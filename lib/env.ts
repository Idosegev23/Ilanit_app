import { z } from 'zod';

// All env keys from spec §8. Validated lazily and cached — NEVER at module
// import time, so `next build` works without secrets present.
const envSchema = z.object({
  // ── App ──
  NEXT_PUBLIC_APP_URL: z.string().url(),
  AUTH_URL: z.string().url().optional(),
  TIMEZONE: z.string().default('Asia/Jerusalem'),

  // ── Database (Neon) ──
  DATABASE_URL: z.string().url(),

  // ── Auth.js v5 + Google OAuth (login + calendar) ──
  AUTH_SECRET: z.string().min(16),
  AUTH_GOOGLE_ID: z.string().min(1),
  AUTH_GOOGLE_SECRET: z.string().min(1),
  ALLOWED_LOGIN_EMAIL: z.string().email(),
  GOOGLE_CALENDAR_ID: z.string().default('primary'),
  TOKEN_ENC_KEY: z.string().min(1), // 32 bytes hex/base64 for AES-256-GCM

  // ── WhatsApp (GreenAPI — outbound only) ──
  GREEN_API_ID_INSTANCE: z.string().min(1),
  GREEN_API_TOKEN: z.string().min(1),
  GREEN_API_BASE_URL: z.string().url().default('https://api.green-api.com'),
  ILANIT_PHONE: z.string().min(1),

  // ── Morning ──
  MORNING_API_KEY: z.string().min(1),
  MORNING_API_SECRET: z.string().min(1),
  MORNING_BASE_URL: z.string().url().default('https://api.greeninvoice.co.il/api/v1'),
  MORNING_BUSINESS_ID: z.string().optional(),
  MORNING_DOC_TYPE: z.string().optional(),

  // ── AI Insights (OpenAI) ──
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default('gpt-5.4'),

  // ── Cron / Blob ──
  CRON_SECRET: z.string().min(16),
  BLOB_READ_WRITE_TOKEN: z.string().min(1),

  // ── Collection (payment-chasing) engine ──
  // 'true' lets the collection engine send WhatsApp messages (after-lesson
  // "paid?" prompts, overdue-debt reminders, monthly group billing). Default
  // OFF — Ilanit asked to silence all collection messages for now.
  COLLECTION_ENABLED: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/**
 * Returns validated, cached environment configuration.
 * Throws (with readable issues) only when actually called at runtime —
 * never at module import, so the build can run without secrets.
 */
export function env(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('\n');
    console.error('[env] environment validation failed:\n' + issues);
    throw new Error('Invalid environment configuration');
  }
  cached = parsed.data;
  return cached;
}

/** Test-only helper to reset the cache between runs. */
export function resetEnvCache(): void {
  cached = null;
}

/**
 * Whether the payment-collection engine ("מנוע גבייה") may send WhatsApp
 * messages. Default OFF; flip by setting COLLECTION_ENABLED=true in the
 * environment. Read straight from process.env (not the validated env()) so it
 * works without the full config present — and so a missing value is simply OFF.
 */
export function collectionEnabled(): boolean {
  return process.env.COLLECTION_ENABLED === 'true';
}
