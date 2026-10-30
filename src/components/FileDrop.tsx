"use client";

import { useRef, useState } from "react";

export const ACCEPT = ".pdf,.docx,.txt,.jpg,.jpeg,.png";

export function FileDrop({
  onFiles,
  multiple = true,
  disabled,
  label,
  hint = "PDF, Word (DOCX), TXT, JPG, PNG — כולל סריקות וצילומי כתב יד",
  compact,
}: {
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  disabled?: boolean;
  label: string;
  hint?: string;
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-disabled={disabled}
      onClick={() => !disabled && input.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !disabled && input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled && e.dataTransfer.files.length) onFiles(Array.from(e.dataTransfer.files));
      }}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition ${
        compact ? "p-4" : "p-8"
      } ${disabled ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400" : over ? "border-indigo-500 bg-indigo-50" : "border-slate-300 bg-white hover:border-indigo-400 hover:bg-slate-50"}`}
    >
      <div className={compact ? "text-xl" : "text-3xl"} aria-hidden>
        ⇪
      </div>
      <div className="mt-1 text-sm font-medium">{label}</div>
      <div className="mt-0.5 text-xs text-slate-500">{hint}</div>
      <input
        ref={input}
        type="file"
        className="hidden"
        accept={ACCEPT}
        multiple={multiple}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </div>
  );
}
