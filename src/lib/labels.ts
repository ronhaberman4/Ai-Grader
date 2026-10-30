import type {
  AssessmentArea,
  AssessmentType,
  Confidence,
  Decision,
  FeedbackLanguage,
  MistakeCategory,
  Readability,
  Strictness,
  SubmissionStatus,
  Tone,
} from "./types";

export const ASSESSMENT_TYPE_LABELS: Record<AssessmentType, string> = {
  reading: "הבנת הנקרא",
  vocabulary: "אוצר מילים",
  grammar: "דקדוק",
  writing: "כתיבה",
  literature: "ספרות",
  mixed: "מבחן משולב",
  general: "עבודה כללית",
};

export const AREA_LABELS: Record<AssessmentArea, string> = {
  reading: "הבנת הנקרא",
  vocabulary: "אוצר מילים",
  grammar: "דקדוק",
  writing: "כתיבה",
  literature: "ספרות",
  other: "אחר",
};

export const STRICTNESS_LABELS: Record<Strictness, { label: string; description: string }> = {
  lenient: { label: "מקל", description: "ניקוד חלקי נדיב, התמקדות בהבנה, ללא הורדות מיותרות" },
  balanced: { label: "מאוזן", description: "לפי המחוון בהגינות, הורדה על טעויות משמעותיות" },
  strict: { label: "קפדני", description: "הורדת נקודות עקבית על טעויות לפי המחוון" },
  very_strict: { label: "קפדני מאוד", description: "כל קריטריון מיושם במלואו, גמישות מינימלית" },
};

export const TONE_LABELS: Record<Tone, string> = {
  encouraging: "מעודד",
  friendly: "ידידותי",
  professional: "מקצועי",
  gentle: "עדין",
  direct: "ישיר",
  firm: "תקיף",
};

export const LANGUAGE_LABELS: Record<FeedbackLanguage, string> = {
  en: "אנגלית",
  he: "עברית",
  both: "דו-לשוני (אנגלית ועברית)",
};

export const STATUS_LABELS: Record<SubmissionStatus, string> = {
  uploaded: "הועלה",
  processing: "בבדיקה",
  needs_review: "דורש בדיקה",
  ready: "מוכן לאישור",
  approved: "מאושר",
  failed: "נכשל",
};

export const STATUS_COLORS: Record<SubmissionStatus, string> = {
  uploaded: "bg-slate-100 text-slate-700",
  processing: "bg-blue-50 text-blue-700",
  needs_review: "bg-amber-50 text-amber-800",
  ready: "bg-teal-50 text-teal-800",
  approved: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-50 text-red-700",
};

export const READABILITY_LABELS: Record<Readability, string> = {
  clear: "קריא",
  partially_unclear: "קריא חלקית",
  unreadable: "לא קריא",
  not_answered: "לא נענה",
};

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  high: "ודאות גבוהה",
  medium: "ודאות בינונית",
  low: "ודאות נמוכה",
};

export const DECISION_LABELS: Record<Decision, string> = {
  pending: "הצעת AI",
  accepted: "אושר ע״י המורה",
  adjusted: "שונה ע״י המורה",
  rejected: "נדחה — דורש ניקוד ידני",
  manual: "סומן לבדיקה ידנית",
};

export const MISTAKE_LABELS: Record<MistakeCategory, string> = {
  grammar: "דקדוק",
  vocabulary: "אוצר מילים",
  spelling: "איות",
  comprehension: "הבנה",
  inference: "הסקת מסקנות",
  content: "תוכן",
  organization: "ארגון",
  mechanics: "פיסוק וכתיב",
  other: "אחר",
};

export const WRITING_CATEGORY_TEMPLATE = [
  { name: "Content", description: "Task completion, relevance and development of ideas" },
  { name: "Organization", description: "Structure, paragraphing, cohesion and linking words" },
  { name: "Vocabulary", description: "Range and accuracy of vocabulary for the level" },
  { name: "Grammar", description: "Accuracy and range of grammatical structures" },
  { name: "Mechanics", description: "Spelling, punctuation and capitalization" },
];
