DO $$
BEGIN
  IF to_regclass('public.roles') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'roles'
         AND column_name = 'code'
    ) THEN
      ALTER TABLE "roles" ADD COLUMN "code" TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM "roles" WHERE "code" = 'admin') THEN
      UPDATE "roles"
         SET "code" = 'admin',
             "name" = CASE
               WHEN NULLIF(BTRIM(COALESCE("name", '')), '') IS NULL THEN 'admin'
               ELSE "name"
             END,
             "description" = COALESCE("description", 'Administrator'),
             "updated_at" = CURRENT_TIMESTAMP
       WHERE "id" = (
         SELECT "id"
           FROM "roles"
          WHERE LOWER(BTRIM(COALESCE("code", ''))) = 'admin'
          ORDER BY "created_at" ASC
          LIMIT 1
       );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM "roles" WHERE "code" = 'admin') THEN
      UPDATE "roles"
         SET "code" = 'admin',
             "name" = CASE
               WHEN NULLIF(BTRIM(COALESCE("name", '')), '') IS NULL THEN 'admin'
               ELSE "name"
             END,
             "description" = COALESCE("description", 'Administrator'),
             "updated_at" = CURRENT_TIMESTAMP
       WHERE "id" = (
         SELECT "id"
           FROM "roles"
          WHERE NULLIF(BTRIM(COALESCE("code", '')), '') IS NULL
            AND LOWER(BTRIM(COALESCE("name", ''))) IN (
              'admin',
              'administrator',
              '管理员',
              '超级管理员'
            )
          ORDER BY "created_at" ASC
          LIMIT 1
       );
    END IF;

    UPDATE "roles"
       SET "code" = 'role_' || REGEXP_REPLACE("roles"."id"::text, '[^A-Za-z0-9]+', '_', 'g')
     WHERE NULLIF(BTRIM(COALESCE("code", '')), '') IS NULL;

    UPDATE "roles"
       SET "code" = 'role_' || REGEXP_REPLACE("roles"."id"::text, '[^A-Za-z0-9]+', '_', 'g')
      FROM (
        SELECT "id",
               ROW_NUMBER() OVER (
                 PARTITION BY "code"
                 ORDER BY "created_at" ASC, "id" ASC
               ) AS duplicate_rank
          FROM "roles"
      ) duplicates
     WHERE "roles"."id" = duplicates."id"
       AND duplicates.duplicate_rank > 1;

    ALTER TABLE "roles" ALTER COLUMN "code" SET NOT NULL;

    IF NOT EXISTS (
      SELECT 1
        FROM pg_indexes
       WHERE schemaname = 'public'
         AND indexname = 'roles_code_key'
    ) THEN
      CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.user_roles') IS NOT NULL THEN
    DELETE FROM "user_roles" newer
      USING "user_roles" older
     WHERE newer."ctid" > older."ctid"
       AND newer."user_id" = older."user_id"
       AND newer."role_id" = older."role_id";

    IF NOT EXISTS (
      SELECT 1
        FROM pg_indexes
       WHERE schemaname = 'public'
         AND indexname = 'user_roles_user_id_role_id_key'
    ) THEN
      CREATE UNIQUE INDEX "user_roles_user_id_role_id_key"
        ON "user_roles"("user_id", "role_id");
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.role_permissions') IS NOT NULL THEN
    DELETE FROM "role_permissions" newer
      USING "role_permissions" older
     WHERE newer."ctid" > older."ctid"
       AND newer."role_id" = older."role_id"
       AND newer."permission_id" = older."permission_id";

    IF NOT EXISTS (
      SELECT 1
        FROM pg_indexes
       WHERE schemaname = 'public'
         AND indexname = 'role_permissions_role_id_permission_id_key'
    ) THEN
      CREATE UNIQUE INDEX "role_permissions_role_id_permission_id_key"
        ON "role_permissions"("role_id", "permission_id");
    END IF;
  END IF;
END $$;
