CREATE TABLE `users` (
  `id` text PRIMARY KEY NOT NULL,
  `username` text NOT NULL,
  `password_hash` text NOT NULL,
  `created_at` integer NOT NULL
);

CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);

CREATE TABLE `files` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `parent_id` text,
  `name` text NOT NULL,
  `is_folder` integer DEFAULT false NOT NULL,
  `r2_key` text,
  `size` integer DEFAULT 0 NOT NULL,
  `mime_type` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX `files_user_parent_idx` ON `files` (`user_id`, `parent_id`);
