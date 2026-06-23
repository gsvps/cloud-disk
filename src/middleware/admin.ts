import type { Context, Next } from 'hono';
import { eq } from 'drizzle-orm';
import type { Env } from '../env';
import { createDb } from '../db';
import { users } from '../db/schema';
import { jsonFail } from '../lib/response';
import type { AuthVariables } from '../middleware/auth';

export type AdminVariables = AuthVariables & {
  adminUser: typeof users.$inferSelect;
};

export async function adminMiddleware(
  c: Context<{ Bindings: Env; Variables: AdminVariables }>,
  next: Next
) {
  const session = c.get('user');
  const db = createDb(c.env.DB);
  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);

  if (!user || user.role !== 'admin') {
    return jsonFail(c, 'FORBIDDEN', '需要管理员权限', 403);
  }
  if (user.status === 'disabled') {
    return jsonFail(c, 'FORBIDDEN', '账号已禁用', 403);
  }

  c.set('adminUser', user);
  await next();
}
