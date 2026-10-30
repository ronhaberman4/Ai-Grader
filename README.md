# בודק מבחנים AI (AI Exam Grader)

אתר לבדיקת מבחנים ועבודות של תלמידים בעזרת Claude (של Anthropic). **המורה תמיד מחליט/ה**: ה-AI מציע ציונים ומשוב, והמורה בודק/ת, עורך/ת ומאשר/ת.

## מה האתר עושה

1. **יצירת מבחן**: שם, כיתה, ציון מקסימלי, רמת CEFR, סוג הערכה, רמת קפדנות (4 רמות), טון משוב (6 אפשרויות), שפת משוב (אנגלית / עברית / דו-לשוני) והנחיות מיוחדות.
2. **מחוון**: מעלים מבחן, תשובון ומחוון (PDF, Word, TXT, תמונות, כולל סריקות וכתב יד) או מדביקים טקסט. ה-AI בונה מחוון מובנה, ואתם עורכים ונועלים אותו. אחרי הנעילה אותו מחוון חל על כל התלמידים.
3. **העלאת עבודות**: תלמיד אחד או הרבה בבת אחת. שם התלמיד מזוהה משם הקובץ או מהכתוב על הדף.
4. **בדיקה**: לכל שאלה מוצגים תשובת התלמיד, התשובה הצפויה, ציון מוצע, הסבר, משוב ומידת ודאות. תשובות לא קריאות מסומנות לבדיקה ידנית, וה-AI לא מנחש אותן. הקובץ המקורי מוצג לצד הבדיקה.
5. **אישור ודוחות**: אישור ציון סופי, דוח PDF לכל תלמיד (או לכל הכיתה בקובץ אחד), ייצוא ל-Excel, וניתוח כיתתי עם תובנות להוראה.

## התקנה על המחשב שלך (פעם אחת)

1. התקינו את **Node.js** (גרסה 22.13 ומעלה, מומלץ 24 LTS) מהאתר https://nodejs.org.
2. הורידו את הקוד (Code → Download ZIP ב-GitHub) וחלצו אותו לתיקייה.
3. צרו מפתח API של Claude בכתובת https://console.anthropic.com/settings/keys. צריך להוסיף אמצעי תשלום או לטעון קרדיט בחשבון. עלות בדיקת מבחן תלויה באורכו, ובדרך כלל מדובר בכמה סנטים.
4. בתיקיית הפרויקט העתיקו את הקובץ `.env.example` לקובץ חדש בשם `.env.local`, ומלאו בו:
   - `ANTHROPIC_API_KEY`: המפתח שיצרתם (מתחיל ב-`sk-ant-`)
   - `APP_PASSWORD`: סיסמה לכניסה לאתר (מומלץ)
   - `SESSION_SECRET`: מחרוזת אקראית ארוכה כלשהי
5. פתחו טרמינל (במחשב Windows: PowerShell) בתיקיית הפרויקט והריצו:
   ```
   npm install
   npm run app
   ```
6. פתחו בדפדפן את הכתובת **http://localhost:3000**.

בפעמים הבאות מספיק להריץ `npm start` (אחרי `npm run app` ראשון). האתר זמין רק מהמחשב שלכם (127.0.0.1).

## איפה נשמרים הנתונים

כל המידע (מסד הנתונים והקבצים שהועלו) נשמר בתיקייה `data/` שבתוך הפרויקט, על המחשב שלכם בלבד. לגיבוי מעתיקים את התיקייה הזאת. הקבצים נשלחים ל-Claude (Anthropic) רק לצורך הבדיקה.

## הגדרות (`.env.local`)

| משתנה | תיאור | ברירת מחדל |
|---|---|---|
| `ANTHROPIC_API_KEY` | מפתח API של Claude (חובה) | — |
| `GRADER_MODEL` | מודל Claude | `claude-opus-5-5` |
| `GRADER_EFFORT` | רמת המאמץ: `low` / `medium` / `high` / `xhigh` / `max` | `high` |
| `APP_PASSWORD` | סיסמת כניסה. אם ריק, אין סיסמה | — |
| `SESSION_SECRET` | סוד לחתימת עוגיית הכניסה | — |
| `DATA_DIR` | תיקיית הנתונים | `./data` |
| `GRADING_CONCURRENCY` | כמה עבודות נבדקות במקביל | `3` |

---

## Technical overview

- **Stack**: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4, Anthropic Claude API (`@anthropic-ai/sdk`, model `claude-opus-5-5`), SQLite via Node's built-in `node:sqlite` (no native build step), Vitest.
- **AI calls** (`src/lib/ai.ts`) are server-side only. They use Claude's structured outputs (`output_config.format` built from the Zod schemas in `src/lib/ai-schemas.ts`), and every response is validated again on our side. Requests are streamed, so long grading responses don't hit HTTP timeouts. Server-side refusal fallback is enabled (`fallbacks: "default"`).
- **Files** (`src/lib/extract.ts`): PDFs (as `document` blocks) and images (as `image` blocks) go straight to Claude, which reads both the text layer and the page images, so Claude does the OCR of scans and handwriting. DOCX/TXT are extracted locally with `mammoth`. Large phone photos are downscaled in the browser before upload. Files are type-checked by extension and magic bytes, and stored outside `public/`.
- **Deterministic scoring** (`src/lib/scoring.ts`): the model only suggests per-question or per-criterion points. Clamping to `[0, max]`, totals, the "needs review" logic, teacher overrides and regrade merging all happen in code. Unreadable answers get no suggestion (`null`), so the teacher has to score them.
- **Rubric consistency** (`src/lib/rubric.ts`, `src/lib/service.ts`): locking validates the rubric (totals must equal the max score, no duplicate numbers, etc.) and stores a SHA-256 hash of the rubric plus grading settings. Every submission records the hash it was graded with, and approval is refused if the hash doesn't match. Locked rubrics and grading settings can't be edited, and a rubric can't be unlocked once any student has been graded with it.
- **Strictness vs tone** (`src/lib/prompts.ts`): strictness appears only in the SCORING section of the prompt and tone only in the FEEDBACK section (covered by tests).
- **Teacher layer**: AI suggestion (`aiPoints`), teacher adjustment (`teacherPoints` / `teacherCriteria` / `teacherFeedback`) and the approved `finalScore` are stored separately. A regrade keeps teacher changes unless the teacher explicitly confirms overwriting them.
- **Batch processing** (`src/lib/queue.ts`): an in-process queue with bounded concurrency. One failure doesn't stop the others. Work interrupted by a restart is re-queued.
- **Class analysis** (`src/lib/analytics.ts`): computed only from approved grades. AI insights are generated from anonymized aggregates and labeled as AI interpretation.
- **Reports**: rendered as HTML (correct Hebrew/English bidi) and exported to A4 PDF in the browser (`src/lib/client/pdf.ts`), with page breaks between blocks.
- **Auth**: optional single-teacher password with an HMAC-signed httpOnly cookie. Pages are protected by middleware, and every API route checks auth itself (`src/lib/api.ts`).

### Commands

```
npm run dev     # development server
npm test        # unit + integration tests (no network; Claude is faked)
npm run lint    # TypeScript type check
npm run app     # production build + start
```

### Tests

`tests/` covers score calculation and clamping, unreadable and missing answers, the four strictness modes and six tones staying in their own prompt sections, rubric validation, locking and hashing, teacher overrides and regrade protection, batch processing with isolated failures, name detection, file validation, and the full pipeline (rubric extraction → lock → batch grading → review → approval → class stats → insights) against a real SQLite database.

### Deployment notes

The app is designed to run locally. To host it online you need a persistent disk for `DATA_DIR` (for example a VPS, Railway or Fly.io with a volume). Serverless platforms like Vercel don't keep local files, so they would need a hosted database and object storage instead. Always set `APP_PASSWORD` and `SESSION_SECRET` when hosting.
