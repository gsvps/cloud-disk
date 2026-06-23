import { Hono } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import type { Env } from '../env';
import { createDb } from '../db';
import { shares } from '../db/schema';
import { generateId, hashPassword } from '../lib/crypto';
import { getFileAccess } from '../lib/file-access';
import { jsonFail, jsonOk } from '../lib/response';
import { generateShareToken } from '../lib/share';
import { authMiddleware, type AuthVariables } from '../middleware/auth';

const sharesRouter = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

sharesRouter.use('*', authMiddleware);

function toShareDto(share: typeof shares.$inferSelect, origin: string) {
  return {
    id: share.id,
    fileId: share.fileId,
    token: share.token,
    url: `${origin}/s/${share.token}`,
    directUrl: share.directLink ? `${origin}/api/share/${share.token}/download` : null,
    hasPassword: !!share.passwordHash,
    expiresAt: share.expiresAt?.toISOString() ?? null,
    allowPreview: share.allowPreview,
    allowEdit: share.allowEdit,
    allowDownload: share.allowDownload,
    directLink: share.directLink,
    downloadCount: share.downloadCount,
    maxDownloads: share.maxDownloads,
    createdAt: share.createdAt.toISOString(),
  };
}

sharesRouter.get('/', async (c) => {
  const user = c.get('user');
  const db = createDb(c.env.DB);
  const rows = await db
    .select()
    .from(shares)
    .where(eq(shares.userId, user.userId))
    .orderBy(desc(shares.createdAt));

  const origin = new URL(c.req.url).origin;
  return jsonOk(c, { shares: rows.map((s) => toShareDto(s, origin)) });
});

sharesRouter.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{
    fileId?: string;
    password?: string;
    expiresInHours?: number;
    allowPreview?: boolean;
    allowEdit?: boolean;
    allowDownload?: boolean;
    directLink?: boolean;
    maxDownloads?: number;
  }>();

  if (!body.fileId) return jsonFail(c, 'BAD_REQUEST', '请指定文件');

  const db = createDb(c.env.DB);
  const access = await getFileAccess(db, user.userId, body.fileId);
  if (!access || access.file.isFolder) {
    return jsonFail(c, 'NOT_FOUND', '文件不存在', 404);
  }
  if (access.permission !== 'owner') {
    return jsonFail(c, 'FORBIDDEN', '仅文件所有者可创建分享', 403);
  }

  let expiresAt: Date | null = null;
  if (body.expiresInHours && body.expiresInHours > 0) {
    expiresAt = new Date(Date.now() + body.expiresInHours * 3600 * 1000);
  }

  const password = body.password?.trim();
  const directLink = !!body.directLink && !password;

  const id = generateId();
  const token = generateShareToken();
  const now = new Date();

  await db.insert(shares).values({
    id,
    fileId: body.fileId,
    userId: user.userId,
    token,
    passwordHash: password ? await hashPassword(password) : null,
    expiresAt,
    allowPreview: body.allowPreview !== false,
    allowEdit: !!body.allowEdit,
    allowDownload: body.allowDownload !== false,
    directLink,
    maxDownloads: body.maxDownloads && body.maxDownloads > 0 ? body.maxDownloads : null,
    createdAt: now,
  });

  const [share] = await db.select().from(shares).where(eq(shares.id, id)).limit(1);
  const origin = new URL(c.req.url).origin;
  return jsonOk(c, { share: toShareDto(share!, origin) });
});

sharesRouter.delete('/:id', async (c) => {
  const user = c.get('user');
  const shareId = c.req.param('id');
  const db = createDb(c.env.DB);

  const [share] = await db
    .select()
    .from(shares)
    .where(and(eq(shares.id, shareId), eq(shares.userId, user.userId)))
    .limit(1);

  if (!share) return jsonFail(c, 'NOT_FOUND', '分享不存在', 404);

  await db.delete(shares).where(eq(shares.id, shareId));
  return jsonOk(c, { deleted: true });
});

export default sharesRouter;
