CREATE TABLE `ai_analyses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` integer NOT NULL,
	`fit_score` integer,
	`why_fit` text,
	`pain_points` text,
	`recommended_angle` text,
	`personalization_hooks` text,
	`raw_json` text,
	`model` text,
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `ai_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`purpose` text NOT NULL,
	`provider` text,
	`model` text,
	`temperature` real,
	`max_tokens` integer,
	`system_prompt` text,
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `companies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`domain` text,
	`website` text,
	`description` text,
	`industry` text,
	`employee_count` integer,
	`country` text,
	`city` text,
	`linkedin_url` text,
	`logo_url` text,
	`data_confidence` real,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `company_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` integer NOT NULL,
	`provider` text NOT NULL,
	`provider_record_id` text,
	`source_url` text,
	`retrieved_at` integer,
	`raw_hash` text
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`payload` text,
	`progress` integer DEFAULT 0,
	`attempts` integer DEFAULT 0,
	`error` text,
	`created_at` integer,
	`started_at` integer,
	`completed_at` integer
);
--> statement-breakpoint
CREATE TABLE `list_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`list_id` integer NOT NULL,
	`company_id` integer NOT NULL,
	`added_at` integer
);
--> statement-breakpoint
CREATE TABLE `lists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `outreach_generations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` integer,
	`person_id` integer,
	`channel` text NOT NULL,
	`tone` text,
	`message` text,
	`model` text,
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `people` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`first_name` text,
	`last_name` text,
	`title` text,
	`company_id` integer,
	`email` text,
	`email_status` text,
	`linkedin_url` text,
	`location` text,
	`data_confidence` real,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `prompt_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`category` text,
	`template` text NOT NULL,
	`variables` text,
	`model_profile` text,
	`usage_count` integer DEFAULT 0,
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `search_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`search_id` integer NOT NULL,
	`company_id` integer NOT NULL,
	`rank` integer,
	`score` real
);
--> statement-breakpoint
CREATE TABLE `searches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`query_text` text NOT NULL,
	`spec_json` text,
	`status` text DEFAULT 'completed' NOT NULL,
	`result_count` integer,
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `signals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` integer NOT NULL,
	`type` text NOT NULL,
	`title` text,
	`summary` text,
	`source_url` text,
	`source` text,
	`published_at` integer,
	`detected_at` integer,
	`confidence` real,
	`evidence` text
);
