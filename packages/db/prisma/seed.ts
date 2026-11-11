/**
 * Prisma seed: bootstrap admin account so /api/v1/admin/* routes are usable.
 *   Admin email: admin@api-website.local
 *   Admin password: change this in code or via env before going live.
 */
import { PrismaClient } from '@prisma/client';
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);

async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(32).toString('hex');
  const derived = (await scrypt(plain, salt, 64)) as Buffer;
  return `scrypt:${salt}:${derived.toString('hex')}`;
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@api-website.local';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!';
  const hash = await hashPassword(password);

  const admin = await prisma.user.upsert({
    where: { email },
    update: { role: 'ADMIN' },
    create: { email, passwordHash: hash, role: 'ADMIN', plan: 'ENTERPRISE' },
  });
  console.log(`[seed] admin ready: ${admin.email} (${admin.id})`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});