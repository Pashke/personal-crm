-- Every contact and group gets an owner. Changes existing data: everything that existed before
-- sign-in goes to the user with the owner's email (OWNER_EMAIL in .env). drizzle.config.ts passes it
-- as the connection setting crm.owner_email, so the address never lands in git.
-- Drizzle applies all new migrations in one transaction: if this one fails, 0004 is rolled back too
-- and the database stays as before the deploy.

-- 1. The owner column, empty for now.
ALTER TABLE "contacts" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "user_id" text;--> statement-breakpoint

-- 2. Existing contacts and groups (the five default groups count too) go to the owner.
-- The owner becomes a user if they are not one yet: their first sign-in lands right in their data.
DO $$
DECLARE
  owner_email text := lower(btrim(coalesce(current_setting('crm.owner_email', true), '')));
  owner_id text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "contacts") AND NOT EXISTS (SELECT 1 FROM "groups") THEN
    RETURN;
  END IF;

  IF owner_email = '' THEN
    RAISE EXCEPTION 'OWNER_EMAIL is not set: the existing contacts and groups need an owner. Add OWNER_EMAIL to .env (see README).';
  END IF;

  SELECT "id" INTO owner_id FROM "users" WHERE "email" = owner_email;
  IF owner_id IS NULL THEN
    -- 32 letters and digits, like the ids Better Auth makes itself.
    owner_id := replace(gen_random_uuid()::text, '-', '');
    INSERT INTO "users" ("id", "name", "email", "email_verified", "created_at", "updated_at")
    VALUES (owner_id, '', owner_email, true, now(), now());
  END IF;

  UPDATE "contacts" SET "user_id" = owner_id;
  UPDATE "groups" SET "user_id" = owner_id;
END $$;--> statement-breakpoint

-- 3. From now on every row must have an owner who is a user.
ALTER TABLE "contacts" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contacts_user_id_idx" ON "contacts" USING btree ("user_id");--> statement-breakpoint

-- A group name is unique among the groups of one user, not in the whole database.
DROP INDEX "groups_name_lower_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "groups_user_id_name_lower_idx" ON "groups" USING btree ("user_id",lower("name"));
