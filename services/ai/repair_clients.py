"""Gemini discovery and independently captured evidence for bounded repair."""

import json
from pathlib import Path

from bs4 import BeautifulSoup

from capture import capture


class GeminiRepairSearch:
    def __init__(self, provider):
        self.provider = provider

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
        return {'status': 'captured', 'source_url': snapshot['final_url'],
                'document_id': snapshot['sha256'], 'sha256': snapshot['sha256'],
                'captured_at': snapshot['captured_at'], 'text_units': units}
