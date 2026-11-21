CREATE TABLE "TypingCacheRevision" (
  "singleton" boolean PRIMARY KEY DEFAULT TRUE CHECK ("singleton"),
  "revision" uuid NOT NULL DEFAULT gen_random_uuid()
);

INSERT INTO "TypingCacheRevision" DEFAULT VALUES;

CREATE FUNCTION bump_typing_cache_revision() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "TypingCacheRevision" SET "revision" = gen_random_uuid();
  RETURN NULL;
END;
$$;

CREATE TRIGGER typing_passage_cache_revision
AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON "TypingPassage"
FOR EACH STATEMENT EXECUTE FUNCTION bump_typing_cache_revision();

CREATE TRIGGER typing_version_cache_revision
AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON "TypingExamVersion"
FOR EACH STATEMENT EXECUTE FUNCTION bump_typing_cache_revision();
