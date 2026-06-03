import { env } from '@/lib/env';
import { getSettings } from '@/lib/settings';

// Morning (greeninvoice) client. Auth = id+secret → short-lived JWT, then create
// an official document (receipt / tax-invoice-receipt) for an offline payment.
// Money is integer shekels (no agorot). The returned PDF URL is later mirrored
// to Vercel Blob and attached to the WhatsApp message + saved to the client file.

export interface ReceiptInput {
  clientName: string;
  clientPhone?: string;
  amount: number; // ₪ integer
  description: string;
  method?: 'bit' | 'cash' | 'transfer' | 'other';
}

export interface ReceiptResult {
  docId: string;
  docNumber: string;
  pdfUrl: string;
}

// Default Morning document type when none configured: 400 = receipt (קבלה).
const DEFAULT_DOC_TYPE = 400;

// Morning payment-row types: 1=cash, 2=cheque, 3=credit-card, 4=bank-transfer,
// 10=other (covers Bit). We map the offline methods we track onto these.
const PAYMENT_TYPE: Record<NonNullable<ReceiptInput['method']>, number> = {
  cash: 1,
  transfer: 4,
  bit: 10,
  other: 10,
};

interface MorningTokenResponse {
  token?: string;
  errorCode?: number;
  errorMessage?: string;
}

interface MorningDocResponse {
  id?: string;
  number?: string | number;
  url?: { he?: string; origin?: string; en?: string } | string;
  errorCode?: number;
  errorMessage?: string;
}

function baseUrl(): string {
  return env().MORNING_BASE_URL.replace(/\/+$/, '');
}

/** Authenticates with Morning (id+secret) and returns a bearer JWT. */
async function getMorningToken(): Promise<string> {
  const e = env();
  const res = await fetch(`${baseUrl()}/account/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: e.MORNING_API_KEY, secret: e.MORNING_API_SECRET }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Morning auth failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as MorningTokenResponse;
  if (!data.token) {
    throw new Error(
      `Morning auth returned no token${data.errorMessage ? `: ${data.errorMessage}` : ''}`,
    );
  }
  return data.token;
}

/** Resolves the configured document type (env → settings → default 400). */
async function resolveDocType(): Promise<number> {
  const e = env();
  const fromEnv = e.MORNING_DOC_TYPE ? Number(e.MORNING_DOC_TYPE) : NaN;
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  try {
    const s = await getSettings();
    const fromSettings = s.morningDocType ? Number(s.morningDocType) : NaN;
    if (Number.isFinite(fromSettings) && fromSettings > 0) return fromSettings;
  } catch {
    // settings unavailable (e.g. tests without DB) → fall through to default
  }
  return DEFAULT_DOC_TYPE;
}

/** Extracts a Hebrew (or any) PDF URL from Morning's polymorphic `url` field. */
function extractPdfUrl(url: MorningDocResponse['url']): string {
  if (!url) return '';
  if (typeof url === 'string') return url;
  return url.he ?? url.origin ?? url.en ?? '';
}

/**
 * Creates an official Morning document for an offline payment and returns the
 * stored document id, human document number, and the PDF URL.
 */
export async function createReceipt(i: ReceiptInput): Promise<ReceiptResult> {
  if (!Number.isInteger(i.amount) || i.amount <= 0) {
    throw new Error('Morning receipt amount must be a positive integer (shekels)');
  }

  const token = await getMorningToken();
  const docType = await resolveDocType();
  const paymentType = PAYMENT_TYPE[i.method ?? 'other'];

  const body = {
    type: docType,
    lang: 'he',
    currency: 'ILS',
    client: {
      name: i.clientName,
      ...(i.clientPhone ? { phone: i.clientPhone } : {}),
    },
    income: [
      {
        description: i.description,
        quantity: 1,
        price: i.amount, // integer shekels
        currency: 'ILS',
        vatType: 0,
      },
    ],
    payment: [
      {
        type: paymentType,
        price: i.amount, // integer shekels
        currency: 'ILS',
      },
    ],
  };

  const res = await fetch(`${baseUrl()}/documents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Morning createReceipt failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as MorningDocResponse;
  if (data.errorCode) {
    throw new Error(
      `Morning createReceipt error ${data.errorCode}: ${data.errorMessage ?? 'unknown'}`,
    );
  }
  if (!data.id) {
    throw new Error('Morning createReceipt returned no document id');
  }

  return {
    docId: String(data.id),
    docNumber: data.number !== undefined ? String(data.number) : '',
    pdfUrl: extractPdfUrl(data.url),
  };
}
