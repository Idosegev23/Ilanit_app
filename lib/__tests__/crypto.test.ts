import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomBytes } from 'crypto';

// A valid 32-byte key, hex-encoded, for AES-256-GCM.
const KEY_HEX = randomBytes(32).toString('hex');

// Mock env() so crypto can read TOKEN_ENC_KEY without real environment setup.
vi.mock('@/lib/env', () => ({
  env: () => ({ TOKEN_ENC_KEY: KEY_HEX }),
}));

import { encrypt, decrypt } from '@/lib/crypto';

describe('crypto (AES-256-GCM)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('round-trips plaintext', () => {
    const plain = 'a-very-secret-refresh-token-1//0abcDEF';
    const enc = encrypt(plain);
    expect(enc).not.toBe(plain);
    expect(decrypt(enc)).toBe(plain);
  });

  it('round-trips unicode / Hebrew text', () => {
    const plain = 'אילנית שלום 🌟';
    expect(decrypt(encrypt(plain))).toBe(plain);
  });

  it('produces different ciphertext each time (random IV)', () => {
    const plain = 'same-input';
    expect(encrypt(plain)).not.toBe(encrypt(plain));
  });

  it('fails to decrypt tampered ciphertext (auth tag check)', () => {
    const enc = encrypt('hello');
    const buf = Buffer.from(enc, 'base64');
    buf[buf.length - 1] ^= 0xff; // flip a ciphertext byte
    const tampered = buf.toString('base64');
    expect(() => decrypt(tampered)).toThrow();
  });

  it('rejects too-short input', () => {
    expect(() => decrypt(Buffer.from('short').toString('base64'))).toThrow();
  });
});
