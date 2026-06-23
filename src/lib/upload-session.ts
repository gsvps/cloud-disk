import type { KVNamespace } from '@cloudflare/workers-types';

export const UPLOAD_CHUNK_SIZE = 5 * 1024 * 1024;
export const UPLOAD_SESSION_TTL = 60 * 60 * 24 * 7;

const SESSION_PREFIX = 'upload:';

export interface UploadPartRecord {
  partNumber: number;
  etag: string;
}

export interface UploadSession {
  sessionId: string;
  fileId: string;
  userId: string;
  parentId: string | null;
  fileName: string;
  mimeType: string;
  r2Key: string;
  r2UploadId: string;
  totalSize: number;
  chunkSize: number;
  parts: UploadPartRecord[];
  createdAt: number;
}

export async function getUploadSession(
  kv: KVNamespace,
  sessionId: string
): Promise<UploadSession | null> {
  const raw = await kv.get(`${SESSION_PREFIX}${sessionId}`);
  if (!raw) return null;
  return JSON.parse(raw) as UploadSession;
}

export async function saveUploadSession(kv: KVNamespace, session: UploadSession): Promise<void> {
  await kv.put(`${SESSION_PREFIX}${session.sessionId}`, JSON.stringify(session), {
    expirationTtl: UPLOAD_SESSION_TTL,
  });
}

export async function deleteUploadSession(kv: KVNamespace, sessionId: string): Promise<void> {
  await kv.delete(`${SESSION_PREFIX}${sessionId}`);
}

export function sessionToStatus(session: UploadSession) {
  return {
    sessionId: session.sessionId,
    fileName: session.fileName,
    totalSize: session.totalSize,
    chunkSize: session.chunkSize,
    uploadedParts: session.parts.map((p) => p.partNumber),
    mimeType: session.mimeType,
    parentId: session.parentId,
  };
}
