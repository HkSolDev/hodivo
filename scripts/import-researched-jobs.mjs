#!/usr/bin/env node
/**
 * Reusable one-shot importer for researched job JSON files.
 *
 * Usage:
 *   node --import tsx --no-network-family-autoselection --env-file=.env scripts/import-researched-jobs.mjs <path-to-jobs.json>
 *
 * `--import tsx` lets this script load the shared sync queue, so slave-db is
 * updated automatically (needs SYNC_REDIS_URL or JOBS_REDIS_URL in .env).
 *
 * Accepts either:
 *   - A JSON array of { source, posts, enrichment, researchDetails }
 *   - A JSON object with currentlyOpenVerifiedRecruitments / applicationsNotYetOpen arrays
 */

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(path.resolve(process.cwd(), 'package.json'));
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require(
  path.resolve(process.cwd(), 'generated/prisma'),
);
const { enqueueSyncEvents, sourceSyncEvent } =
  await import('../src/lib/sync-queue.js');

const inputPath = process.argv[2];
if (!inputPath) {
  console.error(
    'Usage: node --import tsx --no-network-family-autoselection --env-file=.env scripts/import-researched-jobs.mjs <jobs.json>',
  );
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'));
const bundles = Array.isArray(raw)
  ? raw
  : [
      ...(Array.isArray(raw.currentlyOpenVerifiedRecruitments)
        ? raw.currentlyOpenVerifiedRecruitments
        : []),
      ...(Array.isArray(raw.applicationsNotYetOpen)
        ? raw.applicationsNotYetOpen
        : []),
    ];

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

function toHttpsYoutube(url) {
  if (typeof url !== 'string') return url;
  return url.trim().replace(/^http:\/\//i, 'https://');
}

function isEmbeddableYoutubeUrl(url) {
  if (typeof url !== 'string') return false;
  try {
    const u = new URL(url.trim());
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    if (host === 'youtu.be')
      return /^[A-Za-z0-9_-]{11}$/.test(u.pathname.slice(1));
    if (!['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(host))
      return false;
    if (u.pathname === '/watch')
      return /^[A-Za-z0-9_-]{11}$/.test(u.searchParams.get('v') ?? '');
    if (u.pathname === '/playlist')
      return /^[A-Za-z0-9_-]{10,100}$/.test(u.searchParams.get('list') ?? '');
    return false;
  } catch {
    return false;
  }
}

function normalizeYoutubeList(list = []) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const url = toHttpsYoutube(item.url);
    if (!url || !isEmbeddableYoutubeUrl(url) || seen.has(url)) continue;
    seen.add(url);
    out.push({ ...item, url });
  }
  return out;
}

function normalizeOfficialSyllabus(syl) {
  if (!syl) return null;
  if (Array.isArray(syl)) return syl;
  if (typeof syl === 'object') {
    const stage = Array.isArray(syl.examPattern)
      ? syl.examPattern
          .map((p) => (typeof p === 'string' ? p : p?.stage || null))
          .filter(Boolean)
          .join(' → ')
      : null;
    const subjects = Array.isArray(syl.subjects) ? syl.subjects : [];
    return subjects.map((item) => {
      if (item && typeof item === 'object') {
        return {
          stage: item.stage ?? stage,
          subject: String(item.subject ?? ''),
          marks: item.marks != null ? String(item.marks) : null,
          topics: Array.isArray(item.topics) ? item.topics : null,
        };
      }
      return {
        stage,
        subject: String(item),
        marks: null,
        topics: null,
      };
    });
  }
  return null;
}

function normalizeHistoricalCutoffs(list = []) {
  if (!Array.isArray(list)) return [];
  return list.map((item) => {
    if (!item || typeof item !== 'object') return item;
    if (item.cutoffs && typeof item.cutoffs === 'object') return item;
    if (item.cutoffsByCategory && typeof item.cutoffsByCategory === 'object') {
      const yearMatch =
        typeof item.examYear === 'string'
          ? item.examYear.match(/\b(20\d{2})\b/)
          : null;
      const examYear =
        typeof item.examYear === 'number'
          ? item.examYear
          : yearMatch
            ? Number(yearMatch[1])
            : null;
      const stageParts = [item.stage, item.zoneOrRegion].filter(Boolean);
      return {
        examYear,
        post: item.post ?? null,
        stage: stageParts.length ? stageParts.join(' — ') : null,
        isOfficial: Boolean(item.officialSourceNote),
        cutoffs: item.cutoffsByCategory,
        sourceUrl: item.sourceUrl ?? null,
        notes: item.officialSourceNote ?? item.notes ?? null,
      };
    }
    const cat = item.category || 'UR';
    const score =
      item.marks !== undefined && item.marks !== null
        ? item.outOf
          ? `${item.marks} / ${item.outOf}`
          : String(item.marks)
        : null;
    const examYear = typeof item.year === 'number' ? item.year : null;
    const notesParts = [
      typeof item.year === 'string' ? item.year : null,
      item.source || null,
    ].filter(Boolean);
    return {
      examYear,
      post: item.post ?? null,
      stage: item.stage ?? null,
      isOfficial: false,
      cutoffs: score ? { [cat]: score } : null,
      notes: notesParts.length ? notesParts.join(' — ') : null,
    };
  });
}

function mergeReviewedDetails(existing = {}, incoming = {}) {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...existing }
      : {};
  for (const [k, v] of Object.entries(incoming)) {
    if (v === null || v === undefined) continue;
    if (k === 'youtube_resources') {
      base[k] = normalizeYoutubeList([
        ...(Array.isArray(base[k]) ? base[k] : []),
        ...v,
      ]);
    } else if (k === 'official_syllabus') {
      if (!Array.isArray(base[k]) || base[k].length === 0) {
        base[k] = v;
      }
    } else if (k === 'historical_cutoffs') {
      const ex = Array.isArray(base[k]) ? base[k] : [];
      const inc = Array.isArray(v) ? v : [];
      const exHasStructured = ex.some(
        (x) => x && typeof x.cutoffs === 'object',
      );
      const incHasStructured = inc.some(
        (x) => x && typeof x.cutoffs === 'object',
      );
      if (inc.length > ex.length || (!exHasStructured && incHasStructured)) {
        base[k] = inc;
      }
    } else if (base[k] === undefined || base[k] === null || base[k] === '') {
      base[k] = v;
    }
  }
  return base;
}

function dateOrNull(val) {
  if (!val || typeof val !== 'string') return null;
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? null : d;
}

function buildReviewedDetails(bundle, post, postIndex) {
  const src = bundle.source || {};
  const enr = bundle.enrichment || {};
  const rd = bundle.researchDetails || {};
  const existingRd =
    post.reviewedDetails && typeof post.reviewedDetails === 'object'
      ? post.reviewedDetails
      : {};
  const postRes = Array.isArray(enr.postResources)
    ? enr.postResources.find((r) => r.postIndex === postIndex) ||
      enr.postResources[0] ||
      {}
    : {};

  const rawSyllabus =
    (Array.isArray(existingRd.official_syllabus) &&
    existingRd.official_syllabus.length > 0
      ? existingRd.official_syllabus
      : null) ||
    postRes.officialSyllabus ||
    enr.officialSyllabus ||
    null;
  const officialSyllabus = normalizeOfficialSyllabus(rawSyllabus);
  const youtubeResources = normalizeYoutubeList([
    ...(Array.isArray(existingRd.youtube_resources)
      ? existingRd.youtube_resources
      : []),
    ...(Array.isArray(postRes.youtubeResources)
      ? postRes.youtubeResources
      : []),
    ...(Array.isArray(enr.youtubeResources) ? enr.youtubeResources : []),
  ]);
  const rawCutoffs = [
    ...(Array.isArray(existingRd.historical_cutoffs)
      ? existingRd.historical_cutoffs
      : []),
    ...(Array.isArray(postRes.historicalCutoffs)
      ? postRes.historicalCutoffs
      : []),
    ...(Array.isArray(enr.historicalCutoffs) ? enr.historicalCutoffs : []),
  ];
  const historicalCutoffs = normalizeHistoricalCutoffs(rawCutoffs);
  const selectionProcess =
    existingRd.selection_process ||
    rd.selectionProcess ||
    (Array.isArray(rawSyllabus?.examPattern)
      ? rawSyllabus.examPattern
          .map((p) => (typeof p === 'string' ? p : p?.stage))
          .filter(Boolean)
      : null);

  return {
    ...existingRd,
    post_name: post.postName,
    recruiting_body:
      existingRd.recruiting_body ?? post.organization ?? src.name,
    post_group: existingRd.post_group ?? post.postGroup ?? null,
    pay_level: existingRd.pay_level ?? post.payLevel ?? null,
    min_age: existingRd.min_age ?? post.minAge ?? null,
    max_age: existingRd.max_age ?? post.maxAge ?? null,
    vacancies: existingRd.vacancies ?? post.vacancies ?? null,
    application_last_date:
      existingRd.application_last_date ??
      post.applicationLastDate ??
      rd.applicationLastDate ??
      null,
    official_posted_date:
      existingRd.official_posted_date ??
      post.officialPostedDate ??
      rd.officialPostedDate ??
      null,
    application_start_date:
      existingRd.application_start_date ?? rd.applicationStartDate ?? null,
    age_as_on_date: existingRd.age_as_on_date ?? post.ageAsOnDate ?? null,
    education_required:
      existingRd.education_required ?? post.educationRequired ?? null,
    min_education_level:
      existingRd.min_education_level ?? post.minEducationLevel ?? null,
    min_marks_percent:
      existingRd.min_marks_percent ?? post.minMarksPercent ?? null,
    category_relaxation_applies:
      existingRd.category_relaxation_applies ??
      post.categoryRelaxationApplies ??
      null,
    category_relaxation_rules:
      existingRd.category_relaxation_rules ??
      post.categoryRelaxationRules ??
      null,
    advertisement_number:
      existingRd.advertisement_number ?? rd.advertisementNumber ?? null,
    fresher_eligibility_status:
      existingRd.fresher_eligibility_status ??
      rd.fresherEligibilityStatus ??
      null,
    locations: existingRd.locations ?? rd.locations ?? null,
    domicile_requirement:
      existingRd.domicile_requirement ?? rd.domicileRequirement ?? null,
    employment_type: existingRd.employment_type ?? rd.employmentType ?? null,
    fee_rules: existingRd.fee_rules ?? rd.feeRules ?? null,
    payment_methods: existingRd.payment_methods ?? rd.paymentMethods ?? null,
    selection_process: selectionProcess,
    merit_rule: existingRd.merit_rule ?? rd.meritRule ?? null,
    exam_pattern: existingRd.exam_pattern ?? rd.examPattern ?? null,
    documents_required:
      existingRd.documents_required ?? rd.documentsRequired ?? null,
    application_steps:
      existingRd.application_steps ?? rd.applicationSteps ?? null,
    application_instructions:
      existingRd.application_instructions ?? rd.applicationInstructions ?? null,
    vacancy_breakdown:
      existingRd.vacancy_breakdown ??
      (Array.isArray(rd.vacancyBreakdown)
        ? rd.vacancyBreakdown.find((v) => v.postIndex === postIndex) ||
          rd.vacancyBreakdown
        : (rd.vacancyBreakdown ?? null)),
    reader_summary: existingRd.reader_summary ?? enr.readerSummary ?? null,
    official_syllabus: officialSyllabus,
    youtube_resources: youtubeResources,
    historical_cutoffs: historicalCutoffs,
    official_site_url:
      existingRd.official_site_url ?? src.officialSiteUrl ?? null,
    apply_url: existingRd.apply_url ?? src.applyUrl ?? null,
  };
}

async function main() {
  const touchedIds = [];
  const touchedSourceIds = new Set();

  for (const bundle of bundles) {
    const src = bundle.source || {};
    const sourceUrl =
      src.url || src.officialSiteUrl || src.applyUrl || src.notificationPdfUrl;
    if (!src.name || !sourceUrl) {
      console.warn('SKIP bundle missing source.name or url:', src.name);
      continue;
    }

    let source = await prisma.source.findFirst({
      where: { OR: [{ name: src.name }, { url: sourceUrl }] },
    });

    if (!source) {
      source = await prisma.source.create({
        data: {
          name: src.name,
          url: sourceUrl,
          notificationPdfUrl: src.notificationPdfUrl ?? null,
          officialSiteUrl: src.officialSiteUrl ?? null,
          applyUrl: src.applyUrl ?? null,
        },
      });
      console.log(`CREATED SOURCE: ${source.id} (${source.name})`);
    } else {
      const srcPatch = {};
      for (const k of ['notificationPdfUrl', 'officialSiteUrl', 'applyUrl']) {
        if (src[k] && !source[k]) srcPatch[k] = src[k];
      }
      if (Object.keys(srcPatch).length > 0) {
        await prisma.source.update({
          where: { id: source.id },
          data: srcPatch,
        });
      }
      console.log(`REUSED SOURCE:  ${source.id} (${source.name})`);
    }

    touchedSourceIds.add(source.id);
    const posts = Array.isArray(bundle.posts) ? bundle.posts : [];
    for (let i = 0; i < posts.length; i++) {
      const p = posts[i];
      const details = buildReviewedDetails(bundle, p, i);

      const existing = await prisma.post.findFirst({
        where: { sourceId: source.id, postName: p.postName },
      });

      if (existing) {
        const postPatch = {
          reviewedDetails: mergeReviewedDetails(
            existing.reviewedDetails,
            details,
          ),
          reviewedAt: new Date(),
        };
        if (!existing.organization && p.organization)
          postPatch.organization = p.organization;
        if (!existing.postGroup && p.postGroup)
          postPatch.postGroup = p.postGroup;
        if (!existing.vacancies && p.vacancies)
          postPatch.vacancies = p.vacancies;
        if (!existing.payLevel && p.payLevel) postPatch.payLevel = p.payLevel;
        if (existing.minAge == null && p.minAge != null)
          postPatch.minAge = p.minAge;
        if (existing.maxAge == null && p.maxAge != null)
          postPatch.maxAge = p.maxAge;
        if (!existing.applicationLastDate && p.applicationLastDate)
          postPatch.applicationLastDate = dateOrNull(p.applicationLastDate);
        const officialPostedDate = dateOrNull(
          p.officialPostedDate ?? bundle.researchDetails?.officialPostedDate,
        );
        if (!existing.officialPostedDate && officialPostedDate)
          postPatch.officialPostedDate = officialPostedDate;
        if (!existing.ageAsOnDate && p.ageAsOnDate)
          postPatch.ageAsOnDate = dateOrNull(p.ageAsOnDate);
        if (!existing.educationRequired && p.educationRequired)
          postPatch.educationRequired = p.educationRequired;
        if (!existing.minEducationLevel && p.minEducationLevel)
          postPatch.minEducationLevel = p.minEducationLevel;
        if (existing.minMarksPercent == null && p.minMarksPercent != null)
          postPatch.minMarksPercent = p.minMarksPercent;
        if (
          existing.categoryRelaxationApplies == null &&
          typeof p.categoryRelaxationApplies === 'boolean'
        ) {
          postPatch.categoryRelaxationApplies = p.categoryRelaxationApplies;
        }
        if (!existing.categoryRelaxationRules && p.categoryRelaxationRules) {
          postPatch.categoryRelaxationRules = p.categoryRelaxationRules;
        }
        await prisma.post.update({
          where: { id: existing.id },
          data: postPatch,
        });
        await prisma.post.update({
          where: { id: existing.id },
          data: postPatch,
        });
        console.log(`  UPDATED POST: ${existing.id} (${existing.postName})`);
        touchedIds.push(existing.id);
      } else {
        const created = await prisma.post.create({
          data: {
            sourceId: source.id,
            postName: p.postName,
            organization: p.organization ?? null,
            postGroup: p.postGroup ?? null,
            payLevel: p.payLevel ?? null,
            minAge: p.minAge ?? null,
            maxAge: p.maxAge ?? null,
            vacancies: p.vacancies ?? null,
            applicationLastDate: dateOrNull(p.applicationLastDate),
            officialPostedDate: dateOrNull(
              p.officialPostedDate ??
                bundle.researchDetails?.officialPostedDate,
            ),
            ageAsOnDate: dateOrNull(p.ageAsOnDate),
            educationRequired: p.educationRequired ?? null,
            minEducationLevel: p.minEducationLevel ?? null,
            minMarksPercent: p.minMarksPercent ?? null,
            categoryRelaxationApplies:
              typeof p.categoryRelaxationApplies === 'boolean'
                ? p.categoryRelaxationApplies
                : null,
            reviewedDetails: details,
            reviewedAt: new Date(),
            reviewNote:
              p.reviewNote || 'Imported via import-researched-jobs.mjs',
          },
        });
        console.log(`  CREATED POST: ${created.id} (${created.postName})`);
        touchedIds.push(created.id);
      }
    }
  }

  const synced = await enqueueSyncEvents(
    [...touchedSourceIds].map(sourceSyncEvent),
  );
  console.log(
    synced
      ? 'Queued slave-db sync.'
      : 'slave-db sync NOT queued (no Redis URL or Redis unreachable).',
  );

  console.log('\n--- AUDIT ---');
  const rows = await prisma.post.findMany({
    where: { id: { in: touchedIds } },
    include: { source: true },
  });
  for (const r of rows) {
    const d = r.reviewedDetails || {};
    console.log(
      [
        r.id,
        r.postName.slice(0, 42),
        `site=${r.source.officialSiteUrl ? 'Y' : 'N'}`,
        `apply=${r.source.applyUrl ? 'Y' : 'N'}`,
        `pdf=${r.source.notificationPdfUrl ? 'Y' : 'N'}`,
        `syl=${d.official_syllabus ? 'Y' : 'N'}`,
        `yt=${Array.isArray(d.youtube_resources) ? d.youtube_resources.length : 0}`,
        `cut=${Array.isArray(d.historical_cutoffs) ? d.historical_cutoffs.length : 0}`,
        `sel=${Array.isArray(d.selection_process) ? d.selection_process.length : 0}`,
      ].join(' | '),
    );
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
