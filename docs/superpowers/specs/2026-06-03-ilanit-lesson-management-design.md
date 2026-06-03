# מערכת ניהול השיעורים של אילנית — מסמך עיצוב (Design Spec)

- **תאריך:** 2026-06-03
- **סטטוס:** מאושר; עודכן 2026-06-03 (קבוצות למידה · יומן כמקור-אמת · OpenAI gpt-5.4 לתובנות)
- **בעלים:** עידו שגב (triroars@gmail.com)
- **משתמשת קצה:** אילנית — מורה פרטית

---

## 1. מטרה (Overview)

מערכת ניהול עסקית מרוכזת לעסק השיעורים הפרטיים של אילנית. המערכת מטפלת בכל מחזור החיים של שיעור: **תיאום עצמי על-ידי תלמידים → אישור על-ידי אילנית → כניסה ליומן → תזכורות → מעקב תשלום → הפקת קבלה → תובנות עסקיות**.

המערכת היא מוצר אחד עם מודל נתונים משותף (תלמידים, שיעורים, תשלומים, קבלות), שנבנה **במלואו לפני השקה** (לא בשלבים), אך מאורגן במודולים מבודדים וניתנים-לבדיקה.

### יעדי-על
1. תלמידים קובעים שיעור בעצמם דרך לינק ציבורי, רואים זמנים פנויים אמיתיים.
2. אילנית מאשרת/דוחה בלחיצה אחת מהנייד; באישור — השיעור נכנס ליומן Google של אילנית, ואם לתלמיד יש מייל — גם ליומן שלו.
3. תזכורות אוטומטיות: יום לפני (לתלמיד + לאילנית), ובדיקת תשלום אחרי שיעור.
4. הפקת קבלה רשמית ב-Morning ושליחתה בוואטסאפ לתלמיד **כצרופה (קובץ PDF בהודעה)**, עם **עותק נשמר בתיק הלקוח**.
5. דשבורד עם KPIs, גרפים ותובנות AI (OpenAI `gpt-5.4`) לייעול הלו"ז וההכנסות.
6. **קבוצות למידה**: ניהול חברוֹת, מפגשים ביומן, וחיוב חודשי מראש (ב-1 לחודש) עם רוסטר אישור תשלום ותזכורות מותאמות-סוג.

---

## 2. החלטות מאושרות (Locked Decisions)

| נושא | החלטה |
|---|---|
| חיבור יומן | **OAuth 2.0** — אילנית מאשרת **פעם אחת**; refresh token נשמר מוצפן. הכניסה ליומן התלמיד דורשת מייל של התלמיד (הזמנת Google). |
| Morning | **מפתח API נפרד לעסק של אילנית** (id+secret תחת העסק שלה). |
| מודל תשלום | **מעקב + קבלה** בלבד (תשלום אופליין: ביט/מזומן/העברה). אין גבייה אונליין ב-v1. |
| ערוץ אישור | **וואטסאפ (יוצא) + דשבורד.** כל פעולה דרך לינק. |
| פורמט שיעור | **פרונטלי בלבד**, מיקום **קבוע** (כתובת אחת, נכנסת אוטומטית להזמנה). |
| תמחור | **מחיר לכל תלמיד** (ברירת-מחדל בכרטיס, ניתן לעקוף בתיאום). |
| מטבע | **שקלים שלמים בלבד** (int ₪). אין אגורות, אין עשרוני. |
| מאגר תלמידים | **כן** — תלמידים חוזרים, כרטיס לכל תלמיד. |
| תזכורת יום-לפני | **לתלמיד + לאילנית.** |
| לינק תיאום | **לינק כללי אחד**; תלמיד קיים מזוהה לפי טלפון. |
| תובנות | סטטיסטיקות + תובנות מבוססות-כללים **+ תובנות AI** (OpenAI `gpt-5.4`). |
| חזרה שבועית | **כלול ב-v1** — אילנית יוצרת שיעור חוזר לתלמיד קבוע. |
| הודעות נכנסות (webhook) | **אין.** וואטסאפ יוצא בלבד; כל אינטראקציה דרך לינקים. אפס נגיעה בפרויקט world-cup. |
| בסיס נתונים | **Neon Postgres + Drizzle ORM.** (לא Supabase.) |
| אחסון קבצים | **Vercel Blob** ל-PDF של קבלות. |
| אימות | **Auth.js (NextAuth) + Google**, מוגבל למייל של אילנית. אותה הסכמה = לוגין + יומן. |
| דומיין | **דומיין משלה** (שם סופי יסופק לפני השקה). `NEXT_PUBLIC_APP_URL` משתנה סביבה. |
| קבוצות למידה | **סוג אירוע נוסף.** אילנית מנהלת חברוֹת ידנית; מפגשים חוזרים ביומן; **חיוב חודשי מראש ב-1 לחודש**; רוסטר אישור תשלום; תזכורות מותאמות לסוג. |
| מקור-אמת לשיעורים | **היומן.** ה-cron סורק את היומן לזיהוי שיעורים שהסתיימו (כולל אירועים שאילנית יצרה ידנית) ומפעיל את שאלת התשלום. |
| תבניות הודעה | מותאמות **לפי סוג** (יחיד / קבוצה). |
| מנוע AI | **OpenAI `gpt-5.4`** (לא Claude). |

---

## 3. ארכיטקטורה וסטאק

**Next.js 16 (App Router, RTL עברית) · Neon Postgres + Drizzle · Auth.js (Google) · Vercel Cron + Vercel Blob · GreenAPI (יוצא בלבד) · Morning API · OpenAI (`gpt-5.4`).** פרויקט Vercel חדש ועצמאי `ilanit`.

מבוסס על דפוסים מוכחים מ-`krayot-rental` (ספק GreenAPI, אימות cron, טוקני אישור, vitest) ומ-`triroarswebsite` (חיבור Google Calendar), ללא ה-SDK של Supabase.

```
┌──────────────────────────── ilanit/ (Next.js 16 · Vercel · RTL) ─────────────────────────────┐
│  🌐 ציבורי (תלמידים, ללא לוגין)        │  🔒 אילנית (לוגין Google = גם יומן)                     │
│  /book  עמוד תיאום                     │  /dashboard  הכנסות · תפוסה · תובנות AI                 │
│  (זמנים פנויים → פרטים → "ממתין")      │  /students   מאגר תלמידים (מחיר ברירת-מחדל)             │
│                                        │  /lessons    יומן · אישור/דחייה/ביטול · יצירה ידנית     │
│                                        │  /settings   זמינות · כתובת · מחירים · Morning          │
│                                        │  + לינקי-פעולה: /a/[token] (אישור), /p/[token] (תשלום)  │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│  API + Cron:  /api/availability · /api/book · /api/approve · /api/payment                     │
│               /api/cron/reminders (יומי) · /api/cron/payment-check (שעתי) · payment-followup   │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│  lib/  (כל אינטגרציה עטופה, ניתנת-להחלפה):                                                     │
│  google-calendar (OAuth) · whatsapp (GreenAPI יוצא) · morning · insights (Claude) ·           │
│  availability-engine · tokens · notifications                                                 │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│  Neon Postgres (Drizzle):  students · lessons · payments · receipts · availability ·          │
│   availability_exceptions · settings · google_tokens · action_tokens · message_log ·          │
│   insights_cache          │   Vercel Blob: PDF קבלות                                          │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

**עיקרון מנחה:** כל שירות חיצוני נמצא מאחורי ממשק נקי ב-`lib/`, כך שניתן לבדוק כל מודול בנפרד ולהחליף ספק (למשל מעבר ל-instance וואטסאפ של אילנית) בשינוי קונפיגורציה בלבד.

---

## 4. מודל הנתונים (Neon · Drizzle)

> כסף = **int בשקלים שלמים**. זמנים = `timestamptz`, אזור `Asia/Jerusalem`.

| טבלה | שדות מרכזיים |
|---|---|
| **students** | `id, name, phone (E.164, unique), email?, default_price?, default_duration_min, notes?, archived, created_at` |
| **lessons** | `id, type (individual\|group_session), source (booking\|recurrence\|calendar_import\|manual), student_id?→, group_id?→, starts_at, ends_at, status, needs_match (bool), price (snapshot ₪), location (snapshot), google_event_id?, recurrence_id?, booked_by_name?, booked_by_phone?, notes?, created_at, confirmed_at?, cancelled_at?, cancel_reason?` |
| **payments** | `id, lesson_id→ (1:1), status (due\|paid\|waived), amount (₪), method? (bit\|cash\|transfer\|other), paid_at?, created_at` |
| **receipts** | `id, payment_id?→, group_billing_id?→, morning_doc_id, morning_doc_number, doc_type, amount (₪), pdf_url (Blob), status (created\|sent\|failed), sent_at?, created_at` (בדיוק אחד מ-`payment_id`/`group_billing_id`) |
| **availability** | `id, weekday (0-6), start_time, end_time, active` (כמה חלונות ביום מותר) |
| **availability_exceptions** | `id, date, type (blocked\|custom), start_time?, end_time?` (חופשות / ימי מחלה / יום מיוחד) |
| **settings** | שורה אחת: `business_name, location_address, default_duration_min, buffer_min, lead_time_min, booking_horizon_days, reminder_time, payment_followup_delay_h, group_billing_day (ברירת מחדל 1), group_followup_days, morning_doc_type, morning_business_meta (jsonb), timezone` |
| **google_tokens** | שורה אחת: `account_email, refresh_token (מוצפן AES-GCM), access_token?, expiry?, calendar_id, scope` |
| **action_tokens** | `id, token_hash, type (approve\|payment\|assign_student), lesson_id→, expires_at, used_at?, created_at` (חד-פעמי) |
| **message_log** | `id, to_phone, template, body, related_lesson_id?, provider_msg_id?, status, error?, created_at` (אודיט + אנטי-כפילות) |
| **insights_cache** | `id, period, stats (jsonb), ai_text, model, generated_at` |
| **recurrences** | `id, kind (individual\|group), student_id?→, group_id?→, weekday, start_time, duration_min, price?, active, created_at` (תבנית חוזרת — שיעור פרטי או מפגש קבוצה) |
| **groups** | `id, name, monthly_price (₪), location, description?, active, created_at` |
| **group_members** | `id, group_id→, student_id→, active, joined_at` (unique `group_id`+`student_id`) |
| **group_billing** | `id, group_id→, student_id→, month (date=1 לחודש), amount (₪), status (due\|paid\|waived), method?, paid_at?, receipt_id?, created_at` (unique `group`+`student`+`month`) |
| **student_aliases** | `id, student_id→, alias_type (email\|title), value, created_at` (זיכרון שיוך אירועי יומן ידניים) |

**מעברי `lesson.status`:** `pending → confirmed → completed` · `pending → rejected` · `confirmed → cancelled`. שיעור ב-`pending` או `confirmed` **תופס את הסלוט** ומונע תיאום-כפול. שיעור שיובא מהיומן ללא התאמת תלמיד מסומן `needs_match` עד לשיוך ידני. מפגש קבוצה (`type=group_session`) **אינו** מפעיל בדיקת תשלום (החיוב חודשי).

---

## 5. זרימות מרכזיות

### 5.1 תיאום → אישור → יומן
1. תלמיד ב-`/book` בוחר יום → רואה סלוטים פנויים (מנוע הזמינות) → בוחר → ממלא **שם + טלפון** (מייל **מומלץ** עם הסבר: מאפשר כניסה ליומן שלו) + הערות.
2. `POST /api/book` (בטרנזקציה): re-check שהסלוט פנוי (DB + freebusy + lead-time) → התאמת/יצירת תלמיד לפי טלפון → יצירת `lesson(pending)` עם snapshot מחיר/כתובת → יצירת `action_token(approve)` → וואטסאפ לאילנית עם לינק [אשר/דחה] → וואטסאפ לתלמיד "ממתין לאישור" → המסך מציג "נקבע, ממתין לאישור".
3. אילנית ב-`/a/[token]`:
   - **אשר** → re-check ביומן → `events.insert` (OAuth): `summary="שיעור – {שם}"`, `location=כתובת`, `attendees=[מייל אם קיים]`, `sendUpdates:'all'`, reminders → `lesson=confirmed` + `google_event_id` → וואטסאפ לתלמיד "אושר! {תאריך שעה} בכתובת… [הוסף ליומן]".
   - **דחה** → `lesson=rejected` (סלוט משתחרר) → וואטסאפ לתלמיד עם לינק לקבוע מחדש.

**הערת דיוק:** כניסה אוטומטית ליומן *התלמיד* דורשת מייל. ללא מייל — השיעור ביומן של אילנית בלבד + לינק "הוסף ליומן" (Google Calendar template URL) בוואטסאפ.

### 5.2 מנוע הזמינות
סלוטים פנויים = תבנית שבועית − חריגים − שיעורים (pending+confirmed) − freebusy מיומן אילנית − lead-time − עבר, מחולק לסלוטים לפי `default_duration_min + buffer`. אותו מנוע מזין את חישוב **אחוז התפוסה** (קיבולת מהתבנית מול confirmed בפועל).

### 5.3 תזכורות וזיהוי-תשלום (Vercel Cron, מאומת `CRON_SECRET`)
| Cron | תדירות | פעולה |
|---|---|---|
| `/api/cron/tick` | שעתי | שלוש משימות עם gating לפי שעון `Asia/Jerusalem`: **(א) תזכורת יום-לפני** (בשעה מ-`settings.reminder_time`) — שיעורי/מפגשי מחר → וואטסאפ לתלמיד / לחברוֹת-הקבוצה + סיכום לאילנית, **תבנית לפי סוג**. **(ב) סריקת יומן** — אירועים שהסתיימו מאז הריצה הקודמת: שיעור פרטי → `completed` + `payment(due)` + `action_token(payment)` → לאילנית "שולם {₪}? [כן/לא]"; אירוע לא-מזוהה → התאמה לפי מייל/כותרת/`student_aliases`, ואם נכשל → `lesson(needs_match)` + לאילנית "למי לשייך? [בחר]" (`/m/[token]`); מפגשי קבוצה מסומנים ומדולגים. **(ג) followup** — חובות `due` ישנים → תזכורת לאילנית. |
| `/api/cron/group-billing` | יומי | אם היום = `settings.group_billing_day`: לכל קבוצה פעילה × חברה פעילה → `group_billing(due)` לחודש (סכום = מחיר חודשי snapshot) → בקשת תשלום לכל חברה (תבנית קבוצה) + לאילנית לינק לרוסטר. בנוסף: תזכורת לחברוֹת שעדיין `due`. |

כל השליחות **אידמפוטנטיות** דרך `message_log`.

### 5.4 תשלום + קבלה (Morning)
אילנית ב-`/p/[token]` רואה שיעור + סכום (ניתן לערוך סכום שלם / אמצעי תשלום):
- **שולם — הפק קבלה** → `payment=paid` → `lib/morning` יוצר מסמך (סוג לפי `MORNING_DOC_TYPE`, פרטי לקוח, שורת הכנסה, שורת תשלום) → PDF → העלאה ל-Blob → **וואטסאפ לתלמיד עם הקבלה כצרופה — קובץ PDF מצורף בהודעה, לא לינק** (GreenAPI `sendFileByUrl`/`sendFileByUpload`) → **עותק הקבלה נשמר בתיק הלקוח** (`receipts` ↔ Blob, נגיש מ-`/students/[id]`).
- **טרם שולם — שלח בקשה** → וואטסאפ לתלמיד עם בקשת תשלום.

### 5.5 דשבורד + תובנות AI
- **KPIs:** הכנסות (תקופה) · מס' שיעורים (בוצעו/מאושרים/ממתינים) · אחוז תפוסה · תלמידים פעילים · חובות פתוחים.
- **גרפים:** הכנסה לאורך זמן · שיעורים לשבוע · מגמת תפוסה · top תלמידים (Recharts / סקיל analytics-metrics).
- **רשימות:** שיעורי היום/הקרובים · ממתינים לאישור · לא שולמו.
- **AI (OpenAI `gpt-5.4`):** cron יומי מזין ל-OpenAI **אגרגטים** (תפוסה לפי יום/שעה, פערים, קצב חזרת תלמידים/קבוצות, מגמות הכנסה; שמות פרטיים בלבד) ומחזיר תובנות מעשיות בעברית. נשמר ב-`insights_cache`.

### 5.6 חזרה שבועית (v1)
אילנית יוצרת מ-`/lessons` שיעור חוזר לתלמיד קבוע → רשומת `recurrences` → ייצור שיעורי `confirmed` קדימה (אופק מוגדר) + אירוע חוזר ב-Google Calendar. ביטול בודד או של הסדרה.

### 5.7 תיק לקוח (`/students/[id]`)
כרטיס כל תלמיד מציג **תיק לקוח** מלא: פרטים ומחיר ברירת-מחדל, **היסטוריית שיעורים** (כל הסטטוסים), **היסטוריית תשלומים** (שולם/חוב), ו**ארכיון קבלות** — כל קבלה שהופקה נשמרת כעותק PDF (Blob) וניתנת לצפייה/הורדה ישירות מהתיק. הקבלות נשלפות דרך `receipts → payments → lessons → student`. כך אותו PDF שנשלח לתלמיד בוואטסאפ נשמר אוטומטית גם בתיק הלקוח במערכת של אילנית. תיק הלקוח כולל גם חברוּת בקבוצות וחיובים חודשיים (`group_billing`) אם רלוונטי.

### 5.8 קבוצות למידה וחיוב חודשי (`/groups`)
- אילנית יוצרת **קבוצה** (`groups`: שם, מחיר חודשי, מיקום) ומנהלת **חברוֹת ידנית** (`group_members`). היא קובעת את לו"ז המפגשים → `recurrences(kind=group)` → אירועים חוזרים ביומן, מסומנים `type=group` (ב-extendedProperties), נכללים בתפוסה ובתזכורות יום-לפני לכל החברוֹת.
- **חיוב חודשי מראש:** ב-`settings.group_billing_day` (ברירת מחדל 1 לחודש) נוצרת `group_billing(due)` לכל חברה (סכום = מחיר חודשי snapshot). נשלחת בקשת תשלום בוואטסאפ לכל חברה (**תבנית קבוצה**), ולאילנית לינק ל**רוסטר** (`/groups/[id]/billing/[month]`).
- **רוסטר אישור:** אילנית מסמנת מי שילם / מי לא. **שילם** → `paid` → קבלת Morning → PDF כצרופה לחברה + עותק בתיק הלקוח. **לא שילם** → תזכורת תשלום (תבנית קבוצה); תזכורות-המשך עד סגירת החוב.

---

## 6. אימות, אבטחה וחוסן

- **Auth.js + Google**, כניסה מוגבלת ל-`ALLOWED_LOGIN_EMAIL`. אותה הסכמה (offline access) → refresh token ליומן, נשמר מוצפן (`google_tokens`). מסך ההסכמה מתפרסם ל-Production כדי שה-token לא יפוג. middleware מגן על `/dashboard /students /lessons /settings`.
- **לינקי-פעולה** (`/a`, `/p`): טוקן חד-פעמי, hashed, עם תפוגה — לא דורש לוגין (לחיצה אחת מהנייד).
- **Cron** מאומת ב-`CRON_SECRET`. **אין webhook נכנס.**
- **refresh token** מוצפן AES-GCM (`TOKEN_ENC_KEY`).
- **rate-limit** ל-`/api/book` ו-`/api/availability`. נרמול טלפון **E.164 (IL)**.
- כל קריאה חיצונית (Google/Morning/Green/OpenAI) ב-try/catch + לוג + הודעות graceful + אידמפוטנטיות.

---

## 7. בדיקות (vitest)

- מנוע הזמינות (חישוב סלוטים, חפיפות, buffer, lead-time, חריגים).
- נרמול טלפון E.164.
- לוגיקת טוקנים (חד-פעמיות, תפוגה).
- בניית payload ל-Morning.
- זרימת חזרה שבועית (ייצור סדרה).
- ספקים חיצוניים מוקאפים.

---

## 8. משתני סביבה (פרויקט ilanit) — כל הכותרות

```env
# ── App ──
NEXT_PUBLIC_APP_URL=
AUTH_URL=                       # = NEXT_PUBLIC_APP_URL (Auth.js בפרודקשן)
TIMEZONE=Asia/Jerusalem

# ── Database (Neon) ──
DATABASE_URL=

# ── Auth.js v5 + Google OAuth (לוגין + יומן) ──
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
ALLOWED_LOGIN_EMAIL=
GOOGLE_CALENDAR_ID=primary
TOKEN_ENC_KEY=                  # 32 בייט (hex/base64) ל-AES-256-GCM

# ── WhatsApp (GreenAPI — instance של עידו בינתיים, יוצא בלבד) ──
GREEN_API_ID_INSTANCE=
GREEN_API_TOKEN=
GREEN_API_BASE_URL=https://api.green-api.com
ILANIT_PHONE=972545886779

# ── Morning (העסק של אילנית) ──
MORNING_API_KEY=
MORNING_API_SECRET=
MORNING_BASE_URL=https://api.greeninvoice.co.il/api/v1
MORNING_BUSINESS_ID=
MORNING_DOC_TYPE=

# ── AI Insights (OpenAI) ──
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4

# ── Cron / Blob ──
CRON_SECRET=
BLOB_READ_WRITE_TOKEN=
```

> **world-cup: אפס שינויים** (ה-relay בוטל).

---

## 9. פריסה (Deployment)

1. **שלב 0:** יצירת פרויקט Vercel חדש `ilanit`, חיבור אינטגרציות Neon ו-Blob.
2. הגדרת Google OAuth (Client ID/Secret), redirect URI = `${NEXT_PUBLIC_APP_URL}/api/auth/callback/google`, פרסום מסך הסכמה ל-Production.
3. חיבור הדומיין של אילנית.
4. הגדרת Vercel Cron ב-`vercel.json`.
5. הרצת migrations של Drizzle מול Neon, וזריעת `settings` ראשוני + תלמידים קיימים.

---

## 10. מחוץ ל-Scope (v1) / עתיד

- הודעות וואטסאפ **נכנסות** (relay מ-world-cup / instance עצמאי לאילנית) — נדחה; כרגע הכל דרך לינקים.
- **גבייה אונליין** (לינק תשלום Morning) — נדחה; כרגע מעקב אופליין בלבד.
- **קבלה מרוכזת** למספר שיעורים בתשלום אחד — v1 הוא קבלה לכל תשלום.
- ריבוי משתמשים / ריבוי מורים — המערכת חד-משתמשת (אילנית).
- **לינק הצטרפות ציבורי לקבוצה** — נדחה; חברוֹת מנוהלות ידנית ע"י אילנית.

---

## 11. שאלות פתוחות (TBD לפני/במהלך מימוש)

1. **שם הדומיין הסופי** של אילנית (לפני הגדרת OAuth/השקה).
2. **סוג מסמך Morning** מדויק (`400` קבלה / `320` חשבונית מס-קבלה) + פרטי העסק (עוסק פטור/מורשה, ח.פ/ת.ז) — לפי סוג העסק של אילנית.
3. אימות **endpoints מדויקים של Morning** מול התיעוד הרשמי בזמן המימוש.
4. ערכי ברירת-מחדל ל-`settings` (משך שיעור, buffer, lead-time, אופק הזמנה, שעת תזכורת, יום חיוב קבוצות) — יאומתו עם אילנית.
5. **סוג מסמך Morning לקבלה חודשית של קבוצה** ופירוט שורות החשבון.
6. אופן **סימון מפגשי קבוצה ביומן** (extendedProperties) ושדות ההתאמה לזיהוי שיעור פרטי שנוצר ידנית.
