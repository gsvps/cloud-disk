import { Hono } from 'hono';
import { and, desc, eq, ne } from 'drizzle-orm';
import type { Env } from '../env';
import { createDb } from '../db';
import { userGroups, users } from '../db/schema';
import { generateId, hashPassword } from '../lib/crypto';
import { isRegistrationOpen, setSetting } from '../lib/settings';
import { jsonFail, jsonOk } from '../lib/response';
import { adminMiddleware, type AdminVariables } from '../middleware/admin';
import { authMiddleware } from '../middleware/auth';

const adminRouter = new Hono<{ Bindings: Env; Variables: AdminVariables }>();

adminRouter.use('*', authMiddleware, adminMiddleware);

function toGroupDto(group: typeof userGroups.$inferSelect) {
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    canUpload: group.canUpload,
    canShare: group.canShare,
    canCollab: group.canCollab,
    canAdmin: group.canAdmin,
    createdAt: group.createdAt.toISOString(),
  };
}

function toUserDto(user: typeof users.$inferSelect, groupName?: string | null) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    groupId: user.groupId,
    groupName: groupName ?? null,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
  };
}

adminRouter.get('/settings', async (c) => {
  const db = createDb(c.env.DB);
  const registrationOpen = await isRegistrationOpen(db);
  return jsonOk(c, { registrationOpen });
});

adminRouter.put('/settings', async (c) => {
  const body = await c.req.json<{ registrationOpen?: boolean }>();
  if (body.registrationOpen === undefined) {
    return jsonFail(c, 'BAD_REQUEST', '请指定 registrationOpen');
  }

  const db = createDb(c.env.DB);
  await setSetting(db, 'registration_open', body.registrationOpen ? 'true' : 'false');
  return jsonOk(c, { registrationOpen: body.registrationOpen });
});

adminRouter.get('/users', async (c) => {
  const db = createDb(c.env.DB);
  const rows = await db
    .select({ user: users, groupName: userGroups.name })
    .from(users)
    .leftJoin(userGroups, eq(users.groupId, userGroups.id))
    .orderBy(desc(users.createdAt));

  return jsonOk(c, {
    users: rows.map(({ user, groupName }) => toUserDto(user, groupName)),
  });
});

adminRouter.post('/users', async (c) => {
  const body = await c.req.json<{
    username?: string;
    password?: string;
    role?: string;
    groupId?: string | null;
    status?: string;
  }>();

  const username = body.username?.trim();
  const password = body.password;
  if (!username || username.length < 2) {
    return jsonFail(c, 'BAD_REQUEST', '用户名至少 2 个字符');
  }
  if (!password || password.length < 6) {
    return jsonFail(c, 'BAD_REQUEST', '密码至少 6 位');
  }

  const role = body.role === 'admin' ? 'admin' : 'user';
  const status = body.status === 'disabled' ? 'disabled' : 'active';
  const db = createDb(c.env.DB);

  const [dup] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
  if (dup) return jsonFail(c, 'BAD_REQUEST', '用户名已存在');

  let groupId = body.groupId ?? 'grp_default';
  if (groupId) {
    const [group] = await db.select().from(userGroups).where(eq(userGroups.id, groupId)).limit(1);
    if (!group) return jsonFail(c, 'BAD_REQUEST', '用户组不存在');
  } else if (role !== 'admin') {
    groupId = 'grp_default';
  }

  const userId = generateId();
  const now = new Date();
  await db.insert(users).values({
    id: userId,
    username,
    passwordHash: await hashPassword(password),
    role,
    groupId: role === 'admin' ? null : groupId,
    status,
    createdAt: now,
  });

  const [created] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  let groupName: string | null = null;
  if (created?.groupId) {
    const [g] = await db.select({ name: userGroups.name }).from(userGroups).where(eq(userGroups.id, created.groupId)).limit(1);
    groupName = g?.name ?? null;
  }

  return jsonOk(c, { user: toUserDto(created!, groupName) });
});

adminRouter.patch('/users/:id', async (c) => {
  const userId = c.req.param('id');
  const admin = c.get('adminUser');
  const body = await c.req.json<{
    username?: string;
    password?: string;
    role?: string;
    groupId?: string | null;
    status?: string;
  }>();

  const db = createDb(c.env.DB);
  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!target) return jsonFail(c, 'NOT_FOUND', '用户不存在', 404);

  const updates: Partial<typeof users.$inferInsert> = {};

  if (body.username !== undefined) {
    const username = body.username.trim();
    if (username.length < 2) return jsonFail(c, 'BAD_REQUEST', '用户名至少 2 个字符');
    const [dup] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.username, username), ne(users.id, userId)))
      .limit(1);
    if (dup) return jsonFail(c, 'BAD_REQUEST', '用户名已存在');
    updates.username = username;
  }

  if (body.role !== undefined) {
    if (target.id === admin.id && body.role !== 'admin') {
      return jsonFail(c, 'BAD_REQUEST', '不能取消自己的管理员权限');
    }
    updates.role = body.role === 'admin' ? 'admin' : 'user';
    if (updates.role === 'admin') updates.groupId = null;
  }

  if (body.groupId !== undefined) {
    const role = (updates.role ?? target.role) as string;
    if (role === 'admin') {
      updates.groupId = null;
    } else if (body.groupId === null) {
      updates.groupId = 'grp_default';
    } else {
      const [group] = await db.select().from(userGroups).where(eq(userGroups.id, body.groupId)).limit(1);
      if (!group) return jsonFail(c, 'BAD_REQUEST', '用户组不存在');
      updates.groupId = body.groupId;
    }
  }

  if (body.status !== undefined) {
    if (target.id === admin.id && body.status === 'disabled') {
      return jsonFail(c, 'BAD_REQUEST', '不能禁用自己');
    }
    updates.status = body.status === 'disabled' ? 'disabled' : 'active';
  }

  if (body.password !== undefined) {
    if (body.password.length < 6) return jsonFail(c, 'BAD_REQUEST', '密码至少 6 位');
    updates.passwordHash = await hashPassword(body.password);
  }

  if (!Object.keys(updates).length) return jsonFail(c, 'BAD_REQUEST', '没有可更新的字段');

  await db.update(users).set(updates).where(eq(users.id, userId));

  const [updated] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  let groupName: string | null = null;
  if (updated?.groupId) {
    const [g] = await db.select({ name: userGroups.name }).from(userGroups).where(eq(userGroups.id, updated.groupId)).limit(1);
    groupName = g?.name ?? null;
  }

  return jsonOk(c, { user: toUserDto(updated!, groupName) });
});

adminRouter.delete('/users/:id', async (c) => {
  const userId = c.req.param('id');
  const admin = c.get('adminUser');
  if (userId === admin.id) return jsonFail(c, 'BAD_REQUEST', '不能删除自己');

  const db = createDb(c.env.DB);
  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!target) return jsonFail(c, 'NOT_FOUND', '用户不存在', 404);

  await db.delete(users).where(eq(users.id, userId));
  return jsonOk(c, { deleted: true });
});

adminRouter.get('/groups', async (c) => {
  const db = createDb(c.env.DB);
  const groups = await db.select().from(userGroups).orderBy(userGroups.name);
  return jsonOk(c, { groups: groups.map(toGroupDto) });
});

adminRouter.post('/groups', async (c) => {
  const body = await c.req.json<{
    name?: string;
    description?: string;
    canUpload?: boolean;
    canShare?: boolean;
    canCollab?: boolean;
    canAdmin?: boolean;
  }>();

  const name = body.name?.trim();
  if (!name) return jsonFail(c, 'BAD_REQUEST', '请填写用户组名称');

  const db = createDb(c.env.DB);
  const [dup] = await db.select({ id: userGroups.id }).from(userGroups).where(eq(userGroups.name, name)).limit(1);
  if (dup) return jsonFail(c, 'BAD_REQUEST', '用户组名称已存在');

  const id = generateId();
  const now = new Date();
  await db.insert(userGroups).values({
    id,
    name,
    description: body.description?.trim() || null,
    canUpload: body.canUpload !== false,
    canShare: body.canShare !== false,
    canCollab: body.canCollab !== false,
    canAdmin: !!body.canAdmin,
    createdAt: now,
  });

  const [group] = await db.select().from(userGroups).where(eq(userGroups.id, id)).limit(1);
  return jsonOk(c, { group: toGroupDto(group!) });
});

adminRouter.patch('/groups/:id', async (c) => {
  const groupId = c.req.param('id');
  const body = await c.req.json<{
    name?: string;
    description?: string;
    canUpload?: boolean;
    canShare?: boolean;
    canCollab?: boolean;
    canAdmin?: boolean;
  }>();

  const db = createDb(c.env.DB);
  const [target] = await db.select().from(userGroups).where(eq(userGroups.id, groupId)).limit(1);
  if (!target) return jsonFail(c, 'NOT_FOUND', '用户组不存在', 404);

  const updates: Partial<typeof userGroups.$inferInsert> = {};

  if (body.name !== undefined) {
    if (groupId === 'grp_default') {
      return jsonFail(c, 'BAD_REQUEST', '默认用户组不可改名');
    }
    const name = body.name.trim();
    if (!name) return jsonFail(c, 'BAD_REQUEST', '请填写用户组名称');
    const [dup] = await db
      .select({ id: userGroups.id })
      .from(userGroups)
      .where(and(eq(userGroups.name, name), ne(userGroups.id, groupId)))
      .limit(1);
    if (dup) return jsonFail(c, 'BAD_REQUEST', '用户组名称已存在');
    updates.name = name;
  }

  if (body.description !== undefined) updates.description = body.description.trim() || null;
  if (body.canUpload !== undefined) updates.canUpload = !!body.canUpload;
  if (body.canShare !== undefined) updates.canShare = !!body.canShare;
  if (body.canCollab !== undefined) updates.canCollab = !!body.canCollab;
  if (body.canAdmin !== undefined) updates.canAdmin = !!body.canAdmin;

  if (!Object.keys(updates).length) return jsonFail(c, 'BAD_REQUEST', '没有可更新的字段');

  await db.update(userGroups).set(updates).where(eq(userGroups.id, groupId));

  const [updated] = await db.select().from(userGroups).where(eq(userGroups.id, groupId)).limit(1);
  return jsonOk(c, { group: toGroupDto(updated!) });
});

adminRouter.delete('/groups/:id', async (c) => {
  const groupId = c.req.param('id');
  if (groupId === 'grp_default') {
    return jsonFail(c, 'BAD_REQUEST', '不能删除默认用户组');
  }

  const db = createDb(c.env.DB);
  const [target] = await db.select().from(userGroups).where(eq(userGroups.id, groupId)).limit(1);
  if (!target) return jsonFail(c, 'NOT_FOUND', '用户组不存在', 404);

  await db.update(users).set({ groupId: 'grp_default' }).where(eq(users.groupId, groupId));
  await db.delete(userGroups).where(eq(userGroups.id, groupId));
  return jsonOk(c, { deleted: true });
});

export default adminRouter;
