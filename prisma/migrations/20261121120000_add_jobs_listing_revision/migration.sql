CREATE TABLE "JobsListingRevision" (
    "singleton" BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK ("singleton"),
    "revision" UUID NOT NULL DEFAULT gen_random_uuid()
);
INSERT INTO "JobsListingRevision" DEFAULT VALUES;

-- The revision changes atomically with the public listing data, even if Redis is unavailable.
CREATE FUNCTION advance_jobs_listing_revision() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
    UPDATE "JobsListingRevision" SET "revision" = gen_random_uuid() WHERE "singleton";
    RETURN NULL;
END;
$$;

CREATE TRIGGER jobs_listing_post_membership
AFTER INSERT OR DELETE ON "Post"
FOR EACH ROW EXECUTE FUNCTION advance_jobs_listing_revision();

-- Compare the unfiltered card projection and its sort/deadline fields.
CREATE TRIGGER jobs_listing_post_update
AFTER UPDATE ON "Post"
FOR EACH ROW WHEN (
    ROW(OLD.id, OLD."sourceId", OLD."postName", OLD.organization, OLD."postGroup",
        OLD."payLevel", OLD.vacancies, OLD."applicationLastDate", OLD."ageAsOnDate",
        OLD."minAge", OLD."maxAge", OLD."educationRequired", OLD."minEducationLevel",
        OLD."minMarksPercent", OLD."publishedAt", OLD."reviewedDetails" -> 'employment_type')
    IS DISTINCT FROM
    ROW(NEW.id, NEW."sourceId", NEW."postName", NEW.organization, NEW."postGroup",
        NEW."payLevel", NEW.vacancies, NEW."applicationLastDate", NEW."ageAsOnDate",
        NEW."minAge", NEW."maxAge", NEW."educationRequired", NEW."minEducationLevel",
        NEW."minMarksPercent", NEW."publishedAt", NEW."reviewedDetails" -> 'employment_type')
) EXECUTE FUNCTION advance_jobs_listing_revision();

CREATE TRIGGER jobs_listing_source_update
AFTER UPDATE ON "Source"
FOR EACH ROW WHEN (
    ROW(OLD.name, OLD.url, OLD."notificationPdfUrl", OLD."officialSiteUrl", OLD."applyUrl", OLD."fetchedAt")
    IS DISTINCT FROM
    ROW(NEW.name, NEW.url, NEW."notificationPdfUrl", NEW."officialSiteUrl", NEW."applyUrl", NEW."fetchedAt")
) EXECUTE FUNCTION advance_jobs_listing_revision();
