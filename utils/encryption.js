// AES-256-GCM field-level encryption for sensitive medical record fields.
//
// Values are stored as:  enc:v1:<ivHex>:<tagHex>:<cipherHex>
// If FIELD_ENCRYPTION_KEY is not set, encryption is a no-op (plaintext) so the
// app keeps working in dev. In that case decrypt() also returns input as-is.
//
// We additionally expose a deterministic blind index (HMAC) so encrypted
// fields remain searchable without revealing plaintext.

import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const PREFIX = 'enc:v1:';
const ALGO = 'aes-256-gcm';

function getKey() {
  const hex = process.env.FIELD_ENCRYPTION_KEY;
  if (!hex) return null;
  const key = Buffer.from(hex, 'hex');
  if (key.length !== 32) {
    console.warn('[encryption] FIELD_ENCRYPTION_KEY must be 32 bytes (64 hex chars). Encryption disabled.');
    return null;
  }
  return key;
}

export function isEncryptionEnabled() {
  return getKey() !== null;
}

export function encrypt(plain) {
  if (plain === undefined || plain === null || plain === '') return plain;
  const key = getKey();
  if (!key) return plain; // no-op in dev
  if (typeof plain === 'string' && plain.startsWith(PREFIX)) return plain; // already encrypted
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decrypt(value) {
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) return value;
  const key = getKey();
  if (!key) return value;
  try {
    const [, , ivHex, tagHex, dataHex] = value.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const data = Buffer.from(dataHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    return dec.toString('utf8');
  } catch (err) {
    console.error('[encryption] decrypt failed:', err.message);
    return '[decryption error]';
  }
}

// Deterministic searchable token for an encrypted value.
export function blindIndex(plain) {
  const key = getKey();
  if (!plain) return undefined;
  const secret = key || Buffer.from('voicemed-blind-index-fallback');
  return crypto.createHmac('sha256', secret).update(String(plain).toLowerCase().trim()).digest('hex');
}
