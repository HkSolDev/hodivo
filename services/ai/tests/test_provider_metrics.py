import unittest
from unittest.mock import Mock, patch
import httpx

from extract_bundle import request_structured
from provider_metrics import track_provider_requests
from provider_schedule import ProviderDeferred


class ProviderMetricsTests(unittest.TestCase):
    def test_shared_request_cap_blocks_transport_and_restores_context(self):
        from provider_metrics import provider_post, provider_budget_exhausted, ProviderRequestLimit
        client = Mock()
        client.post.return_value = httpx.Response(200)
        with track_provider_requests(max_attempts=2) as counts:
            provider_post(client, 'https://provider.invalid')
            client.post.side_effect = httpx.ReadTimeout('fixture')
            with self.assertRaises(httpx.ReadTimeout):
                provider_post(client, 'https://provider.invalid')
            with self.assertRaises(ProviderRequestLimit) as error:
                provider_post(client, 'https://provider.invalid')
            self.assertTrue(error.exception.retryable)
            self.assertTrue(provider_budget_exhausted())
        self.assertEqual(client.post.call_count, 2)
        self.assertEqual(counts, {'attempted': 2, 'succeeded': 1, 'failed': 1})
        self.assertFalse(provider_budget_exhausted())
        client.post.side_effect = None
        with track_provider_requests(max_attempts=2):
            provider_post(client, 'https://provider.invalid')
        for invalid in (0, -1, True, 1.5):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                with track_provider_requests(max_attempts=invalid):
                    pass

    def test_missing_credentials_do_not_count_a_request(self):
        with track_provider_requests() as counts:
            with patch('extract_bundle.provider_keys', return_value=[]), patch('extract_bundle.provider_off_peak_delay', return_value=0):
                with self.assertRaisesRegex(RuntimeError, 'provider_credential_unavailable'):
                    request_structured({}, {}, '', provider='deepseek')
        self.assertEqual(counts, {'attempted': 0, 'succeeded': 0, 'failed': 0})

    def test_off_peak_deferral_does_not_count_a_request(self):
        with track_provider_requests() as counts:
            with patch('extract_bundle.provider_off_peak_delay', return_value=60):
                with self.assertRaises(ProviderDeferred):
                    request_structured({}, {}, '', provider='deepseek')
        self.assertEqual(counts['attempted'], 0)

    def test_successful_http_with_invalid_json_still_counts_http_success(self):
        client = Mock()
        client.post.return_value = httpx.Response(200, json={'choices': [{'finish_reason': 'stop', 'message': {'content': 'invalid json'}}]})
        with track_provider_requests() as counts:
            with patch('extract_bundle.provider_keys', return_value=['fixture']), patch('extract_bundle.provider_off_peak_delay', return_value=0):
                with self.assertRaisesRegex(RuntimeError, 'provider_json_invalid'):
                    request_structured({}, {}, '', provider='deepseek', client=client)
        self.assertEqual(counts, {'attempted': 1, 'succeeded': 1, 'failed': 0})

    def test_transport_failure_counts_one_attempt(self):
        client = Mock()
        client.post.side_effect = httpx.ConnectError('fixture')
        with track_provider_requests() as counts:
            with patch('extract_bundle.provider_keys', return_value=['fixture']), patch('extract_bundle.provider_off_peak_delay', return_value=0):
                with self.assertRaises(RuntimeError):
                    request_structured({}, {}, '', provider='deepseek', client=client)
        self.assertEqual(counts, {'attempted': 1, 'succeeded': 0, 'failed': 1})

    def test_pipeline_reports_preflight_failure_without_http_requests(self):
        import json
        from pathlib import Path
        from tempfile import TemporaryDirectory
        from generic_pipeline import run_pipeline
        from test_worker_recovery_and_reporting import WorkerRecoveryAndReportingTests
        with TemporaryDirectory() as directory:
            root = Path(directory)
            prepared = WorkerRecoveryAndReportingTests()._sample_prepared_bundle()
            path = root / 'fixture.prepared.json'
            path.write_text(json.dumps(prepared))
            sources = [{'source': 'fixture', 'status': 'prepared_for_review',
                        'prepared_inputs': 1, 'prepared_paths': [str(path)]}]
            def extract(_):
                return request_structured({}, {}, '', provider='deepseek')
            with patch('extract_bundle.provider_keys', return_value=[]), patch('extract_bundle.provider_off_peak_delay', return_value=0):
                report = run_pipeline(root, prepare=lambda *args, **kwargs: sources, extract=extract)
            self.assertEqual(report['summary']['provider_requests'],
                             {'attempted': 0, 'succeeded': 0, 'failed': 0})
            self.assertEqual(report['summary']['extractions']['failed'], 1)

    def test_pipeline_counts_evidence_and_review_requests_including_failures(self):
        import json
        from pathlib import Path
        from tempfile import TemporaryDirectory
        from generic_pipeline import run_pipeline
        from provider_metrics import provider_post
        from test_worker_recovery_and_reporting import WorkerRecoveryAndReportingTests
        for stage in ('evidence', 'review'):
            with self.subTest(stage=stage), TemporaryDirectory() as directory:
                root = Path(directory)
                prepared = WorkerRecoveryAndReportingTests()._sample_prepared_bundle()
                path = root / 'fixture.prepared.json'
                path.write_text(json.dumps(prepared))
                source_input = prepared['llm_input']['input']
                sources = [{'source': 'fixture', 'status': 'prepared_for_review',
                            'prepared_inputs': 1, 'prepared_paths': [str(path)]}]
                client = Mock()
                client.post.return_value = httpx.Response(200)
                prepare_identity = []
                def evidence(*args, **kwargs):
                    prepare_identity.append(kwargs['model_identity'])
                    provider_post(client, 'https://provider.invalid')
                    provider_post(client, 'https://provider.invalid')
                    return {'status': 'waiting', 'reason': 'evidence_provider_retry_wait'}
                def review(*args, **kwargs):
                    provider_post(client, 'https://provider.invalid')
                    client.post.side_effect = httpx.ConnectError('fixture')
                    try:
                        provider_post(client, 'https://provider.invalid')
                    except httpx.ConnectError as error:
                        raise RuntimeError('provider_network_failed') from error
                with patch('generic_pipeline._load_bundles_for_source', return_value={
                        source_input['bundle_id']: source_input}), patch(
                        'html_first_checkpoint.prepare_html_first', side_effect=evidence), patch(
                        'generic_pipeline.review_and_repair', side_effect=review), patch(
                        'generic_pipeline.task_provider', return_value=type('FixtureSearchProvider', (), {
                            'model': 'fixture-model', 'assess_notice_evidence': lambda self, value: {}})()):
                    report = run_pipeline(root, prepare=lambda *args, **kwargs: sources,
                        extract=lambda _: {'bundle_id': source_input['bundle_id'],
                                           'facts': {'purpose': 'recruitment'}},
                        issuer_hosts={'Example Board': ['example.gov.in']}, html_first=(stage == 'evidence'), evidence_assessor=None,
                        evidence_discover=lambda _: {}, max_provider_requests_per_notice=1)
                if stage == 'evidence':
                    self.assertEqual(prepare_identity[0],
                        {'provider': 'FixtureSearchProvider', 'model': 'fixture-model'})
                    self.assertIn('provider_request_budget_exhausted',
                        report['sources']['fixture']['blocked_reasons'])
                expected = ({'attempted': 1, 'succeeded': 1, 'failed': 0} if stage == 'evidence'
                            else {'attempted': 2, 'succeeded': 1, 'failed': 1})
                self.assertEqual(report['summary']['provider_requests'], expected)

    def test_task_adapters_count_key_rotation_and_transport_failures(self):
        from providers.gemini import GeminiProvider
        from providers.xai import XaiProvider
        client = Mock()
        client.post.side_effect = [httpx.Response(429, json={}), httpx.Response(200,
            json={'candidates': [{'content': {'parts': [{'text': '{}'}]}, 'finishReason': 'STOP'}]})]
        gemini = GeminiProvider(keys=['fixture-a', 'fixture-b'], client=client)
        with track_provider_requests() as counts:
            result = gemini.request_json(system_prompt='fixture', parts=[{'text': 'fixture'}])
        self.assertEqual(result['status'], 'ok')
        self.assertEqual(counts, {'attempted': 2, 'succeeded': 1, 'failed': 1})
        for provider in (gemini, XaiProvider(model='fixture-model', client=client,
                                           env={'XAI_API_KEY': 'fixture'})):
            for error_type in (httpx.ConnectError, httpx.ReadError, httpx.ReadTimeout,
                               httpx.WriteTimeout, httpx.PoolTimeout, httpx.LocalProtocolError):
                with self.subTest(provider=type(provider).__name__, error=error_type.__name__):
                    client.post.side_effect = error_type('fixture')
                    with track_provider_requests() as counts:
                        result = provider.request_json(system_prompt='fixture', parts=[{'text': 'fixture'}])
                    self.assertEqual(result['retryable'], error_type is not httpx.LocalProtocolError)
                    self.assertEqual(counts, {'attempted': 1, 'succeeded': 0, 'failed': 1})
        from provider_metrics import ProviderRequestLimit
        client.post.reset_mock()
        client.post.side_effect = None
        client.post.return_value = httpx.Response(429, json={})
        with track_provider_requests(max_attempts=1) as counts:
            with self.assertRaises(ProviderRequestLimit):
                gemini.request_json(system_prompt='fixture', parts=[{'text': 'fixture'}])
        self.assertEqual(client.post.call_count, 1)
        self.assertEqual(counts, {'attempted': 1, 'succeeded': 0, 'failed': 1})
        client.post.return_value = httpx.Response(200, json={'choices': [
            {'finish_reason': 'stop', 'message': {'content': '{}'}}]})
        with track_provider_requests() as counts:
            result = provider.request_json(system_prompt='fixture', parts=[{'text': 'fixture'}])
        self.assertEqual(result['status'], 'ok')
        self.assertEqual(counts, {'attempted': 1, 'succeeded': 1, 'failed': 0})
