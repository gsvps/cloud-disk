import { Hono } from 'hono';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Env } from '../env';
import { createDb } from '../db';
import { files } from '../db/schema';
import { generateId, sanitizeFilename } from '../lib/crypto';
import { jsonFail, jsonOk } from '../lib/response';
import { authMiddleware, type AuthVariables } from '../middleware/auth';

const filesRouter = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

filesRouter.use('*', authMiddleware);

function toFileDto(record: typeof files.$inferSelect) {
  return {
    id: record.id,
    name: record.name,
    parentId: record.parentId,
    isFolder: record.isFolder,
    size: record.size,
    mimeType: record.mimeType,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

async function getOwnedFile(db: ReturnType<typeof createDb>, userId: string, fileId: string) {
  const [record] = await db
    .select()
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.userId, userId)))
    .limit(1);
  return record ?? null;
}

async function getOwnedParent(db: ReturnType<typeof createDb>, userId: string, parentId: string | null) {
  if (!parentId) return true;
  const parent = await getOwnedFile(db, userId, parentId);
  return parent?.isFolder === true;
}

filesRouter.get('/', async (c) => {
  const user = c.get('user');
  const parentId = c.req.query('parentId') || null;
  const db = createDb(c.env.DB);

  if (parentId) {
    const valid = await getOwnedParent(db, user.userId, parentId);
    if (!valid) {
      return jsonFail(c, 'NOT_FOUND', '文件夹不存在', 404);
    }
  }

  const condition = parentId
    ? and(eq(files.userId, user.userId), eq(files.parentId, parentId))
    : and(eq(files.userId, user.userId), isNull(files.parentId));

  const rows = await db.select().from(files).where(condition).orderBy(desc(files.isFolder), files.name);

  return jsonOk(c, { files: rows.map(toFileDto) });
});

filesRouter.post('/folders', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ name?: string; parentId?: string | null }>();
  const name = sanitizeFilename(body.name?.trim() || '');
  const parentId = body.parentId ?? null;

  if (!name) {
    return jsonFail(c, 'BAD_REQUEST', '文件夹名称不能为空');
  }

  const db = createDb(c.env.DB);
  if (!(await getOwnedParent(db, user.userId, parentId))) {
    return jsonFail(c, 'NOT_FOUND', '父文件夹不存在', 404);
  }

  const now = new Date();
  const id = generateId();

  await db.insert(files).values({
    id,
    userId: user.userId,
    parentId,
    name,
    isFolder: true,
    size: 0,
    createdAt: now,
    updatedAt: now,
  });

  const [record] = await db.select().from(files).where(eq(files.id, id)).limit(1);
  return jsonOk(c, { file: toFileDto(record!) });
});

filesRouter.post('/upload', async (c) => {
  const user = c.get('user');
  const formData = await c.req.formData();
  const rawFile = formData.get('file');
  const parentIdRaw = formData.get('parentId');
  const parentId = parentIdRaw && String(parentIdRaw) !== '' ? String(parentIdRaw) : null;

  if (!rawFile || typeof rawFile === 'string') {
    return jsonFail(c, 'BAD_REQUEST', '请选择要上传的文件');
  }

  const file = rawFile as File;

  const name = sanitizeFilename(file.name);
  if (!name) {
    return jsonFail(c, 'BAD_REQUEST', '文件名无效');
  }

  const db = createDb(c.env.DB);
  if (!(await getOwnedParent(db, user.userId, parentId))) {
    return jsonFail(c, 'NOT_FOUND', '目标文件夹不存在', 404);
  }

  const id = generateId();
  const r2Key = `${user.userId}/${id}/${name}`;
  const now = new Date();

  await c.env.R2.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type || 'application/octet-stream' },
  });

  await db.insert(files).values({
    id,
    userId: user.userId,
    parentId,
    name,
    isFolder: false,
    r2Key,
    size: file.size,
    mimeType: file.type || 'application/octet-stream',
    createdAt: now,
    updatedAt: now,
  });

  const [record] = await db.select().from(files).where(eq(files.id, id)).limit(1);
  return jsonOk(c, { file: toFileDto(record!) });
});

filesRouter.get('/:id/download', async (c) => {
  const user = c.get('user');
  const fileId = c.req.param('id');
  const db = createDb(c.env.DB);
  const record = await getOwnedFile(db, user.userId, fileId);

  if (!record) {
    return jsonFail(c, 'NOT_FOUND', '文件不存在', 404);
  }
  if (record.isFolder) {
    return jsonFail(c, 'BAD_REQUEST', '无法下载文件夹');
  }
  if (!record.r2Key) {
    return jsonFail(c, 'NOT_FOUND', '文件内容不存在', 404);
  }

  const object = await c.env.R2.get(record.r2Key);
  if (!object) {
    return jsonFail(c, 'NOT_FOUND', '文件内容不存在', 404);
  }

  const headers = new Headers();
  headers.set('Content-Type', record.mimeType || 'application/octet-stream');
  headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(record.name)}"`);
  if (object.size) headers.set('Content-Length', String(object.size));

  return new Response(object.body, { headers });
});

filesRouter.patch('/:id', async (c) => {
  const user = c.get('user');
  const fileId = c.req.param('id');
  const body = await c.req.json<{ name?: string; parentId?: string | null }>();
  const db = createDb(c.env.DB);
  const record = await getOwnedFile(db, user.userId, fileId);

  if (!record) {
    return jsonFail(c, 'NOT_FOUND', '文件不存在', 404);
  }

  const updates: Partial<typeof files.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (body.name !== undefined) {
    const name = sanitizeFilename(body.name.trim());
    if (!name) return jsonFail(c, 'BAD_REQUEST', '名称不能为空');
    updates.name = name;
  }

  if (body.parentId !== undefined) {
    if (body.parentId === fileId) {
      return jsonFail(c, 'BAD_REQUEST', '不能移动到自身');
    }
    if (!(await getOwnedParent(db, user.userId, body.parentId))) {
      return jsonFail(c, 'NOT_FOUND', '目标文件夹不存在', 404);
    }
    updates.parentId = body.parentId;
  }

  await db.update(files).set(updates).where(eq(files.id, fileId));

  const [updated] = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
  return jsonOk(c, { file: toFileDto(updated!) });
});

filesRouter.delete('/:id', async (c) => {
  const user = c.get('user');
  const fileId = c.req.param('id');
  const db = createDb(c.env.DB);
  const record = await getOwnedFile(db, user.userId, fileId);

  if (!record) {
    return jsonFail(c, 'NOT_FOUND', '文件不存在', 404);
  }

  if (record.isFolder) {
    const children = await db
      .select({ id: files.id })
      .from(files)
      .where(and(eq(files.userId, user.userId), eq(files.parentId, fileId)))
      .limit(1);

    if (children.length > 0) {
      return jsonFail(c, 'BAD_REQUEST', '请先清空文件夹内的内容');
    }
  } else if (record.r2Key) {
    await c.env.R2.delete(record.r2Key);
  }

  await db.delete(files).where(eq(files.id, fileId));
  return jsonOk(c, { deleted: true });
});

export default filesRouter;
