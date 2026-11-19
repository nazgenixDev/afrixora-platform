BEGIN;

ALTER TABLE "ApiKey"
  ADD COLUMN "keyHash" VARCHAR(64),
  ADD COLUMN "keyPrefix" VARCHAR(8);

-- Les huit premiers caractères de la partie aléatoire distinguent les clés émises.
UPDATE "ApiKey"
SET "keyHash" = encode(sha256(convert_to("key", 'UTF8')), 'hex'),
    "keyPrefix" = left(regexp_replace("key", '^(afrx|nxa)_live_', ''), 8);

ALTER TABLE "ApiKey"
  ALTER COLUMN "keyHash" SET NOT NULL,
  ALTER COLUMN "keyPrefix" SET NOT NULL,
  DROP COLUMN "key";

CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

COMMIT;
