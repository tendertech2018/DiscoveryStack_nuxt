CREATE TABLE `growthExperimentReviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`experimentId` int NOT NULL,
	`reviewerUserId` int NOT NULL,
	`decision` enum('approved','needs_revision','rejected') NOT NULL,
	`factualityDecision` enum('passed','failed') NOT NULL,
	`brandQualityDecision` enum('passed','failed') NOT NULL,
	`reviewNote` text,
	`approvedForDataset` boolean NOT NULL DEFAULT false,
	`reviewedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `growthExperimentReviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `growthExperimentVariants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`experimentId` int NOT NULL,
	`variantType` enum('control','candidate') NOT NULL,
	`contentHash` varchar(128) NOT NULL,
	`artifactStorageKey` varchar(512),
	`factualityStatus` enum('pending','passed','failed') NOT NULL DEFAULT 'pending',
	`qualityStatus` enum('pending','passed','failed') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `growthExperimentVariants_id` PRIMARY KEY(`id`),
	CONSTRAINT `growth_variant_unique` UNIQUE(`experimentId`,`variantType`)
);
--> statement-breakpoint
CREATE TABLE `growthExperiments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`intakeId` int NOT NULL,
	`workspaceId` int,
	`sourceUrl` varchar(2048) NOT NULL,
	`sourceContentHash` varchar(128) NOT NULL,
	`locale` enum('en','zh-hant') NOT NULL,
	`targetEngine` varchar(80) NOT NULL,
	`queryFingerprint` varchar(128) NOT NULL,
	`rewriteMode` enum('manual','autogeo_api','autogeo_mini') NOT NULL,
	`modelId` varchar(240),
	`modelRevision` varchar(128),
	`ruleRevision` varchar(128),
	`datasetRevision` varchar(128),
	`status` enum('draft','ready_for_review','approved','rejected','revoked') NOT NULL DEFAULT 'draft',
	`autoPublish` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `growthExperiments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `growthMeasurements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`experimentId` int NOT NULL,
	`variantId` int NOT NULL,
	`channel` enum('google_search','google_ai_overview','chatgpt','gemini','perplexity','manual') NOT NULL,
	`metric` enum('retrieval','rank','citation','visibility','geo_score','geu_score','conversion') NOT NULL,
	`value` decimal(12,4) NOT NULL,
	`provenance` enum('observed','imported','human_confirmed') NOT NULL,
	`observedAt` timestamp NOT NULL,
	`windowStart` timestamp,
	`windowEnd` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `growthMeasurements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `growthResearchConsents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`leadId` int NOT NULL,
	`action` enum('granted','revoked') NOT NULL,
	`scope` varchar(160) NOT NULL,
	`copyVersion` varchar(80) NOT NULL,
	`locale` enum('en','zh-hant') NOT NULL,
	`requestFingerprintHash` varchar(64) NOT NULL,
	`occurredAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `growthResearchConsents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `growthResearchIntakes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`leadId` int NOT NULL,
	`canonicalWebsiteUrl` varchar(2048) NOT NULL,
	`domain` varchar(253) NOT NULL,
	`locale` enum('en','zh-hant') NOT NULL,
	`consentId` int NOT NULL,
	`status` enum('pending_review','approved','rejected','revoked') NOT NULL DEFAULT 'pending_review',
	`ownerReviewNote` text,
	`reviewedAt` timestamp,
	`consentRevokedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `growthResearchIntakes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `leads` ADD `growthResearchConsent` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `growthExperimentReviews` ADD CONSTRAINT `growth_review_experiment_fk` FOREIGN KEY (`experimentId`) REFERENCES `growthExperiments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `growthExperimentReviews` ADD CONSTRAINT `growth_review_user_fk` FOREIGN KEY (`reviewerUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `growthExperimentVariants` ADD CONSTRAINT `growth_variant_experiment_fk` FOREIGN KEY (`experimentId`) REFERENCES `growthExperiments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `growthExperiments` ADD CONSTRAINT `growth_experiment_intake_fk` FOREIGN KEY (`intakeId`) REFERENCES `growthResearchIntakes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `growthExperiments` ADD CONSTRAINT `growth_experiment_workspace_fk` FOREIGN KEY (`workspaceId`) REFERENCES `auditWorkspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `growthMeasurements` ADD CONSTRAINT `growth_measurement_experiment_fk` FOREIGN KEY (`experimentId`) REFERENCES `growthExperiments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `growthMeasurements` ADD CONSTRAINT `growth_measurement_variant_fk` FOREIGN KEY (`variantId`) REFERENCES `growthExperimentVariants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `growthResearchConsents` ADD CONSTRAINT `growth_consent_lead_fk` FOREIGN KEY (`leadId`) REFERENCES `leads`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `growthResearchIntakes` ADD CONSTRAINT `growth_intake_lead_fk` FOREIGN KEY (`leadId`) REFERENCES `leads`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `growthResearchIntakes` ADD CONSTRAINT `growth_intake_consent_fk` FOREIGN KEY (`consentId`) REFERENCES `growthResearchConsents`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `growth_review_experiment_idx` ON `growthExperimentReviews` (`experimentId`);--> statement-breakpoint
CREATE INDEX `growth_experiment_intake_idx` ON `growthExperiments` (`intakeId`);--> statement-breakpoint
CREATE INDEX `growth_experiment_status_idx` ON `growthExperiments` (`status`);--> statement-breakpoint
CREATE INDEX `growth_measurement_experiment_idx` ON `growthMeasurements` (`experimentId`);--> statement-breakpoint
CREATE INDEX `growth_consent_lead_idx` ON `growthResearchConsents` (`leadId`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `growth_intake_status_idx` ON `growthResearchIntakes` (`status`);--> statement-breakpoint
CREATE INDEX `growth_intake_lead_idx` ON `growthResearchIntakes` (`leadId`);