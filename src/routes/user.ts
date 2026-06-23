import { Hono } from 'hono';
import { eq, like } from 'drizzle-orm';
import type { Env } from '../env';
import { createDb } from '../db';
import { users } from '../db/schema';
import { jsonOk } from '../lib/response';
import { authMiddleware, type AuthVariables } from '../middleware/auth';

const userRouter = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

userRouter.use('*', authMiddleware);

userRouter.get('/me', async (c) => {
  const session = c.get('user');
  const db = createDb(c.env.DB);
  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  return jsonOk(c, {
    user: {
      id: session.userId,
      username: session.username,
      role: user?.role ?? 'user',
    },
  });
});

userRouter.get('/search', async (c) => {
  const q = c.req.query('q')?.trim();
  if (!q || q.length < 1) return jsonOk(c, { users: [] });

  const db = createDb(c.env.DB);
  const rows = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(like(users.username, `%${q}%`))
    .limit(10);

  return jsonOk(c, { users: rows });
});

export default userRouter;
