/**
 * API Key utilities: generation, hashing (SHA-256) and HMAC-SHA256 request signing.
 * Keys are stored hashed — the plaintext is shown exactly once at creation.
 */
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { API_KEY_PREFIX } from '@api-website/shared';

/** Generate `sk_live_` + 32 random hex characters (16 random bytes). */
export function generateApiKey(): string {
  return API_KEY_PREFIX + randomBytes(16).toString('hex');
}

/** SHA-256 hex digest used for at-rest storage. */
export function hashApiKey(plain: string): string {
  return createHash('sha256').update(plain).digest('hex');
}

export interface HmacSignInput {
  apiKey: string;
  method: string;
  path: string;
  timestampSec: number;
}

/**
 * HMAC-SHA256 request signature.
 * message = METHOD + "\n" + path + "\n" + timestamp
 * Clients must send: X-API-Key, X-Timestamp, X-Signature.
 */
export function signRequest(input: HmacSignInput): string {
  const message = `${input.method}\n${input.path}\n${input.timestampSec}`;
  return createHmac('sha256', input.apiKey).update(message).digest('hex');
}

/** Constant-time-ish check that the provided signature matches. */
export function verifySignature(input: HmacSignInput, signature: string): boolean {
  return signRequest(input) === signature.toLowerCase();
}

/** Timestamps older than 5 minutes are rejected (replay protection). */
export function isTimestampValid(tsSec: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  return Math.abs(now - tsSec) <= 300;
}