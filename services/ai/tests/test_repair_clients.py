import tempfile
import unittest
from unittest.mock import Mock, patch

from repair_clients import GeminiRepairSearch, OfficialRepairCapture


class RepairClientTests(unittest.TestCase):
    def test_search_preserves_numeric_candidate_and_requests_grounded_discovery(self):
        provider = Mock()
        provider.discover_sources.return_value = {
            'status': 'ok', 'data': {'candidates': [{'value': 35}]}}
        result = GeminiRepairSearch(provider).discover_for_request({'query': 'age'})
        self.assertEqual(result['candidates'][0]['value'], 35)
        schema = provider.discover_sources.call_args.kwargs['response_schema']
        value_schema = schema['properties']['candidates']['items']['properties']['value']
        self.assertIn({'type': 'number'}, value_schema['anyOf'])

    def test_notice_search_accepts_hints_and_requests_current_matching_cycle(self):
        provider = Mock()
        GeminiRepairSearch(provider).discover_notice({'issuer_hint': 'Example Board',
            'post_names': ['Engineer'], 'cycle_hint': '2026'})
        call = provider.discover_sources.call_args.kwargs
        self.assertIn('unverified discovery hints', call['system_prompt'])
        self.assertIn('latest official notice', call['system_prompt'])
        self.assertIn('Do not substitute an older cycle', call['system_prompt'])
        self.assertEqual(call['response_schema']['required'], ['source_urls'])

    def test_official_capture_retains_normalized_source_for_fresh_extraction(self):
        from pathlib import Path
        with tempfile.TemporaryDirectory() as root:
            body = Path(root) / 'body.html'
            body.write_text('<title>Engineer Recruitment</title><h1>Engineer Recruitment</h1>'
                            '<p>Qualifications: degree.</p>')
            snapshot = {'body_path': str(body), 'final_url': 'https://example.gov.in/notice',
                        'sha256': 'a' * 64, 'captured_at': '2026-11-12T00:00:00Z'}
            with patch('repair_clients.capture', return_value={
                    'outcome': 'changed', 'snapshot': snapshot}):
                result = OfficialRepairCapture(root).capture_source(snapshot['final_url'])
        self.assertEqual(result['document']['source_url'], snapshot['final_url'])
        self.assertIn('Qualifications: degree.', result['text_units'][0]['text'])
        self.assertEqual(result['document']['content']['title'], 'Engineer Recruitment')

    def test_failed_capture_cannot_reuse_stale_snapshot(self):
        with tempfile.TemporaryDirectory() as root, patch('repair_clients.capture', return_value={
                'outcome': 'failed', 'snapshot': {'body_path': 'must-not-be-read'}}):
            self.assertEqual(OfficialRepairCapture(root).capture_source(
                'https://example.gov.in/notice')['status'], 'failed')
