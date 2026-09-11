PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`age` integer,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`dietary_style` text DEFAULT 'unspecified' NOT NULL,
	`exclusions_json` text DEFAULT '[]' NOT NULL,
	`water_target_ml` integer DEFAULT 2000 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_profiles`("user_id", "name", "age", "timezone", "dietary_style", "exclusions_json", "water_target_ml") SELECT "user_id", "name", "age", "timezone", "dietary_style", "exclusions_json", "water_target_ml" FROM `profiles`;--> statement-breakpoint
DROP TABLE `profiles`;--> statement-breakpoint
ALTER TABLE `__new_profiles` RENAME TO `profiles`;--> statement-breakpoint
PRAGMA foreign_keys=ON;