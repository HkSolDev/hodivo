import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock

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
