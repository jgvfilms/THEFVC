CREATE TABLE `credits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`production_title` text NOT NULL,
	`role` text NOT NULL,
	`year` integer NOT NULL,
	`format` text,
	`verified` integer DEFAULT false,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `production_crew` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`production_id` integer NOT NULL,
	`profile_id` integer NOT NULL,
	`role` text NOT NULL,
	`status` text DEFAULT 'invited',
	`day_rate` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`production_id`) REFERENCES `productions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `productions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`creator_id` integer NOT NULL,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`description` text,
	`start_date` text,
	`end_date` text,
	`location` text,
	`status` text DEFAULT 'pre_production',
	`budget` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`city` text,
	`state` text,
	`country` text DEFAULT 'US',
	`bio` text,
	`avatar_initials` text,
	`reel_url` text,
	`imdb_url` text,
	`website_url` text,
	`day_rate` integer,
	`availability` text DEFAULT 'available',
	`skills` text DEFAULT '[]',
	`is_public` integer DEFAULT true,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_user_id_unique` ON `profiles` (`user_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token` text NOT NULL,
	`user_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_unique` ON `sessions` (`token`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`handle` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_handle_unique` ON `users` (`handle`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);