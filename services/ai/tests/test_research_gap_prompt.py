"""Focused offline tests for the research gap prompt builder."""

import copy
import unittest

from research_gap_prompt import build_research_gap_prompt, build_notice_research_prompt


OFFICIAL_URL = "https://upessc.example.gov.in/notices/09-2026.pdf"
THIRD_PARTY_URL = "https://sarkariresult.example/upessc-headmaster"


def sample_source_input() -> dict:
    return {
        "bundle_id": "bundle-upessc-09-2026",
        "identity": {
            "issuer": "UPESSC",
            "advertisement_number": "09/2026",
            "campaign": "Headmaster Recruitment",
            "year": "2026",
        },
        "coverage": {"status": "ready_for_extraction", "review_reasons": []},
        "documents": [
            {
                "document_id": "main-pdf",
                "source_url": OFFICIAL_URL,
                "format": "pdf",
                "title": "UPESSC Advertisement 09/2026",
                "role": "main_notice",
                "authority": "official_host_candidate",
                "sections": [
                    {
                        "evidence_id": "main-pdf:sec-1",
                        "text": (
                            "Issuer: UPESSC | Advt No: 09/2026 | Post: Headmaster (Balak) | "
                            "Vacancies: 1037 | Education: Master Degree with 50% Marks and B.Ed."
                        ),
                        "locations": [{"page": 1, "block_id": "page-1-native"}],
                    }
                ],
            },
            {
                "document_id": "mirror-html",
                "source_url": THIRD_PARTY_URL,
                "format": "html",
                "title": "UPESSC Headmaster recruitment",
                "role": "listing",
                "authority": "needs_review",
                "sections": [
                    {
                        "evidence_id": "mirror-html:sec-1",
                        "text": "Vacancies: 1037",
                        "locations": [{"block": 1}],
                    }
                ],
            },
        ],
    }


def sample_facts() -> dict:
    return {
        "posts": [
            {
                "post_name": "Headmaster (Balak)",
                "vacancies": 1037,
                "education_required": "Master Degree with 50% Marks and B.Ed.",
                "application_last_date": None,
                "max_age": 62,
            }
        ],
        "evidence": [
            {
                "field_path": "posts.0.vacancies",
                "evidence_id": "main-pdf:sec-1",
                "quote": "Vacancies: 1037",
            },
            {
                "field_path": "posts.0.education_required",
                "evidence_id": "main-pdf:sec-1",
                "quote": "Education: Master Degree with 50% Marks and B.Ed.",
            },
        ],
        "missing_fields": [
            {
                "field_path": "posts.0.application_last_date",
                "reason": "Last date not stated in section 1.",
            }
        ],
    }


class ResearchGapPromptTests(unittest.TestCase):
    def test_prompt_uses_verified_identity_supported_facts_and_known_official_urls(self):
        result = build_research_gap_prompt(
            sample_facts(),
            sample_source_input(),
            review_findings=[
                {
                    "field_path": "posts.0.max_age",
                    "status": "conflicting",
                    "reason": "Notification states 60 and 62.",
                }
            ],
            requested_fields=["education_required"],
        )

        self.assertEqual(result["status"], "ready")
        self.assertEqual(result["identity"]["issuer"], "UPESSC")
        self.assertEqual(result["identity"]["advertisement_or_exam_identity"], "09/2026 (2026)")
        self.assertEqual([item["url"] for item in result["official_urls"]], [OFFICIAL_URL])

        supported = {item["field_path"]: item for item in result["supported_facts"]}
        self.assertEqual(supported["posts.0.vacancies"]["value"], 1037)
        self.assertEqual(supported["posts.0.vacancies"]["quote"], "Vacancies: 1037")
        self.assertNotIn("posts.0.education_required", {g["field_path"] for g in result["gaps"]})

        self.assertEqual([g["field_path"] for g in result["gaps"]], ["posts.0.application_last_date"])
        self.assertEqual(result["gaps"][0]["reason"], "Last date not stated in section 1.")
        self.assertEqual([c["field_path"] for c in result["conflicts"]], ["posts.0.max_age"])

        prompt = result["prompt"]
        self.assertIn("Issuer: UPESSC", prompt)
        self.assertIn("09/2026 (2026)", prompt)
        self.assertIn(OFFICIAL_URL, prompt)
        self.assertNotIn(THIRD_PARTY_URL, prompt)
        self.assertIn("Vacancies: 1037", prompt)
        self.assertIn("posts.0.application_last_date", prompt)
        self.assertIn("posts.0.max_age", prompt)
        self.assertIn("unresolved is an acceptable result", prompt)

    def test_unlocated_quotes_and_unofficial_documents_are_not_supported_facts(self):
        facts = sample_facts()
        facts["missing_fields"] = []
        facts["evidence"] = [
            {
                "field_path": "posts.0.vacancies",
                "evidence_id": "main-pdf:sec-1",
                "quote": "Vacancies: 9999",
            },
            {
                "field_path": "posts.0.education_required",
                "evidence_id": "mirror-html:sec-1",
                "quote": "Vacancies: 1037",
            },
        ]

        result = build_research_gap_prompt(facts, sample_source_input())

        self.assertEqual(result["status"], "complete")
        self.assertEqual(result["supported_facts"], [])
        self.assertIsNone(result["prompt"])

    def test_missing_identity_and_identity_conflict_block_without_a_prompt(self):
        missing = build_research_gap_prompt(sample_facts(), {"bundle_id": "bundle-1"})
        self.assertEqual(missing["status"], "blocked")
        self.assertEqual(missing["reason"], "enrichment_requires_verified_identity")
        self.assertIsNone(missing["prompt"])
        self.assertEqual(missing["gaps"], [])

        source = sample_source_input()
        source["coverage"]["review_reasons"] = ["conflicting_advertisement_number"]
        conflicted = build_research_gap_prompt(sample_facts(), source)
        self.assertEqual(conflicted["status"], "blocked")
        self.assertEqual(conflicted["reason"], "enrichment_identity_conflict")
        self.assertIsNone(conflicted["prompt"])

    def test_requested_fields_are_post_scoped_and_skip_supported_values(self):
        source = sample_source_input()
        source["documents"][0]["sections"][0]["text"] += " | Vacancies: 250"
        source["documents"][0]["sections"][0]["evidence_id"] = "main-pdf:sec-1"
        facts = {
            "posts": [
                {"post_name": "Headmaster (Balak)", "vacancies": None},
                {"post_name": "Headmaster (Girls)", "vacancies": 250},
            ],
            "evidence": [
                {
                    "field_path": "posts.1.vacancies",
                    "evidence_id": "main-pdf:sec-1",
                    "quote": "Vacancies: 250",
                }
            ],
            "missing_fields": [],
        }

        result = build_research_gap_prompt(facts, source, requested_fields=["vacancies"])

        self.assertEqual([g["field_path"] for g in result["gaps"]], ["posts.0.vacancies"])
        self.assertEqual(result["gaps"][0]["reason"], "requested_missing_value")
        supported = {item["field_path"]: item for item in result["supported_facts"]}
        self.assertEqual(supported["posts.1.vacancies"]["post_name"], "Headmaster (Girls)")

    def test_unknown_and_non_researchable_fields_are_not_invented(self):
        source = sample_source_input()
        facts = sample_facts()
        facts["missing_fields"] = []

        unknown = build_research_gap_prompt(
            facts, source, requested_fields=["unsupported_custom_field", "other.thing"]
        )
        self.assertEqual(unknown["status"], "complete")

        non_researchable = build_research_gap_prompt(
            facts,
            source,
            review_findings=[
                {"field_path": "posts.0.post_name", "status": "suspicious", "reason": "Portal branding."}
            ],
        )
        self.assertEqual(non_researchable["status"], "complete")
        self.assertEqual(non_researchable["gaps"], [])

    def test_issuer_host_revalidation_excludes_mismatched_official_candidate(self):
        source = sample_source_input()
        result = build_research_gap_prompt(
            sample_facts(),
            source,
            issuer_hosts={"UPESSC": ["upessc.gov.in"]},
        )

        self.assertEqual(result["status"], "ready")
        self.assertEqual(result["official_urls"], [])
        self.assertIn("None supplied. Discover official sources for the exact notice; never fabricate URLs.", result["prompt"])

    def test_colab_template_keeps_preparation_optional_and_notice_specific(self):
        identity = {'issuer': 'IIIT Pune', 'advertisement_number': 'IIITP/ECE/0002'}
        core = build_notice_research_prompt(identity, [], ['min_age'], [])
        self.assertIn('IIITP/ECE/0002', core)
        self.assertIn('PDF retrieval failure does not end research', core)
        self.assertIn('additional official issuer sources', core)
        self.assertNotIn('12. Last three', core)
        extended = build_notice_research_prompt(identity, [], ['syllabus'], [],
                                                include_preparation=True)
        self.assertIn('12. Last three', extended)
        self.assertIn('category, numeric score', extended)
        self.assertIn('actual', extended)
        self.assertIn('video/playlist URLs', extended)
        self.assertIn('interview-only JRF', extended)

    def test_inputs_are_not_mutated_and_output_is_deterministic(self):
        facts = sample_facts()
        source = sample_source_input()
        facts_before = copy.deepcopy(facts)
        source_before = copy.deepcopy(source)

        first = build_research_gap_prompt(facts, source, requested_fields=["vacancies"])
        second = build_research_gap_prompt(facts, source, requested_fields=["vacancies"])

        self.assertEqual(first, second)
        self.assertEqual(facts, facts_before)
        self.assertEqual(source, source_before)


if __name__ == "__main__":
    unittest.main()
