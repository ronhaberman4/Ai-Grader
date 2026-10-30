import type Anthropic from "@anthropic-ai/sdk";
import { readStored } from "./storage";
import type { StoredFile } from "./types";

/** A piece of model input: plain text, or a PDF / image that Claude reads visually. */
export type InputPart =
  | Anthropic.Beta.Messages.BetaTextBlockParam
  | Anthropic.Beta.Messages.BetaImageBlockParam
  | Anthropic.Beta.Messages.BetaRequestDocumentBlock;

export class ExtractionError extends Error {}

async function docxToText(buf: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ buffer: buf });
  return value;
}

/**
 * Converts a stored file into model input parts.
 * - PDF: sent as a document block; Claude receives both the text layer and page images,
 *   so scanned / handwritten PDFs are read visually (OCR by the model).
 * - Images: sent as image blocks for handwriting recognition.
 * - DOCX / TXT: text is extracted locally.
 */
export async function fileToParts(f: StoredFile, label: string): Promise<InputPart[]> {
  const buf = readStored(f);
  const header = `--- ${label}: "${f.filename}" ---`;
  if (f.mime === "application/pdf") {
    return [
      { type: "text", text: header },
      { type: "document", title: f.filename, source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") } },
    ];
  }
  if (f.mime === "image/jpeg" || f.mime === "image/png") {
    return [
      { type: "text", text: header },
      { type: "image", source: { type: "base64", media_type: f.mime, data: buf.toString("base64") } },
    ];
  }
  let text: string;
  try {
    text = f.mime === "text/plain" ? buf.toString("utf8") : await docxToText(buf);
  } catch {
    throw new ExtractionError(`לא ניתן לקרוא את הקובץ "${f.filename}". ייתכן שהוא פגום.`);
  }
  text = text.replace(/\r\n/g, "\n").trim();
  if (!text) throw new ExtractionError(`לא נמצא טקסט בקובץ "${f.filename}".`);
  return [{ type: "text", text: `${header}\n${text}` }];
}
