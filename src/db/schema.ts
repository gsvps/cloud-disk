import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const userGroups = sqliteTable('user_groups', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  canUpload: integer('can_upload', { mode: 'boolean' }).notNull().default(true),
  canShare: integer('can_share', { mode: 'boolean' }).notNull().default(true),
  canCollab: integer('can_collab', { mode: 'boolean' }).notNull().default(true),
  canAdmin: integer('can_admin', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('user'),
  groupId: text('group_id').references(() => userGroups.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('active'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const files = sqliteTable('files', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  parentId: text('parent_id'),
  name: text('name').notNull(),
  isFolder: integer('is_folder', { mode: 'boolean' }).notNull().default(false),
  r2Key: text('r2_key'),
  size: integer('size').notNull().default(0),
  mimeType: text('mime_type'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const fileCollaborators = sqliteTable('file_collaborators', {
  id: text('id').primaryKey(),
  fileId: text('file_id')
    .notNull()
    .references(() => files.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  permission: text('permission').notNull(),
  grantedBy: text('granted_by')
    .notNull()
    .references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const shares = sqliteTable('shares', {
  id: text('id').primaryKey(),
  fileId: text('file_id')
    .notNull()
    .references(() => files.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  passwordHash: text('password_hash'),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  allowPreview: integer('allow_preview', { mode: 'boolean' }).notNull().default(true),
  allowEdit: integer('allow_edit', { mode: 'boolean' }).notNull().default(false),
  allowDownload: integer('allow_download', { mode: 'boolean' }).notNull().default(true),
  directLink: integer('direct_link', { mode: 'boolean' }).notNull().default(false),
  downloadCount: integer('download_count').notNull().default(0),
  maxDownloads: integer('max_downloads'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export type User = typeof users.$inferSelect;
export type UserGroup = typeof userGroups.$inferSelect;
export type AppSetting = typeof appSettings.$inferSelect;
export type FileRecord = typeof files.$inferSelect;
export type FileCollaborator = typeof fileCollaborators.$inferSelect;
export type Share = typeof shares.$inferSelect;
