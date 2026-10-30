import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./db";
import { newId } from "./rubric";
import type { StoredFile } from "./types";

export const MAX_FILE_BYTES = 25 * 1024 * 1024;

const TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

export const ACCEPT_ATTR = ".pdf,.docx,.txt,.jpg,.jpeg,.png";

export class UploadError extends Error {}

function sniff(buf: Buffer, ext: string): boolean {
  const startsWith = (bytes: number[]) => bytes.every((b, i) => buf[i] === b);
  switch (ext) {
    case ".pdf":
      return buf.subarray(0, 1024).includes(Buffer.from("%PDF"));
    case ".docx":
      return startsWith([0x50, 0x4b]); // zip container
    case ".jpg":
    case ".jpeg":
      return startsWith([0xff, 0xd8, 0xff]);
    case ".png":
      return startsWith([0x89, 0x50, 0x4e, 0x47]);
    case ".txt":
      return !buf.subarray(0, 4096).includes(0);
    default:
      return false;
  }
}

/** Validates and writes an uploaded file to private storage (never under /public). */
export function saveUpload(scope: string, filename: string, buf: Buffer): StoredFile {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".doc") throw new UploadError(`הקובץ "${filename}" בפורמט Word ישן (.doc). יש לשמור אותו כ-.docx או PDF.`);
  if (ext === ".heic" || ext === ".heif")
    throw new UploadError(`הקובץ "${filename}" בפורמט HEIC של אייפון. יש לשמור אותו כ-JPG (או לצלם במצב "התאמה מרבית").`);
  const mime = TYPES[ext];
  if (!mime) throw new UploadError(`סוג הקובץ "${filename}" אינו נתמך. ניתן להעלות PDF, DOCX, TXT, JPG או PNG.`);
  if (buf.length === 0) throw new UploadError(`הקובץ "${filename}" ריק.`);
  if (buf.length > MAX_FILE_BYTES) throw new UploadError(`הקובץ "${filename}" גדול מדי (מעל 25MB).`);
  if (!sniff(buf, ext)) throw new UploadError(`הקובץ "${filename}" פגום או שאינו תואם לסיומת שלו.`);

  const id = newId("f_");
  const safeScope = scope.replace(/[^a-zA-Z0-9_-]/g, "");
  const dir = path.join(dataDir(), "uploads", safeScope);
  fs.mkdirSync(dir, { recursive: true });
  const storedPath = path.join("uploads", safeScope, id + ext);
  fs.writeFileSync(path.join(dataDir(), storedPath), buf);
  return { id, filename: path.basename(filename), storedPath, mime, size: buf.length };
}

export function readStored(f: StoredFile): Buffer {
  return fs.readFileSync(resolveStored(f.storedPath));
}

export function removeStored(f: StoredFile) {
  try {
    fs.unlinkSync(resolveStored(f.storedPath));
  } catch {
    // already gone
  }
}

export function removeScope(scope: string) {
  const safeScope = scope.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeScope) return;
  fs.rmSync(path.join(dataDir(), "uploads", safeScope), { recursive: true, force: true });
}

function resolveStored(storedPath: string): string {
  const root = path.join(dataDir(), "uploads");
  const full = path.resolve(dataDir(), storedPath);
  if (!full.startsWith(root + path.sep)) throw new Error("invalid path");
  return full;
}
