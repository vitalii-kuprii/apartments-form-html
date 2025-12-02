-- Add missing columns to users table
ALTER TABLE "users" ADD COLUMN "preferred_mode" TEXT NOT NULL DEFAULT 'ui';

-- Add missing columns to apartments table
ALTER TABLE "apartments" ADD COLUMN "agency_name" TEXT;
ALTER TABLE "apartments" ADD COLUMN "commission" TEXT;
