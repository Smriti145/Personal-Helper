CREATE TABLE `daily_checkins` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`energy` integer,
	`mood` integer,
	`stress` integer,
	`symptoms_json` text DEFAULT '[]' NOT NULL,
	`sleep_minutes` integer,
	`movement_minutes` integer,
	`water_ml` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_daily_checkins_user_date` ON `daily_checkins` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE `medications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`dose` text,
	`instructions` text NOT NULL,
	`frequency` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`prescriber` text,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`age` integer,
	`timezone` text DEFAULT 'Asia/Kolkata' NOT NULL,
	`dietary_style` text DEFAULT 'jain_vegetarian' NOT NULL,
	`exclusions_json` text DEFAULT '[]' NOT NULL,
	`water_target_ml` integer DEFAULT 2000 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `reminder_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`quiet_start` text DEFAULT '22:30' NOT NULL,
	`quiet_end` text DEFAULT '05:30' NOT NULL,
	`default_snooze_minutes` integer DEFAULT 10 NOT NULL,
	`escalation_enabled` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `routine_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`routine_id` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`scheduled_minute` integer NOT NULL,
	`dependency_type` text,
	`dependency_task_id` text,
	`offset_minutes` integer,
	`priority` integer DEFAULT 2 NOT NULL,
	FOREIGN KEY (`routine_id`) REFERENCES `routines`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `routines` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`day_type` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `task_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`task_id` text,
	`medication_id` text,
	`scheduled_at` integer NOT NULL,
	`status` text NOT NULL,
	`completed_at` integer,
	`missed_reason` text,
	`note` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_email` ON `users` (`email`);