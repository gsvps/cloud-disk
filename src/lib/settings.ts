import { eq } from 'drizzle-orm';
import type { createDb } from '../db';
import { appSettings } from '../db/schema';

export async function getSetting(
  db: ReturnType<typeof createDb>,
  key: string,
  defaultValue = ''
): Promise<string> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return row?.value ?? defaultValue;
}

export async function setSetting(
  db: ReturnType<typeof createDb>,
  key: string,
  value: string
): Promise<void> {
  const now = new Date();
  const [existing] = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  if (existing) {
    await db.update(appSettings).set({ value, updatedAt: now }).where(eq(appSettings.key, key));
  } else {
    await db.insert(appSettings).values({ key, value, updatedAt: now });
  }
}

export async function isRegistrationOpen(db: ReturnType<typeof createDb>): Promise<boolean> {
  const value = await getSetting(db, 'registration_open', 'true');
  return value !== 'false' && value !== '0';
}
