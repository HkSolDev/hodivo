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

    def test_failed_capture_cannot_reuse_stale_snapshot(self):
        with tempfile.TemporaryDirectory() as root, patch('repair_clients.capture', return_value={
                'outcome': 'failed', 'snapshot': {'body_path': 'must-not-be-read'}}):
            self.assertEqual(OfficialRepairCapture(root).capture_source(
                'https://example.gov.in/notice')['status'], 'failed')
