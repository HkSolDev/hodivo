"""Discover official evidence from portal hints without trusting search prose."""

import re
from datetime import date
from urllib.parse import urlsplit

from build_extraction_input import prepare_extraction, is_extraction_approved
from extract_bundle import extract_bundle
from targeted_enrichment import is_official_issuer_url, verify_enrichment_identity
from verify_bundle import normalized, verify_bundles


def recover_official_notice(extracted, source_input, *, search_client, capture_client,
                            issuer_hosts=None):
    """One search, three independent captures, one fresh extraction; no publication."""
    facts = extracted.get('facts') or {}
    posts = facts.get('posts') or []
    issuers = {p.get('recruiting_body') for p in posts if p.get('recruiting_body')}
    names = sorted({p.get('post_name') for p in posts if p.get('post_name')})
    report = {'stage': 'official_notice_discovery', 'status': 'unresolved',
              'requests': [], 'audit_log': [], 'reason_codes': []}
    if len(issuers) != 1 or not names:
        report['reason_codes'] = ['notice_discovery_missing_search_hints']
        return extracted, source_input, report
    issuer = next(iter(issuers))
    identity = source_input.get('identity') or {}
    year = identity.get('year')
    if year and not re.fullmatch(r'20\d{2}', str(year)):
        year = None
    if not year:
        years = {str(p.get('application_last_date', ''))[:4] for p in posts
                 if re.fullmatch(r'20\d{2}-\d{2}-\d{2}', str(p.get('application_last_date')))}
        year = next(iter(years)) if len(years) == 1 else None
    request = {'issuer_hint': issuer, 'post_names': names, 'cycle_hint': year,
               'advertisement_hint': identity.get('advertisement_number'),
               'known_dates': sorted({p['application_last_date'] for p in posts
                                      if p.get('application_last_date')}),
               'as_of': date.today().isoformat(),
               'discovery_urls': [d.get('source_url') for d in source_input.get('documents', [])]}
    report['requests'].append(request)
    try:
        found = search_client.discover_notice(request)
    except (OSError, ValueError, RuntimeError) as error:
        report.update(reason_codes=['notice_discovery_failed'],
                      retryable=bool(getattr(error, 'retryable', False)))
        return extracted, source_input, report
    if found.get('status') != 'ok':
        report.update(reason_codes=[found.get('reason') or 'notice_discovery_failed'],
                      retryable=bool(found.get('retryable')))
        return extracted, source_input, report
    urls = (found.get('data') or {}).get('source_urls', [])
    if not isinstance(urls, list):
        urls = []
    matches = []
    for url in list(dict.fromkeys(u for u in urls if isinstance(u, str)))[:3]:
        audit = {'source_url': url, 'status': 'unverified'}
        report['audit_log'].append(audit)
        try:
            parsed = urlsplit(url)
        except ValueError:
            audit['status'] = 'invalid_source_url'
            continue
        host = parsed.hostname or ''
        # Reserved public-institution domains are discovery candidates, not proof of issuer.
        reserved = any(host.endswith('.' + suffix) for suffix in
                       ('gov.in', 'nic.in', 'ac.in', 'edu.in', 'res.in', 'bank.in'))
        if not is_official_issuer_url(url, issuer, issuer_hosts) and not (
                parsed.scheme == 'https' and reserved and not parsed.username and not parsed.password):
            audit['status'] = 'unofficial_source'
            continue
        try:
            captured = capture_client.capture_source(url)
            document = captured.get('document')
            final_url = captured.get('source_url', '')
            if captured.get('status') != 'captured' or not isinstance(document, dict):
                audit['status'] = 'source_capture_failed'
                continue
            # A redirect cannot inherit the original hostname's authority.
            if urlsplit(final_url).hostname != host:
                audit['status'] = 'unverified_redirect'
                continue
            text = normalized(' '.join(u.get('text', '') for u in captured.get('text_units', [])))
            if any(not re.search(r'(?<!\w)' + re.escape(normalized(n)) + r'(?!\w)', text)
                   for n in [issuer, *names]):
                audit['status'] = 'notice_identity_mismatch'
                continue
            # Require the same cycle and an independent captured date or advertisement anchor.
            anchors = request['known_dates'][:]
            ad = identity.get('advertisement_number')
            if ad and not re.fullmatch(r'recruitment/rect/20\d{2}', normalized(ad)):
                anchors.append(ad)
            date_forms = []
            for anchor in anchors:
                date_forms.append(normalized(anchor))
                try:
                    day = date.fromisoformat(anchor)
                    date_forms.extend(normalized(day.strftime(fmt)) for fmt in
                                      ('%d/%m/%Y', '%d-%m-%Y', '%d %B %Y', '%B %d, %Y'))
                except ValueError:
                    pass
            if not year or str(year) not in text or not any(a in text for a in date_forms):
                audit['status'] = 'notice_cycle_unconfirmed'
                continue
            bundles = verify_bundles([document], issuer_hosts={issuer: [host]})['bundles']
            if len(bundles) != 1:
                audit['status'] = 'notice_identity_ambiguous'
                continue
            bundle = bundles[0]
            if any(r.startswith(('ambiguous_', 'conflicting_')) for r in bundle['review_reasons']):
                audit['status'] = 'notice_identity_ambiguous'
                continue
            actual = bundle['identity']
            if actual.get('issuer') and normalized(actual['issuer']) != normalized(issuer):
                audit['status'] = 'notice_identity_mismatch'
                continue
            if (ad and not re.fullmatch(r'recruitment/rect/20\d{2}', normalized(ad))
                    and actual.get('advertisement_number')
                    and normalized(actual['advertisement_number']) != normalized(ad)):
                audit['status'] = 'notice_advertisement_mismatch'
                continue
            if actual.get('year') and actual['year'] != year:
                audit['status'] = 'notice_cycle_mismatch'
                continue
            # Only captured issuer/post/cycle text can fill absent regex identity fields.
            actual.update(issuer=issuer, year=year)
            if not actual.get('advertisement_number') and not actual.get('campaign'):
                actual['campaign'] = ' / '.join(names)
            bundle['bundle_id'] = source_input['bundle_id']
            prepared = prepare_extraction(bundle)
            if not is_extraction_approved(prepared):
                audit['status'] = 'official_evidence_not_extractable'
                continue
            matches.append(prepared)
            audit['status'] = 'matched_official_notice'
        except Exception as error:
            # A broken remote document must not discard the portal evidence or stop other captures.
            audit['status'] = 'official_capture_failed'
            report['retryable'] = report.get('retryable', False) or bool(getattr(error, 'retryable', False))
    # Multiple matches may contain conflicting revisions; never choose arbitrarily.
    if len(matches) != 1:
        report['reason_codes'] = ['official_notice_ambiguous' if matches else 'official_notice_not_verified']
        return extracted, source_input, report
    prepared = matches[0]
    try:
        candidate = extract_bundle(prepared)
    except (OSError, ValueError, RuntimeError) as error:
        report.update(reason_codes=['official_notice_extraction_failed'],
                      retryable=bool(getattr(error, 'retryable', False)))
        return extracted, source_input, report
    recovered = prepared['llm_input']['input']
    if not verify_enrichment_identity(recovered)[0]:
        report['reason_codes'] = ['official_notice_identity_unresolved']
        return extracted, source_input, report
    report.update(status='recovered', reason_codes=[], issuer_hosts={issuer: [urlsplit(recovered['documents'][0]['source_url']).hostname]})
    report['discovery_source_urls'] = request['discovery_urls']
    return candidate, recovered, report
