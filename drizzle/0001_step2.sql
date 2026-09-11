CREATE TABLE `prompt_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`prompt_id` integer,
	`title` text NOT NULL,
	`company_id` integer,
	`company_name` text,
	`prompt` text NOT NULL,
	`result` text NOT NULL,
	`model` text,
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `saved_searches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`query` text NOT NULL,
	`spec_json` text,
	`enabled` integer DEFAULT 1 NOT NULL,
	`last_run_at` integer,
	`last_result_count` integer,
	`last_new_matches` integer DEFAULT 0,
	`last_new_signals` integer DEFAULT 0,
	`last_result_domains` text,
	`created_at` integer
);
