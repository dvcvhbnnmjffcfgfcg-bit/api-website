/**
 * Password hashing with scrypt (Node built-in, no external deps).
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);

const SALT_LEN = 32;
const KEY_LEN = 64;

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LEN).toString('hex');
  const derived = (await scrypt(plain, salt, KEY_LEN)) as Buffer;
  return `scrypt:${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const [scheme, salt, expectedHex] = stored.split(':');
  if (scheme !== 'scrypt' || !salt || !expectedHex) return false;
  const actual = (await scrypt(plain, salt, KEY_LEN)) as Buffer;
  const expected = Buffer.from(expectedHex, 'hex');
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}