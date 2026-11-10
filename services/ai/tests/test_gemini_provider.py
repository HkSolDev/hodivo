import json
import os
import unittest
from unittest.mock import Mock, patch

import httpx

from extract_bundle import provider_keys
from providers.gemini import (
    GeminiProvider,
    gemini_api_key,
    gemini_api_keys,
    gemini_purpose_model,
)


class GeminiProviderTests(unittest.TestCase):
    def test_numbered_key_is_supported_without_exposing_it(self):
        with patch.dict(os.environ, {'GEMINI_API_KEY_1': 'illustrative-key'}, clear=True):
            self.assertEqual(gemini_api_key(), 'illustrative-key')

    def test_missing_key_fails_closed(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(RuntimeError, 'provider_credential_unavailable'):
                gemini_api_key()

    def test_gemini_api_keys_trims_orders_and_deduplicates_across_env_vars(self):
        env = {
            'GEMINI_API_KEYS': ' key-a , key-b , , key-a ',
            'GEMINI_API_KEY': 'key-b, key-c ',
            'GEMINI_API_KEY_2': 'key-e',
            'GEMINI_API_KEY_1': 'key-c, key-d',
        }
        with patch.dict(os.environ, env, clear=True):
            self.assertEqual(gemini_api_keys(), ['key-a', 'key-b', 'key-c', 'key-d', 'key-e'])
            self.assertEqual(provider_keys('gemini'), ['key-a', 'key-b', 'key-c', 'key-d', 'key-e'])

    def test_seven_comma_separated_pool_trims_deduplicates_and_selects_first(self):
        env = {'GEMINI_API_KEYS': (
            ' key-1 , key-2 , , key-3 , key-2 ,   , key-4 , key-1 , key-5 ')}
        with patch.dict(os.environ, env, clear=True):
            self.assertEqual(gemini_api_keys(), ['key-1', 'key-2', 'key-3', 'key-4', 'key-5'])
            self.assertEqual(gemini_api_key(), 'key-1')

    def test_429_resource_exhausted_rotates_once_per_key_without_logging_keys(self):
        r429 = httpx.Response(429, json={'error': {'status': 'RESOURCE_EXHAUSTED'}})
        r200 = httpx.Response(200, json={
            'candidates': [{'finishReason': 'STOP', 'content': {'parts': [{'text': '{"ok": true}'}]}}],
            'usageMetadata': {'totalTokenCount': 12},
        })
        client = Mock()
        client.post.side_effect = [r429, r200]
        provider = GeminiProvider(keys=['secret-key-1', 'secret-key-2', 'secret-key-3'], client=client)
        result = provider.request_json(
            system_prompt='Return JSON',
            parts=[{'text': 'hello'}],
            response_schema={'type': 'object'},
        )
        self.assertEqual(result['status'], 'ok')
        self.assertEqual(result['data'], {'ok': True})
        self.assertEqual(result['attempt_count'], 2)
        self.assertEqual(result['used_key_index'], 2)
        self.assertEqual(client.post.call_count, 2)
        serialized = json.dumps(result)
        self.assertNotIn('secret-key-1', serialized)
        self.assertNotIn('secret-key-2', serialized)

    def test_non_429_errors_and_invalid_json_do_not_rotate(self):
        for status in (400, 401, 403, 500):
            client = Mock()
            client.post.return_value = httpx.Response(
                status, json={'error': {'status': 'INVALID_ARGUMENT'}}
            )
            provider = GeminiProvider(keys=['secret-key-1', 'secret-key-2'], client=client)
            result = provider.request_json(
                system_prompt='Return JSON',
                parts=[{'text': 'hello'}],
            )
            self.assertEqual(result['status'], 'unresolved')
            self.assertEqual(result['reason'], f'gemini_http_{status}')
            self.assertEqual(result['attempt_count'], 1)
            self.assertEqual(client.post.call_count, 1)

        bad_json_client = Mock()
        bad_json_client.post.return_value = httpx.Response(200, json={
            'candidates': [{'finishReason': 'STOP', 'content': {'parts': [{'text': '{not-json'}]}}],
        })
        provider = GeminiProvider(keys=['secret-key-1', 'secret-key-2'], client=bad_json_client)
        bad_json_result = provider.request_json(
            system_prompt='Return JSON',
            parts=[{'text': 'hello'}],
        )
        self.assertEqual(bad_json_result['status'], 'unresolved')
        self.assertFalse(bad_json_result['retryable'])
        self.assertEqual(bad_json_result['reason'], 'gemini_json_invalid')
        self.assertEqual(bad_json_client.post.call_count, 1)

    def test_exhausted_key_pool_stops_safely_with_retryable_unresolved_result(self):
        client = Mock()
        client.post.return_value = httpx.Response(
            429, json={'error': {'status': 'RESOURCE_EXHAUSTED'}}
        )
        provider = GeminiProvider(keys=['secret-key-1', 'secret-key-2', 'secret-key-3'], client=client)
        result = provider.request_json(
            system_prompt='Return JSON',
            parts=[{'text': 'hello'}],
        )
        self.assertEqual(result['status'], 'unresolved')
        self.assertTrue(result['retryable'])
        self.assertEqual(result['reason'], 'gemini_quota_exhausted')
        self.assertIsNone(result['data'])
        self.assertEqual(result['attempt_count'], 3)
        self.assertEqual(client.post.call_count, 3)

    def test_purpose_models_never_inherit_shared_llm_model(self):
        with patch.dict(os.environ, {'LLM_MODEL': 'deepseek-flash'}, clear=True):
            for purpose, override_env in (
                    ('search', 'GEMINI_SEARCH_MODEL'), ('review', 'GEMINI_REVIEW_MODEL'),
                    ('vision', 'GEMINI_VISION_MODEL')):
                self.assertEqual(gemini_purpose_model(purpose), 'gemini-3.8-flash')
                with patch.dict(os.environ, {override_env: f'gemini-special-{purpose}'}):
                    self.assertEqual(gemini_purpose_model(purpose), f'gemini-special-{purpose}')
                self.assertEqual(gemini_purpose_model(purpose), 'gemini-3.8-flash')

    def test_request_json_uses_the_configured_purpose_model(self):
        client = Mock()
        client.post.return_value = httpx.Response(200, json={
            'candidates': [{'finishReason': 'STOP', 'content': {'parts': [{'text': '{"ok": true}'}]}}],
        })
        with patch.dict(os.environ, {'GEMINI_REVIEW_MODEL': 'configured-review-model'}, clear=True):
            provider = GeminiProvider(
                keys=['secret-key-1'], model=gemini_purpose_model('review'), client=client)
        provider.request_json(system_prompt='Return JSON', parts=[{'text': 'hello'}])
        url = client.post.call_args.args[0]
        self.assertIn('/models/configured-review-model:generateContent', url)
        self.assertNotIn('gemini-2.5-flash-lite', url)

    def test_invalid_purpose_model_name_fails_loudly(self):
        with patch.dict(os.environ, {
            'GEMINI_SEARCH_MODEL': 'bad model/name',
            'LLM_MODEL': 'deepseek-flash',
        }, clear=True):
            with self.assertRaisesRegex(ValueError, 'Invalid Gemini model name'):
                gemini_purpose_model('search')
            with self.assertRaisesRegex(ValueError, 'Unknown Gemini model purpose'):
                gemini_purpose_model('extraction')


class GeminiGroundedSearchTests(unittest.TestCase):
    def response(self, text, grounding=None, finish='STOP'):
        candidate = {'finishReason': finish, 'content': {'parts': [{'text': text}]}}
        if grounding is not None:
            candidate['groundingMetadata'] = grounding
        return httpx.Response(200, json={'candidates': [candidate],
                                        'usageMetadata': {'totalTokenCount': 10}})

    def test_search_then_schema_preserves_grounding_and_numeric_candidate(self):
        metadata = {'webSearchQueries': ['SSC JE age'], 'groundingChunks': [
            {'web': {'uri': 'https://ssc.gov.in/notice.pdf', 'title': 'SSC'}}]}
        client = Mock()
        client.post.side_effect = [self.response('Official notice says maximum age 30.', metadata),
            self.response('{"candidates": [{"value": 30}]}')]
        provider = GeminiProvider(keys=['test-only'], model='gemini-2.5-flash', client=client)
        schema = {'type': 'object', 'properties': {'candidates': {'type': 'array'}}}
        result = provider.discover_sources(query='SSC JE age', system_prompt='Official evidence only',
                                           response_schema=schema)
        self.assertEqual(result['status'], 'ok')
        self.assertEqual(result['data']['candidates'][0]['value'], 30)
        first, second = [call.kwargs['json'] for call in client.post.call_args_list]
        self.assertEqual(first['tools'], [{'google_search': {}}])
        self.assertNotIn('responseMimeType', first.get('generationConfig', {}))
        self.assertNotIn('responseJsonSchema', first.get('generationConfig', {}))
        self.assertNotIn('tools', second)
        self.assertEqual(second['generationConfig']['responseJsonSchema'], schema)
        self.assertIn('maximum age 30', second['contents'][0]['parts'][0]['text'])
        self.assertEqual(result['grounding_metadata'], metadata)
        self.assertEqual(result['stage_usage']['search']['totalTokenCount'], 10)
        self.assertEqual(result['stage_usage']['structure']['totalTokenCount'], 10)
        self.assertEqual(result['attempt_count'], 2)

    def test_missing_grounding_or_empty_text_skips_second_call(self):
        for text, metadata in [('Answer without sources', None), ('', {'groundingChunks': [{}]})]:
            client = Mock()
            client.post.return_value = self.response(text, metadata)
            result = GeminiProvider(keys=['test-only'], client=client).discover_sources(
                query='q', system_prompt='s', response_schema={})
            self.assertEqual(result['status'], 'unresolved')
            self.assertEqual(result['reason'], 'gemini_search_ungrounded')
            self.assertEqual(client.post.call_count, 1)

    def test_search_failure_does_not_generate_and_structure_failure_retains_evidence(self):
        client = Mock()
        provider = GeminiProvider(keys=['test-only'], client=client)
        client.post.return_value = httpx.Response(503)
        self.assertEqual(provider.discover_sources(query='q', system_prompt='s', response_schema={})['reason'], 'gemini_http_503')
        self.assertEqual(client.post.call_count, 1)
        metadata = {'groundingChunks': [{'web': {'uri': 'https://ssc.gov.in'}}]}
        client.post.reset_mock()
        client.post.side_effect = [self.response('notice', metadata), self.response('invalid JSON')]
        result = provider.discover_sources(query='q', system_prompt='s', response_schema={})
        self.assertEqual(result['status'], 'unresolved')
        self.assertEqual(result['reason'], 'gemini_json_invalid')
        self.assertEqual(result['grounding_metadata'], metadata)
        self.assertEqual(client.post.call_count, 2)

    def test_quota_rotation_is_bounded_in_both_stages(self):
        client = Mock()
        metadata = {'groundingChunks': [{'web': {'uri': 'https://ssc.gov.in'}}]}
        client.post.side_effect = [httpx.Response(429), self.response('notice', metadata),
                                  httpx.Response(429), self.response('{"candidates": []}')]
        result = GeminiProvider(keys=['secret-a', 'secret-b'], client=client).discover_sources(
            query='q', system_prompt='s', response_schema={})
        self.assertEqual(result['status'], 'ok')
        self.assertEqual(result['attempt_count'], 4)
        self.assertEqual(client.post.call_count, 4)
        self.assertNotIn('secret-a', json.dumps(result))
        self.assertNotIn('secret-b', json.dumps(result))


if __name__ == '__main__':
    unittest.main()
