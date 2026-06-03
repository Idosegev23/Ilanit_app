import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { env } from '@/lib/env';

// AES-256-GCM symmetric encryption for secrets at rest (e.g. Google refresh
// tokens). Key derived from TOKEN_ENC_KEY (32 bytes, hex or base64).

const ALGO = 'aes-256-gcm';
const IV_LEN = 12; // 96-bit nonce, recommended for GCM
const TAG_LEN = 16;

function loadKey(): Buffer {
  const raw = env().TOKEN_ENC_KEY;
  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, 'hex');
  } else {
    key = Buffer.from(raw, 'base64');
  }
  if (key.length !== 32) {
    throw new Error(
      `TOKEN_ENC_KEY must decode to 32 bytes for AES-256-GCM (got ${key.length})`,
    );
  }
  return key;
}

/**
 * Encrypts plaintext, returning a compact base64 string of iv|tag|ciphertext.
 */
export function encrypt(plain: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

/**
 * Decrypts a value produced by encrypt(). Throws on tamper / wrong key.
 */
export function decrypt(enc: string): string {
  const key = loadKey();
  const data = Buffer.from(enc, 'base64');
  if (data.length < IV_LEN + TAG_LEN) {
    throw new Error('ciphertext too short');
  }
  const iv = data.subarray(0, IV_LEN);
  const tag = data.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = data.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString('utf8');
}
