"""Bounded Gemini Vision recovery for verified unreadable PDF pages.

Preserves original PDF bytes, native text, rendered page image, and Vision output
as four separate immutable evidence versions. Never overwrites native text and
never runs Vision on readable pages.
"""

import copy
import hashlib
import json
import unicodedata
from datetime import date
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, ValidationError

from capture_store import atomic_write, now
from verify_bundle import grouping_blocking_reasons


# Small documented maximum per notice so multi-page unreadable PDFs never fan out unboundedly.
MAX_VISION_PAGES_PER_NOTICE = 6
SHORT_PDF_PAGE_THRESHOLD = 4

REQUIRED_RECRUITMENT_FIELDS = (
    "post_name",
    "recruiting_body",
    "advertisement_number",
    "dates",
    "qualifications",
    "age_conditions",
    "category_conditions",
    "vacancies",
    "experience",
    "application_links",
)

HTML_FIELD_PATTERNS: dict[str, tuple[str, ...]] = {
    "post_name": ("post", "designation", "cadre", "पद", "प्रधानाध्यापक", "प्रवक्ता", "सहायक अध्यापक"),
    "recruiting_body": ("commission", "board", "ministry", "authority", "institute", "आयोग", "बोर्ड"),
    "advertisement_number": ("advt", "advertisement", "notification no", "exam", "विज्ञापन"),
    "dates": ("last date", "closing date", "start date", "deadline", "अंतिम तिथि", "तिथि"),
    "qualifications": ("qualification", "education", "degree", "diploma", "b.ed", "शैक्षिक", "अर्हता", "योग्यता"),
    "age_conditions": ("age limit", "minimum age", "maximum age", "min age", "max age", "आयु", "उम्र"),
    "category_conditions": ("category", "relaxation", "reservation", "sc", "st", "obc", "ews", "pwbd", "आरक्षण", "छूट"),
    "vacancies": ("vacanc", "number of posts", "total posts", "रिक्ति", "पदों की संख्या"),
    "experience": ("experience", "minimum years", "teaching experience", "अनुभव", "कार्यानुभव"),
    "application_links": ("apply", "registration", "online form", "application link", "आवेदन"),
}

ALLOWED_VISION_FACT_FIELDS = {
    # Qualification
    "education_required",
    "min_education_level",
    "min_marks_percent",
    # Dates
    "application_start_date",
    "application_last_date",
    "fee_payment_last_date",
    "age_as_on_date",
    # Age
    "min_age",
    "max_age",
    # Vacancies
    "vacancies",
    "total_vacancies",
    # Experience
    "experience_years",
    "minimum_experience_years",
}

FIELD_TO_VISION_TOPIC = {
    "post_name": "posts",
    "posts": "posts",
    "recruiting_body": "recruiting_body",
    "advertisement_number": "advertisement_number",
    "education_required": "education",
    "min_education_level": "education",
    "min_marks_percent": "education",
    "qualification": "education",
    "qualifications": "education",
    "education": "education",
    "application_start_date": "dates",
    "application_last_date": "dates",
    "fee_payment_last_date": "dates",
    "age_as_on_date": "dates",
    "dates": "dates",
    "min_age": "age",
    "max_age": "age",
    "age": "age",
    "age_conditions": "age",
    "category_conditions": "category",
    "category_relaxation": "category",
    "vacancies": "vacancies",
    "total_vacancies": "vacancies",
    "experience_years": "experience",
    "minimum_experience_years": "experience",
    "experience_rules": "experience",
    "experience": "experience",
    "application_links": "links",
    "apply_url": "links",
}

VISION_TOPIC_KEYWORDS: dict[str, tuple[str, ...]] = {
    "posts": ("post", "designation", "cadre", "पद", "प्रधानाध्यापक", "प्रवक्ता", "सहायक अध्यापक"),
    "recruiting_body": ("commission", "board", "ministry", "authority", "आयोग", "बोर्ड"),
    "advertisement_number": ("advt", "advertisement", "notification no", "विज्ञापन"),
    "education": (
        "qualification",
        "education",
        "degree",
        "diploma",
        "b.ed",
        "postgraduate",
        "शैक्षिक",
        "अर्हता",
        "योग्यता",
    ),
    "age": ("age", "minimum age", "maximum age", "आयु", "उम्र"),
    "category": ("category", "relaxation", "reservation", "sc", "st", "obc", "ews", "आरक्षण", "छूट"),
    "vacancies": ("vacanc", "number of posts", "रिक्ति", "पदों की संख्या"),
    "dates": ("last date", "closing date", "deadline", "date", "अंतिम तिथि", "तिथि", "दिनांक"),
    "experience": ("experience", "minimum years", "teaching", "अनुभव", "कार्यानुभव", "शिक्षण अनुभव"),
    "links": ("apply", "registration", "online", "portal", "आवेदन"),
}



VISION_SYSTEM_PROMPT = """You are extracting recruitment facts from an official Indian government notification PDF page image.
1. Identify each post name from the visible page or linked notice identity context.
2. Bind every requirement strictly to the post named or clearly bound by its quotation.
3. Preserve complete qualifying conditions (institution scope, class range, minimum years, certificate authority).
4. Return exact verbatim source quotations as printed on the page and the physical PDF page number.
5. Never infer eligibility, never merge alternatives, and never guess unreadable text (use null)."""


class VisionCandidateFact(BaseModel):
    model_config = ConfigDict(extra="forbid")
    field_path: str
    value: str | int | float | bool | None
    exact_quote: str
    physical_pdf_page: int
    section_locator: str
    conditions: str | None = None


class VisionExperienceAlternative(BaseModel):
    model_config = ConfigDict(extra="forbid")
    minimum_years: float | None
    role_titles: list[str]
    institution_or_scope: str | None
    class_scope: str | None
    certificate_requirement: str | None
    supporting_quote: str
    physical_pdf_page: int
    source_locator: str


class VisionPostRecovery(BaseModel):
    model_config = ConfigDict(extra="forbid")
    post_name: str
    post_binding_quote: str
    candidate_facts: list[VisionCandidateFact] = []
    experience_alternatives: list[VisionExperienceAlternative] = []


class VisionPageResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    physical_pdf_page: int
    visible_issuer: str | None = None
    visible_advertisement_number: str | None = None
    page_text_quote: str
    posts: list[VisionPostRecovery]


def _norm(text: str | None) -> str:
    if not isinstance(text, str):
        return ""
    collapsed = " ".join(unicodedata.normalize("NFKC", text).split())
    for token in (" /", "/ "):
        while token in collapsed:
            collapsed = collapsed.replace(token, "/")
    while " ।" in collapsed:
        collapsed = collapsed.replace(" ।", "।")
    return collapsed.casefold()


def is_bundle_identity_verified_for_vision(
    bundle: dict[str, Any], document: dict[str, Any]
) -> tuple[bool, str | None]:
    """Verify notice identity and document link provenance before allowing Vision recovery."""
    if not isinstance(bundle, dict) or not isinstance(document, dict):
        return False, "invalid_bundle_or_document"
    if document.get("format") != "pdf":
        return False, "not_a_pdf_document"
    if grouping_blocking_reasons(bundle):
        return False, "bundle_grouping_blocked"
    identity = bundle.get("identity") or {}
    issuer = (identity.get("issuer") or "").strip()
    ad_or_campaign = (
        identity.get("advertisement_number") or identity.get("campaign") or ""
    ).strip()
    if not issuer or not ad_or_campaign:
        return False, "unverified_notice_identity"
    doc_url = (document.get("source_url") or "").strip()
    if not doc_url.startswith(("http://", "https://")):
        return False, "invalid_document_source_url"

    # A supporting PDF must either have its own identity evidence or be explicitly linked
    # from a main_notice document in the same verified bundle.
    if document.get("role") != "main_notice":
        doc_identity = document.get("identity") or {}
        has_self_id = bool(
            doc_identity.get("issuer") or doc_identity.get("advertisement_number")
        )
        linked_from_main = any(
            other.get("role") == "main_notice"
            and any(
                isinstance(link, dict) and link.get("url") == doc_url
                for link in (other.get("content") or {}).get("links", [])
            )
            for other in bundle.get("documents", [])
        )
        if not (has_self_id or linked_from_main):
            return False, "unverified_pdf_identity_link"
    return True, None


def unusable_pdf_pages(document: dict[str, Any]) -> list[dict[str, Any]]:
    """Return only PDF page entries marked unusable by deterministic native-text checks."""
    if document.get("format") != "pdf":
        return []
    content = document.get("content") or {}
    pages = content.get("pages") or []
    unusable = []
    for page in sorted(pages, key=lambda p: p.get("number", 0)):
        number = page.get("number")
        if not isinstance(number, int) or number < 1:
            continue
        status = page.get("native_status")
        if status == "usable_candidate":
            continue
        if status in {
            "suspicious_or_unusable",
            "image_only_or_scan_candidate",
            "no_native_text",
        }:
            unusable.append(page)
    return unusable


def _native_text_for_page(document: dict[str, Any], page_number: int) -> str:
    content = document.get("content") or {}
    for block in content.get("blocks") or []:
        if block.get("page") == page_number:
            for alt in block.get("alternatives") or []:
                if alt.get("method") == "native_text":
                    return alt.get("text") or ""
    return ""


def assess_html_completeness(bundle: dict[str, Any]) -> dict[str, Any]:
    """Deterministically assess which required recruitment fields HTML documents already cover."""
    html_docs = [
        doc for doc in (bundle.get("documents") or [])
        if isinstance(doc, dict) and doc.get("format") == "html"
    ]
    if not html_docs:
        return {
            "has_html": False,
            "complete": False,
            "present_fields": [],
            "missing_fields": list(REQUIRED_RECRUITMENT_FIELDS),
        }

    text_chunks: list[str] = []
    has_apply_link = False
    identity = bundle.get("identity") or {}
    if identity.get("issuer"):
        text_chunks.append(str(identity["issuer"]))
    if identity.get("advertisement_number") or identity.get("campaign"):
        text_chunks.append(str(identity.get("advertisement_number") or identity.get("campaign")))

    for doc in html_docs:
        content = doc.get("content") or {}
        if content.get("title"):
            text_chunks.append(str(content["title"]))
        for block in content.get("blocks") or []:
            if not isinstance(block, dict):
                continue
            if isinstance(block.get("text"), str):
                text_chunks.append(block["text"])
            if block.get("type") == "table":
                for row in block.get("rows") or []:
                    if isinstance(row, list):
                        text_chunks.append(" ".join(str(cell) for cell in row))
        for link in content.get("links") or []:
            if not isinstance(link, dict):
                continue
            link_text = _norm(str(link.get("text") or "") + " " + str(link.get("url") or ""))
            text_chunks.append(link_text)
            if any(_norm(kw) in link_text for kw in HTML_FIELD_PATTERNS["application_links"]):
                has_apply_link = True

    combined_norm = _norm(" \n ".join(text_chunks))
    present: list[str] = []
    missing: list[str] = []

    for field in REQUIRED_RECRUITMENT_FIELDS:
        if field == "recruiting_body" and (identity.get("issuer") or "").strip():
            present.append(field)
            continue
        if field == "advertisement_number" and (
            (identity.get("advertisement_number") or "").strip()
            or (identity.get("campaign") or "").strip()
        ):
            present.append(field)
            continue
        if field == "application_links" and has_apply_link:
            present.append(field)
            continue
        patterns = HTML_FIELD_PATTERNS.get(field, ())
        if any(_norm(kw) in combined_norm for kw in patterns):
            present.append(field)
        else:
            missing.append(field)

    return {
        "has_html": True,
        "complete": len(missing) == 0,
        "present_fields": present,
        "missing_fields": missing,
    }


def _readable_bundle_quotes(bundle: dict[str, Any]) -> list[str]:
    quotes: list[str] = []
    for doc in bundle.get("documents", []):
        content = doc.get("content") or {}
        if doc.get("format") == "html":
            if content.get("title"):
                quotes.append(str(content["title"]))
            for block in content.get("blocks") or []:
                if isinstance(block.get("text"), str):
                    quotes.append(block["text"])
                if block.get("type") == "table":
                    for row in block.get("rows") or []:
                        quotes.append(" ".join(str(cell) for cell in row))
        elif doc.get("format") == "pdf":
            for sec in content.get("sections") or []:
                if isinstance(sec.get("text"), str):
                    quotes.append(sec["text"])
    return quotes


def _is_string_or_date_grounded_in_quote(value: str, quote: str, quote_norm: str) -> bool:
    val_norm = _norm(value)
    if not val_norm:
        return False
    if val_norm in quote_norm:
        return True
    try:
        parsed_date = date.fromisoformat(value.strip())
        if parsed_date.isoformat() == value.strip():
            yyyy = f"{parsed_date.year:04d}"
            mm = f"{parsed_date.month:02d}"
            dd = f"{parsed_date.day:02d}"
            alt_forms = (
                f"{dd}-{mm}-{yyyy}",
                f"{dd}/{mm}/{yyyy}",
                f"{dd}.{mm}.{yyyy}",
                f"{int(dd)}/{int(mm)}/{yyyy}",
                f"{int(dd)}-{int(mm)}/{yyyy}",
            )
            if any(form in quote for form in alt_forms):
                return True
            if yyyy in quote and (dd in quote or str(parsed_date.day) in quote):
                return True
    except ValueError:
        pass
    return False


def _normalize_missing_topics(missing_fields: set[str] | list[str] | None) -> set[str]:
    if missing_fields is None:
        return set(VISION_TOPIC_KEYWORDS.keys())
    topics: set[str] = set()
    for item in missing_fields:
        if not isinstance(item, str):
            continue
        leaf = item.strip().split(".")[-1].casefold()
        mapped = FIELD_TO_VISION_TOPIC.get(leaf)
        if mapped:
            topics.add(mapped)
        elif leaf in VISION_TOPIC_KEYWORDS:
            topics.add(leaf)
    return topics


def select_unreadable_pages_for_vision(
    bundle: dict[str, Any],
    document: dict[str, Any],
    unusable: list[dict[str, Any]],
    *,
    missing_fields: set[str] | list[str] | None = None,
    remaining_budget: int = MAX_VISION_PAGES_PER_NOTICE,
    short_pdf_page_threshold: int = SHORT_PDF_PAGE_THRESHOLD,
) -> dict[str, list[dict[str, Any]]]:
    """Deterministically select relevant unreadable pages up to remaining_budget.

    - If HTML already contains all required recruitment fields (`missing_fields` empty when
      derived from HTML completeness), skip all PDF pages.
    - For short PDFs (`<= short_pdf_page_threshold` pages), process every unreadable page
      (unless explicitly marked `relevant=False`) within `remaining_budget`.
    - For longer PDFs (`> short_pdf_page_threshold` pages), deterministically rank pages using
      native extracted text, headings/section labels, page/table structure, keywords related to
      the missing fields, page-local link/context hints, and document role (`main_notice` vs
      `corrigendum`), selecting only the highest-value pages within `remaining_budget`.
    """
    if missing_fields is None:
        doc_cov = (document.get("content") or {}).get("coverage") or {}
        doc_missing = doc_cov.get("missing_required_fields")
        if isinstance(doc_missing, list) and doc_missing:
            missing_fields = doc_missing
        else:
            html_check = assess_html_completeness(bundle)
            if html_check["has_html"]:
                if html_check["complete"]:
                    return {
                        "selected": [],
                        "skipped": list(unusable),
                        "deferred": [],
                    }
                missing_fields = html_check["missing_fields"]

    missing_topics = _normalize_missing_topics(missing_fields)
    scored_relevant: list[tuple[int, int, dict[str, Any]]] = []
    skipped: list[dict[str, Any]] = []

    content = document.get("content") or {}
    all_pages = content.get("pages") or []
    total_pages = max(len(all_pages), max((p.get("number", 0) for p in unusable), default=0))
    is_short_pdf = total_pages <= short_pdf_page_threshold
    doc_role = (document.get("role") or "main_notice").strip().casefold()
    role_bonus = 15 if doc_role in {"corrigendum", "amendment"} else (5 if doc_role == "main_notice" else 0)

    tables_by_page: dict[int, list[dict[str, Any]]] = {}
    for tbl in content.get("tables") or []:
        if isinstance(tbl, dict) and isinstance(tbl.get("page"), int):
            tables_by_page.setdefault(tbl["page"], []).append(tbl)
    for block in content.get("blocks") or []:
        if isinstance(block, dict) and block.get("type") == "table" and isinstance(block.get("page"), int):
            tables_by_page.setdefault(block["page"], []).append(block)

    link_hints_by_page: dict[int, str] = {}
    for other_doc in bundle.get("documents", []):
        other_content = other_doc.get("content") or {}
        for link in other_content.get("links") or []:
            if not isinstance(link, dict):
                continue
            url = str(link.get("url") or "")
            if "#page=" in url:
                try:
                    p_no = int(url.split("#page=", 1)[1].split("&")[0])
                    link_hints_by_page[p_no] = (
                        link_hints_by_page.get(p_no, "")
                        + " "
                        + str(link.get("text") or "")
                        + " "
                        + json.dumps(link.get("context") or {}, ensure_ascii=False)
                    )
                except ValueError:
                    pass
            elif isinstance(link.get("page"), int) and other_doc.get("document_id") == document.get("document_id"):
                p_no = link["page"]
                link_hints_by_page[p_no] = (
                    link_hints_by_page.get(p_no, "")
                    + " "
                    + str(link.get("text") or "")
                    + " "
                    + json.dumps(link.get("context") or {}, ensure_ascii=False)
                )

    for page_entry in unusable:
        page_num = page_entry["number"]
        if not missing_topics or page_entry.get("relevant") is False:
            skipped.append(page_entry)
            continue

        has_table = bool(
            page_entry.get("has_table")
            or page_entry.get("tables")
            or tables_by_page.get(page_num)
        )
        table_bonus = 10 if has_table else 0

        declared_raw = (
            list(page_entry.get("topics") or [])
            + list(page_entry.get("relevant_fields") or [])
        )
        if declared_raw:
            declared_topics = {
                FIELD_TO_VISION_TOPIC.get(str(t).strip().casefold(), str(t).strip().casefold())
                for t in declared_raw
                if str(t).strip()
            }
            matched_declared = declared_topics & missing_topics
            if not matched_declared:
                if is_short_pdf and missing_fields is None:
                    scored_relevant.append((10 + role_bonus + table_bonus, page_num, page_entry))
                else:
                    skipped.append(page_entry)
                continue
            scored_relevant.append(
                (100 + len(matched_declared) * 10 + role_bonus + table_bonus, page_num, page_entry)
            )
            continue

        native_page_text = _native_text_for_page(document, page_num)
        table_text = " ".join(
            json.dumps(t, ensure_ascii=False) for t in (tables_by_page.get(page_num) or [])
        )
        hint_text = _norm(
            " ".join(
                str(part)
                for part in (
                    page_entry.get("heading"),
                    page_entry.get("section_hint"),
                    native_page_text,
                    table_text,
                    link_hints_by_page.get(page_num),
                )
                if part
            )
        )
        if hint_text:
            matched_kw_topics = {
                topic
                for topic in missing_topics
                if any(_norm(kw) in hint_text for kw in VISION_TOPIC_KEYWORDS.get(topic, ()))
            }
            non_missing_kw_topics = {
                topic
                for topic in (set(VISION_TOPIC_KEYWORDS.keys()) - missing_topics)
                if any(_norm(kw) in hint_text for kw in VISION_TOPIC_KEYWORDS.get(topic, ()))
            }
            if matched_kw_topics:
                scored_relevant.append(
                    (50 + len(matched_kw_topics) * 10 + role_bonus + table_bonus, page_num, page_entry)
                )
                continue
            if non_missing_kw_topics and not is_short_pdf:
                skipped.append(page_entry)
                continue

        scored_relevant.append((1 + role_bonus + table_bonus, page_num, page_entry))

    scored_relevant.sort(key=lambda item: (-item[0], item[1]))
    budget = max(0, int(remaining_budget))
    selected = [item[2] for item in scored_relevant[:budget]]
    deferred = [item[2] for item in scored_relevant[budget:]]
    return {
        "selected": selected,
        "skipped": skipped,
        "deferred": deferred,
    }


def validate_vision_page_output(
    raw_result: dict[str, Any],
    *,
    expected_page_number: int,
    bundle: dict[str, Any],
    existing_facts: dict[tuple[str, str], Any] | None = None,
) -> dict[str, Any]:
    """Deterministically validate Vision response for one physical PDF page."""
    if not isinstance(raw_result, dict) or raw_result.get("status") != "ok":
        reason = (
            raw_result.get("reason")
            if isinstance(raw_result, dict)
            else "vision_provider_failed"
        ) or "vision_provider_failed"
        retryable = bool(raw_result.get("retryable")) if isinstance(raw_result, dict) else False
        return {
            "status": "unresolved",
            "retryable": retryable,
            "reason_codes": [reason],
            "validated_response": None,
            "conflicts": [],
        }

    data = raw_result.get("data")
    if not isinstance(data, dict):
        return {
            "status": "unresolved",
            "retryable": False,
            "reason_codes": ["vision_output_malformed"],
            "validated_response": None,
            "conflicts": [],
        }

    try:
        parsed = VisionPageResponse.model_validate_json(
            json.dumps(data, ensure_ascii=False), strict=True
        )
    except (ValidationError, TypeError, ValueError):
        return {
            "status": "unresolved",
            "retryable": False,
            "reason_codes": ["vision_output_malformed"],
            "validated_response": None,
            "conflicts": [],
        }

    reasons: list[str] = []
    conflicts: list[dict[str, Any]] = []

    if parsed.physical_pdf_page != expected_page_number:
        reasons.append("vision_page_number_mismatch")

    identity = bundle.get("identity") or {}
    expected_issuer = _norm(identity.get("issuer"))
    expected_ad = _norm(identity.get("advertisement_number"))
    if parsed.visible_issuer and expected_issuer:
        vis_issuer = _norm(parsed.visible_issuer)
        if vis_issuer not in expected_issuer and expected_issuer not in vis_issuer:
            reasons.append("vision_identity_mismatch")
    if parsed.visible_advertisement_number and expected_ad:
        vis_ad = _norm(parsed.visible_advertisement_number)
        if vis_ad != expected_ad:
            reasons.append("vision_identity_mismatch")

    page_quote_norm = _norm(parsed.page_text_quote)
    if not page_quote_norm:
        reasons.append("vision_missing_page_quote")

    readable_context_norm = _norm(" \n ".join(_readable_bundle_quotes(bundle)))

    if not parsed.posts:
        reasons.append("vision_no_posts_bound")

    seen_post_field_values: dict[tuple[str, str], Any] = dict(existing_facts or {})

    for post in parsed.posts:
        post_name_norm = _norm(post.post_name)
        binding_norm = _norm(post.post_binding_quote)
        if not post_name_norm or not binding_norm:
            reasons.append("vision_missing_post_binding")
            continue
        if binding_norm not in page_quote_norm and binding_norm not in readable_context_norm:
            reasons.append("vision_post_binding_not_in_evidence")
        if post_name_norm not in binding_norm and post_name_norm not in page_quote_norm and post_name_norm not in readable_context_norm:
            reasons.append("vision_post_name_not_grounded")

        if not post.candidate_facts and not post.experience_alternatives:
            reasons.append("vision_post_has_no_facts")

        non_null_fact_count = 0
        for fact in post.candidate_facts:
            if fact.field_path not in ALLOWED_VISION_FACT_FIELDS:
                reasons.append("vision_unsupported_field")
            if fact.physical_pdf_page != expected_page_number:
                reasons.append("vision_page_number_mismatch")
            if not fact.section_locator.strip():
                reasons.append("vision_missing_locator")
            quote_norm = _norm(fact.exact_quote)
            if fact.value is None:
                # Null indicates unreadable text on the page for this field; never guess.
                if quote_norm and quote_norm not in page_quote_norm:
                    reasons.append("vision_missing_or_ungrounded_quote")
                continue
            non_null_fact_count += 1
            if not quote_norm or quote_norm not in page_quote_norm:
                reasons.append("vision_missing_or_ungrounded_quote")
            if isinstance(fact.value, str):
                if not _is_string_or_date_grounded_in_quote(fact.value, fact.exact_quote, quote_norm):
                    reasons.append("vision_fact_value_not_in_quote")
            elif isinstance(fact.value, (int, float)) and not isinstance(fact.value, bool):
                num_str = str(int(fact.value)) if float(fact.value).is_integer() else str(fact.value)
                if num_str not in fact.exact_quote:
                    reasons.append("vision_numeric_value_not_in_quote")

            key = (post_name_norm, fact.field_path)
            if key in seen_post_field_values and seen_post_field_values[key] != fact.value:
                reasons.append("vision_fact_conflict")
                conflicts.append({
                    "post_name": post.post_name,
                    "field_path": fact.field_path,
                    "existing_value": seen_post_field_values[key],
                    "conflicting_value": fact.value,
                    "quote": fact.exact_quote,
                })
            else:
                seen_post_field_values[key] = fact.value

        if post.candidate_facts and non_null_fact_count == 0 and not post.experience_alternatives:
            reasons.append("vision_null_candidate_fact")

        for alt in post.experience_alternatives:
            if alt.physical_pdf_page != expected_page_number:
                reasons.append("vision_page_number_mismatch")
            if not alt.source_locator.strip():
                reasons.append("vision_missing_locator")
            sup_norm = _norm(alt.supporting_quote)
            if not sup_norm or sup_norm not in page_quote_norm:
                reasons.append("vision_missing_or_ungrounded_quote")
            if not alt.role_titles:
                reasons.append("vision_missing_role_titles")
            for role_title in alt.role_titles:
                if not _norm(role_title) or _norm(role_title) not in sup_norm:
                    reasons.append("vision_role_not_in_quote")
            for qualifier in (alt.institution_or_scope, alt.class_scope):
                if qualifier is not None and _norm(qualifier) not in sup_norm:
                    reasons.append("vision_qualifier_not_in_quote")
            if alt.certificate_requirement is not None:
                if _norm(alt.certificate_requirement) not in page_quote_norm and _norm(alt.certificate_requirement) not in sup_norm:
                    reasons.append("vision_certificate_not_in_quote")
            if alt.minimum_years is not None:
                years_str = (
                    str(int(alt.minimum_years))
                    if float(alt.minimum_years).is_integer()
                    else str(alt.minimum_years)
                )
                if years_str not in alt.supporting_quote:
                    reasons.append("vision_numeric_value_not_in_quote")

    unique_reasons = sorted(set(reasons))
    if unique_reasons:
        return {
            "status": "unresolved",
            "retryable": False,
            "reason_codes": unique_reasons,
            "validated_response": None,
            "conflicts": conflicts,
        }

    return {
        "status": "recovered",
        "retryable": False,
        "reason_codes": [],
        "validated_response": parsed.model_dump(mode="json"),
        "conflicts": [],
    }


def recover_unreadable_pdf_pages(
    bundle: dict[str, Any],
    *,
    gemini_provider: Any,
    pdf_bytes_by_doc: dict[str, bytes] | None = None,
    page_images_by_doc: dict[str, dict[int, bytes]] | None = None,
    existing_facts: dict[tuple[str, str], Any] | None = None,
    storage_dir: Path | None = None,
    missing_fields: set[str] | list[str] | None = None,
    max_pages: int = MAX_VISION_PAGES_PER_NOTICE,
    ocr_engine: Any = None,
    short_pdf_page_threshold: int = SHORT_PDF_PAGE_THRESHOLD,
) -> dict[str, Any]:
    """Run bounded Vision/OCR recovery only for verified unreadable PDF pages relevant to missing fields.

    Returns a dictionary containing:
      - `bundle`: a copy of the bundle where native_text and existing HTML/PDF sections
        are untouched, and recovered PDF pages receive immutable `vision_recovery`
        metadata and citable `vision_recovered` sections.
      - `vision_called`: bool
      - `ocr_called`: bool
      - `requests`: list of page recovery, skipped, and cap-deferred records
      - `status`: 'not_needed' | 'recovered' | 'unresolved' | 'retryable'
      - `reason_codes`: sorted list of machine-readable reason codes
    """
    if not isinstance(max_pages, int) or isinstance(max_pages, bool) or max_pages < 1:
        raise ValueError("max_pages must be a positive integer")

    updated_bundle = copy.deepcopy(bundle)
    pdf_bytes_map = pdf_bytes_by_doc or {}
    images_map = page_images_by_doc or {}
    requests: list[dict[str, Any]] = []
    all_reasons: list[str] = []
    any_retryable = False
    vision_called = False
    ocr_called = False
    remaining_budget = max_pages

    for doc in updated_bundle.get("documents", []):
        if doc.get("format") != "pdf":
            continue
        unusable = unusable_pdf_pages(doc)
        if not unusable:
            continue

        verified_ok, verify_reason = is_bundle_identity_verified_for_vision(
            updated_bundle, doc
        )
        doc_id = doc["document_id"]
        doc_url = doc["source_url"]
        if not verified_ok:
            reason_code = verify_reason or "unverified_page_identity"
            all_reasons.append(reason_code)
            requests.append({
                "document_id": doc_id,
                "source_url": doc_url,
                "physical_pdf_page": None,
                "status": "unresolved",
                "retryable": False,
                "reason_codes": [reason_code],
                "vision_called": False,
            })
            continue

        selection = select_unreadable_pages_for_vision(
            updated_bundle,
            doc,
            unusable,
            missing_fields=missing_fields,
            remaining_budget=remaining_budget,
            short_pdf_page_threshold=short_pdf_page_threshold,
        )
        selected_entries = selection["selected"]
        skipped_entries = selection["skipped"]
        deferred_entries = selection["deferred"]
        remaining_budget -= len(selected_entries)

        raw_pdf_bytes = pdf_bytes_map.get(doc_id, b"")
        pdf_sha256 = hashlib.sha256(raw_pdf_bytes).hexdigest() if raw_pdf_bytes else None
        doc_images = images_map.get(doc_id) or {}
        recovered_pages_for_doc: list[dict[str, Any]] = []
        skipped_pages_for_doc: list[int] = []
        retryable_pages_for_doc: list[int] = []
        still_unreadable_pages: list[int] = []

        for page_entry in skipped_entries:
            page_num = page_entry["number"]
            skipped_pages_for_doc.append(page_num)
            requests.append({
                "document_id": doc_id,
                "source_url": doc_url,
                "physical_pdf_page": page_num,
                "status": "skipped",
                "retryable": False,
                "reason_codes": ["vision_page_not_relevant_to_missing_fields"],
                "vision_called": False,
            })

        for page_entry in deferred_entries:
            page_num = page_entry["number"]
            retryable_pages_for_doc.append(page_num)
            still_unreadable_pages.append(page_num)
            any_retryable = True
            all_reasons.append("vision_page_cap_deferred")
            requests.append({
                "document_id": doc_id,
                "source_url": doc_url,
                "physical_pdf_page": page_num,
                "status": "retryable",
                "retryable": True,
                "reason_codes": ["vision_page_cap_deferred"],
                "vision_called": False,
            })

        for page_entry in selected_entries:
            page_num = page_entry["number"]
            native_text = _native_text_for_page(doc, page_num)
            native_sha256 = hashlib.sha256(native_text.encode("utf-8")).hexdigest()
            image_bytes = doc_images.get(page_num)
            if not image_bytes:
                all_reasons.append("vision_rendered_image_missing")
                still_unreadable_pages.append(page_num)
                requests.append({
                    "document_id": doc_id,
                    "source_url": doc_url,
                    "physical_pdf_page": page_num,
                    "status": "unresolved",
                    "retryable": False,
                    "reason_codes": ["vision_rendered_image_missing"],
                    "vision_called": False,
                })
                continue

            image_sha256 = hashlib.sha256(image_bytes).hexdigest()
            ocr_text = ""
            ocr_engine_name = None
            ocr_config: dict[str, Any] = {}
            if ocr_engine is not None:
                ocr_called = True
                if hasattr(ocr_engine, "__dict__") and "extract_text" in getattr(ocr_engine, "__dict__", {}) or (
                    not callable(ocr_engine) and hasattr(ocr_engine, "extract_text")
                ):
                    ocr_raw = ocr_engine.extract_text(image_bytes, page_number=page_num)
                elif callable(ocr_engine):
                    ocr_raw = ocr_engine(image_bytes, page_num)
                elif hasattr(ocr_engine, "extract_text"):
                    ocr_raw = ocr_engine.extract_text(image_bytes, page_number=page_num)
                else:
                    ocr_raw = None
                if isinstance(ocr_raw, dict):
                    ocr_text = str(ocr_raw.get("text") or "")
                    ocr_engine_name = str(ocr_raw.get("engine") or getattr(ocr_engine, "engine", "tesseract"))
                    ocr_config = dict(ocr_raw.get("config") or getattr(ocr_engine, "config", {}))
                elif isinstance(ocr_raw, str):
                    ocr_text = ocr_raw
                    ocr_engine_name = str(getattr(ocr_engine, "engine", "custom_ocr"))
                    ocr_config = dict(getattr(ocr_engine, "config", {}))
            ocr_sha256 = hashlib.sha256(ocr_text.encode("utf-8")).hexdigest() if ocr_called else None

            supporting_ctx = _readable_bundle_quotes(updated_bundle)[:5]
            if ocr_text.strip():
                supporting_ctx.append(f"[OCR_CANDIDATE_PAGE_{page_num}] {ocr_text.strip()}")

            prompt = json.dumps(
                {
                    "task": "vision_page_recovery",
                    "bundle_id": updated_bundle.get("bundle_id"),
                    "notice_identity": updated_bundle.get("identity", {}),
                    "document_id": doc_id,
                    "source_url": doc_url,
                    "physical_pdf_page": page_num,
                    "supporting_context": supporting_ctx,
                },
                ensure_ascii=False,
            )

            vision_called = True
            raw_res = gemini_provider.recover_pdf_page(
                image_bytes=image_bytes,
                prompt=prompt,
                response_schema=VisionPageResponse.model_json_schema(),
                system_prompt=VISION_SYSTEM_PROMPT,
            )
            raw_text_bytes = (
                (raw_res.get("raw_text") or json.dumps(raw_res.get("data"), ensure_ascii=False)).encode("utf-8")
                if isinstance(raw_res, dict)
                else b""
            )
            vision_sha256 = hashlib.sha256(raw_text_bytes).hexdigest()

            image_artifact_path = None
            vision_artifact_path = None
            ocr_artifact_path = None
            if storage_dir is not None:
                v_root = Path(storage_dir) / "vision"
                img_path = v_root / "images" / f"{doc_id}-page-{page_num}-{image_sha256[:16]}.png"
                resp_path = v_root / "responses" / f"{doc_id}-page-{page_num}-{vision_sha256[:16]}.json"
                atomic_write(img_path, image_bytes)
                atomic_write(
                    resp_path,
                    json.dumps(
                        {
                            "recorded_at": now(),
                            "document_id": doc_id,
                            "physical_pdf_page": page_num,
                            "pdf_sha256": pdf_sha256,
                            "native_sha256": native_sha256,
                            "image_sha256": image_sha256,
                            "ocr_sha256": ocr_sha256,
                            "vision_sha256": vision_sha256,
                            "prompt": prompt,
                            "raw_result": raw_res,
                        },
                        ensure_ascii=False,
                        indent=2,
                    ).encode("utf-8"),
                )
                image_artifact_path = str(img_path.resolve())
                vision_artifact_path = str(resp_path.resolve())
                if ocr_called and ocr_sha256:
                    ocr_path = v_root / "ocr" / f"{doc_id}-page-{page_num}-{ocr_sha256[:16]}.json"
                    atomic_write(
                        ocr_path,
                        json.dumps(
                            {
                                "recorded_at": now(),
                                "document_id": doc_id,
                                "physical_pdf_page": page_num,
                                "engine": ocr_engine_name,
                                "config": ocr_config,
                                "ocr_sha256": ocr_sha256,
                                "text": ocr_text,
                            },
                            ensure_ascii=False,
                            indent=2,
                        ).encode("utf-8"),
                    )
                    ocr_artifact_path = str(ocr_path.resolve())

            validation = validate_vision_page_output(
                raw_res,
                expected_page_number=page_num,
                bundle=updated_bundle,
                existing_facts=existing_facts,
            )
            evidence_versions: dict[str, Any] = {
                "canonical_pdf": {
                    "version_type": "canonical_pdf_bytes",
                    "sha256": pdf_sha256,
                    "source_url": doc_url,
                },
                "native_text": {
                    "version_type": "native_text_diagnostic",
                    "sha256": native_sha256,
                    "physical_pdf_page": page_num,
                    "native_status": page_entry.get("native_status"),
                    "text": native_text,
                },
                "rendered_image": {
                    "version_type": "rendered_page_image",
                    "sha256": image_sha256,
                    "physical_pdf_page": page_num,
                    "mime_type": "image/png",
                    "artifact_path": image_artifact_path,
                },
                "vision_output": {
                    "version_type": "gemini_vision_candidate",
                    "sha256": vision_sha256,
                    "physical_pdf_page": page_num,
                    "model": getattr(gemini_provider, "model", None),
                    "artifact_path": vision_artifact_path,
                    "raw_data": raw_res.get("data") if isinstance(raw_res, dict) else None,
                },
            }
            if ocr_called:
                evidence_versions["ocr_output"] = {
                    "version_type": "ocr_candidate_text",
                    "sha256": ocr_sha256,
                    "physical_pdf_page": page_num,
                    "engine": ocr_engine_name,
                    "config": ocr_config,
                    "artifact_path": ocr_artifact_path,
                    "text": ocr_text,
                }

            page_record = {
                "document_id": doc_id,
                "source_url": doc_url,
                "physical_pdf_page": page_num,
                "status": validation["status"],
                "retryable": validation["retryable"],
                "reason_codes": validation["reason_codes"],
                "conflicts": validation["conflicts"],
                "vision_called": True,
                "ocr_called": ocr_called,
                "evidence_versions": evidence_versions,
                "validated_response": validation["validated_response"],
            }
            requests.append(page_record)

            if validation["status"] == "recovered":
                recovered_pages_for_doc.append(page_record)
            else:
                still_unreadable_pages.append(page_num)
                all_reasons.extend(validation["reason_codes"])
                if validation["retryable"]:
                    retryable_pages_for_doc.append(page_num)
                    any_retryable = True

        # Attach immutable vision_recovery record to document content without mutating native_text
        content = doc["content"]
        content["vision_recovery"] = {
            "max_pages_per_notice": max_pages,
            "selected_pages": [p["number"] for p in selected_entries],
            "recovered_pages": [r["physical_pdf_page"] for r in recovered_pages_for_doc],
            "skipped_pages": skipped_pages_for_doc,
            "retryable_pages": retryable_pages_for_doc,
            "unresolved_pages": still_unreadable_pages,
            "records": recovered_pages_for_doc,
        }

        # Preserve all previously valid sections on the document and append any recovered pages.
        # A failure on one page must never erase existing valid HTML or PDF sections.
        sections = list(content.get("sections") or [])
        existing_sec_ids = {s.get("id") for s in sections if isinstance(s, dict)}
        for rec in recovered_pages_for_doc:
            p_num = rec["physical_pdf_page"]
            sec_id = f"vision-page-{p_num}"
            if sec_id in existing_sec_ids:
                continue
            v_resp = rec["validated_response"]
            versions = rec["evidence_versions"]
            sections.append({
                "id": sec_id,
                "heading": f"Vision recovered page {p_num}",
                "text": v_resp["page_text_quote"],
                "topics": ["education", "age", "vacancies", "dates", "experience"],
                "page_range": [p_num, p_num],
                "evidence": [
                    {
                        "block_id": f"page-{p_num}-vision",
                        "page": p_num,
                        "line_range": [1, max(1, len(v_resp["page_text_quote"].splitlines()))],
                        "method": "gemini_vision_v1",
                        "image_sha256": versions["rendered_image"]["sha256"],
                        "vision_sha256": versions["vision_output"]["sha256"],
                        "pdf_sha256": versions["canonical_pdf"]["sha256"],
                    }
                ],
                "status": "vision_recovered_candidate",
            })
        if recovered_pages_for_doc:
            content["sections"] = sections

        # Only when all relevant unreadable pages of this verified PDF are resolved may its
        # coverage gap be cleared for this document. Native blocks remain untouched.
        if (recovered_pages_for_doc or skipped_pages_for_doc) and not still_unreadable_pages and sections:
            cov = dict(content.get("coverage") or {})
            cov["unreadable_pages"] = []
            cov["vision_recovered_pages"] = [r["physical_pdf_page"] for r in recovered_pages_for_doc]
            if skipped_pages_for_doc:
                cov["vision_skipped_pages"] = skipped_pages_for_doc
            content["coverage"] = cov
            cleared_reasons = {"empty_content", "content_coverage_gap"}
            official_hosts = {
                urlsplit(d.get("source_url") or "").hostname.casefold()
                for d in updated_bundle.get("documents", [])
                if isinstance(d, dict)
                and d.get("authority") == "official_host_candidate"
                and urlsplit(d.get("source_url") or "").scheme == "https"
                and urlsplit(d.get("source_url") or "").hostname
            }
            doc_parsed = urlsplit(doc_url)
            has_verified_vision_identity = any(
                (r.get("validated_response") or {}).get("visible_issuer")
                or (r.get("validated_response") or {}).get("visible_advertisement_number")
                for r in recovered_pages_for_doc
            )
            if (
                doc.get("authority") != "official_host_candidate"
                and doc_parsed.scheme == "https"
                and doc_parsed.hostname
                and doc_parsed.hostname.casefold() in official_hosts
                and has_verified_vision_identity
            ):
                doc["authority"] = "official_host_candidate"
                cleared_reasons.add("authority_needs_review")
            doc["review_reasons"] = [
                r
                for r in doc.get("review_reasons", [])
                if r not in cleared_reasons
            ]
        elif recovered_pages_for_doc or skipped_pages_for_doc:
            cov = dict(content.get("coverage") or {})
            cov["unreadable_pages"] = sorted(set(still_unreadable_pages))
            cov["vision_recovered_pages"] = [r["physical_pdf_page"] for r in recovered_pages_for_doc]
            if skipped_pages_for_doc:
                cov["vision_skipped_pages"] = skipped_pages_for_doc
            content["coverage"] = cov

    if not requests or all(r.get("status") == "skipped" for r in requests):
        overall_status: Literal["not_needed", "recovered", "unresolved", "retryable"] = "not_needed"
    elif all_reasons:
        overall_status = "retryable" if any_retryable else "unresolved"
    else:
        overall_status = "recovered"

    # Recompute bundle-level review_reasons if all documents now have sections and no coverage gaps
    if overall_status in {"recovered", "not_needed"}:
        still_gap = any(
            (d.get("content") or {}).get("coverage", {}).get("unreadable_pages")
            or not (d.get("content") or {}).get("sections")
            for d in updated_bundle.get("documents", [])
            if d.get("format") == "pdf"
        )
        if not still_gap:
            updated_bundle["review_reasons"] = [
                r
                for r in updated_bundle.get("review_reasons", [])
                if r not in {"empty_content", "content_coverage_gap", "pdf_requires_review"}
            ]

    return {
        "bundle": updated_bundle,
        "vision_called": vision_called,
        "ocr_called": ocr_called,
        "status": overall_status,
        "reason_codes": sorted(set(all_reasons)),
        "requests": requests,
    }
