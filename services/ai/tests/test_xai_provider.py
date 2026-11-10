import base64
import json
import os
import tempfile
import unittest
from unittest.mock import Mock, patch

import httpx

from extract_bundle import request_structured
from providers.tasks import task_provider
from providers.xai import XaiProvider
from stage_retry import StageRetries


class XaiTests(unittest.TestCase):
    def provider(self, body, status=200):
        client = Mock()
        client.post.return_value = httpx.Response(status, json=body)
        return XaiProvider(model='grok-4.7', client=client, env={'XAI_API_KEY': 'test-only'}), client

    def test_search_responses_tool_citations_and_usage(self):
        body = {'status': 'completed', 'output': [
            {'type': 'web_search_call', 'status': 'completed'},
            {'type': 'message', 'content': [{'type': 'output_text',
                'text': '{"candidates": []}', 'annotations': [
                    {'type': 'url_citation', 'url': 'https://ssc.gov.in', 'title': 'SSC'}]}]}]}
        provider, client = self.provider(body)
        result = provider.discover_sources(query='notice', system_prompt='official only', response_schema={'type': 'object'})
        self.assertEqual(result['status'], 'ok')
        self.assertEqual(result['citations'][0]['url'], 'https://ssc.gov.in')
        self.assertEqual(result['tool_usage']['web_search_calls'], 1)
        self.assertEqual(client.post.call_args.args[0], 'https://api.x.ai/v1/responses')
        self.assertEqual(client.post.call_args.kwargs['json']['tools'], [{'type': 'web_search'}])
        body['output'][1]['content'][0]['annotations'] = []
        client.post.return_value = httpx.Response(200, json=body)
        self.assertEqual(provider.discover_sources(query='q', system_prompt='s', response_schema={})['citations'], [])
        body['status'] = 'incomplete'
        client.post.return_value = httpx.Response(200, json=body)
        self.assertEqual(provider.discover_sources(query='q', system_prompt='s', response_schema={})['status'], 'unresolved')

    def test_review_vision_and_auth_failure(self):
        body = {'choices': [{'finish_reason': 'stop', 'message': {'content': '{"findings": []}'}}]}
        provider, client = self.provider(body)
        result = provider.recover_pdf_page(image_bytes=b'png', prompt='read', system_prompt='review', response_schema={'type': 'object'})
        self.assertEqual(result['data'], {'findings': []})
        payload = client.post.call_args.kwargs['json']
        self.assertEqual(payload['response_format']['type'], 'json_schema')
        self.assertEqual(payload['messages'][1]['content'][1]['image_url']['url'],
                         'data:image/png;base64,' + base64.b64encode(b'png').decode())
        for status in (401, 403):
            client.post.reset_mock()
            client.post.return_value = httpx.Response(status)
            result = provider.request_json(system_prompt='s', parts=[{'text': 't'}])
            self.assertFalse(result['retryable'])
            self.assertEqual(result['reason'], f'xai_http_{status}')
            client.post.assert_called_once()
        client.post.return_value = httpx.Response(200, json={'choices': []})
        self.assertEqual(provider.request_json(system_prompt='s', parts=[])['status'], 'unresolved')

    def test_real_extraction_entrypoint_and_task_routing(self):
        env = {'LLM_PROVIDER': 'xai', 'LLM_MODEL': 'grok-4.7', 'XAI_API_KEY': 'test-only',
               'SEARCH_PROVIDER': 'xai', 'SEARCH_MODEL': 'search-model',
               'REVIEW_PROVIDER': 'xai', 'REVIEW_MODEL': 'review-model',
               'VISION_PROVIDER': 'xai', 'VISION_MODEL': 'vision-model'}
        client = Mock()
        client.post.return_value = httpx.Response(200, json={'choices': [
            {'finish_reason': 'stop', 'message': {'content': '{"facts": []}'}}]})
        with patch.dict(os.environ, env, clear=True):
            wire, metadata = request_structured({}, {'type': 'object'}, 'extract', client=client)
            self.assertEqual(wire, {'facts': []})
            self.assertEqual(metadata['provider'], 'xai')
            self.assertEqual(client.post.call_args.args[0], 'https://api.x.ai/v1/chat/completions')
            self.assertEqual(client.post.call_args.kwargs['headers']['Authorization'], 'Bearer test-only')
            for purpose in ('search', 'review', 'vision'):
                self.assertEqual(task_provider(purpose).model, purpose + '-model')
            del os.environ['SEARCH_MODEL']
            with self.assertRaises(ValueError):
                task_provider('search')

    def test_recovery_budget_cools_down_and_does_not_touch_publication(self):
        with tempfile.TemporaryDirectory() as root:
            clock = [1000]
            ledger = StageRetries(root, clock=lambda: clock[0])
            for attempt in range(3):
                self.assertTrue(ledger.begin('review_recovery', 'sha'))
                ledger.failure('review_recovery', 'sha', 'unavailable', retryable=True)
                self.assertFalse(ledger.begin('review_recovery', 'sha'))
                clock[0] = ledger.read('review_recovery', 'sha')['next_at']
            self.assertEqual(clock[0], 1000 + 30 + 60 + 86400)
            self.assertTrue(ledger.begin('review_recovery', 'sha'))
            self.assertEqual(ledger.read('review_recovery', 'sha')['attempts'], 1)
            ledger.success('review_recovery', 'sha')
            self.assertFalse(ledger.path('publication', 'sha').exists())
