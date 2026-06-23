import { Hono } from 'hono';
import { and, eq, like, ne } from 'drizzle-orm';
import type { Env } from '../env';
import { createDb } from '../db';
import { users } from '../db/schema';
import { verifyPassword, hashPassword } from '../lib/crypto';
import { getUserPermissions } from '../lib/user-permissions';
import { jsonFail, jsonOk } from '../lib/response';
import { authMiddleware, type AuthVariables } from '../middleware/auth';

const userRouter = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

userRouter.use('*', authMiddleware);

userRouter.get('/me', async (c) => {
  const session = c.get('user');
  const db = createDb(c.env.DB);
  const perms = await getUserPermissions(db, session.userId);
  if (!perms) return jsonFail(c, 'NOT_FOUND', '用户不存在', 404);

  return jsonOk(c, {
    user: {
      id: session.userId,
      username: session.username,
      role: perms.user.role,
      groupId: perms.user.groupId,
      groupName: perms.group?.name ?? null,
      status: perms.user.status,
      permissions: {
        canUpload: perms.canUpload,
        canShare: perms.canShare,
        canCollab: perms.canCollab,
        canAdmin: perms.canAdmin,
      },
    },
  });
});

userRouter.put('/password', async (c) => {
  const session = c.get('user');
  const body = await c.req.json<{ oldPassword?: string; newPassword?: string }>();
  const oldPassword = body.oldPassword;
  const newPassword = body.newPassword;

  if (!oldPassword || !newPassword) {
    return jsonFail(c, 'BAD_REQUEST', '请填写原密码和新密码');
  }
  if (newPassword.length < 6) {
    return jsonFail(c, 'BAD_REQUEST', '新密码至少 6 位');
  }

  const db = createDb(c.env.DB);
  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!user) return jsonFail(c, 'NOT_FOUND', '用户不存在', 404);

  if (!(await verifyPassword(oldPassword, user.passwordHash))) {
    return jsonFail(c, 'BAD_REQUEST', '原密码不正确');
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(newPassword) })
    .where(eq(users.id, session.userId));

  return jsonOk(c, { updated: true });
});

userRouter.get('/search', async (c) => {
  const q = c.req.query('q')?.trim();
  if (!q || q.length < 1) return jsonOk(c, { users: [] });

  const currentUser = c.get('user');
  const excludeRaw = c.req.query('exclude')?.trim();
  const excludeIds = new Set(
    excludeRaw
      ? excludeRaw
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      : []
  );
  excludeIds.add(currentUser.userId);

  const db = createDb(c.env.DB);
  const rows = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(and(like(users.username, `${q}%`), ne(users.id, currentUser.userId)))
    .limit(12);

  const filtered = rows.filter((row) => !excludeIds.has(row.id)).slice(0, 8);
  return jsonOk(c, { users: filtered });
});

export default userRouter;
