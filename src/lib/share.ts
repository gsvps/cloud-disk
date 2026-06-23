import { eq } from 'drizzle-orm';
import type { createDb } from '../db';
import { files, shares } from '../db/schema';
import { verifyPassword } from './crypto';

const SHARE_ACCESS_PREFIX = 'share-access:';
const SHARE_ACCESS_TTL = 60 * 60 * 24;

export function generateShareToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateAccessToken(): string {
  return crypto.randomUUID();
}

export async function getShareByToken(db: ReturnType<typeof createDb>, token: string) {
  const [share] = await db
    .select()
    .from(shares)
    .where(eq(shares.token, token))
    .limit(1);
  if (!share) return null;

  const [file] = await db.select().from(files).where(eq(files.id, share.fileId)).limit(1);
  if (!file) return null;

  return { share, file };
}

export function isShareExpired(share: typeof shares.$inferSelect): boolean {
  if (!share.expiresAt) return false;
  return share.expiresAt.getTime() <= Date.now();
}

export function isShareDownloadLimitReached(share: typeof shares.$inferSelect): boolean {
  if (!share.maxDownloads) return false;
  return share.downloadCount >= share.maxDownloads;
}

export async function verifySharePassword(
  share: typeof shares.$inferSelect,
  password: string | undefined
): Promise<boolean> {
  if (!share.passwordHash) return true;
  if (!password) return false;
  return verifyPassword(password, share.passwordHash);
}

export function canDirectAccess(share: typeof shares.$inferSelect): boolean {
  return share.directLink && !share.passwordHash;
}

export async function createShareAccessSession(
  kv: KVNamespace,
  share: typeof shares.$inferSelect,
  canEdit: boolean
): Promise<string> {
  const accessToken = generateAccessToken();
  const ttl = share.expiresAt
    ? Math.min(SHARE_ACCESS_TTL, Math.max(60, Math.floor((share.expiresAt.getTime() - Date.now()) / 1000)))
    : SHARE_ACCESS_TTL;

  await kv.put(
    `${SHARE_ACCESS_PREFIX}${accessToken}`,
    JSON.stringify({ shareId: share.id, canEdit }),
    { expirationTtl: ttl }
  );
  return accessToken;
}

export async function validateShareAccessToken(
  kv: KVNamespace,
  accessToken: string | undefined,
  shareId: string
): Promise<{ canEdit: boolean } | null> {
  if (!accessToken) return null;
  const raw = await kv.get(`${SHARE_ACCESS_PREFIX}${accessToken}`);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as { shareId: string; canEdit: boolean };
    if (data.shareId !== shareId) return null;
    return { canEdit: data.canEdit };
  } catch {
    return null;
  }
}

export async function resolveShareAccess(
  kv: KVNamespace,
  share: typeof shares.$inferSelect,
  accessToken: string | undefined,
  password: string | undefined
): Promise<{ ok: true; canEdit: boolean; accessToken?: string } | { ok: false; reason: string }> {
  if (isShareExpired(share)) {
    return { ok: false, reason: '分享链接已过期' };
  }

  if (canDirectAccess(share)) {
    return { ok: true, canEdit: share.allowEdit };
  }

  if (share.passwordHash) {
    const session = await validateShareAccessToken(kv, accessToken, share.id);
    if (session) {
      return { ok: true, canEdit: session.canEdit && share.allowEdit };
    }
    if (password !== undefined) {
      const valid = await verifySharePassword(share, password);
      if (!valid) return { ok: false, reason: '分享密码错误' };
      const token = await createShareAccessSession(kv, share, share.allowEdit);
      return { ok: true, canEdit: share.allowEdit, accessToken: token };
    }
    return { ok: false, reason: '需要分享密码' };
  }

  const session = await validateShareAccessToken(kv, accessToken, share.id);
  if (session) {
    return { ok: true, canEdit: session.canEdit && share.allowEdit };
  }

  const token = await createShareAccessSession(kv, share, share.allowEdit);
  return { ok: true, canEdit: share.allowEdit, accessToken: token };
}

export async function streamR2Object(
  r2: R2Bucket,
  r2Key: string,
  filename: string,
  mimeType: string | null,
  inline: boolean
) {
  const object = await r2.get(r2Key);
  if (!object) return null;

  const headers = new Headers();
  headers.set('Content-Type', mimeType || 'application/octet-stream');
  headers.set(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(filename)}"`
  );
  if (object.size) headers.set('Content-Length', String(object.size));

  return new Response(object.body, { headers });
}
