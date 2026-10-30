import { beforeEach, describe, expect, it } from "vitest";
import type { GradingOutput } from "@/lib/ai-schemas";
import * as db from "@/lib/db";
import { fileToParts } from "@/lib/extract";
import * as service from "@/lib/service";
import { saveUpload, UploadError } from "@/lib/storage";
import type { SessionSettings } from "@/lib/types";
import { answer, fakeModel, output, sampleRubric, useTempData } from "./helpers";

const settings: SessionSettings = {
  name: "Unit 3 Test", className: "ט'2", subject: "English", maxScore: 40, cefrLevel: "A2",
  assessmentType: "mixed", strictness: "strict", tone: "encouraging", feedbackLanguage: "both",
  specialInstructions: "Accept alternative wording.",
};

function lockedSession() {
  const s = db.createSession(settings);
  service.saveRubricEdits(s.id, sampleRubric());
  service.lockRubric(s.id);
  return db.getSession(s.id)!;
}

function upload(sessionId: string, filename: string, text: string) {
  const sub = db.createSubmission(sessionId, filename.replace(".txt", ""), "filename");
  db.addSubmissionFile(sub.id, saveUpload(sub.id, filename, Buffer.from(text)));
  return sub.id;
}

const writing = (c1: number, c2: number, c3: number) =>
  answer("q3", null, {
    criteriaScores: [
      { criterionId: "c1", points: c1, explanation: "" },
      { criterionId: "c2", points: c2, explanation: "" },
      { criterionId: "c3", points: c3, explanation: "" },
    ],
    mistakes: [{ category: "grammar", description: "past simple of irregular verbs" }],
  });

/** Grades each student by a number written in their file: "score:N". */
function scoreFromText(req: { input: { type: string }[] }): GradingOutput {
  const text = req.input.map((p) => ("text" in p ? (p.text as string) : "")).join("\n");
  if (text.includes("FAIL")) throw new Error("simulated network failure");
  const n = Number(/score:(\d+)/.exec(text)?.[1] ?? 0);
  return output([answer("q1", n), answer("q2", 10, { readability: text.includes("messy") ? "unreadable" : "clear" }), writing(6, 4, 4)]);
}

describe("end-to-end grading pipeline", () => {
  beforeEach(() => useTempData());

  it("extracts a structured rubric from teacher materials, flags issues, and refuses to lock when totals mismatch", async () => {
    const s = db.createSession(settings);
    db.addSessionFile(s.id, "answer_key", saveUpload(s.id, "key.txt", Buffer.from("1. bus broke down (10)\n2. happy (10)")));
    const { calls } = fakeModel(() => ({
      questions: [
        { number: "1", section: "Reading", prompt: "Why was Tom late?", area: "reading", maxPoints: 10, expectedAnswer: "The bus broke down", acceptableAlternatives: [], partialCreditRules: "", criteria: [], notes: "" },
        { number: "2", section: "Vocabulary", prompt: "Synonym of glad", area: "vocabulary", maxPoints: 10, expectedAnswer: "happy", acceptableAlternatives: ["joyful"], partialCreditRules: "", criteria: [], notes: "" },
      ],
      generalInstructions: "Accept alternative wording.",
      issues: [{ severity: "warning", questionNumber: null, message: "לא נמצא מחוון לשאלת הכתיבה" }],
    }));
    const after = await service.extractRubric(s.id, "Spelling: no deduction in reading.");
    expect(calls[0].input.some((p) => p.type === "text" && p.text.includes("bus broke down"))).toBe(true);
    expect(calls[0].input.some((p) => p.type === "text" && p.text.includes("Spelling: no deduction"))).toBe(true);
    expect(after.rubric!.questions).toHaveLength(2);
    expect(after.rubricIssues.some((i) => i.source === "ai")).toBe(true);
    expect(after.rubricIssues.some((i) => i.severity === "error" && i.message.includes("20"))).toBe(true);
    expect(() => service.lockRubric(s.id)).toThrow(/לא ניתן לנעול/);
  });

  it("a locked rubric cannot be edited, and grading settings cannot change", () => {
    const s = lockedSession();
    expect(s.rubricHash).toBeTruthy();
    expect(() => service.saveRubricEdits(s.id, sampleRubric())).toThrow(/נעול/);
    expect(() => service.updateSettings(s.id, { ...settings, strictness: "lenient" })).toThrow(/נעול/);
    service.updateSettings(s.id, { ...settings, name: "Renamed" }); // labels are fine
    expect(db.getSession(s.id)!.name).toBe("Renamed");
    expect(db.getSession(s.id)!.rubricHash).toBe(s.rubricHash);
  });

  it("grades a batch: same rubric for everyone, failures isolated, unreadable flagged, totals computed in code", async () => {
    const s = lockedSession();
    const { calls } = fakeModel(scoreFromText);
    const ids = [
      upload(s.id, "Noa.txt", "1. score:9"),
      upload(s.id, "Dan.txt", "1. score:5"),
      upload(s.id, "Maya.txt", "FAIL"),
      upload(s.id, "Omer.txt", "score:7 messy"),
      upload(s.id, "Lior.txt", "score:3"),
    ];
    for (const id of ids) service.requestGrading(id);
    await service.gradingQueue().idle();

    expect(calls).toHaveLength(5);
    // Rubric consistency: every student was graded with byte-identical instructions.
    expect(new Set(calls.map((c) => c.instructions)).size).toBe(1);

    const subs = ids.map((id) => db.getSubmission(id)!);
    expect(subs.map((x) => x.status)).toEqual(["ready", "ready", "failed", "needs_review", "ready"]);
    expect(subs[2].error).toContain("simulated network failure");
    expect(subs[0].aiTotal).toBe(9 + 10 + 14);
    expect(subs.every((x) => x.status === "failed" || x.rubricHash === s.rubricHash)).toBe(true);
    expect(subs[3].results![1].aiPoints).toBeNull();

    // Retry the failed one after "fixing" the file.
    db.updateSubmission(ids[2], {});
    const sub = db.getSubmission(ids[2])!;
    db.deleteSubmissionFile(sub.files[0].id);
    db.addSubmissionFile(ids[2], saveUpload(ids[2], "Maya.txt", Buffer.from("score:10")));
    service.requestGrading(ids[2]);
    await service.gradingQueue().idle();
    expect(db.getSubmission(ids[2])!.status).toBe("ready");
    expect(db.getSubmission(ids[2])!.aiTotal).toBe(34);
  });

  it("teacher review, approval, regrade protection and class analysis", async () => {
    const s = lockedSession();
    fakeModel(scoreFromText);
    const a = upload(s.id, "Noa.txt", "score:9");
    const b = upload(s.id, "Omer.txt", "score:2 messy");
    service.requestGrading(a);
    service.requestGrading(b);
    await service.gradingQueue().idle();

    // Unresolved questions block approval.
    expect(() => service.approveSubmission(b)).toThrow(/החלטה/);
    service.reviewQuestion(b, "q2", { type: "set_points", points: 4 });
    let sb = db.getSubmission(b)!;
    expect(sb.status).toBe("ready");

    // Teacher adjusts a score; AI suggestion stays visible, total updates.
    service.reviewQuestion(a, "q1", { type: "set_points", points: 6 });
    service.reviewQuestion(a, "q3", { type: "set_criterion", criterionId: "c3", points: 6 });
    const approvedA = service.approveSubmission(a);
    expect(approvedA.status).toBe("approved");
    expect(approvedA.aiTotal).toBe(33);
    expect(approvedA.finalScore).toBe(6 + 10 + 6 + 4 + 6);

    // Approved work is frozen.
    expect(() => service.reviewQuestion(a, "q1", { type: "set_points", points: 1 })).toThrow();
    expect(() => service.requestGrading(a)).toThrow();

    // Regrade keeps teacher changes by default.
    service.requestGrading(b);
    await service.gradingQueue().idle();
    sb = db.getSubmission(b)!;
    expect(sb.results![1].teacherPoints).toBe(4);
    expect(sb.status).toBe("ready");
    // ...and only drops them with explicit permission.
    service.requestGrading(b, { overwriteTeacherChanges: true });
    await service.gradingQueue().idle();
    sb = db.getSubmission(b)!;
    expect(sb.results![1].teacherPoints).toBeNull();
    expect(sb.status).toBe("needs_review");
    service.reviewQuestion(b, "q2", { type: "set_points", points: 0 });
    service.approveSubmission(b);

    const stats = service.classStats(s.id);
    expect(stats.count).toBe(2);
    expect(stats.highest).toBe(32);
    expect(stats.lowest).toBe(2 + 0 + 14);
    expect(stats.average).toBe(24);
    expect(stats.median).toBe(24);
    expect(stats.perQuestion.find((x) => x.questionId === "q2")!.avgPercent).toBe(50);
    expect(stats.mistakeCategories[0]).toMatchObject({ category: "grammar", students: 2 });
    expect(stats.needsSupport.map((x) => x.submissionId)).toEqual([b]);
    expect(stats.distribution.reduce((n, d) => n + d.count, 0)).toBe(2);

    // Every AI call is costed: 4 grading runs × (10k in × $2 + 5k out × $10) / 1M = 4 × $0.07.
    const cost = db.sessionCost(s.id);
    expect(cost.calls).toBe(4);
    expect(cost.grading).toBeCloseTo(0.28, 6);
    expect(db.getSubmission(b)!.costUsd).toBeCloseTo(0.21, 6); // graded three times
    expect(db.getSubmission(a)!.costUsd).toBeCloseTo(0.07, 6);

    // Unapproving reopens editing and removes the student from the stats.
    service.unapproveSubmission(a);
    expect(service.classStats(s.id).count).toBe(1);
  });

  it("uses the name written on the page only when no name was known", async () => {
    const s = lockedSession();
    fakeModel(() => output([answer("q1", 1), answer("q2", 1), writing(1, 1, 1)], "Yael Bar"));
    const sub = db.createSubmission(s.id, "", "none");
    db.addSubmissionFile(sub.id, saveUpload(sub.id, "IMG_1234.txt", Buffer.from("x")));
    const named = upload(s.id, "Noa.txt", "x");
    service.requestGrading(sub.id);
    service.requestGrading(named);
    await service.gradingQueue().idle();
    expect(db.getSubmission(sub.id)!.studentName).toBe("Yael Bar");
    expect(db.getSubmission(named)!.studentName).toBe("Noa");
    expect(db.getSubmission(named)!.detectedName).toBe("Yael Bar");
  });

  it("cannot unlock a rubric once students were graded with it", async () => {
    const s = lockedSession();
    fakeModel(scoreFromText);
    const id = upload(s.id, "Noa.txt", "score:1");
    service.requestGrading(id);
    await service.gradingQueue().idle();
    expect(() => service.unlockRubric(s.id)).toThrow(/לא ניתן לפתוח/);
  });

  it("generates class insights from aggregated data without student names", async () => {
    const s = lockedSession();
    const { calls } = fakeModel((req) =>
      req.name === "class_insights"
        ? { insights: [{ title: "t", observation: "o", evidence: "e", recommendation: "r" }], reviewTopics: ["past simple"] }
        : scoreFromText(req as never),
    );
    for (const [n, t] of [["Noa", "score:9"], ["Dan", "score:4"]]) {
      const id = upload(s.id, `${n}.txt`, t);
      service.requestGrading(id);
      await service.gradingQueue().idle();
      service.approveSubmission(id);
    }
    const after = await service.generateInsights(s.id);
    expect(after.insights!.basedOnCount).toBe(2);
    const sent = JSON.stringify(calls.at(-1)!.input);
    expect(sent).not.toContain("Noa");
    expect(sent).not.toContain("Dan");
  });
});

describe("file handling", () => {
  beforeEach(() => useTempData());

  it("rejects unsupported, empty and mismatched files", () => {
    expect(() => saveUpload("x", "a.doc", Buffer.from("x"))).toThrow(UploadError);
    expect(() => saveUpload("x", "a.exe", Buffer.from("x"))).toThrow(UploadError);
    expect(() => saveUpload("x", "a.pdf", Buffer.from(""))).toThrow(UploadError);
    expect(() => saveUpload("x", "a.png", Buffer.from("not a png"))).toThrow(/פגום/);
  });

  it("sends PDFs and images to the vision model and extracts text files locally", async () => {
    const pdf = saveUpload("x", "exam.pdf", Buffer.from("%PDF-1.4\n%%EOF"));
    const png = saveUpload("x", "page.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0]));
    const txt = saveUpload("x", "notes.txt", Buffer.from("hello"));
    expect((await fileToParts(pdf, "F"))[1]).toMatchObject({ type: "document", title: "exam.pdf", source: { media_type: "application/pdf" } });
    expect((await fileToParts(png, "F"))[1]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/png" } });
    expect((await fileToParts(txt, "F"))[0]).toMatchObject({ type: "text" });
  });
});
