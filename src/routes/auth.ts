import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { Env } from '../env';
import { createDb } from '../db';
import { users } from '../db/schema';
import { generateId, hashPassword, verifyPassword } from '../lib/crypto';
import { jsonFail, jsonOk } from '../lib/response';
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  sessionCookie,
  type AuthVariables,
} from '../middleware/auth';

const auth = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

auth.get('/setup-status', async (c) => {
  const db = createDb(c.env.DB);
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  return jsonOk(c, { needsSetup: existing.length === 0 });
});

auth.post('/setup', async (c) => {
  const db = createDb(c.env.DB);
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length > 0) {
    return jsonFail(c, 'FORBIDDEN', '系统已初始化，无法重复设置', 403);
  }

  const body = await c.req.json<{ username?: string; password?: string }>();
  const username = body.username?.trim();
  const password = body.password;

  if (!username || username.length < 2) {
    return jsonFail(c, 'BAD_REQUEST', '用户名至少 2 个字符');
  }
  if (!password || password.length < 6) {
    return jsonFail(c, 'BAD_REQUEST', '密码至少 6 个字符');
  }

  const userId = generateId();
  const passwordHash = await hashPassword(password);
  const now = new Date();

  await db.insert(users).values({
    id: userId,
    username,
    passwordHash,
    role: 'admin',
    createdAt: now,
  });

  const token = await createSession(c.env.KV, { userId, username });
  c.header('Set-Cookie', sessionCookie(token));

  return jsonOk(c, { user: { id: userId, username, role: 'admin' }, token });
});

auth.post('/login', async (c) => {
  const body = await c.req.json<{ username?: string; password?: string }>();
  const username = body.username?.trim();
  const password = body.password;

  if (!username || !password) {
    return jsonFail(c, 'BAD_REQUEST', '请输入用户名和密码');
  }

  const db = createDb(c.env.DB);
  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return jsonFail(c, 'UNAUTHORIZED', '用户名或密码错误', 401);
  }

  const token = await createSession(c.env.KV, { userId: user.id, username: user.username });
  c.header('Set-Cookie', sessionCookie(token));

  return jsonOk(c, {
    user: { id: user.id, username: user.username, role: user.role },
    token,
  });
});

auth.post('/logout', async (c) => {
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const cookie = c.req.header('Cookie');
  const cookieToken = cookie?.match(/(?:^|;\s*)token=([^;]+)/)?.[1];

  const sessionToken = token || (cookieToken ? decodeURIComponent(cookieToken) : null);
  if (sessionToken) {
    await deleteSession(c.env.KV, sessionToken);
  }

  c.header('Set-Cookie', clearSessionCookie());
  return jsonOk(c, { loggedOut: true });
});

auth.post('/register', async (c) => {
  const db = createDb(c.env.DB);
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length === 0) {
    return jsonFail(c, 'FORBIDDEN', '请先完成系统初始化', 403);
  }

  const body = await c.req.json<{ username?: string; password?: string }>();
  const username = body.username?.trim();
  const password = body.password;

  if (!username || username.length < 2) {
    return jsonFail(c, 'BAD_REQUEST', '用户名至少 2 个字符');
  }
  if (!password || password.length < 6) {
    return jsonFail(c, 'BAD_REQUEST', '密码至少 6 位');
  }

  const [dup] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
  if (dup) return jsonFail(c, 'BAD_REQUEST', '用户名已存在');

  const userId = generateId();
  const now = new Date();
  await db.insert(users).values({
    id: userId,
    username,
    passwordHash: await hashPassword(password),
    role: 'user',
    createdAt: now,
  });

  const token = await createSession(c.env.KV, { userId, username });
  c.header('Set-Cookie', sessionCookie(token));

  return jsonOk(c, { user: { id: userId, username, role: 'user' }, token });
});

export default auth;
