import { Hono } from 'hono';
import type { Context } from 'hono';
import { and, eq } from 'drizzle-orm';
import type { Env } from '../env';
import { createDb } from '../db';
import { files, shares } from '../db/schema';
import { isEditable, isPreviewable } from '../lib/preview';
import { jsonFail } from '../lib/response';
import {
  canDirectAccess,
  getShareByToken,
  isShareDownloadLimitReached,
  isShareExpired,
  resolveShareAccess,
  streamR2Object,
} from '../lib/share';

type ShareCtx = Context<{ Bindings: Env }>;

export const publicShareRouter = new Hono<{ Bindings: Env }>();

publicShareRouter.get('/:token', async (c) => {
  const db = createDb(c.env.DB);
  const result = await getShareByToken(db, c.req.param('token'));
  if (!result) return jsonFail(c, 'NOT_FOUND', '分享不存在', 404);

  const { share, file } = result;
  if (file.isFolder) return jsonFail(c, 'BAD_REQUEST', '无法分享文件夹');

  return c.json({
    success: true,
    data: {
      name: file.name,
      size: file.size,
      mimeType: file.mimeType,
      expired: isShareExpired(share),
      requiresPassword: !!share.passwordHash && !canDirectAccess(share),
      allowPreview: share.allowPreview && isPreviewable(file.mimeType, file.name),
      allowEdit: share.allowEdit && isEditable(file.mimeType, file.name, file.size),
      allowDownload: share.allowDownload,
      directLink: share.directLink,
      expiresAt: share.expiresAt?.toISOString() ?? null,
      downloadLimitReached: isShareDownloadLimitReached(share),
    },
  });
});

publicShareRouter.post('/:token/access', async (c) => {
  const db = createDb(c.env.DB);
  const result = await getShareByToken(db, c.req.param('token'));
  if (!result) return jsonFail(c, 'NOT_FOUND', '分享不存在', 404);

  const body = (await c.req.json<{ password?: string }>().catch(() => ({ password: undefined }))) as {
    password?: string;
  };
  const access = await resolveShareAccess(c.env.KV, result.share, undefined, body.password);

  if (!access.ok) return jsonFail(c, 'FORBIDDEN', access.reason, 403);

  return c.json({
    success: true,
    data: { accessToken: access.accessToken ?? null, canEdit: access.canEdit },
  });
});

publicShareRouter.get('/:token/download', (c) => shareDownload(c));
publicShareRouter.get('/:token/preview', (c) => sharePreview(c));
publicShareRouter.get('/:token/content', (c) => shareGetContent(c));
publicShareRouter.put('/:token/content', (c) => sharePutContent(c));

async function authorizeShare(c: ShareCtx, needEdit = false) {
  const token = c.req.param('token');
  if (!token) return { error: jsonFail(c, 'BAD_REQUEST', '无效分享链接') };

  const db = createDb(c.env.DB);
  const result = await getShareByToken(db, token);
  if (!result) return { error: jsonFail(c, 'NOT_FOUND', '分享不存在', 404) };

  const { share, file } = result;
  if (file.isFolder || !file.r2Key) return { error: jsonFail(c, 'BAD_REQUEST', '无效分享') };
  if (isShareExpired(share)) return { error: jsonFail(c, 'FORBIDDEN', '分享已过期', 403) };

  const accessToken = c.req.header('X-Share-Access') || c.req.query('accessToken') || undefined;
  const password = c.req.query('password') || undefined;

  if (canDirectAccess(share) && !needEdit) {
    return { db, share, file, canEdit: share.allowEdit };
  }

  const access = await resolveShareAccess(c.env.KV, share, accessToken, password);
  if (!access.ok) return { error: jsonFail(c, 'FORBIDDEN', access.reason, 403) };
  if (needEdit && !access.canEdit) return { error: jsonFail(c, 'FORBIDDEN', '无编辑权限', 403) };

  return { db, share, file, canEdit: access.canEdit, accessToken: access.accessToken };
}

async function shareDownload(c: ShareCtx) {
  const auth = await authorizeShare(c);
  if ('error' in auth) return auth.error;
  const { db, share, file } = auth;

  if (!share.allowDownload) return jsonFail(c, 'FORBIDDEN', '不允许下载', 403);
  if (isShareDownloadLimitReached(share)) {
    return jsonFail(c, 'FORBIDDEN', '下载次数已达上限', 403);
  }

  await db
    .update(shares)
    .set({ downloadCount: share.downloadCount + 1 })
    .where(eq(shares.id, share.id));

  const res = await streamR2Object(c.env.R2, file.r2Key!, file.name, file.mimeType, false);
  return res ?? jsonFail(c, 'NOT_FOUND', '文件不存在', 404);
}

async function sharePreview(c: ShareCtx) {
  const auth = await authorizeShare(c);
  if ('error' in auth) return auth.error;
  const { share, file } = auth;

  if (!share.allowPreview) return jsonFail(c, 'FORBIDDEN', '不允许预览', 403);
  if (!isPreviewable(file.mimeType, file.name)) {
    return jsonFail(c, 'BAD_REQUEST', '该文件不支持预览');
  }

  const res = await streamR2Object(c.env.R2, file.r2Key!, file.name, file.mimeType, true);
  return res ?? jsonFail(c, 'NOT_FOUND', '文件不存在', 404);
}

async function shareGetContent(c: ShareCtx) {
  const auth = await authorizeShare(c);
  if ('error' in auth) return auth.error;
  const { share, file } = auth;

  if (!share.allowPreview) return jsonFail(c, 'FORBIDDEN', '不允许读取', 403);

  const object = await c.env.R2.get(file.r2Key!);
  if (!object) return jsonFail(c, 'NOT_FOUND', '文件不存在', 404);

  const text = await object.text();
  return c.json({
    success: true,
    data: {
      content: text,
      editable: share.allowEdit && isEditable(file.mimeType, file.name, file.size),
    },
  });
}

async function sharePutContent(c: ShareCtx) {
  const auth = await authorizeShare(c, true);
  if ('error' in auth) return auth.error;
  const { db, share, file } = auth;

  if (!isEditable(file.mimeType, file.name, file.size)) {
    return jsonFail(c, 'BAD_REQUEST', '该文件不支持在线编辑');
  }

  const body = await c.req.json<{ content?: string }>();
  if (body.content === undefined) return jsonFail(c, 'BAD_REQUEST', '内容不能为空');

  const contentBytes = new TextEncoder().encode(body.content);
  await c.env.R2.put(file.r2Key!, contentBytes, {
    httpMetadata: { contentType: file.mimeType || 'text/plain' },
  });

  const now = new Date();
  await db
    .update(files)
    .set({ size: contentBytes.length, updatedAt: now })
    .where(eq(files.id, file.id));

  return c.json({ success: true, data: { saved: true, size: contentBytes.length } });
}
