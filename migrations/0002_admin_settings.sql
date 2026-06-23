CREATE TABLE `app_settings` (
  `key` text PRIMARY KEY NOT NULL,
  `value` text NOT NULL,
  `updated_at` integer NOT NULL
);

INSERT INTO `app_settings` (`key`, `value`, `updated_at`)
VALUES ('registration_open', 'true', cast(unixepoch() as integer));

CREATE TABLE `user_groups` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `description` text,
  `can_upload` integer DEFAULT true NOT NULL,
  `can_share` integer DEFAULT true NOT NULL,
  `can_collab` integer DEFAULT true NOT NULL,
  `can_admin` integer DEFAULT false NOT NULL,
  `created_at` integer NOT NULL
);

CREATE UNIQUE INDEX `user_groups_name_unique` ON `user_groups` (`name`);

INSERT INTO `user_groups` (`id`, `name`, `description`, `can_upload`, `can_share`, `can_collab`, `can_admin`, `created_at`)
VALUES (
  'grp_default',
  '默认用户组',
  '普通用户默认权限：上传、分享、协作',
  true,
  true,
  true,
  false,
  cast(unixepoch() as integer)
);

ALTER TABLE `users` ADD COLUMN `group_id` text REFERENCES `user_groups`(`id`) ON DELETE SET NULL;
ALTER TABLE `users` ADD COLUMN `status` text DEFAULT 'active' NOT NULL;

UPDATE `users` SET `group_id` = 'grp_default' WHERE `group_id` IS NULL AND `role` != 'admin';
