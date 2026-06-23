import { eq } from 'drizzle-orm';
import type { createDb } from '../db';
import { userGroups, users } from '../db/schema';

export type UserPermissions = {
  user: typeof users.$inferSelect;
  group: typeof userGroups.$inferSelect | null;
  isAdmin: boolean;
  canUpload: boolean;
  canShare: boolean;
  canCollab: boolean;
  canAdmin: boolean;
};

export async function getUserPermissions(
  db: ReturnType<typeof createDb>,
  userId: string
): Promise<UserPermissions | null> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;

  let group: typeof userGroups.$inferSelect | null = null;
  if (user.groupId) {
    const [g] = await db.select().from(userGroups).where(eq(userGroups.id, user.groupId)).limit(1);
    group = g ?? null;
  }

  const isAdmin = user.role === 'admin';
  return {
    user,
    group,
    isAdmin,
    canUpload: isAdmin || !!group?.canUpload,
    canShare: isAdmin || !!group?.canShare,
    canCollab: isAdmin || !!group?.canCollab,
    canAdmin: isAdmin || !!group?.canAdmin,
  };
}

export function isUserActive(user: typeof users.$inferSelect): boolean {
  return user.status !== 'disabled';
}
