import { Hono } from 'hono';
import type { Context } from 'hono';
import { eq } from 'drizzle-orm';
import type { Env } from '../env';
import { createDb } from '../db';
import { files, shares } from '../db/schema';
import {
  getOfficeEmbedUrl,
  getPreviewMode,
  isEditable,
  isPreviewable,
} from '../lib/preview';
import { jsonFail } from '../lib/response';
import { getShareListParentId, isFileInShareTree } from '../lib/share-folder';
import {
  canDirectAccess,
  getShareByToken,
  isShareDownloadLimitReached,
  isShareExpired,
  resolveShareAccess,
  streamR2Object,
} from '../lib/share';

type ShareCtx = Context<{ Bindings: Env }>;

type ShareAuthSuccess = {
  db: ReturnType<typeof createDb>;
  share: typeof shares.$inferSelect;
  rootFile: typeof files.$inferSelect;
  canEdit: boolean;
  accessToken: string | undefined;
};

type ShareAuthResult = ShareAuthSuccess | { error: Response };

type ShareTargetAuthResult = (ShareAuthSuccess & { file: typeof files.$inferSelect }) | { error: Response };

function isShareAuthError(result: ShareAuthResult | ShareTargetAuthResult): result is { error: Response } {
  return 'error' in result;
}

export const publicShareRouter = new Hono<{ Bindings: Env }>();

function shareFileDto(file: typeof files.$inferSelect) {
  return {
    id: file.id,
    name: file.name,
    isFolder: file.isFolder,
    size: file.size,
    mimeType: file.mimeType,
    previewable: !file.isFolder && isPreviewable(file.mimeType, file.name),
    previewMode: file.isFolder ? null : getPreviewMode(file.mimeType, file.name),
    editable: !file.isFolder && isEditable(file.mimeType, file.name, file.size),
  };
}

async function authorizeShare(c: ShareCtx, needEdit = false): Promise<ShareAuthResult> {
  const token = c.req.param('token');
  if (!token) return { error: jsonFail(c, 'BAD_REQUEST', '无效分享链接') };

  const db = createDb(c.env.DB);
  const result = await getShareByToken(db, token);
  if (!result) return { error: jsonFail(c, 'NOT_FOUND', '分享不存在', 404) };

  const { share, file: rootFile } = result;
  if (isShareExpired(share)) return { error: jsonFail(c, 'FORBIDDEN', '分享已过期', 403) };

  const accessToken = c.req.header('X-Share-Access') || c.req.query('accessToken') || undefined;
  const password = c.req.query('password') || undefined;

  if (canDirectAccess(share) && !needEdit) {
    return { db, share, rootFile, canEdit: share.allowEdit, accessToken };
  }

  const access = await resolveShareAccess(c.env.KV, share, accessToken, password);
  if (!access.ok) return { error: jsonFail(c, 'FORBIDDEN', access.reason, 403) };
  if (needEdit && !access.canEdit) return { error: jsonFail(c, 'FORBIDDEN', '无编辑权限', 403) };

  return {
    db,
    share,
    rootFile,
    canEdit: access.canEdit,
    accessToken: access.accessToken ?? accessToken,
  };
}

async function authorizeShareTarget(
  c: ShareCtx,
  targetFileId: string,
  needEdit = false
): Promise<ShareTargetAuthResult> {
  const auth = await authorizeShare(c, needEdit);
  if (isShareAuthError(auth)) return auth;

  const { db, share, rootFile } = auth;

  if (!rootFile.isFolder) {
    if (targetFileId !== rootFile.id) {
      return { error: jsonFail(c, 'NOT_FOUND', '文件不存在', 404) };
    }
    if (!rootFile.r2Key) return { error: jsonFail(c, 'BAD_REQUEST', '无效分享') };
    const [file] = await db.select().from(files).where(eq(files.id, targetFileId)).limit(1);
    return { ...auth, file: file! };
  }

  const inTree = await isFileInShareTree(db, rootFile.id, targetFileId);
  if (!inTree) return { error: jsonFail(c, 'NOT_FOUND', '文件不存在', 404) };

  const [file] = await db.select().from(files).where(eq(files.id, targetFileId)).limit(1);
  if (!file || file.isFolder) return { error: jsonFail(c, 'BAD_REQUEST', '请指定具体文件') };

  return { ...auth, file };
}

publicShareRouter.get('/:token', async (c) => {
  const db = createDb(c.env.DB);
  const result = await getShareByToken(db, c.req.param('token'));
  if (!result) return jsonFail(c, 'NOT_FOUND', '分享不存在', 404);

  const { share, file } = result;

  return c.json({
    success: true,
    data: {
      name: file.name,
      isFolder: file.isFolder,
      size: file.size,
      mimeType: file.mimeType,
      expired: isShareExpired(share),
      requiresPassword: !!share.passwordHash && !canDirectAccess(share),
      allowPreview: share.allowPreview,
      allowEdit: share.allowEdit && !file.isFolder && isEditable(file.mimeType, file.name, file.size),
      allowDownload: share.allowDownload,
      directLink: share.directLink && !file.isFolder,
      expiresAt: share.expiresAt?.toISOString() ?? null,
      downloadLimitReached: isShareDownloadLimitReached(share),
      previewable: !file.isFolder && isPreviewable(file.mimeType, file.name),
      previewMode: file.isFolder ? null : getPreviewMode(file.mimeType, file.name),
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

publicShareRouter.get('/:token/files', async (c) => {
  const auth = await authorizeShare(c);
  if (isShareAuthError(auth)) return auth.error;

  const { db, share, rootFile } = auth;
  if (!rootFile.isFolder) return jsonFail(c, 'BAD_REQUEST', '此分享不是文件夹');

  const parentId = c.req.query('parentId') || null;
  const listParent = await getShareListParentId(db, rootFile, parentId);
  if (!listParent) return jsonFail(c, 'NOT_FOUND', '文件夹不存在', 404);

  const rows = await db.select().from(files).where(eq(files.parentId, listParent));
  rows.sort((a, b) => {
    if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return c.json({
    success: true,
    data: {
      files: rows.map(shareFileDto),
      rootId: rootFile.id,
      parentId: listParent,
    },
  });
});

publicShareRouter.get('/:token/files/:fileId/preview-info', async (c) => {
  const fileId = c.req.param('fileId');
  const auth = await authorizeShareTarget(c, fileId);
  if (isShareAuthError(auth)) return auth.error;

  const { share, file, accessToken } = auth;
  if (!share.allowPreview) return jsonFail(c, 'FORBIDDEN', '不允许预览', 403);

  const mode = getPreviewMode(file.mimeType, file.name);
  if (!mode) return jsonFail(c, 'BAD_REQUEST', '该文件不支持预览');

  const origin = new URL(c.req.url).origin;
  const q = accessToken ? `?accessToken=${encodeURIComponent(accessToken)}` : '';
  const streamUrl = `${origin}/api/share/${share.token}/files/${file.id}/preview${q}`;

  if (mode === 'office') {
    return c.json({
      success: true,
      data: { mode: 'office', embedUrl: getOfficeEmbedUrl(streamUrl), streamUrl },
    });
  }

  return c.json({ success: true, data: { mode: 'direct', url: streamUrl } });
});

publicShareRouter.get('/:token/files/:fileId/preview', async (c) => shareFilePreview(c));
publicShareRouter.get('/:token/files/:fileId/download', async (c) => shareFileDownload(c));
publicShareRouter.get('/:token/files/:fileId/content', async (c) => shareFileGetContent(c));
publicShareRouter.put('/:token/files/:fileId/content', async (c) => shareFilePutContent(c));

publicShareRouter.get('/:token/download', async (c) => {
  const auth = await authorizeShare(c);
  if (isShareAuthError(auth)) return auth.error;
  if (auth.rootFile.isFolder) return jsonFail(c, 'BAD_REQUEST', '文件夹请进入分享页浏览下载');
  return shareFileDownload(c, auth.rootFile.id);
});

publicShareRouter.get('/:token/preview', async (c) => {
  const auth = await authorizeShare(c);
  if (isShareAuthError(auth)) return auth.error;
  if (auth.rootFile.isFolder) return jsonFail(c, 'BAD_REQUEST', '文件夹请进入分享页预览');
  return shareFilePreview(c, auth.rootFile.id);
});

publicShareRouter.get('/:token/content', async (c) => {
  const auth = await authorizeShare(c);
  if (isShareAuthError(auth)) return auth.error;
  if (auth.rootFile.isFolder) return jsonFail(c, 'BAD_REQUEST', '文件夹内文件请指定路径');
  return shareFileGetContent(c, auth.rootFile.id);
});

publicShareRouter.put('/:token/content', async (c) => {
  const auth = await authorizeShare(c, true);
  if (isShareAuthError(auth)) return auth.error;
  if (auth.rootFile.isFolder) return jsonFail(c, 'BAD_REQUEST', '文件夹内文件请指定路径');
  return shareFilePutContent(c, auth.rootFile.id);
});

async function shareFileDownload(c: ShareCtx, fileIdOverride?: string) {
  const fileId = fileIdOverride ?? c.req.param('fileId');
  if (!fileId) return jsonFail(c, 'BAD_REQUEST', '无效文件');
  const auth = await authorizeShareTarget(c, fileId);
  if (isShareAuthError(auth)) return auth.error;

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

async function shareFilePreview(c: ShareCtx, fileIdOverride?: string) {
  const fileId = fileIdOverride ?? c.req.param('fileId');
  if (!fileId) return jsonFail(c, 'BAD_REQUEST', '无效文件');
  const auth = await authorizeShareTarget(c, fileId);
  if (isShareAuthError(auth)) return auth.error;

  const { share, file } = auth;
  if (!share.allowPreview) return jsonFail(c, 'FORBIDDEN', '不允许预览', 403);
  if (!isPreviewable(file.mimeType, file.name)) {
    return jsonFail(c, 'BAD_REQUEST', '该文件不支持预览');
  }

  const res = await streamR2Object(c.env.R2, file.r2Key!, file.name, file.mimeType, true);
  return res ?? jsonFail(c, 'NOT_FOUND', '文件不存在', 404);
}

async function shareFileGetContent(c: ShareCtx, fileIdOverride?: string) {
  const fileId = fileIdOverride ?? c.req.param('fileId');
  if (!fileId) return jsonFail(c, 'BAD_REQUEST', '无效文件');
  const auth = await authorizeShareTarget(c, fileId);
  if (isShareAuthError(auth)) return auth.error;

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

async function shareFilePutContent(c: ShareCtx, fileIdOverride?: string) {
  const fileId = fileIdOverride ?? c.req.param('fileId');
  if (!fileId) return jsonFail(c, 'BAD_REQUEST', '无效文件');
  const auth = await authorizeShareTarget(c, fileId, true);
  if (isShareAuthError(auth)) return auth.error;

  const { db, file } = auth;
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
