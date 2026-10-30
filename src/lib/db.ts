import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { newId } from "./rubric";
import type {
  ClassInsights,
  GradingSession,
  NameSource,
  OverallFeedback,
  QuestionResult,
  Rubric,
  RubricIssue,
  SessionFile,
  SessionFileKind,
  SessionSettings,
  StoredFile,
  Submission,
  SubmissionFile,
  SubmissionStatus,
} from "./types";

export function dataDir(): string {
  return path.resolve(process.env.DATA_DIR || "./data");
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  class_name TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  max_score REAL NOT NULL,
  cefr_level TEXT NOT NULL,
  assessment_type TEXT NOT NULL,
  strictness TEXT NOT NULL,
  tone TEXT NOT NULL,
  feedback_language TEXT NOT NULL,
  special_instructions TEXT NOT NULL DEFAULT '',
  rubric_json TEXT,
  rubric_issues_json TEXT NOT NULL DEFAULT '[]',
  rubric_source_text TEXT NOT NULL DEFAULT '',
  rubric_locked_at TEXT,
  rubric_hash TEXT,
  insights_json TEXT,
  insights_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS session_files (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  filename TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  student_name TEXT NOT NULL DEFAULT '',
  name_source TEXT NOT NULL DEFAULT 'none',
  detected_name TEXT,
  status TEXT NOT NULL,
  error TEXT,
  results_json TEXT,
  overall_json TEXT,
  teacher_overall_json TEXT,
  teacher_comment TEXT NOT NULL DEFAULT '',
  rubric_hash TEXT,
  ai_model TEXT,
  ai_total REAL,
  final_score REAL,
  graded_at TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_submissions_session ON submissions(session_id);
CREATE TABLE IF NOT EXISTS submission_files (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  page_order INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_submission_files_sub ON submission_files(submission_id);
`;

type Row = Record<string, unknown>;

const g = globalThis as unknown as { __graderDb?: DatabaseSync };

export function getDb(): DatabaseSync {
  if (g.__graderDb) return g.__graderDb;
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = process.env.DB_FILE || path.join(dir, "grader.db");
  const db = new DatabaseSync(file === ":memory:" ? ":memory:" : file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA);
  // Work interrupted by a server restart goes back to the queue.
  db.prepare("UPDATE submissions SET status = 'uploaded' WHERE status = 'processing'").run();
  g.__graderDb = db;
  return db;
}

/** For tests: drop the cached connection. */
export function resetDbForTests() {
  g.__graderDb?.close();
  g.__graderDb = undefined;
}

const now = () => new Date().toISOString();
const json = (v: unknown) => (v === null || v === undefined ? null : JSON.stringify(v));
const parse = <T>(v: unknown, fallback: T): T => (typeof v === "string" && v ? (JSON.parse(v) as T) : fallback);

export function transaction<T>(fn: () => T): T {
  const db = getDb();
  db.exec("BEGIN");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

// ---------- Sessions ----------

function rowToSession(r: Row): GradingSession {
  return {
    id: r.id as string,
    name: r.name as string,
    className: r.class_name as string,
    subject: r.subject as string,
    maxScore: r.max_score as number,
    cefrLevel: r.cefr_level as GradingSession["cefrLevel"],
    assessmentType: r.assessment_type as GradingSession["assessmentType"],
    strictness: r.strictness as GradingSession["strictness"],
    tone: r.tone as GradingSession["tone"],
    feedbackLanguage: r.feedback_language as GradingSession["feedbackLanguage"],
    specialInstructions: r.special_instructions as string,
    rubric: parse<Rubric | null>(r.rubric_json, null),
    rubricIssues: parse<RubricIssue[]>(r.rubric_issues_json, []),
    rubricSourceText: r.rubric_source_text as string,
    rubricLockedAt: (r.rubric_locked_at as string) ?? null,
    rubricHash: (r.rubric_hash as string) ?? null,
    insights: parse<ClassInsights | null>(r.insights_json, null),
    insightsAt: (r.insights_at as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export function createSession(s: SessionSettings): GradingSession {
  const id = newId("s_");
  const t = now();
  getDb()
    .prepare(
      `INSERT INTO sessions (id, name, class_name, subject, max_score, cefr_level, assessment_type, strictness, tone,
        feedback_language, special_instructions, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(id, s.name, s.className, s.subject, s.maxScore, s.cefrLevel, s.assessmentType, s.strictness, s.tone,
      s.feedbackLanguage, s.specialInstructions, t, t);
  return getSession(id)!;
}

export function getSession(id: string): GradingSession | null {
  const r = getDb().prepare("SELECT * FROM sessions WHERE id = ?").get(id) as Row | undefined;
  return r ? rowToSession(r) : null;
}

export type SessionSummary = GradingSession & {
  submissionCount: number;
  approvedCount: number;
  needsReviewCount: number;
};

export function listSessions(): SessionSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT s.*,
        (SELECT COUNT(*) FROM submissions x WHERE x.session_id = s.id) AS submission_count,
        (SELECT COUNT(*) FROM submissions x WHERE x.session_id = s.id AND x.status = 'approved') AS approved_count,
        (SELECT COUNT(*) FROM submissions x WHERE x.session_id = s.id AND x.status = 'needs_review') AS needs_review_count
       FROM sessions s ORDER BY s.updated_at DESC`,
    )
    .all() as Row[];
  return rows.map((r) => ({
    ...rowToSession(r),
    submissionCount: Number(r.submission_count),
    approvedCount: Number(r.approved_count),
    needsReviewCount: Number(r.needs_review_count),
  }));
}

export function updateSessionSettings(id: string, s: SessionSettings) {
  getDb()
    .prepare(
      `UPDATE sessions SET name=?, class_name=?, subject=?, max_score=?, cefr_level=?, assessment_type=?, strictness=?,
        tone=?, feedback_language=?, special_instructions=?, updated_at=? WHERE id=?`,
    )
    .run(s.name, s.className, s.subject, s.maxScore, s.cefrLevel, s.assessmentType, s.strictness, s.tone,
      s.feedbackLanguage, s.specialInstructions, now(), id);
}

/** Updates only fields that do not influence grading (allowed after locking). */
export function updateSessionLabels(id: string, name: string, className: string) {
  getDb().prepare("UPDATE sessions SET name=?, class_name=?, updated_at=? WHERE id=?").run(name, className, now(), id);
}

export function saveRubric(id: string, rubric: Rubric | null, issues: RubricIssue[], sourceText?: string) {
  const db = getDb();
  db.prepare("UPDATE sessions SET rubric_json=?, rubric_issues_json=?, updated_at=? WHERE id=?").run(
    json(rubric), JSON.stringify(issues), now(), id);
  if (sourceText !== undefined) {
    db.prepare("UPDATE sessions SET rubric_source_text=? WHERE id=?").run(sourceText, id);
  }
}

export function setRubricLock(id: string, hash: string | null) {
  getDb()
    .prepare("UPDATE sessions SET rubric_locked_at=?, rubric_hash=?, updated_at=? WHERE id=?")
    .run(hash ? now() : null, hash, now(), id);
}

export function setInsights(id: string, insights: ClassInsights | null) {
  getDb()
    .prepare("UPDATE sessions SET insights_json=?, insights_at=? WHERE id=?")
    .run(json(insights), insights ? now() : null, id);
}

export function deleteSession(id: string) {
  getDb().prepare("DELETE FROM sessions WHERE id=?").run(id);
}

export function touchSession(id: string) {
  getDb().prepare("UPDATE sessions SET updated_at=? WHERE id=?").run(now(), id);
}

// ---------- Session files ----------

function rowToFile(r: Row): StoredFile {
  return {
    id: r.id as string,
    filename: r.filename as string,
    storedPath: r.stored_path as string,
    mime: r.mime as string,
    size: Number(r.size),
  };
}

export function addSessionFile(sessionId: string, kind: SessionFileKind, f: StoredFile): SessionFile {
  const t = now();
  getDb()
    .prepare("INSERT INTO session_files (id, session_id, kind, filename, stored_path, mime, size, created_at) VALUES (?,?,?,?,?,?,?,?)")
    .run(f.id, sessionId, kind, f.filename, f.storedPath, f.mime, f.size, t);
  return { ...f, sessionId, kind, createdAt: t };
}

export function listSessionFiles(sessionId: string): SessionFile[] {
  return (getDb().prepare("SELECT * FROM session_files WHERE session_id=? ORDER BY created_at").all(sessionId) as Row[]).map(
    (r) => ({ ...rowToFile(r), sessionId, kind: r.kind as SessionFileKind, createdAt: r.created_at as string }),
  );
}

export function getSessionFile(fileId: string): SessionFile | null {
  const r = getDb().prepare("SELECT * FROM session_files WHERE id=?").get(fileId) as Row | undefined;
  return r
    ? { ...rowToFile(r), sessionId: r.session_id as string, kind: r.kind as SessionFileKind, createdAt: r.created_at as string }
    : null;
}

export function deleteSessionFile(fileId: string) {
  getDb().prepare("DELETE FROM session_files WHERE id=?").run(fileId);
}

// ---------- Submissions ----------

function rowToSubmission(r: Row, files: SubmissionFile[]): Submission {
  return {
    id: r.id as string,
    sessionId: r.session_id as string,
    studentName: r.student_name as string,
    nameSource: r.name_source as NameSource,
    detectedName: (r.detected_name as string) ?? null,
    status: r.status as SubmissionStatus,
    error: (r.error as string) ?? null,
    results: parse<QuestionResult[] | null>(r.results_json, null),
    overall: parse<OverallFeedback | null>(r.overall_json, null),
    teacherOverall: parse<OverallFeedback | null>(r.teacher_overall_json, null),
    teacherComment: r.teacher_comment as string,
    rubricHash: (r.rubric_hash as string) ?? null,
    aiModel: (r.ai_model as string) ?? null,
    aiTotal: (r.ai_total as number) ?? null,
    finalScore: (r.final_score as number) ?? null,
    gradedAt: (r.graded_at as string) ?? null,
    approvedAt: (r.approved_at as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    files,
  };
}

function filesFor(submissionIds: string[]): Map<string, SubmissionFile[]> {
  const map = new Map<string, SubmissionFile[]>();
  if (submissionIds.length === 0) return map;
  const rows = getDb()
    .prepare(
      `SELECT * FROM submission_files WHERE submission_id IN (${submissionIds.map(() => "?").join(",")}) ORDER BY page_order`,
    )
    .all(...submissionIds) as Row[];
  for (const r of rows) {
    const sid = r.submission_id as string;
    if (!map.has(sid)) map.set(sid, []);
    map.get(sid)!.push({ ...rowToFile(r), submissionId: sid, pageOrder: Number(r.page_order) });
  }
  return map;
}

export function createSubmission(sessionId: string, studentName: string, nameSource: NameSource): Submission {
  const id = newId("sub_");
  const t = now();
  getDb()
    .prepare(
      "INSERT INTO submissions (id, session_id, student_name, name_source, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
    )
    .run(id, sessionId, studentName, nameSource, "uploaded", t, t);
  return getSubmission(id)!;
}

export function getSubmission(id: string): Submission | null {
  const r = getDb().prepare("SELECT * FROM submissions WHERE id=?").get(id) as Row | undefined;
  if (!r) return null;
  return rowToSubmission(r, filesFor([id]).get(id) ?? []);
}

export function listSubmissions(sessionId: string): Submission[] {
  const rows = getDb()
    .prepare("SELECT * FROM submissions WHERE session_id=? ORDER BY created_at, rowid")
    .all(sessionId) as Row[];
  const files = filesFor(rows.map((r) => r.id as string));
  return rows.map((r) => rowToSubmission(r, files.get(r.id as string) ?? []));
}

export type SubmissionPatch = Partial<{
  studentName: string;
  nameSource: NameSource;
  detectedName: string | null;
  status: SubmissionStatus;
  error: string | null;
  results: QuestionResult[] | null;
  overall: OverallFeedback | null;
  teacherOverall: OverallFeedback | null;
  teacherComment: string;
  rubricHash: string | null;
  aiModel: string | null;
  aiTotal: number | null;
  finalScore: number | null;
  gradedAt: string | null;
  approvedAt: string | null;
}>;

const COLUMN: Record<keyof SubmissionPatch, [string, boolean]> = {
  studentName: ["student_name", false],
  nameSource: ["name_source", false],
  detectedName: ["detected_name", false],
  status: ["status", false],
  error: ["error", false],
  results: ["results_json", true],
  overall: ["overall_json", true],
  teacherOverall: ["teacher_overall_json", true],
  teacherComment: ["teacher_comment", false],
  rubricHash: ["rubric_hash", false],
  aiModel: ["ai_model", false],
  aiTotal: ["ai_total", false],
  finalScore: ["final_score", false],
  gradedAt: ["graded_at", false],
  approvedAt: ["approved_at", false],
};

export function updateSubmission(id: string, patch: SubmissionPatch) {
  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  for (const [key, value] of Object.entries(patch)) {
    const col = COLUMN[key as keyof SubmissionPatch];
    if (!col || value === undefined) continue;
    sets.push(`${col[0]}=?`);
    values.push(col[1] ? json(value) : (value as string | number | null));
  }
  if (sets.length === 0) return;
  sets.push("updated_at=?");
  values.push(now(), id);
  getDb().prepare(`UPDATE submissions SET ${sets.join(", ")} WHERE id=?`).run(...values);
}

/** Atomically claims a submission for processing; returns false if someone else already did. */
export function claimSubmission(id: string): boolean {
  const r = getDb()
    .prepare("UPDATE submissions SET status='processing', error=NULL, updated_at=? WHERE id=? AND status <> 'processing' AND status <> 'approved'")
    .run(now(), id);
  return Number(r.changes) === 1;
}

export function deleteSubmission(id: string) {
  getDb().prepare("DELETE FROM submissions WHERE id=?").run(id);
}

export function addSubmissionFile(submissionId: string, f: StoredFile): SubmissionFile {
  const db = getDb();
  const max = db.prepare("SELECT COALESCE(MAX(page_order), 0) AS m FROM submission_files WHERE submission_id=?").get(submissionId) as Row;
  const order = Number(max.m) + 1;
  db.prepare("INSERT INTO submission_files (id, submission_id, filename, stored_path, mime, size, page_order) VALUES (?,?,?,?,?,?,?)")
    .run(f.id, submissionId, f.filename, f.storedPath, f.mime, f.size, order);
  return { ...f, submissionId, pageOrder: order };
}

export function deleteSubmissionFile(fileId: string) {
  getDb().prepare("DELETE FROM submission_files WHERE id=?").run(fileId);
}

export function getSubmissionFile(fileId: string): SubmissionFile | null {
  const r = getDb().prepare("SELECT * FROM submission_files WHERE id=?").get(fileId) as Row | undefined;
  return r ? { ...rowToFile(r), submissionId: r.submission_id as string, pageOrder: Number(r.page_order) } : null;
}
