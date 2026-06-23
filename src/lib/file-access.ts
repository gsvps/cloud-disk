import { and, eq, isNull, or } from 'drizzle-orm';
import type { createDb } from '../db';
import { fileCollaborators, files } from '../db/schema';

export type FilePermission = 'owner' | 'edit' | 'view';

export interface FileAccess {
  file: typeof files.$inferSelect;
  permission: FilePermission;
}

export async function getFileAccess(
  db: ReturnType<typeof createDb>,
  userId: string,
  fileId: string
): Promise<FileAccess | null> {
  const [file] = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
  if (!file) return null;

  if (file.userId === userId) {
    return { file, permission: 'owner' };
  }

  const perm = await resolveCollaboratorPermission(db, userId, file);
  if (!perm) return null;
  return { file, permission: perm };
}

async function resolveCollaboratorPermission(
  db: ReturnType<typeof createDb>,
  userId: string,
  file: typeof files.$inferSelect
): Promise<'edit' | 'view' | null> {
  let current: typeof files.$inferSelect | null = file;

  while (current) {
    const [collab] = await db
      .select()
      .from(fileCollaborators)
      .where(and(eq(fileCollaborators.fileId, current.id), eq(fileCollaborators.userId, userId)))
      .limit(1);

    if (collab) {
      return collab.permission === 'edit' ? 'edit' : 'view';
    }

    if (!current.parentId) break;
    const [parent] = await db.select().from(files).where(eq(files.id, current.parentId)).limit(1);
    current = parent ?? null;
  }

  return null;
}

export function canRead(permission: FilePermission): boolean {
  return permission === 'owner' || permission === 'edit' || permission === 'view';
}

export function canWrite(permission: FilePermission): boolean {
  return permission === 'owner' || permission === 'edit';
}

export async function listAccessibleFiles(
  db: ReturnType<typeof createDb>,
  userId: string,
  parentId: string | null,
  scope: 'mine' | 'shared'
) {
  if (scope === 'mine') {
    const condition = parentId
      ? and(eq(files.userId, userId), eq(files.parentId, parentId))
      : and(eq(files.userId, userId), isNull(files.parentId));
    return db.select().from(files).where(condition);
  }

  if (parentId) {
    const access = await getFileAccess(db, userId, parentId);
    if (!access || !canRead(access.permission)) return [];
    return db.select().from(files).where(eq(files.parentId, parentId));
  }

  const collabs = await db
    .select({ file: files })
    .from(fileCollaborators)
    .innerJoin(files, eq(fileCollaborators.fileId, files.id))
    .where(eq(fileCollaborators.userId, userId));

  return collabs.map((c) => c.file).filter((f) => !f.parentId);
}

export async function getOwnedParent(
  db: ReturnType<typeof createDb>,
  userId: string,
  parentId: string | null
): Promise<boolean> {
  if (!parentId) return true;
  const access = await getFileAccess(db, userId, parentId);
  return access?.file.isFolder === true && canWrite(access.permission);
}
