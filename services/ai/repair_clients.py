"""Gemini discovery and independently captured evidence for bounded repair."""

import json
from pathlib import Path

from bs4 import BeautifulSoup

from capture import capture
from normalize_html import normalize_html
from research_gap_prompt import RECRUITMENT_RESEARCH_INSTRUCTIONS


class GeminiRepairSearch:
    def __init__(self, provider):
        self.provider = provider

    def discover_notice(self, request):
        return self.provider.discover_sources(
            query=json.dumps(request, ensure_ascii=False),
            system_prompt=RECRUITMENT_RESEARCH_INSTRUCTIONS +
                ' Supplied identity fields are unverified discovery hints, not established facts. '
                'Find the latest official notice and dated amendments for the matching recruitment cycle. '
                'Do not substitute an older cycle or a different, newer recruitment. '
                'An advertisement number is optional for discovery. Return source_urls only.',
            response_schema={'type': 'object', 'properties': {'source_urls': {
                'type': 'array', 'items': {'type': 'string'}}}, 'required': ['source_urls']})

    def discover_for_request(self, request):
        schema = {'type': 'object', 'properties': {'candidates': {
            'type': 'array', 'items': {'type': 'object', 'properties': {
                name: ({'anyOf': [{'type': 'string'}, {'type': 'number'},
                                  {'type': 'boolean'}, {'type': 'null'},
                                  {'type': 'array', 'items': {'type': 'string'}}]}
                       if name == 'value' else {'type': 'string'}) for name in (
                    'source_url', 'value', 'exact_quote', 'post_binding_quote')},
                'required': ['source_url', 'value', 'exact_quote', 'post_binding_quote']}}},
            'required': ['candidates']}
        result = self.provider.discover_sources(
            query=json.dumps(request, ensure_ascii=False),
            system_prompt='Find official issuer documents for this recruitment field. '
                          'Return exact quotations and post binding. Never invent sources or facts. '
                          'Return no candidates when uncertain.',
            response_schema=schema)
        return {**result, 'candidates': (result.get('data') or {}).get('candidates', [])}


class OfficialRepairCapture:
    def __init__(self, root):
        self.root = Path(root)

    def capture_source(self, url):
        result = capture(url, self.root)
        snapshot = result.get('snapshot')
        if result.get('outcome') not in {'changed', 'identical', 'not_modified'} or not snapshot:
            return {'status': 'failed'}
        body = Path(snapshot['body_path']).read_bytes()
        units = []
        if body.startswith(b'%PDF-'):
            import pdfplumber
            from io import BytesIO
            with pdfplumber.open(BytesIO(body)) as document:
                for number, page in enumerate(document.pages[:30], 1):
                    units.append({'page': number, 'locator': f'page:{number}',
                                  'text': page.extract_text() or ''})
        else:
            units.append({'locator': 'html:body', 'text':
                          BeautifulSoup(body, 'html.parser').get_text(' ', strip=True)})
        kind = 'pdf' if body.startswith(b'%PDF-') else 'html'
        content = ({'format': 'pdf', 'source_url': snapshot['final_url'],
                    'sections': [{'text': u['text'], 'evidence': [{'page': u['page']}]}
                                 for u in units]}
                   if kind == 'pdf' else normalize_html(body, snapshot['final_url']))
        document = {'document_id': snapshot['sha256'], 'source_url': snapshot['final_url'],
                    'format': kind, 'content': content}
        return {'status': 'captured', 'document': document, 'source_url': snapshot['final_url'],
                'document_id': snapshot['sha256'], 'sha256': snapshot['sha256'],
                'captured_at': snapshot['captured_at'], 'text_units': units}
