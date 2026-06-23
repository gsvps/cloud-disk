import { Hono } from 'hono';
import type { Env } from '../env';
import { jsonOk } from '../lib/response';
import { authMiddleware, type AuthVariables } from '../middleware/auth';

const userRouter = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

userRouter.use('*', authMiddleware);

userRouter.get('/me', async (c) => {
  const user = c.get('user');
  return jsonOk(c, { user: { id: user.userId, username: user.username } });
});

export default userRouter;
