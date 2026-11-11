"""Validate read_notice tool requests; pure checks, no execution, no network.

The Gemini evidence assessment may request the read_notice tool, but code
validates the request before any retrieval runs. Arguments must name a known
official document URL and existing schema field paths; unknown tools, invented
fields and unrelated URLs are rejected with fixed reason codes. The tool result
itself stays owned by the retrieval runtime, so this module defines no result
or evidence shape.
"""

import re
from urllib.parse import urlsplit

TOOL_NAME = 'read_notice'
ARGUMENT_KEYS = {'document_url', 'fields'}
INDEX_PATTERN = r'(?:0|[1-9]\d*)'
ACCEPTED_KEYS = {'tool', 'document_url', 'fields'}


def compile_field_patterns(field_paths):
    """Turn catalogue paths with <index> into full-match regexes."""
    if not isinstance(field_paths, list) or not field_paths or not all(
        isinstance(path, str) and path for path in field_paths
    ):
        raise ValueError('Field paths must be a nonempty list of catalogue strings')
    return [re.compile(re.escape(path).replace('<index>', INDEX_PATTERN)) for path in field_paths]


def parse_official_url(url):
    """Return urlsplit parts for an absolute credential-free https URL."""
    if not isinstance(url, str) or not url:
        return None
    try:
        parts = urlsplit(url)
    except ValueError:
        return None
    # Same constraints as targeted_enrichment.is_official_issuer_url and
    # verify_bundle: https only, hostname present, no embedded credentials.
    if parts.scheme != 'https' or not parts.hostname or parts.username or parts.password:
        return None
    return parts


def _urls_match(parts, known):
    return (
        parts.scheme == known.scheme
        and (parts.hostname or '').casefold() == (known.hostname or '').casefold()
        and parts.path == known.path
        and parts.query == known.query
        and parts.fragment == known.fragment
    )


def validate_document_url(url, known_urls):
    """Accept the URL only when it matches one supplied known official URL."""
    parts = parse_official_url(url)
    if parts is None:
        return None, 'invalid_document_url'
    known = []
    for candidate in known_urls:
        candidate_parts = parse_official_url(candidate)
        if candidate_parts is None:
            raise ValueError('Known official URLs must be absolute credential-free https URLs')
        known.append(candidate_parts)
    if not any(_urls_match(parts, candidate) for candidate in known):
        return None, 'unrelated_document_url'
    return parts, None


def validate_read_notice_request(tool_name, arguments, *, known_urls, field_paths):
    """Return (accepted, reason, payload) for one requested tool call."""
    if tool_name != TOOL_NAME:
        return False, 'unknown_tool', None
    if not isinstance(arguments, dict) or set(arguments) != ARGUMENT_KEYS:
        return False, 'invalid_arguments', None
    _, url_reason = validate_document_url(arguments['document_url'], known_urls)
    if url_reason:
        return False, url_reason, None
    fields = arguments['fields']
    if (
        not isinstance(fields, list)
        or not fields
        or not all(isinstance(field, str) and field for field in fields)
    ):
        return False, 'invalid_fields', None
    if len(set(fields)) != len(fields):
        return False, 'duplicate_field', None
    patterns = compile_field_patterns(field_paths)
    for field in fields:
        if not any(pattern.fullmatch(field) for pattern in patterns):
            # Fixed code only: never echo model-supplied field names back.
            return False, 'unknown_field_path', None
    return True, None, {
        'tool': TOOL_NAME,
        'document_url': arguments['document_url'],
        'fields': list(fields),
    }
