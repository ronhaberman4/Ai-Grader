"use client";

/**
 * Exports rendered HTML (with correct Hebrew RTL shaping by the browser) to an A4 PDF.
 * Each element in `pages` starts on a new page; long content breaks between [data-pdf-block] elements.
 */
export async function exportToPdf(pages: HTMLElement[], filename: string) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const margin = 10;
  const contentW = 210 - margin * 2;
  const contentH = 297 - margin * 2;
  let first = true;

  for (const el of pages) {
    const scale = 2;
    const canvas = await html2canvas(el, { scale, backgroundColor: "#ffffff", logging: false });
    const pxPerMm = canvas.width / contentW;
    const pagePx = Math.floor(contentH * pxPerMm);
    const origin = el.getBoundingClientRect().top;
    const blocks = Array.from(el.querySelectorAll<HTMLElement>("[data-pdf-block]")).map((b) => {
      const r = b.getBoundingClientRect();
      return { top: Math.floor((r.top - origin) * scale), bottom: Math.ceil((r.bottom - origin) * scale) };
    });

    let y = 0;
    while (y < canvas.height - 2) {
      let end = Math.min(y + pagePx, canvas.height);
      if (end < canvas.height) {
        const crossing = blocks.find((b) => b.top > y + 20 && b.top < end && b.bottom > end);
        if (crossing) end = crossing.top - 4;
      }
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = end - y;
      const ctx = slice.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, y, canvas.width, end - y, 0, 0, canvas.width, end - y);
      if (!first) pdf.addPage();
      first = false;
      pdf.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", margin, margin, contentW, (end - y) / pxPerMm);
      y = end;
    }
  }
  pdf.save(filename);
}
