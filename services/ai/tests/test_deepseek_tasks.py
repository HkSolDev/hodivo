import json
import os
import unittest
from unittest.mock import Mock, patch

import httpx

from providers.deepseek import DeepSeekTaskProvider
from providers.tasks import task_provider
from provider_metrics import track_provider_requests


class DeepSeekTaskTests(unittest.TestCase):
    def provider(self, *, model='deepseek-flash', data=None, search=False):
        client = Mock()
        body = {'status': 'completed', 'output': [
            {'type': 'message', 'content': [{'type': 'output_text',
                'text': json.dumps(data or {'findings': []}), 'annotations': [
                    {'type': 'url_citation', 'url': 'https://ssc.gov.in/notice'}]}]}],
            'usage': {'input_tokens': 10}}
        if search:
            body['output'].insert(0, {'type': 'web_search_call', 'status': 'completed'})
            body['usage']['server_tool_use'] = {'tool_search': 1, 'tool_fetch': 0}
        client.post.return_value = httpx.Response(200, json=body)
        return DeepSeekTaskProvider(model=model, client=client,
            env={'DEEPSEEK_API_KEY': 'test-only'}), client

    def test_task_routing_and_unsupported_models_fail_before_transport(self):
        env = {'DEEPSEEK_API_KEY': 'test-only', 'LLM_MODEL': 'unrelated-extraction',
               'SEARCH_PROVIDER': 'deepseek', 'SEARCH_MODEL': 'deepseek-v4-pro',
               'REVIEW_PROVIDER': 'deepseek', 'REVIEW_MODEL': 'deepseek-flash',
               'VISION_PROVIDER': 'deepseek', 'VISION_MODEL': 'deepseek-flash'}
        with patch.dict(os.environ, env, clear=True):
            for purpose in ('search', 'review', 'vision'):
                self.assertIsInstance(task_provider(purpose), DeepSeekTaskProvider)
                self.assertEqual(task_provider(purpose).model, env[purpose.upper() + '_MODEL'])
            os.environ['SEARCH_MODEL'] = 'deepseek-flash'
            with self.assertRaises(ValueError):
                task_provider('search')
            os.environ['VISION_MODEL'] = 'deepseek-v4-pro'
            with self.assertRaises(ValueError):
                task_provider('vision')
            del os.environ['REVIEW_MODEL']
            with self.assertRaises(ValueError):
                task_provider('review')
        with self.assertRaises(RuntimeError):
            DeepSeekTaskProvider(model='deepseek-flash', env={})

    def test_search_requires_actual_tool_use_and_preserves_citations(self):
        provider, client = self.provider(model='deepseek-v4-pro', data={'source_urls': []}, search=True)
        with track_provider_requests() as metrics:
            result = provider.discover_sources(query='official notice', system_prompt='Research', response_schema={'type': 'object'})
        self.assertEqual(result['status'], 'ok')
        self.assertEqual(result['citations'][0]['url'], 'https://ssc.gov.in/notice')
        self.assertEqual(result['tool_usage']['tool_search'], 1)
        self.assertEqual(client.post.call_args.args[0], 'https://api.deepseek.com/v1/responses')
        self.assertEqual(client.post.call_args.kwargs['json']['tools'], [{'type': 'web_search'}])
        self.assertEqual(metrics['attempted'], 1)
        provider, _ = self.provider(model='deepseek-v4-pro')
        self.assertEqual(provider.discover_sources(query='q', system_prompt='s', response_schema={})['reason'],
                         'deepseek_search_not_executed')
        provider, client = self.provider()
        with self.assertRaises(ValueError):
            provider.discover_sources(query='q', system_prompt='s', response_schema={})
        client.post.assert_not_called()

    def test_review_schema_and_image_payload(self):
        provider, client = self.provider()
        schema = {'type': 'object', 'properties': {'findings': {'type': 'array', 'items': {'type': 'string'}}}}
        before = json.dumps(schema)
        self.assertEqual(provider.request_json(system_prompt='review', parts=[{'text': 'evidence'}], response_schema=schema)['data'], {'findings': []})
        self.assertEqual(client.post.call_args.kwargs['json']['text']['format']['type'], 'json_schema')
        self.assertEqual(json.dumps(schema), before)
        provider.recover_pdf_page(image_bytes=b'png', prompt='read', system_prompt='recover', response_schema=schema)
        self.assertEqual(client.post.call_args.kwargs['json']['input'][0]['content'][1],
                         {'type': 'input_image', 'image_url': 'data:image/png;base64,cG5n'})

    def test_planner_returns_reads_for_existing_validator(self):
        read = {'document_url': 'https://ssc.gov.in/notice.pdf', 'fields': ['min_age']}
        provider, _ = self.provider(data={'missing_fields': ['min_age'], 'read_requests': [read]})
        result = provider.assess_notice_evidence({'known_urls': [read['document_url']]})
        self.assertEqual(result['function_calls'], [{'name': 'read_notice', 'args': read}])

    def test_errors_refusal_and_invalid_json_never_pass(self):
        provider, client = self.provider()
        for status in (401, 404, 429, 503):
            client.post.return_value = httpx.Response(status)
            result = provider.request_json(system_prompt='s', parts=[])
            self.assertEqual(result['reason'], f'deepseek_http_{status}')
            self.assertEqual(result['retryable'], status in (429, 503))
        client.post.side_effect = httpx.ConnectError('private transport detail')
        result = provider.request_json(system_prompt='s', parts=[])
        self.assertTrue(result['retryable'])
        self.assertNotIn('private', str(result))
        client.post.side_effect = None
        for body in ({'status': 'incomplete'}, {'status': 'completed', 'output': []},
                     {'status': 'completed', 'output': [{'type': 'message', 'content': [{'type': 'refusal'}]}]}):
            client.post.return_value = httpx.Response(200, json=body)
            self.assertEqual(provider.request_json(system_prompt='s', parts=[])['status'], 'unresolved')
