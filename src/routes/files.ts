import { Hono } from 'hono';
import type { Context } from 'hono';
import { and, eq } from 'drizzle-orm';
import type { Env } from '../env';
import { createDb } from '../db';
import { fileCollaborators, files, users } from '../db/schema';
import { generateId, sanitizeFilename } from '../lib/crypto';
import {
  canRead,
  canWrite,
  getFileAccess,
  getOwnedParent,
  listAccessibleFiles,
} from '../lib/file-access';
import { getUserPermissions } from '../lib/user-permissions';
import {
  contentDisposition,
  getOfficeEmbedUrl,
  getPreviewMode,
  isEditable,
  isPreviewable,
  TEXT_MAX_EDIT_BYTES,
} from '../lib/preview';
import { createPreviewTicket } from '../lib/preview-ticket';
import { jsonFail, jsonOk } from '../lib/response';
import { authMiddleware, type AuthVariables } from '../middleware/auth';

const filesRouter = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

filesRouter.use('*', authMiddleware);

function toFileDto(record: typeof files.$inferSelect, extra: Record<string, unknown> = {}) {
  return {
    id: record.id,
    name: record.name,
    parentId: record.parentId,
    isFolder: record.isFolder,
    size: record.size,
    mimeType: record.mimeType,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    previewable: !record.isFolder && isPreviewable(record.mimeType, record.name),
    previewMode: record.isFolder ? null : getPreviewMode(record.mimeType, record.name),
    editable: !record.isFolder && isEditable(record.mimeType, record.name, record.size),
    ...extra,
  };
}

filesRouter.get('/', async (c) => {
  const user = c.get('user');
  const parentId = c.req.query('parentId') || null;
  const scope = c.req.query('scope') === 'shared' ? 'shared' : 'mine';
  const db = createDb(c.env.DB);

  if (parentId) {
    const access = await getFileAccess(db, user.userId, parentId);
    if (!access?.file.isFolder || !canRead(access.permission)) {
      return jsonFail(c, 'NOT_FOUND', '文件夹不存在', 404);
    }
  }

  const rows = await listAccessibleFiles(db, user.userId, parentId, scope);
  rows.sort((a, b) => {
    if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const withMeta = await Promise.all(
    rows.map(async (f) => {
      const access = await getFileAccess(db, user.userId, f.id);
      return toFileDto(f, {
        permission: access?.permission ?? 'view',
        owned: f.userId === user.userId,
      });
    })
  );

  return jsonOk(c, { files: withMeta, scope });
});

filesRouter.post('/folders', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ name?: string; parentId?: string | null }>();
  const name = sanitizeFilename(body.name?.trim() || '');
  const parentId = body.parentId ?? null;

  if (!name) return jsonFail(c, 'BAD_REQUEST', '文件夹名称不能为空');

  const db = createDb(c.env.DB);
  if (!(await getOwnedParent(db, user.userId, parentId))) {
    return jsonFail(c, 'NOT_FOUND', '父文件夹不存在或无写入权限', 404);
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
  return jsonOk(c, { file: toFileDto(record!, { permission: 'owner', owned: true }) });
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
  if (!name) return jsonFail(c, 'BAD_REQUEST', '文件名无效');

  const db = createDb(c.env.DB);
  const perms = await getUserPermissions(db, user.userId);
  if (!perms?.canUpload) {
    return jsonFail(c, 'FORBIDDEN', '当前账号无上传权限', 403);
  }
  if (!(await getOwnedParent(db, user.userId, parentId))) {
    return jsonFail(c, 'NOT_FOUND', '目标文件夹不存在或无写入权限', 404);
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
  return jsonOk(c, { file: toFileDto(record!, { permission: 'owner', owned: true }) });
});

filesRouter.get('/:id/preview-info', async (c) => {
  const access = await requireReadAccess(c);
  if (access instanceof Response) return access;
  const { file } = access;

  if (file.isFolder || !file.r2Key) return jsonFail(c, 'BAD_REQUEST', '无法预览');
  const mode = getPreviewMode(file.mimeType, file.name);
  if (!mode) return jsonFail(c, 'BAD_REQUEST', '该文件不支持预览');

  const origin = new URL(c.req.url).origin;

  if (mode === 'office') {
    const ticket = await createPreviewTicket(c.env.KV, {
      r2Key: file.r2Key,
      name: file.name,
      mimeType: file.mimeType,
    });
    const publicUrl = `${origin}/api/public-preview/${ticket}`;
    return jsonOk(c, {
      mode: 'office',
      embedUrl: getOfficeEmbedUrl(publicUrl),
      streamUrl: publicUrl,
    });
  }

  return jsonOk(c, {
    mode: 'direct',
    url: `${origin}/api/files/${file.id}/preview`,
  });
});

filesRouter.get('/:id/preview', async (c) => {
  const access = await requireReadAccess(c);
  if (access instanceof Response) return access;
  const { file } = access;

  if (file.isFolder || !file.r2Key) return jsonFail(c, 'BAD_REQUEST', '无法预览');
  if (!isPreviewable(file.mimeType, file.name)) {
    return jsonFail(c, 'BAD_REQUEST', '该文件不支持预览');
  }

  const object = await c.env.R2.get(file.r2Key);
  if (!object) return jsonFail(c, 'NOT_FOUND', '文件不存在', 404);

  const headers = new Headers();
  headers.set('Content-Type', file.mimeType || 'application/octet-stream');
  headers.set('Content-Disposition', contentDisposition(file.name, true));
  if (object.size) headers.set('Content-Length', String(object.size));
  return new Response(object.body, { headers });
});

filesRouter.get('/:id/content', async (c) => {
  const access = await requireReadAccess(c);
  if (access instanceof Response) return access;
  const { file } = access;

  if (file.isFolder || !file.r2Key) return jsonFail(c, 'BAD_REQUEST', '无法读取');
  const object = await c.env.R2.get(file.r2Key);
  if (!object) return jsonFail(c, 'NOT_FOUND', '文件不存在', 404);

  const text = await object.text();
  return jsonOk(c, {
    content: text,
    editable: canWrite(access.permission) && isEditable(file.mimeType, file.name, file.size),
  });
});

filesRouter.put('/:id/content', async (c) => {
  const access = await requireWriteAccess(c);
  if (access instanceof Response) return access;
  const { file } = access;

  if (file.isFolder || !file.r2Key) return jsonFail(c, 'BAD_REQUEST', '无法编辑');
  if (!isEditable(file.mimeType, file.name, file.size)) {
    return jsonFail(c, 'BAD_REQUEST', '该文件不支持在线编辑');
  }

  const body = await c.req.json<{ content?: string }>();
  if (body.content === undefined) return jsonFail(c, 'BAD_REQUEST', '内容不能为空');

  const contentBytes = new TextEncoder().encode(body.content);
  if (contentBytes.length > TEXT_MAX_EDIT_BYTES) {
    return jsonFail(c, 'BAD_REQUEST', '文件过大，无法在线编辑');
  }

  await c.env.R2.put(file.r2Key, contentBytes, {
    httpMetadata: { contentType: file.mimeType || 'text/plain' },
  });

  const now = new Date();
  const db = createDb(c.env.DB);
  await db.update(files).set({ size: contentBytes.length, updatedAt: now }).where(eq(files.id, file.id));

  return jsonOk(c, { saved: true, size: contentBytes.length });
});

filesRouter.get('/:id/download', async (c) => {
  const access = await requireReadAccess(c);
  if (access instanceof Response) return access;
  const { file } = access;

  if (file.isFolder || !file.r2Key) return jsonFail(c, 'BAD_REQUEST', '无法下载');
  const object = await c.env.R2.get(file.r2Key);
  if (!object) return jsonFail(c, 'NOT_FOUND', '文件不存在', 404);

  const headers = new Headers();
  headers.set('Content-Type', file.mimeType || 'application/octet-stream');
  headers.set('Content-Disposition', contentDisposition(file.name, false));
  if (object.size) headers.set('Content-Length', String(object.size));
  return new Response(object.body, { headers });
});

filesRouter.get('/:id/collaborators', async (c) => {
  const user = c.get('user');
  const fileId = c.req.param('id');
  const db = createDb(c.env.DB);
  const access = await getFileAccess(db, user.userId, fileId);

  if (!access || access.permission !== 'owner') {
    return jsonFail(c, 'FORBIDDEN', '仅所有者可管理协作者', 403);
  }

  const rows = await db
    .select({
      id: fileCollaborators.id,
      permission: fileCollaborators.permission,
      createdAt: fileCollaborators.createdAt,
      username: users.username,
      userId: users.id,
    })
    .from(fileCollaborators)
    .innerJoin(users, eq(fileCollaborators.userId, users.id))
    .where(eq(fileCollaborators.fileId, fileId));

  return jsonOk(c, {
    collaborators: rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      username: r.username,
      permission: r.permission,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});

filesRouter.post('/:id/collaborators', async (c) => {
  const user = c.get('user');
  const fileId = c.req.param('id');
  const body = await c.req.json<{ username?: string; permission?: string }>();
  const username = body.username?.trim();
  const permission = body.permission === 'edit' ? 'edit' : 'view';

  if (!username) return jsonFail(c, 'BAD_REQUEST', '请输入用户名');

  const db = createDb(c.env.DB);
  const access = await getFileAccess(db, user.userId, fileId);
  if (!access || access.permission !== 'owner') {
    return jsonFail(c, 'FORBIDDEN', '仅所有者可添加协作者', 403);
  }

  const [target] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!target) return jsonFail(c, 'NOT_FOUND', '用户不存在', 404);
  if (target.id === user.userId) return jsonFail(c, 'BAD_REQUEST', '不能添加自己');

  const id = generateId();
  const now = new Date();

  try {
    await db.insert(fileCollaborators).values({
      id,
      fileId,
      userId: target.id,
      permission,
      grantedBy: user.userId,
      createdAt: now,
    });
  } catch {
    return jsonFail(c, 'BAD_REQUEST', '该用户已是协作者');
  }

  return jsonOk(c, { collaborator: { id, username: target.username, permission } });
});

filesRouter.delete('/:id/collaborators/:collaboratorId', async (c) => {
  const user = c.get('user');
  const fileId = c.req.param('id');
  const collaboratorId = c.req.param('collaboratorId');
  const db = createDb(c.env.DB);

  const access = await getFileAccess(db, user.userId, fileId);
  if (!access || access.permission !== 'owner') {
    return jsonFail(c, 'FORBIDDEN', '仅所有者可移除协作者', 403);
  }

  await db
    .delete(fileCollaborators)
    .where(and(eq(fileCollaborators.id, collaboratorId), eq(fileCollaborators.fileId, fileId)));

  return jsonOk(c, { deleted: true });
});

filesRouter.patch('/:id', async (c) => {
  const access = await requireWriteAccess(c);
  if (access instanceof Response) return access;
  const { file } = access;
  const fileId = file.id;

  const body = await c.req.json<{ name?: string; parentId?: string | null }>();
  const db = createDb(c.env.DB);
  const updates: Partial<typeof files.$inferInsert> = { updatedAt: new Date() };

  if (body.name !== undefined) {
    const name = sanitizeFilename(body.name.trim());
    if (!name) return jsonFail(c, 'BAD_REQUEST', '名称不能为空');
    updates.name = name;
  }

  if (body.parentId !== undefined) {
    if (body.parentId === fileId) return jsonFail(c, 'BAD_REQUEST', '不能移动到自身');
    if (!(await getOwnedParent(db, c.get('user').userId, body.parentId))) {
      return jsonFail(c, 'NOT_FOUND', '目标文件夹不存在或无权限', 404);
    }
    updates.parentId = body.parentId;
  }

  await db.update(files).set(updates).where(eq(files.id, fileId));
  const [updated] = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
  return jsonOk(c, { file: toFileDto(updated!) });
});

filesRouter.delete('/:id', async (c) => {
  const access = await requireWriteAccess(c);
  if (access instanceof Response) return access;
  const { file, permission } = access;

  if (permission !== 'owner') {
    return jsonFail(c, 'FORBIDDEN', '仅所有者可删除', 403);
  }

  const db = createDb(c.env.DB);
  const user = c.get('user');

  if (file.isFolder) {
    const children = await db
      .select({ id: files.id })
      .from(files)
      .where(and(eq(files.userId, user.userId), eq(files.parentId, file.id)))
      .limit(1);
    if (children.length > 0) return jsonFail(c, 'BAD_REQUEST', '请先清空文件夹内的内容');
  } else if (file.r2Key) {
    await c.env.R2.delete(file.r2Key);
  }

  await db.delete(files).where(eq(files.id, file.id));
  return jsonOk(c, { deleted: true });
});

async function requireReadAccess(c: Context<{ Bindings: Env; Variables: AuthVariables }>) {
  const fileId = c.req.param('id');
  if (!fileId) return jsonFail(c, 'BAD_REQUEST', '无效文件 ID');
  const db = createDb(c.env.DB);
  const access = await getFileAccess(db, c.get('user').userId, fileId);
  if (!access) return jsonFail(c, 'NOT_FOUND', '文件不存在', 404);
  if (!canRead(access.permission)) return jsonFail(c, 'FORBIDDEN', '无访问权限', 403);
  return access;
}

async function requireWriteAccess(c: Context<{ Bindings: Env; Variables: AuthVariables }>) {
  const fileId = c.req.param('id');
  if (!fileId) return jsonFail(c, 'BAD_REQUEST', '无效文件 ID');
  const db = createDb(c.env.DB);
  const access = await getFileAccess(db, c.get('user').userId, fileId);
  if (!access) return jsonFail(c, 'NOT_FOUND', '文件不存在', 404);
  if (!canWrite(access.permission)) return jsonFail(c, 'FORBIDDEN', '无编辑权限', 403);
  return access;
}

export default filesRouter;
