const GENERIC = new Set([
  "img", "image", "scan", "scanned", "scanner", "dsc", "dcim", "photo", "pic", "whatsapp", "document", "doc", "file",
  "page", "pages", "exam", "test", "quiz", "assignment", "homework", "hw", "pxl", "screenshot", "copy", "final",
  "student", "submission", "pdf", "jpg", "png", "camscanner", "cam", "at", "pm", "am", "new", "untitled",
  "מבחן", "עבודה", "סריקה", "עמוד", "תלמיד", "תלמידה", "בוחן", "שיעורי", "בית", "צילום", "מסמך", "חדש",
]);

/**
 * Guesses a student name from a file name, e.g. "Noa_Levi_exam.pdf" → "Noa Levi".
 * Returns null for camera / scanner names like "IMG_2034.jpg".
 */
export function nameFromFilename(filename: string): string | null {
  const base = filename.replace(/\.[^.]+$/, "");
  const words = base
    .replace(/[_\-.,()[\]{}+]+/g, " ")
    .split(/\s+/)
    .filter((w) => !GENERIC.has(w.toLowerCase()))
    .flatMap((w) => w.replace(/([a-z])([A-Z])/g, "$1 $2").split(" "))
    .map((w) => w.replace(/\d+/g, "").trim())
    .filter((w) => w.length > 1 && !GENERIC.has(w.toLowerCase()));
  if (words.length === 0 || words.length > 4) return null;
  return words
    .map((w) => (/^[a-z]/i.test(w) ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}
