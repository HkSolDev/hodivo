import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from html_first_evidence import recover_html_first_evidence
from normalize_html import normalize_html
from verify_bundle import verify_bundles

HOSTS = {'Example Board': ['example.gov.in']}
BASE = 'https://example.gov.in'
HTML = ('<h1>Engineer Recruitment Notice</h1><p>Issuer: Example Board</p>'
        '<p>Campaign: Engineers</p><p>Advertisement No: EB/01/2026</p>'
        '<p>Post: Engineer</p><p>Last date: 30 November 2026</p>')


def bundle():
    url = BASE + '/notice'
    content = normalize_html((HTML + '<a href="/notice.pdf">Recruitment PDF</a>').encode(),
                             url, include_link_context=True)
    doc = {'document_id': 'html', 'source_url': url, 'format': 'html', 'content': content}
    return verify_bundles([doc], issuer_hosts=HOSTS)['bundles'][0]


def assessment(calls=None, missing=None):
    return {'status': 'ok', 'data': json.dumps({'missing_fields': missing or []}),
            'function_calls': calls or []}


def pdf_call(url=BASE + '/notice.pdf'):
    return {'name': 'read_notice', 'args': {'document_url': url, 'fields': ['min_age']}}


class HtmlFirstEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.process = Mock(return_value=(None, 'pdf_requires_review', False))
        self.search = Mock(return_value={'data': {'source_urls': [BASE + '/official']}})

    def recover(self, assess):
        return recover_html_first_evidence(bundle(), self.root, assess=assess,
            discover=self.search, process=self.process, issuer_hosts=HOSTS)

    def captured(self, html=HTML):
        url = BASE + '/official'
        path = self.root / 'official.json'
        path.write_text(json.dumps(normalize_html(html.encode(), url, include_link_context=True)))
        return {'final_url': url, 'document_kind': 'html', 'content_path': str(path)}, None, False

    def test_complete_html_reads_no_pdf_and_does_no_research(self):
        result = self.recover(Mock(return_value=assessment()))
        self.process.assert_not_called()
        self.search.assert_not_called()
        self.assertEqual(result['bundle'], bundle())

    def test_pdf_failure_continues_to_research_preserving_html(self):
        self.process.side_effect = [(None, 'pdf_requires_review', False), self.captured()]
        assess = Mock(side_effect=[assessment([pdf_call()]), assessment(missing=['min_age'])])
        result = self.recover(assess)
        self.assertEqual(result['tools'][0]['status'], 'pdf_requires_review')
        self.assertTrue(result['search_called'])
        self.assertEqual(result['research'][0]['status'], 'captured')
        self.assertEqual(len(result['bundle']['documents']), 2)
        self.assertEqual(result['bundle']['documents'][0], bundle()['documents'][0])
        request = self.search.call_args.args[0]
        self.assertIn('Research this exact Indian', request['prompt'])
        self.assertIn('EB/01/2026', request['prompt'])
        self.assertEqual(assess.call_args_list[1].args[0]['known_urls'], [])

    def test_repeated_calls_are_bounded_and_deduplicated(self):
        self.search.return_value = {'data': {'source_urls': [BASE + '/notice.pdf'] * 10}}
        result = self.recover(Mock(side_effect=[
            assessment([pdf_call()] * 8), assessment(missing=['min_age'])]))
        self.assertEqual(self.process.call_count, 1)
        self.assertEqual(result['tools'][1]['status'], 'already_read')
        self.assertEqual(result['research'][0]['status'], 'already_read')

    def test_unofficial_and_different_notice_sources_are_rejected(self):
        self.search.return_value = {'data': {'source_urls': ['https://portal.example/job', BASE + '/official']}}
        self.process.return_value = self.captured(HTML.replace('EB/01/2026', 'EB/02/2026'))
        result = self.recover(Mock(return_value=assessment(missing=['min_age'])))
        self.assertEqual([item['status'] for item in result['research']],
                         ['unofficial_source', 'identity_mismatch'])
        self.assertEqual(len(result['bundle']['documents']), 1)
        self.assertEqual(self.process.call_count, 1)

    def test_provider_and_capture_errors_preserve_progress(self):
        self.process.side_effect = ValueError('untrusted exception')
        result = self.recover(Mock(return_value={'status': 'unresolved', 'data': 'broken'}))
        self.assertTrue(result['search_called'])
        self.assertEqual(result['research'][0]['status'], 'document_processing_failed')
        self.assertEqual(result['bundle'], bundle())
        self.assertNotIn('untrusted exception', json.dumps(result))

    def test_linked_unreadable_pdf_recovers_before_identity_acceptance(self):
        from vision_recovery import is_bundle_identity_verified_for_vision
        path = self.root / 'scan.json'
        path.write_text(json.dumps({'format': 'pdf', 'sections': [],
                                   'pages': [{'number': 1, 'native_status': 'no_native_text'}]}))
        self.process.return_value = ({'final_url': BASE + '/notice.pdf',
            'document_kind': 'pdf', 'content_path': str(path)}, None, False)
        for advertisement, expected in [('EB/01/2026', 'captured'),
                                         ('EB/02/2026', 'identity_mismatch')]:
            with self.subTest(advertisement=advertisement):
                def vision(source):
                    document = source['documents'][-1]
                    self.assertTrue(is_bundle_identity_verified_for_vision(source, document)[0])
                    document['content']['sections'] = [{'text':
                        'Recruitment Notice\nIssuer: Example Board\nAdvertisement No: ' + advertisement,
                        'evidence': [{'page': 1}]}]
                    return {'bundle': source}
                recover = Mock(side_effect=vision)
                assess = Mock(side_effect=[assessment([pdf_call()]), assessment()])
                result = recover_html_first_evidence(bundle(), self.root, assess=assess,
                    discover=self.search, process=self.process, issuer_hosts=HOSTS,
                    recover_vision=recover)
                self.assertEqual(result['tools'][0]['status'], expected)
                recover.assert_called_once()
                self.assertEqual(len(result['bundle']['documents']), 2 if expected == 'captured' else 1)
                self.assertEqual(result['bundle']['documents'][0], bundle()['documents'][0])

    def test_unreadable_pdf_vision_failure_continues_to_research(self):
        path = self.root / 'scan.json'
        path.write_text(json.dumps({'sections': [],
            'pages': [{'number': 1, 'native_status': 'no_native_text'}]}))
        self.process.return_value = ({'final_url': BASE + '/notice.pdf',
            'document_kind': 'pdf', 'content_path': str(path)}, None, False)
        recover = Mock(side_effect=TimeoutError())
        self.search.return_value = {'data': {'source_urls': []}}
        result = recover_html_first_evidence(bundle(), self.root,
            assess=Mock(side_effect=[assessment([pdf_call()]), assessment(missing=['min_age'])]),
            discover=self.search, process=self.process, issuer_hosts=HOSTS, recover_vision=recover)
        self.assertEqual(result['tools'][0]['status'], 'document_vision_failed')
        self.assertTrue(result['search_called'])
        self.assertEqual(result['bundle'], bundle())

    def test_saved_legacy_font_mirror_does_not_gain_official_status(self):
        source = json.loads((Path(__file__).parent / 'fixtures' / 'headmaster-native-pages.json').read_text())
        self.search.return_value = {'data': {'source_urls': [source['source_url']]}}
        recover = Mock()
        result = recover_html_first_evidence(bundle(), self.root,
            assess=Mock(return_value=assessment(missing=['min_age'])), discover=self.search,
            process=self.process, issuer_hosts=HOSTS, recover_vision=recover)
        self.assertEqual(result['research'][0]['status'], 'unofficial_source')
        self.process.assert_not_called()
        recover.assert_not_called()
        self.assertEqual(result['bundle'], bundle())

    def test_missing_identity_calls_no_providers(self):
        source = bundle()
        source['identity']['issuer'] = None
        assess = Mock()
        result = recover_html_first_evidence(source, self.root, assess=assess,
            discover=self.search, process=self.process, issuer_hosts=HOSTS)
        assess.assert_not_called()
        self.search.assert_not_called()
        self.assertEqual(result['bundle'], source)


class HtmlFirstCheckpointTests(unittest.TestCase):
    setUp = HtmlFirstEvidenceTests.setUp
    def test_saved_evidence_reuses_work_and_corruption_never_repeats_paid_calls(self):
        from html_first_checkpoint import prepare_html_first
        assess = Mock(return_value=assessment())
        root = self.root / 'checkpoint'
        options = dict(issuer_hosts=HOSTS, assess=assess, discover=self.search,
                       process=self.process)
        first = prepare_html_first(bundle(), root, **options)
        second = prepare_html_first(bundle(), root, **options)
        self.assertFalse(first['reused'])
        self.assertTrue(second['reused'])
        self.assertEqual(assess.call_count, 1)
        response = next(root.glob('state/stages/evidence/*.response.json'))
        response.write_text('{}')
        third = prepare_html_first(bundle(), root, **options)
        self.assertEqual(third['status'], 'waiting')
        self.assertEqual(assess.call_count, 1)

    def test_changed_html_starts_a_new_evidence_version(self):
        from html_first_checkpoint import prepare_html_first
        assess = Mock(return_value=assessment())
        options = dict(issuer_hosts=HOSTS, assess=assess, discover=self.search)
        source = bundle()
        prepare_html_first(source, self.root, **options)
        source['documents'][0]['content']['blocks'][0]['text'] += ' Amendment'
        prepare_html_first(source, self.root, **options)
        self.assertEqual(assess.call_count, 2)

    def test_transient_research_retry_preserves_completed_assessment(self):
        from html_first_checkpoint import prepare_html_first
        assess = Mock(return_value=assessment(missing=['min_age']))
        search = Mock(side_effect=[TimeoutError(), {'data': {'source_urls': []}}])
        clock = [1000.0]
        options = dict(issuer_hosts=HOSTS, assess=assess, discover=search,
                       clock=lambda: clock[0])
        first = prepare_html_first(bundle(), self.root, **options)
        self.assertEqual(first['status'], 'waiting')
        second = prepare_html_first(bundle(), self.root, **options)
        self.assertEqual(second['status'], 'waiting')
        self.assertEqual(search.call_count, 1)
        clock[0] += 1000
        third = prepare_html_first(bundle(), self.root, **options)
        self.assertEqual(third['status'], 'prepared')
        self.assertEqual(assess.call_count, 1)
        self.assertEqual(search.call_count, 2)

    def test_vision_model_change_reuses_completed_search_work(self):
        from html_first_checkpoint import prepare_html_first
        assess = Mock(return_value=assessment())
        vision = Mock()
        options = dict(issuer_hosts=HOSTS, assess=assess, discover=self.search,
                       model_identity='search-model', recover_vision=vision)
        # Exercise the checkpoint boundary independently of PDF quality/identity.
        def recover(source, root, *, assess, recover_vision, **kwargs):
            assess({'identity': source['identity']})
            recover_vision(source)
            return {'bundle': source}
        vision.return_value = {'bundle': bundle()}
        with patch('html_first_checkpoint.recover_html_first_evidence', side_effect=recover):
            first = prepare_html_first(bundle(), self.root, vision_model_identity='vision-a', **options)
            same = prepare_html_first(bundle(), self.root, vision_model_identity='vision-a', **options)
            changed = prepare_html_first(bundle(), self.root, vision_model_identity='vision-b', **options)
        self.assertFalse(first['reused'])
        self.assertTrue(same['reused'])
        self.assertFalse(changed['reused'])
        self.assertEqual(assess.call_count, 1)
        self.assertEqual(vision.call_count, 2)

    def test_search_provider_identity_scopes_saved_evidence(self):
        from html_first_checkpoint import prepare_html_first
        assess = Mock(return_value=assessment())
        options = dict(issuer_hosts=HOSTS, assess=assess, discover=self.search)
        first_identity = {'provider': 'GeminiProvider', 'model': 'same-model'}
        first = prepare_html_first(bundle(), self.root, model_identity=first_identity, **options)
        same = prepare_html_first(bundle(), self.root, model_identity=first_identity, **options)
        changed = prepare_html_first(bundle(), self.root,
            model_identity={'provider': 'XaiProvider', 'model': 'same-model'}, **options)
        self.assertFalse(first['reused'])
        self.assertTrue(same['reused'])
        self.assertFalse(changed['reused'])
        self.assertEqual(assess.call_count, 2)

    def test_request_cap_waits_and_resumes_without_repeating_assessment(self):
        import httpx
        from html_first_checkpoint import prepare_html_first
        from provider_metrics import provider_post, track_provider_requests
        client = Mock()
        client.post.return_value = httpx.Response(200)
        def assess(request):
            provider_post(client, 'https://provider.invalid')
            return assessment(missing=['min_age'])
        def discover(request):
            provider_post(client, 'https://provider.invalid')
            return {'data': {'source_urls': []}}
        assessor = Mock(side_effect=assess)
        clock = [1000.0]
        options = dict(issuer_hosts=HOSTS, assess=assessor, discover=discover,
                       clock=lambda: clock[0])
        with track_provider_requests(max_attempts=1):
            first = prepare_html_first(bundle(), self.root, **options)
        self.assertEqual(first['status'], 'waiting')
        with track_provider_requests(max_attempts=1):
            second = prepare_html_first(bundle(), self.root, **options)
        self.assertEqual(second['status'], 'waiting')
        self.assertEqual(client.post.call_count, 1)
        clock[0] += 1000
        with track_provider_requests(max_attempts=1):
            third = prepare_html_first(bundle(), self.root, **options)
        self.assertEqual(third['status'], 'prepared')
        self.assertEqual(assessor.call_count, 1)
        self.assertEqual(client.post.call_count, 2)
