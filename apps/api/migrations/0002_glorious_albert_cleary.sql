CREATE TABLE `consents` (
	`user_id` text NOT NULL,
	`version` text NOT NULL,
	`accepted_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `version`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
