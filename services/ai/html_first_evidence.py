"""Bounded evidence recovery before extraction; model output is never source evidence."""

import copy
import hashlib
import json
from pathlib import Path

from build_extraction_input import BundleFacts
from check_coverage import bundle_units
from compact_inline import field_catalogue
from evidence_tool_contract import compile_field_patterns, validate_read_notice_request
from recover_documents import capture_and_normalize
from research_gap_prompt import build_notice_research_prompt
from targeted_enrichment import is_official_issuer_url, verify_enrichment_identity
from verify_bundle import normalized, verify_bundles


def _assessment(bundle, known_urls, assess, fields, outcomes):
    request = {'identity': bundle['identity'], 'documents': bundle['documents'],
               'evidence': bundle_units(bundle), 'known_urls': known_urls,
               'field_paths': fields, 'tool_outcomes': outcomes}
    # Reject oversized inputs rather than silently dropping evidence.
    if len(json.dumps(request, ensure_ascii=False)) > 120_000:
        return {'status': 'unresolved', 'reason': 'assessment_budget_exceeded'}
    try:
        result = assess(request)
        return result if isinstance(result, dict) else {'status': 'unresolved'}
    except Exception as error:
        return {'status': 'unresolved', 'reason': 'assessment_failed',
                'retryable': bool(getattr(error, 'retryable', isinstance(error, (TimeoutError, ConnectionError))))}


def recover_html_first_evidence(bundle, root, *, assess, discover, issuer_hosts,
                                process=capture_and_normalize, recover_vision=None):
    """Two assessments, two linked reads, one research round, at most three research captures.

    Failures preserve collected evidence. Every added document must independently
    match the issuer, advertisement/exam and year. Existing extraction/publication
    gates still decide readiness. Callers own checkpointing and the notice lock.
    """
    bundle = copy.deepcopy(bundle)
    valid, identity, reason = verify_enrichment_identity(bundle)
    report = {'bundle': bundle, 'tools': [], 'research': [], 'search_called': False,
              'reason': reason, 'assessment_calls': 0}
    if not valid:
        return report
    fields = [item['field'] for item in field_catalogue(BundleFacts.model_json_schema())]
    patterns = compile_field_patterns(fields)
    known_urls = sorted({link['url'] for doc in bundle['documents']
                         for link in doc['content'].get('links', [])
                         if isinstance(link.get('url'), str) and
                         is_official_issuer_url(link['url'], identity['issuer'], issuer_hosts)})
    seen = {doc['source_url'] for doc in bundle['documents']}

    def collect(url):
        if url in seen:
            return 'already_read'
        seen.add(url)
        if not is_official_issuer_url(url, identity['issuer'], issuer_hosts):
            return 'unofficial_source'
        try:
            result, failure, _ = process(url, Path(root))
            if result is None:
                return failure or 'capture_failed'
            final_url = result['final_url']
            if not is_official_issuer_url(final_url, identity['issuer'], issuer_hosts):
                return 'unofficial_redirect'
            content = json.loads(Path(result['content_path']).read_text())
            document = {'document_id': hashlib.sha256(final_url.encode()).hexdigest()[:24],
                        'source_url': final_url, 'format': result['document_kind'], 'content': content}
            vision_attempted = False
            if document['format'] == 'pdf' and recover_vision is not None:
                from vision_recovery import is_bundle_identity_verified_for_vision, unusable_pdf_pages
                provisional = copy.deepcopy(bundle)
                provisional['documents'].append(document)
                if unusable_pdf_pages(document) and is_bundle_identity_verified_for_vision(provisional, document)[0]:
                    vision_attempted = True
                    try:
                        recovered = recover_vision(provisional)
                        document = next(doc for doc in recovered['bundle']['documents']
                                        if doc['document_id'] == document['document_id'])
                    except Exception:
                        return 'document_vision_failed'
            verified = verify_bundles([document], issuer_hosts=issuer_hosts)['bundles']
            if len(verified) != 1:
                return 'identity_unresolved'
            candidate = verified[0]
            ok, found, _ = verify_enrichment_identity(candidate)
            if not ok or any(normalized(found[key]) != normalized(identity[key]) for key in
                             ('issuer', 'advertisement_or_exam_identity', 'year')):
                return 'identity_mismatch'
            additions = candidate['documents']
            existing_ids = {doc['document_id'] for doc in bundle['documents']}
            additions = [doc for doc in additions if doc['document_id'] not in existing_ids]
            bundle['documents'].extend(additions)
            if additions and recover_vision is not None and not vision_attempted:
                try:
                    recovered = recover_vision(copy.deepcopy(bundle))
                    bundle['documents'] = recovered['bundle']['documents']
                except Exception:
                    return 'captured_vision_failed'
            return 'captured'
        except Exception:
            return 'document_processing_failed'

    assessment = _assessment(bundle, known_urls, assess, fields, [])
    report['assessment_calls'] += 1
    requests = assessment.get('function_calls') or []
    if not isinstance(requests, list):
        requests = []
    for call in requests[:2]:
        if not isinstance(call, dict):
            report['tools'].append({'status': 'invalid_tool_call'})
            continue
        accepted, reason, payload = validate_read_notice_request(
            call.get('name'), call.get('args'), known_urls=known_urls, field_paths=fields)
        report['tools'].append({'status': collect(payload['document_url']) if accepted else reason})
    if len(requests) > 2:
        report['tools'].append({'status': 'tool_budget_exhausted'})
    if requests:
        # A fresh assessment gets collected evidence and failures, with no tools offered.
        assessment = _assessment(bundle, [], assess, fields, report['tools'])
        report['assessment_calls'] += 1
    if assessment.get('retryable'):
        report.update(reason='assessment_failed', retryable=True)
        return report
    data = None
    try:
        data = assessment.get('data')
        data = json.loads(data) if isinstance(data, str) else data
        if not isinstance(data, dict) or 'missing_fields' not in data:
            raise ValueError
        missing = data['missing_fields']
        conflicts = data.get('conflicting_fields', []) if isinstance(data, dict) else []
        if not isinstance(missing, list) or not isinstance(conflicts, list):
            raise ValueError
        if any(not isinstance(field, str) or not any(pattern.fullmatch(field) for pattern in patterns)
               for field in missing + conflicts):
            raise ValueError
        gaps = sorted({field for field in missing + conflicts if isinstance(field, str)
                       and any(pattern.fullmatch(field) for pattern in patterns)})
    except (TypeError, ValueError):
        gaps = []
        report['reason'] = 'assessment_response_invalid'
    # If planning failed, still research coverage gaps rather than stopping at PDF failure.
    if assessment.get('status') != 'ok' or report['reason'] == 'assessment_response_invalid':
        from check_coverage import check_coverage
        gaps = check_coverage(bundle)['coverage_focus']
    if gaps and discover is not None:
        report['search_called'] = True
        request = {'identity': identity, 'known_urls': known_urls, 'remaining_fields': gaps,
                   'evidence': bundle_units(bundle), 'tool_outcomes': report['tools']}
        request['prompt'] = build_notice_research_prompt(
            identity, request['evidence'], gaps, known_urls)
        if len(request['prompt']) > 120_000:
            report['search_called'] = False
            report['reason'] = 'research_input_budget_exceeded'
            return report
        try:
            found = discover(request)
            if found.get('retryable'):
                report.update(reason='research_failed', retryable=True)
                return report
            report['grounding_metadata'] = found.get('grounding_metadata')
            candidates = (found.get('data') or {}).get('source_urls', [])
            if not isinstance(candidates, list):
                candidates = []
            for url in list(dict.fromkeys(item for item in candidates if isinstance(item, str)))[:3]:
                report['research'].append({'status': collect(url)})
        except Exception as error:
            report['reason'] = 'research_failed'
            report['retryable'] = bool(getattr(error, 'retryable', isinstance(error, (TimeoutError, ConnectionError))))
    return report
