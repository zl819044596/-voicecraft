/**
 * BYOK key encryption (R1). Port of the proven v2 implementation.
 *
 * Master key: ENC_KEY (compose env). Formats: 64 hex chars or 44 base64 chars.
 * Per-key envelope: salt=16B random → scrypt(ENC_KEY, salt)=32B → AES-256-GCM
 * iv=12B; stored = base64(iv ‖ authTag ‖ ciphertext); salt stored as hex.
 * Plaintext keys exist only transiently inside these two functions; decrypt()
 * is used by the pipeline to call providers, never to return to the frontend.
 */

import crypto from 'node:crypto';

const IV_LEN = 12;
const TAG_LEN = 16;
const SALT_LEN = 16;

function resolveMasterKey(): Buffer {
  const enc = process.env.ENC_KEY;
  if (!enc) throw new Error('ENC_KEY is not set');
  const normalized = enc.trim();
  if (/^[0-9a-fA-F]{64}$/.test(normalized)) return Buffer.from(normalized, 'hex');
  const buf = Buffer.from(normalized, 'base64');
  if (buf.length === 32 && /^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) return buf;
  throw new Error('ENC_KEY must be 32 bytes (64 hex chars or 44 base64 chars)');
}

function deriveKey(masterKey: Buffer, salt: Buffer): Buffer {
  return crypto.scryptSync(masterKey, salt, 32);
}

export function encryptKey(plaintext: string): { ciphertext: string; salt: string } {
  const text = String(plaintext ?? '');
  if (text.length === 0) throw new Error('plaintext is empty');
  const masterKey = resolveMasterKey();
  const salt = crypto.randomBytes(SALT_LEN);
  const key = deriveKey(masterKey, salt);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, encrypted]);
  return { ciphertext: payload.toString('base64'), salt: salt.toString('hex') };
}

export function decryptKey(ciphertext: string, saltHex: string): string {
  const masterKey = resolveMasterKey();
  const salt = Buffer.from(String(saltHex), 'hex');
  const key = deriveKey(masterKey, salt);
  const payload = Buffer.from(String(ciphertext), 'base64');
  if (payload.length < IV_LEN + TAG_LEN) throw new Error('ciphertext is too short');
  const iv = payload.subarray(0, IV_LEN);
  const tag = payload.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = payload.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]);
  return plain.toString('utf8');
}

/** Mask a raw key for display: `sk-…wxyz` (first 3 + last 4). */
export function maskKey(plaintext: string): string {
  const t = String(plaintext ?? '');
  if (t.length <= 7) return '••••';
  return `${t.slice(0, 3)}…${t.slice(-4)}`;
}
