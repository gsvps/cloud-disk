ALTER TABLE `users` ADD COLUMN `role` text DEFAULT 'user' NOT NULL;

CREATE TABLE `file_collaborators` (
  `id` text PRIMARY KEY NOT NULL,
  `file_id` text NOT NULL,
  `user_id` text NOT NULL,
  `permission` text NOT NULL,
  `granted_by` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`granted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX `file_collaborators_unique` ON `file_collaborators` (`file_id`, `user_id`);
CREATE INDEX `file_collaborators_user_idx` ON `file_collaborators` (`user_id`);

CREATE TABLE `shares` (
  `id` text PRIMARY KEY NOT NULL,
  `file_id` text NOT NULL,
  `user_id` text NOT NULL,
  `token` text NOT NULL,
  `password_hash` text,
  `expires_at` integer,
  `allow_preview` integer DEFAULT true NOT NULL,
  `allow_edit` integer DEFAULT false NOT NULL,
  `allow_download` integer DEFAULT true NOT NULL,
  `direct_link` integer DEFAULT false NOT NULL,
  `download_count` integer DEFAULT 0 NOT NULL,
  `max_downloads` integer,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX `shares_token_unique` ON `shares` (`token`);
CREATE INDEX `shares_file_idx` ON `shares` (`file_id`);
CREATE INDEX `shares_user_idx` ON `shares` (`user_id`);
