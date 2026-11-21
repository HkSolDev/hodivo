CREATE TABLE "TypingAttemptCacheRevision" (
  "passageId" text NOT NULL,
  "kind" text NOT NULL,
  "scope" text NOT NULL,
  "revision" uuid NOT NULL DEFAULT gen_random_uuid(),
  PRIMARY KEY ("passageId", "kind", "scope")
);

CREATE FUNCTION bump_typing_attempt_cache_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE
  attempt "TypingAttempt" := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
BEGIN
  -- Serialize changes to the same board before checking the user's best.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    attempt."passageId" || ':' || attempt."mode"::text, 0
  ));

  INSERT INTO "TypingAttemptCacheRevision" ("passageId", "kind", "scope")
  VALUES (attempt."passageId", 'progress', attempt."authUserId")
  ON CONFLICT ("passageId", "kind", "scope")
  DO UPDATE SET "revision" = EXCLUDED."revision";

  IF TG_OP <> 'INSERT' OR NOT EXISTS (
    SELECT 1 FROM "TypingAttempt" prior
    WHERE prior."authUserId" = attempt."authUserId"
      AND prior."passageId" = attempt."passageId"
      AND prior."mode" = attempt."mode"
      AND (-prior."netWpm", prior."errorPercent", prior."createdAt", prior."id")
        < (-attempt."netWpm", attempt."errorPercent", attempt."createdAt", attempt."id")
  ) THEN
    INSERT INTO "TypingAttemptCacheRevision" ("passageId", "kind", "scope")
    VALUES (attempt."passageId", 'board', attempt."mode"::text)
    ON CONFLICT ("passageId", "kind", "scope")
    DO UPDATE SET "revision" = EXCLUDED."revision";
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER typing_attempt_cache_revision
AFTER INSERT OR DELETE OR UPDATE OF "examVersionId" ON "TypingAttempt"
FOR EACH ROW EXECUTE FUNCTION bump_typing_attempt_cache_revision();
