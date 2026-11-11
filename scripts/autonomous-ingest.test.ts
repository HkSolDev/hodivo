import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';
import {
  AutonomousIngestError,
  ingestAutonomousNotice,
} from '../src/routes/autonomous-ingest.js';

const token = 'fictional-autonomous-ingest-credential-for-tests-only';
const aiDir = join(import.meta.dirname, '..', 'services', 'ai');

function generateAutonomousPayloadFromPython(options: {
  decision?: 'accepted' | 'blocked' | 'retryable';
  vacancies?: number | null;
  minAge?: number | null;
  maxAge?: number | null;
  educationRequired?: string | null;
  applicationLastDate?: string | null;
  payLevel?: string | null;
  authority?: string;
}): Record<string, unknown> {
  const script = `
import json, sys, tempfile
from build_extraction_input import CandidatePost
from autonomous_pipeline import _sync_missing_fields, run_autonomous_notice

opts = json.loads(sys.argv[1])
authority = opts.get("authority", "official_host_candidate")
vacancies = opts.get("vacancies", 120)
min_age = opts.get("minAge", 21)
max_age = opts.get("maxAge", 40)
edu = opts.get("educationRequired", "Postgraduate with B.Ed.")
last_date = opts.get("applicationLastDate", "2026-12-15")
pay_level = opts.get("payLevel")

extra_text = f" Total vacancies: {vacancies}." if vacancies == 150 else ""
if pay_level:
    extra_text += f" Pay Level: {pay_level}."

pdf_text = (
    "Uttar Pradesh Education Service Selection Commission (UPESSC) Advt No. 01/2026. "
    "Post: Headmaster. Minimum qualification: Postgraduate with B.Ed. "
    "Age limit: 21 to 40 years. Total vacancies: 120. "
    "Application last date: 2026-12-15." + extra_text
)

source_input = {
    "bundle_id": "upessc-hm-2026",
    "identity": {
        "issuer": "Uttar Pradesh Education Service Selection Commission",
        "advertisement_number": "01/2026",
        "year": "2026",
        "authority": authority,
    },
    "coverage": {"review_reasons": []},
    "documents": [
        {
            "document_id": "doc-official-pdf",
            "format": "pdf",
            "role": "primary",
            "authority": authority,
            "source_url": "https://upessc.up.gov.in/notices/advt-01-2026.pdf",
            "title": "UPESSC Advt 01/2026 Official Notification",
            "sections": [
                {
                    "evidence_id": "doc-official-pdf:s1",
                    "title": "Main Section",
                    "text": pdf_text,
                    "locations": [{"kind": "pdf_page", "page": 6, "locator": "page:6"}],
                }
            ],
        }
    ],
}

post = {name: None for name in CandidatePost.model_fields}
for name in (
    "exam_dates",
    "locations",
    "vacancy_breakdown",
    "experience_rules",
    "fee_rules",
    "selection_process",
    "application_steps",
    "documents_required",
    "language_requirements",
    "other_requirements",
):
    post[name] = []
post["eligibility_rules"] = {
    "gender_requirement": None,
    "category_requirement": [],
    "education_options": [],
    "age_rules": [],
    "relaxation_combination_rule": None,
}
post["post_name"] = "Headmaster"
post["recruiting_body"] = "Uttar Pradesh Education Service Selection Commission (UPESSC)"
post["advertisement_number"] = "01/2026"
post["application_last_date"] = last_date
post["vacancies"] = vacancies
post["min_age"] = min_age
post["max_age"] = max_age
post["education_required"] = edu
post["pay_level"] = pay_level

evidence = [
    {"field_path": "posts.0.post_name", "evidence_id": "doc-official-pdf:s1", "quote": "Post: Headmaster."},
    {"field_path": "posts.0.recruiting_body", "evidence_id": "doc-official-pdf:s1", "quote": "Uttar Pradesh Education Service Selection Commission (UPESSC)"},
    {"field_path": "posts.0.advertisement_number", "evidence_id": "doc-official-pdf:s1", "quote": "Advt No. 01/2026."},
]
if last_date is not None:
    evidence.append({"field_path": "posts.0.application_last_date", "evidence_id": "doc-official-pdf:s1", "quote": f"Application last date: {last_date}."})
if vacancies is not None:
    evidence.append({"field_path": "posts.0.vacancies", "evidence_id": "doc-official-pdf:s1", "quote": f"Total vacancies: {vacancies}."})
if min_age is not None:
    evidence.append({"field_path": "posts.0.min_age", "evidence_id": "doc-official-pdf:s1", "quote": "Age limit: 21 to 40 years."})
if max_age is not None:
    evidence.append({"field_path": "posts.0.max_age", "evidence_id": "doc-official-pdf:s1", "quote": "Age limit: 21 to 40 years."})
if edu is not None:
    evidence.append({"field_path": "posts.0.education_required", "evidence_id": "doc-official-pdf:s1", "quote": "Minimum qualification: Postgraduate with B.Ed."})
if pay_level is not None:
    evidence.append({"field_path": "posts.0.pay_level", "evidence_id": "doc-official-pdf:s1", "quote": f"Pay Level: {pay_level}."})

facts = {
    "purpose": "recruitment",
    "purpose_evidence": [{"evidence_id": "doc-official-pdf:s1", "quote": "Post: Headmaster."}],
    "document_purposes": [{"document_id": "doc-official-pdf", "purpose": "recruitment", "evidence": [{"evidence_id": "doc-official-pdf:s1", "quote": "Post: Headmaster."}]}],
    "amendment": None,
    "posts": [post],
    "evidence": evidence,
    "missing_fields": [],
}
_sync_missing_fields(facts)
result = {
    "bundle_id": "upessc-hm-2026",
    "provider": "gemini",
    "model": "gemini-2.5-flash",
    "usage": {"total_tokens": 100},
    "review_reasons": [],
    "inline_check": {"errors": [], "fields": []},
    "facts": facts,
}
with tempfile.TemporaryDirectory() as tmp:
    out = run_autonomous_notice(
        tmp,
        {"llm_input": {"input": source_input}},
        source_name="UPESSC Official",
        extract_fn=lambda _: result,
    )
    payload = out["ingest_payload"]
    payload["historicalCutoffs"] = [
        {"post_name": "Headmaster", "recruitment_year": 2022, "stage": "Written", "category": "OBC", "score_type": "marks", "score": 312.5, "reference_only": True}
    ]
    print(json.dumps(payload))
`;
  return JSON.parse(
    execFileSync(
      join(aiDir, '.venv', 'bin', 'python'),
      ['-c', script, JSON.stringify(options)],
      {
        env: { ...process.env, PYTHONPATH: aiDir },
        encoding: 'utf8',
      },
    ),
  ) as Record<string, unknown>;
}

function createInMemoryDb() {
  const sources = new Map<string, { id: string; url: string; name: string }>();
  const candidates = new Map<string, Record<string, unknown>>();
  const posts = new Map<string, Record<string, unknown>>();
  const automatedRecords = new Map<string, Record<string, unknown>>();
  let idCounter = 0;

  const db = {
    source: {
      async upsert({
        where,
        update,
        create,
      }: {
        where: { url: string };
        update: { name?: string };
        create: { url: string; name: string };
      }) {
        const existing = sources.get(where.url);
        if (existing) {
          if (update.name) existing.name = update.name;
          return existing;
        }
        const created = {
          id: `src_${++idCounter}`,
          url: create.url,
          name: create.name,
        };
        sources.set(where.url, created);
        return created;
      },
    },
    extractionCandidate: {
      async upsert({
        where,
        create,
      }: {
        where: { contentHash: string };
        update: Record<string, unknown>;
        create: Record<string, unknown>;
      }) {
        const existing = candidates.get(where.contentHash);
        if (existing) return existing;
        const created = {
          id: `cand_${++idCounter}`,
          ...create,
        };
        candidates.set(where.contentHash, created);
        return created;
      },
    },
    post: {
      async findMany({ where }: { where: { sourceId: string } }) {
        return [...posts.values()].filter((p) => p.sourceId === where.sourceId);
      },
      async create({ data }: { data: Record<string, unknown> }) {
        const created = {
          id: `post_${++idCounter}`,
          ...data,
        };
        posts.set(created.id, created);
        return created;
      },
      async update({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) {
        const existing = posts.get(where.id);
        if (!existing) throw new Error('Post not found');
        const updated = { ...existing, ...data };
        posts.set(where.id, updated);
        return updated;
      },
      async count() {
        return posts.size;
      },
    },
    automatedNoticeRecord: {
      async findUnique({
        where,
      }: {
        where: {
          bundleId_evidenceFingerprint: {
            bundleId: string;
            evidenceFingerprint: string;
          };
        };
      }) {
        const key = `${where.bundleId_evidenceFingerprint.bundleId}::${where.bundleId_evidenceFingerprint.evidenceFingerprint}`;
        return automatedRecords.get(key) ?? null;
      },
      async upsert({
        where,
        update,
        create,
      }: {
        where: {
          bundleId_evidenceFingerprint: {
            bundleId: string;
            evidenceFingerprint: string;
          };
        };
        update: Record<string, unknown>;
        create: Record<string, unknown>;
      }) {
        const key = `${where.bundleId_evidenceFingerprint.bundleId}::${where.bundleId_evidenceFingerprint.evidenceFingerprint}`;
        const existing = automatedRecords.get(key);
        if (existing) {
          const updated = { ...existing, ...update };
          automatedRecords.set(key, updated);
          return updated;
        }
        const created = {
          id: `auto_${++idCounter}`,
          ...create,
        };
        automatedRecords.set(key, created);
        return created;
      },
    },
    async $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      return fn(db);
    },
    _state: { sources, candidates, posts, automatedRecords },
  };
  return db;
}

await test('autonomous ingest route enforces bearer token and rejects invalid payloads before DB access', async (t) => {
  const app = buildApp(undefined, {
    AUTH_ENABLED: 'false',
    INGEST_TOKEN: token,
  });
  t.after(() => app.close());

  const unauth = await app.inject({
    method: 'POST',
    url: '/api/internal/ingest',
    payload: { kind: 'autonomous_notice' },
  });
  assert.equal(unauth.statusCode, 401);

  const invalid = await app.inject({
    method: 'POST',
    url: '/api/internal/ingest',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      kind: 'autonomous_notice',
      bundleId: 'b1',
      decision: 'accepted',
      publicationStatus: 'published',
      persistenceAllowed: true,
    },
  });
  assert.equal(invalid.statusCode, 400);
});

await test('blocked and retryable autonomous notices persist AutomatedNoticeRecord without publishing Post rows', async () => {
  const db = createInMemoryDb();
  const retryablePayload = generateAutonomousPayloadFromPython({
    decision: 'retryable',
    applicationLastDate: null,
  });

  const res = await ingestAutonomousNotice(retryablePayload, db as never);
  assert.equal(res.decision, 'retryable');
  assert.equal(res.publication_status, 'retryable');
  assert.deepEqual(res.post_ids, []);
  assert.equal(await db.post.count(), 0);
  assert.equal(db._state.automatedRecords.size, 1);

  // Attempting to force persistenceAllowed=true on a retryable notice fails closed
  await assert.rejects(
    ingestAutonomousNotice(
      { ...retryablePayload, persistenceAllowed: true },
      db as never,
    ),
    AutonomousIngestError,
  );
  assert.equal(await db.post.count(), 0);
});

await test('accepted autonomous notice publishes Post, is idempotent on repeat, updates supported fields on stronger evidence with auditLineage, and keeps cutoffs reference_only', async () => {
  const db = createInMemoryDb();
  const acceptedPayload = generateAutonomousPayloadFromPython({
    decision: 'accepted',
    vacancies: 120,
    payLevel: null,
  });

  // 1. First accepted run publishes 1 Post and records AutomatedNoticeRecord + ExtractionCandidate
  assert.ok(
    acceptedPayload.draftEnvelope,
    'run_autonomous_notice must produce a non-null draftEnvelope',
  );
  const draftReview = (acceptedPayload.draftEnvelope as Record<string, unknown>)
    .review as Record<string, unknown>;
  assert.equal(
    (draftReview.automated_decision as Record<string, unknown>).decision,
    'accepted',
  );
  assert.equal(
    typeof (draftReview.automated_decision as Record<string, unknown>)
      .extraction_version,
    'string',
  );

  // Invalid or missing draftEnvelope on an accepted notice is rejected before persisting Post rows
  await assert.rejects(
    ingestAutonomousNotice(
      { ...acceptedPayload, draftEnvelope: null },
      db as never,
    ),
    AutonomousIngestError,
  );
  await assert.rejects(
    ingestAutonomousNotice(
      {
        ...acceptedPayload,
        draftEnvelope: {
          ...(acceptedPayload.draftEnvelope as Record<string, unknown>),
          extraUnsupportedKey: true,
        },
      },
      db as never,
    ),
    AutonomousIngestError,
  );
  assert.equal(await db.post.count(), 0);

  const first = await ingestAutonomousNotice(acceptedPayload, db as never);
  assert.equal(first.decision, 'accepted');
  assert.equal(first.publication_status, 'published');
  assert.equal(first.reused_existing, false);
  assert.equal(first.post_ids.length, 1);
  assert.equal(await db.post.count(), 1);
  assert.equal(db._state.candidates.size, 1);

  const createdPost = db._state.posts.get(first.post_ids[0])!;
  assert.equal(createdPost.postName, 'Headmaster');
  assert.equal(createdPost.vacancies, 120);
  assert.equal(createdPost.payLevel, null);
  // Historical cutoff (312.5) must never leak into minMarksPercent
  assert.equal(createdPost.minMarksPercent, null);

  // 2. Identical repeat run is idempotent and does not duplicate Post rows
  const second = await ingestAutonomousNotice(acceptedPayload, db as never);
  assert.equal(second.decision, 'accepted');
  assert.equal(second.reused_existing, true);
  assert.deepEqual(second.post_ids, first.post_ids);
  assert.equal(await db.post.count(), 1);

  // 3. Stronger later official evidence updates supported fields (vacancies 120 -> 150, payLevel null -> Level-10) and records auditLineage
  const strongerPayload = generateAutonomousPayloadFromPython({
    decision: 'accepted',
    vacancies: 150,
    payLevel: 'Level-10',
  });
  const third = await ingestAutonomousNotice(strongerPayload, db as never);
  assert.equal(third.decision, 'accepted');
  assert.equal(third.reused_existing, false);
  assert.deepEqual(third.post_ids, first.post_ids);
  assert.equal(await db.post.count(), 1);

  const updatedPost = db._state.posts.get(first.post_ids[0])!;
  assert.equal(updatedPost.vacancies, 150);
  assert.equal(updatedPost.payLevel, 'Level-10');

  const thirdRecord = db._state.automatedRecords.get(
    `upessc-hm-2026::${String(strongerPayload.evidenceFingerprint)}`,
  )!;
  const lineage = thirdRecord.auditLineage as Array<Record<string, unknown>>;
  assert.ok(lineage.length >= 2);
  assert.ok(
    lineage.some(
      (entry) =>
        entry.post_name === 'Headmaster' &&
        entry.field_path === 'vacancies' &&
        entry.previous_value === 120 &&
        entry.new_value === 150,
    ),
  );
  assert.ok(
    lineage.some(
      (entry) =>
        entry.post_name === 'Headmaster' &&
        entry.field_path === 'pay_level' &&
        entry.previous_value === null &&
        entry.new_value === 'Level-10',
    ),
  );

  // 4. Historical cutoffs without reference_only=true or non-official authority are rejected
  await assert.rejects(
    ingestAutonomousNotice(
      {
        ...acceptedPayload,
        evidenceFingerprint: 'fp-bad-cutoff',
        historicalCutoffs: [
          { post_name: 'Headmaster', score: 300, reference_only: false },
        ],
      },
      db as never,
    ),
    /reference_only=true/,
  );
});

await test('stores preparation resources without publishing them or erasing them on omitted retries', async () => {
  for (const decision of ['retryable', 'accepted'] as const) {
    const db = createInMemoryDb();
    const payload = generateAutonomousPayloadFromPython({
      decision,
      ...(decision === 'retryable' ? { applicationLastDate: null } : {}),
    });
    const youtubeResources = [
      {
        url: 'https://www.youtube.com/watch?v=abcdefghijk',
        title: 'Illustrative algebra lesson',
        channel: 'Example teaching channel',
        language: 'English',
        topics: ['Algebra'],
        checkedAt: '2026-11-11T10:00:00Z',
        recommendationReason: null,
      },
    ];
    const officialSyllabus = [
      { exam_name: 'Example exam', topics: ['Algebra'] },
    ];
    const historicalCutoffs = [
      {
        recruitment_year: 2025,
        category: 'SC',
        score: 0,
        reference_only: true,
      },
    ];
    await ingestAutonomousNotice(
      { ...payload, youtubeResources, officialSyllabus, historicalCutoffs },
      db as never,
    );
    let record = [...db._state.automatedRecords.values()][0];
    assert.deepEqual(record.youtubeResources, youtubeResources);
    assert.deepEqual(record.officialSyllabus, officialSyllabus);
    assert.deepEqual(record.historicalCutoffs, historicalCutoffs);
    await ingestAutonomousNotice(payload, db as never);
    record = [...db._state.automatedRecords.values()][0];
    assert.deepEqual(record.youtubeResources, youtubeResources);
    assert.equal(db._state.automatedRecords.size, 1);
    assert.equal(await db.post.count(), decision === 'accepted' ? 1 : 0);
    for (const post of db._state.posts.values()) {
      assert.equal(post.minMarksPercent, null);
      assert.equal(
        'youtubeResources' in (post.reviewedDetails as object),
        false,
      );
    }
  }
});

await test('rejects invalid preparation resource URLs before persistence', async () => {
  const payload = generateAutonomousPayloadFromPython({
    decision: 'retryable',
  });
  const resource = {
    title: 'Example',
    channel: 'Example',
    language: null,
    topics: [],
    checkedAt: '2026-11-11T10:00:00Z',
    recommendationReason: null,
  };
  for (const url of [
    'javascript:alert(1)',
    'https://youtube.com.evil.example/watch?v=abcdefghijk',
    'https://youtube.com/redirect?q=example',
    'http://youtu.be/abcdefghijk',
  ]) {
    const db = createInMemoryDb();
    await assert.rejects(
      ingestAutonomousNotice(
        { ...payload, youtubeResources: [{ ...resource, url }] },
        db as never,
      ),
      AutonomousIngestError,
    );
    assert.equal(db._state.automatedRecords.size, 0);
    assert.equal(await db.post.count(), 0);
  }
});

await test(
  'preparation metadata round-trips through PostgreSQL without publishing jobs',
  { skip: !process.env.TEST_DATABASE_URL },
  async (t) => {
    const url = new URL(process.env.TEST_DATABASE_URL!);
    assert.equal(url.hostname, '127.0.0.1');
    assert.equal(url.pathname, '/aptus_preparation_test');
    assert.equal(process.env.DATABASE_URL, process.env.TEST_DATABASE_URL);
    const { prisma } = await import('../src/db.js');
    const bundleId = `preparation-storage-${crypto.randomUUID()}`;
    t.after(async () => {
      await prisma.automatedNoticeRecord.deleteMany({ where: { bundleId } });
      await prisma.$disconnect();
    });
    const payload = {
      kind: 'autonomous_notice',
      bundleId,
      sourceName: 'Illustrative storage test',
      sourceUrl: 'https://example.invalid/preparation',
      evidenceFingerprint: 'storage-test-v1',
      extractionVersion: 'test-only',
      decision: 'blocked',
      publicationStatus: 'blocked',
      persistenceAllowed: false,
      reasonCodes: ['test_only'],
      noticeIdentity: {},
      auditLineage: [],
      officialSyllabus: [{ exam_name: 'Example exam', topics: ['Algebra'] }],
      historicalCutoffs: [
        {
          recruitment_year: 2025,
          category: 'SC',
          score: 0,
          reference_only: true,
        },
      ],
    };
    const resources = [
      {
        url: 'https://youtu.be/abcdefghijk',
        title: 'Illustrative lesson',
        channel: 'Example channel',
        language: null,
        topics: ['Algebra'],
        checkedAt: '2026-11-11T10:00:00Z',
        recommendationReason: null,
      },
    ];
    const countBefore = await prisma.post.count();
    const result = await ingestAutonomousNotice(
      { ...payload, youtubeResources: resources },
      prisma,
    );
    const read = () =>
      prisma.automatedNoticeRecord.findUniqueOrThrow({
        where: { id: result.record_id },
      });
    const stored = await read();
    assert.deepEqual(stored.officialSyllabus, payload.officialSyllabus);
    assert.deepEqual(stored.historicalCutoffs, payload.historicalCutoffs);
    assert.deepEqual(stored.youtubeResources, resources);
    await ingestAutonomousNotice(payload, prisma);
    assert.deepEqual((await read()).youtubeResources, resources);
    await ingestAutonomousNotice({ ...payload, youtubeResources: [] }, prisma);
    assert.deepEqual((await read()).youtubeResources, []);
    await ingestAutonomousNotice(
      { ...payload, youtubeResources: null },
      prisma,
    );
    assert.equal((await read()).youtubeResources, null);
    await assert.rejects(
      ingestAutonomousNotice(
        {
          ...payload,
          evidenceFingerprint: 'invalid-url',
          youtubeResources: [
            { ...resources[0], url: 'https://example.invalid/video' },
          ],
        },
        prisma,
      ),
      AutonomousIngestError,
    );
    assert.equal(
      await prisma.automatedNoticeRecord.count({ where: { bundleId } }),
      1,
    );
    assert.equal(await prisma.post.count(), countBefore);
  },
);
