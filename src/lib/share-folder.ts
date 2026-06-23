import { eq } from 'drizzle-orm';
import type { createDb } from '../db';
import { files } from '../db/schema';

/** 判断 target 是否在 shareRoot 文件夹树内（含自身） */
export async function isFileInShareTree(
  db: ReturnType<typeof createDb>,
  shareRootId: string,
  targetFileId: string
): Promise<boolean> {
  if (shareRootId === targetFileId) return true;

  let currentId: string | null = targetFileId;
  const visited = new Set<string>();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const [record] = await db.select().from(files).where(eq(files.id, currentId)).limit(1);
    if (!record) return false;
    if (record.id === shareRootId) return true;
    currentId = record.parentId;
  }

  return false;
}

export async function getShareListParentId(
  db: ReturnType<typeof createDb>,
  shareRoot: typeof files.$inferSelect,
  parentId: string | null
): Promise<string | null> {
  if (!shareRoot.isFolder) return null;

  const listParent = parentId ?? shareRoot.id;
  if (listParent === shareRoot.id) return shareRoot.id;

  const ok = await isFileInShareTree(db, shareRoot.id, listParent);
  if (!ok) return null;

  const [parent] = await db.select().from(files).where(eq(files.id, listParent)).limit(1);
  return parent?.isFolder ? listParent : null;
}
