import { readStored } from "./storage";
import type { StoredFile } from "./types";

/** A piece of model input: either plain text or a file (PDF / image) the vision model reads directly. */
export type InputPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string; detail: "high" }
  | { type: "input_file"; filename: string; file_data: string };

export class ExtractionError extends Error {}

async function docxToText(buf: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ buffer: buf });
  return value;
}

/**
 * Converts a stored file into model input parts.
 * - PDF: sent as a file; the model receives both the text layer and page images,
 *   so scanned / handwritten PDFs are read visually (OCR by the vision model).
 * - Images: sent at high detail for handwriting recognition.
 * - DOCX / TXT: text is extracted locally.
 */
export async function fileToParts(f: StoredFile, label: string): Promise<InputPart[]> {
  const buf = readStored(f);
  const header: InputPart = { type: "input_text", text: `--- ${label}: "${f.filename}" ---` };
  if (f.mime === "application/pdf") {
    return [header, { type: "input_file", filename: f.filename, file_data: `data:application/pdf;base64,${buf.toString("base64")}` }];
  }
  if (f.mime.startsWith("image/")) {
    return [header, { type: "input_image", image_url: `data:${f.mime};base64,${buf.toString("base64")}`, detail: "high" }];
  }
  let text: string;
  try {
    text = f.mime === "text/plain" ? buf.toString("utf8") : await docxToText(buf);
  } catch {
    throw new ExtractionError(`לא ניתן לקרוא את הקובץ "${f.filename}". ייתכן שהוא פגום.`);
  }
  text = text.replace(/\r\n/g, "\n").trim();
  if (!text) throw new ExtractionError(`לא נמצא טקסט בקובץ "${f.filename}".`);
  return [{ type: "input_text", text: `${header.text}\n${text}` }];
}
