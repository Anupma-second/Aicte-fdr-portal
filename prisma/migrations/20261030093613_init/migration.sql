-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(100) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `phone` VARCHAR(20) NULL,
    `role` ENUM('INSTITUTION', 'SCRUTINY_OFFICER', 'COMPETENT_AUTHORITY', 'ADMIN') NOT NULL,
    `status` ENUM('PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'REJECTED') NOT NULL DEFAULT 'PENDING_APPROVAL',
    `tokenVersion` INTEGER NOT NULL DEFAULT 0,
    `lastLoginAt` DATETIME(3) NULL,
    `institutionId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    INDEX `User_role_status_idx`(`role`, `status`),
    INDEX `User_institutionId_idx`(`institutionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Institution` (
    `id` VARCHAR(191) NOT NULL,
    `aicteCode` VARCHAR(30) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `type` ENUM('ENGINEERING', 'MANAGEMENT', 'PHARMACY', 'ARCHITECTURE', 'POLYTECHNIC', 'OTHER') NOT NULL,
    `addressLine` VARCHAR(255) NULL,
    `city` VARCHAR(100) NOT NULL,
    `state` VARCHAR(60) NOT NULL,
    `region` ENUM('NORTH', 'SOUTH', 'EAST', 'WEST', 'CENTRAL', 'NORTH_EAST') NOT NULL,
    `contactName` VARCHAR(120) NULL,
    `contactEmail` VARCHAR(191) NULL,
    `contactPhone` VARCHAR(20) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Institution_aicteCode_key`(`aicteCode`),
    INDEX `Institution_state_idx`(`state`),
    INDEX `Institution_region_idx`(`region`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Fdr` (
    `id` VARCHAR(191) NOT NULL,
    `referenceNo` VARCHAR(24) NOT NULL,
    `fdrNumber` VARCHAR(40) NOT NULL,
    `institutionId` VARCHAR(191) NOT NULL,
    `bankName` VARCHAR(120) NOT NULL,
    `branchName` VARCHAR(120) NOT NULL,
    `ifscCode` VARCHAR(11) NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `issueDate` DATE NOT NULL,
    `maturityDate` DATE NOT NULL,
    `status` ENUM('SUBMITTED', 'UNDER_SCRUTINY', 'DISCREPANCY_RAISED', 'VERIFIED', 'ACTIVE', 'EXPIRING', 'MATURED', 'RENEWED', 'REPLACED', 'RELEASE_REQUESTED', 'RELEASED', 'CLOSED') NOT NULL DEFAULT 'SUBMITTED',
    `trustLevel` ENUM('SELF_DECLARED', 'DOCUMENT_VERIFIED', 'BANK_CONFIRMED') NOT NULL DEFAULT 'SELF_DECLARED',
    `riskScore` INTEGER NOT NULL DEFAULT 0,
    `riskLevel` ENUM('GREEN', 'AMBER', 'RED') NOT NULL DEFAULT 'GREEN',
    `riskReasons` JSON NULL,
    `submittedById` VARCHAR(191) NOT NULL,
    `assignedOfficerId` VARCHAR(191) NULL,
    `submittedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `verifiedAt` DATETIME(3) NULL,
    `slaDueAt` DATETIME(3) NULL,
    `statusChangedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Fdr_referenceNo_key`(`referenceNo`),
    INDEX `Fdr_fdrNumber_idx`(`fdrNumber`),
    INDEX `Fdr_maturityDate_idx`(`maturityDate`),
    INDEX `Fdr_status_idx`(`status`),
    INDEX `Fdr_status_maturityDate_idx`(`status`, `maturityDate`),
    INDEX `Fdr_riskLevel_riskScore_idx`(`riskLevel`, `riskScore`),
    INDEX `Fdr_assignedOfficerId_status_idx`(`assignedOfficerId`, `status`),
    INDEX `Fdr_submittedById_idx`(`submittedById`),
    UNIQUE INDEX `Fdr_institutionId_fdrNumber_key`(`institutionId`, `fdrNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FdrDocument` (
    `id` VARCHAR(191) NOT NULL,
    `fdrId` VARCHAR(191) NOT NULL,
    `type` ENUM('FDR_SCAN', 'COVERING_LETTER', 'BANK_LETTER', 'RENEWAL_PROOF', 'RELEASE_APPLICATION', 'OTHER') NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `isCurrent` BOOLEAN NOT NULL DEFAULT true,
    `originalName` VARCHAR(255) NOT NULL,
    `mimeType` VARCHAR(100) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `storageKey` VARCHAR(191) NOT NULL,
    `sha256` CHAR(64) NOT NULL,
    `iv` VARCHAR(32) NOT NULL,
    `authTag` VARCHAR(32) NOT NULL,
    `uploadedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `FdrDocument_storageKey_key`(`storageKey`),
    INDEX `FdrDocument_fdrId_isCurrent_idx`(`fdrId`, `isCurrent`),
    INDEX `FdrDocument_uploadedById_idx`(`uploadedById`),
    UNIQUE INDEX `FdrDocument_fdrId_type_version_key`(`fdrId`, `type`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OcrExtraction` (
    `id` VARCHAR(191) NOT NULL,
    `documentId` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `rawText` TEXT NULL,
    `fdrNumber` VARCHAR(40) NULL,
    `bankName` VARCHAR(120) NULL,
    `branchName` VARCHAR(120) NULL,
    `amount` DECIMAL(14, 2) NULL,
    `issueDate` DATE NULL,
    `maturityDate` DATE NULL,
    `confidence` DOUBLE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `OcrExtraction_documentId_key`(`documentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FdrEvent` (
    `id` VARCHAR(191) NOT NULL,
    `fdrId` VARCHAR(191) NOT NULL,
    `type` ENUM('SUBMITTED', 'DOCUMENT_UPLOADED', 'OCR_RUN', 'DISCREPANCY_RAISED', 'DISCREPANCY_RESOLVED', 'OBSERVATION_ADDED', 'BANK_VERIFICATION', 'VERIFIED', 'STATUS_CHANGED', 'ALERT_SENT', 'ESCALATED', 'RENEWED', 'REPLACED', 'RELEASE_REQUESTED', 'RELEASE_DECISION', 'RELEASED', 'CLOSED') NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `detail` TEXT NULL,
    `metadata` JSON NULL,
    `actorId` VARCHAR(191) NULL,
    `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FdrEvent_fdrId_occurredAt_idx`(`fdrId`, `occurredAt`),
    INDEX `FdrEvent_actorId_idx`(`actorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Discrepancy` (
    `id` VARCHAR(191) NOT NULL,
    `fdrId` VARCHAR(191) NOT NULL,
    `type` ENUM('MISSING_FIELD', 'MISSING_DOCUMENT', 'MATURITY_BEFORE_ISSUE', 'AMOUNT_MISMATCH', 'DUPLICATE_FDR_NUMBER', 'BANK_MISMATCH', 'OTHER') NOT NULL,
    `severity` ENUM('LOW', 'MEDIUM', 'HIGH') NOT NULL DEFAULT 'MEDIUM',
    `status` ENUM('OPEN', 'RESPONDED', 'RESOLVED', 'WAIVED') NOT NULL DEFAULT 'OPEN',
    `source` ENUM('SYSTEM', 'OFFICER') NOT NULL DEFAULT 'SYSTEM',
    `field` VARCHAR(60) NULL,
    `declaredValue` VARCHAR(255) NULL,
    `extractedValue` VARCHAR(255) NULL,
    `message` TEXT NOT NULL,
    `response` TEXT NULL,
    `respondedAt` DATETIME(3) NULL,
    `raisedById` VARCHAR(191) NULL,
    `resolvedById` VARCHAR(191) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Discrepancy_fdrId_status_idx`(`fdrId`, `status`),
    INDEX `Discrepancy_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `Discrepancy_type_idx`(`type`),
    INDEX `Discrepancy_raisedById_idx`(`raisedById`),
    INDEX `Discrepancy_resolvedById_idx`(`resolvedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ScrutinyObservation` (
    `id` VARCHAR(191) NOT NULL,
    `fdrId` VARCHAR(191) NOT NULL,
    `officerId` VARCHAR(191) NOT NULL,
    `note` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ScrutinyObservation_fdrId_createdAt_idx`(`fdrId`, `createdAt`),
    INDEX `ScrutinyObservation_officerId_idx`(`officerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReleaseRequest` (
    `id` VARCHAR(191) NOT NULL,
    `fdrId` VARCHAR(191) NOT NULL,
    `status` ENUM('REQUESTED', 'DOCUMENT_CHECK', 'SCRUTINY', 'AUTHORITY_APPROVAL', 'APPROVED', 'REJECTED', 'CLOSED') NOT NULL DEFAULT 'REQUESTED',
    `reason` TEXT NOT NULL,
    `requestedById` VARCHAR(191) NOT NULL,
    `decidedById` VARCHAR(191) NULL,
    `decisionNote` TEXT NULL,
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `decidedAt` DATETIME(3) NULL,
    `closedAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ReleaseRequest_fdrId_idx`(`fdrId`),
    INDEX `ReleaseRequest_status_requestedAt_idx`(`status`, `requestedAt`),
    INDEX `ReleaseRequest_requestedById_idx`(`requestedById`),
    INDEX `ReleaseRequest_decidedById_idx`(`decidedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RenewalLink` (
    `id` VARCHAR(191) NOT NULL,
    `oldFdrId` VARCHAR(191) NOT NULL,
    `newFdrId` VARCHAR(191) NOT NULL,
    `type` ENUM('RENEWAL', 'REPLACEMENT') NOT NULL,
    `note` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `RenewalLink_oldFdrId_key`(`oldFdrId`),
    UNIQUE INDEX `RenewalLink_newFdrId_key`(`newFdrId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `fdrId` VARCHAR(191) NULL,
    `kind` ENUM('REMINDER', 'ESCALATION', 'DISCREPANCY', 'RELEASE', 'ACCOUNT', 'SYSTEM') NOT NULL,
    `channel` ENUM('IN_APP', 'EMAIL') NOT NULL DEFAULT 'IN_APP',
    `title` VARCHAR(200) NOT NULL,
    `body` TEXT NOT NULL,
    `link` VARCHAR(255) NULL,
    `emailStatus` ENUM('NOT_APPLICABLE', 'PENDING', 'SENT', 'LOGGED', 'FAILED') NOT NULL DEFAULT 'NOT_APPLICABLE',
    `dedupeKey` VARCHAR(191) NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Notification_dedupeKey_key`(`dedupeKey`),
    INDEX `Notification_userId_readAt_createdAt_idx`(`userId`, `readAt`, `createdAt`),
    INDEX `Notification_fdrId_idx`(`fdrId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AlertRule` (
    `id` VARCHAR(191) NOT NULL,
    `kind` ENUM('REMINDER', 'ESCALATION') NOT NULL,
    `days` INTEGER NOT NULL,
    `targetLevel` ENUM('INSTITUTION', 'SCRUTINY_OFFICER', 'COMPETENT_AUTHORITY') NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AlertRule_kind_isActive_idx`(`kind`, `isActive`),
    UNIQUE INDEX `AlertRule_kind_days_targetLevel_key`(`kind`, `days`, `targetLevel`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EscalationLog` (
    `id` VARCHAR(191) NOT NULL,
    `fdrId` VARCHAR(191) NOT NULL,
    `ruleId` VARCHAR(191) NULL,
    `fromLevel` ENUM('INSTITUTION', 'SCRUTINY_OFFICER', 'COMPETENT_AUTHORITY') NULL,
    `toLevel` ENUM('INSTITUTION', 'SCRUTINY_OFFICER', 'COMPETENT_AUTHORITY') NOT NULL,
    `toUserId` VARCHAR(191) NULL,
    `daysOverdue` INTEGER NOT NULL,
    `note` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `EscalationLog_fdrId_createdAt_idx`(`fdrId`, `createdAt`),
    INDEX `EscalationLog_ruleId_idx`(`ruleId`),
    INDEX `EscalationLog_toUserId_idx`(`toUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actorId` VARCHAR(191) NULL,
    `actorLabel` VARCHAR(191) NOT NULL,
    `action` VARCHAR(80) NOT NULL,
    `entityType` VARCHAR(40) NOT NULL,
    `entityId` VARCHAR(40) NULL,
    `payload` LONGTEXT NOT NULL,
    `prevHash` CHAR(64) NOT NULL,
    `hash` CHAR(64) NOT NULL,

    UNIQUE INDEX `AuditLog_hash_key`(`hash`),
    INDEX `AuditLog_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `AuditLog_actorId_idx`(`actorId`),
    INDEX `AuditLog_occurredAt_idx`(`occurredAt`),
    INDEX `AuditLog_action_idx`(`action`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditChainHead` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `lastHash` CHAR(64) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BankVerificationLog` (
    `id` VARCHAR(191) NOT NULL,
    `fdrId` VARCHAR(191) NOT NULL,
    `adapter` VARCHAR(40) NOT NULL DEFAULT 'mock',
    `result` ENUM('CONFIRMED', 'NOT_FOUND', 'MISMATCH', 'ERROR') NOT NULL,
    `confirmedAmount` DECIMAL(14, 2) NULL,
    `confirmedMaturityDate` DATE NULL,
    `responsePayload` JSON NULL,
    `requestedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BankVerificationLog_fdrId_createdAt_idx`(`fdrId`, `createdAt`),
    INDEX `BankVerificationLog_requestedById_idx`(`requestedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LoginAttempt` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 0,
    `windowStart` DATETIME(3) NOT NULL,
    `lockedUntil` DATETIME(3) NULL,

    UNIQUE INDEX `LoginAttempt_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_institutionId_fkey` FOREIGN KEY (`institutionId`) REFERENCES `Institution`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Fdr` ADD CONSTRAINT `Fdr_institutionId_fkey` FOREIGN KEY (`institutionId`) REFERENCES `Institution`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Fdr` ADD CONSTRAINT `Fdr_submittedById_fkey` FOREIGN KEY (`submittedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Fdr` ADD CONSTRAINT `Fdr_assignedOfficerId_fkey` FOREIGN KEY (`assignedOfficerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FdrDocument` ADD CONSTRAINT `FdrDocument_fdrId_fkey` FOREIGN KEY (`fdrId`) REFERENCES `Fdr`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FdrDocument` ADD CONSTRAINT `FdrDocument_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OcrExtraction` ADD CONSTRAINT `OcrExtraction_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `FdrDocument`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FdrEvent` ADD CONSTRAINT `FdrEvent_fdrId_fkey` FOREIGN KEY (`fdrId`) REFERENCES `Fdr`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FdrEvent` ADD CONSTRAINT `FdrEvent_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Discrepancy` ADD CONSTRAINT `Discrepancy_fdrId_fkey` FOREIGN KEY (`fdrId`) REFERENCES `Fdr`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Discrepancy` ADD CONSTRAINT `Discrepancy_raisedById_fkey` FOREIGN KEY (`raisedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Discrepancy` ADD CONSTRAINT `Discrepancy_resolvedById_fkey` FOREIGN KEY (`resolvedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScrutinyObservation` ADD CONSTRAINT `ScrutinyObservation_fdrId_fkey` FOREIGN KEY (`fdrId`) REFERENCES `Fdr`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScrutinyObservation` ADD CONSTRAINT `ScrutinyObservation_officerId_fkey` FOREIGN KEY (`officerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReleaseRequest` ADD CONSTRAINT `ReleaseRequest_fdrId_fkey` FOREIGN KEY (`fdrId`) REFERENCES `Fdr`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReleaseRequest` ADD CONSTRAINT `ReleaseRequest_requestedById_fkey` FOREIGN KEY (`requestedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReleaseRequest` ADD CONSTRAINT `ReleaseRequest_decidedById_fkey` FOREIGN KEY (`decidedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RenewalLink` ADD CONSTRAINT `RenewalLink_oldFdrId_fkey` FOREIGN KEY (`oldFdrId`) REFERENCES `Fdr`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RenewalLink` ADD CONSTRAINT `RenewalLink_newFdrId_fkey` FOREIGN KEY (`newFdrId`) REFERENCES `Fdr`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_fdrId_fkey` FOREIGN KEY (`fdrId`) REFERENCES `Fdr`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EscalationLog` ADD CONSTRAINT `EscalationLog_fdrId_fkey` FOREIGN KEY (`fdrId`) REFERENCES `Fdr`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EscalationLog` ADD CONSTRAINT `EscalationLog_ruleId_fkey` FOREIGN KEY (`ruleId`) REFERENCES `AlertRule`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EscalationLog` ADD CONSTRAINT `EscalationLog_toUserId_fkey` FOREIGN KEY (`toUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BankVerificationLog` ADD CONSTRAINT `BankVerificationLog_fdrId_fkey` FOREIGN KEY (`fdrId`) REFERENCES `Fdr`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BankVerificationLog` ADD CONSTRAINT `BankVerificationLog_requestedById_fkey` FOREIGN KEY (`requestedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
