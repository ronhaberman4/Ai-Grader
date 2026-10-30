import { describe, expect, it } from "vitest";
import { nameFromFilename } from "@/lib/names";

describe("student name from filename", () => {
  it.each([
    ["Noa_Levi_exam.pdf", "Noa Levi"],
    ["noa-levi.jpg", "Noa Levi"],
    ["יוסי כהן - מבחן.pdf", "יוסי כהן"],
    ["DavidCohen2.png", "David Cohen"],
    ["IMG_2034.jpg", null],
    ["Scan 2026-10-30 12.01.pdf", null],
    ["WhatsApp Image 2026-01-01 at 10.00.00.jpeg", null],
  ])("%s → %s", (file, expected) => {
    expect(nameFromFilename(file)).toBe(expected);
  });
});
