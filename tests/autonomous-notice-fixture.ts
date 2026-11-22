import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const aiDir = join(import.meta.dirname, '..', 'services', 'ai');

export function generateAutonomousPayloadFromPython(options: {
  decision?: 'accepted' | 'blocked' | 'retryable';
  vacancies?: number | null;
  minAge?: number | null;
  maxAge?: number | null;
  educationRequired?: string | null;
  applicationLastDate?: string | null;
  payLevel?: string | null;
  authority?: string;
  selectionStep?: string;
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
selection_step = opts.get("selectionStep")
if selection_step:
    extra_text += f" Selection: {selection_step}."
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

if selection_step:
    post["selection_process"] = [selection_step]
    evidence.append({"field_path": "posts.0.selection_process.0", "evidence_id": "doc-official-pdf:s1", "quote": f"Selection: {selection_step}."})

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
