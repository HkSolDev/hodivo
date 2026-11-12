"""Portal hints can start research; only independently captured matching notices replace evidence."""

import copy
import unittest
from unittest.mock import Mock, patch

from normalize_html import normalize_html
from notice_discovery import recover_official_notice
from autonomous_pipeline import review_and_repair

URL = 'https://board.example.gov.in/engineer-2026'
HTML = ('<h1>Engineer Recruitment Notice</h1><p>Issuer: Example Board</p>'
        '<p>Post: Engineer</p><p>Application last date: 2026-11-25</p>'
        '<p>Qualifications: Bachelor degree in engineering. Vacancies: 10.</p>'
        '<p>Age limit: 18 to 35 years.</p>')


class NoticeDiscoveryTests(unittest.TestCase):
    def setUp(self):
        self.extracted = {'bundle_id': 'portal-notice', 'facts': {'purpose': 'recruitment',
            'posts': [{'post_name': 'Engineer', 'recruiting_body': 'Example Board',
                       'application_last_date': '2026-11-25'}]}}
        self.source = {'bundle_id': 'portal-notice', 'identity': {
            'issuer': None, 'year': '2026', 'advertisement_number': None},
            'documents': [{'source_url': 'https://portal.example/job', 'authority': 'needs_review'}]}
        self.search = Mock()
        self.search.discover_notice.return_value = {'status': 'ok', 'data': {'source_urls': [URL]}}
        self.capture = Mock()
        self.set_capture(HTML)

    def set_capture(self, html, url=URL):
        self.capture.capture_source.return_value = {'status': 'captured', 'source_url': url,
            'document': {'document_id': 'official', 'source_url': url, 'format': 'html',
                         'content': normalize_html(html.encode(), url)},
            'text_units': [{'text': html, 'locator': 'html:body'}]}

    def recover(self):
        return recover_official_notice(self.extracted, self.source,
            search_client=self.search, capture_client=self.capture)

    @patch('notice_discovery.extract_bundle')
    def test_missing_ad_and_issuer_searches_and_reextracts_only_matching_official_evidence(self, extract):
        extract.return_value = {'facts': {'official_reextraction': True}}
        before = copy.deepcopy(self.source)
        candidate, source, report = self.recover()
        self.assertEqual(report['status'], 'recovered')
        self.assertTrue(candidate['facts']['official_reextraction'])
        self.assertEqual(source['bundle_id'], 'portal-notice')
        self.assertEqual(source['identity']['issuer'], 'Example Board')
        self.assertEqual(source['identity']['campaign'], 'Engineer')
        self.assertEqual([d['source_url'] for d in source['documents']], [URL])
        self.assertEqual(report['discovery_source_urls'], ['https://portal.example/job'])
        self.assertEqual(self.source, before)
        self.assertEqual(extract.call_count, 1)

    @patch('notice_discovery.extract_bundle')
    def test_old_or_new_different_cycle_never_replaces_the_discovered_notice(self, extract):
        for year in ('2025', '2027'):
            self.set_capture(HTML.replace('2026', year))
            candidate, source, report = self.recover()
            self.assertIs(candidate, self.extracted)
            self.assertIs(source, self.source)
            self.assertEqual(report['audit_log'][0]['status'], 'notice_cycle_unconfirmed')
        extract.assert_not_called()

    @patch('notice_discovery.extract_bundle')
    def test_portal_wrong_issuer_wrong_post_and_unofficial_redirect_are_not_evidence(self, extract):
        for html, url in ((HTML.replace('Example Board', 'Other Board'), URL),
                          (HTML.replace('Engineer', 'Clerk'), URL),
                          (HTML, 'https://portal.example/job')):
            self.set_capture(html, url)
            self.assertEqual(self.recover()[2]['status'], 'unresolved')
        self.search.discover_notice.return_value['data']['source_urls'] = ['https://portal.example/job']
        self.assertEqual(self.recover()[2]['audit_log'][0]['status'], 'unofficial_source')
        extract.assert_not_called()

    @patch('notice_discovery.extract_bundle')
    def test_multiple_matching_sources_do_not_silently_choose_a_revision(self, extract):
        other = URL + '-revised'
        self.search.discover_notice.return_value['data']['source_urls'].append(other)
        first = self.capture.capture_source.return_value
        second = copy.deepcopy(first)
        second.update(source_url=other)
        second['document'].update(source_url=other)
        second['document']['content']['source_url'] = other
        self.capture.capture_source.side_effect = [first, second]
        self.assertEqual(self.recover()[2]['reason_codes'], ['official_notice_ambiguous'])
        extract.assert_not_called()

    def test_search_failure_preserves_original_and_reports_retryable(self):
        self.search.discover_notice.return_value = {'status': 'unresolved', 'reason': 'provider_timeout',
                                                   'retryable': True}
        candidate, source, report = self.recover()
        self.assertIs(candidate, self.extracted)
        self.assertIs(source, self.source)
        self.assertTrue(report['retryable'])
        self.capture.capture_source.assert_not_called()

    @patch('notice_discovery.extract_bundle')
    def test_real_review_path_receives_fresh_official_candidate_not_portal_facts(self, extract):
        extract.return_value = {'facts': {'posts': [{'post_name': 'Engineer'}]}}
        with patch('autonomous_pipeline.review_extracted_candidate', return_value={
                'passed': True, 'findings': []}) as review:
            result = review_and_repair(self.extracted, self.source,
                search_client=self.search, capture_client=self.capture)
        self.assertEqual(result[3][0]['status'], 'recovered')
        self.assertEqual(review.call_args.args[1]['documents'][0]['source_url'], URL)

    @patch('notice_discovery.extract_bundle')
    def test_known_advertisement_cannot_be_replaced_by_different_notice(self, extract):
        self.source['identity']['advertisement_number'] = '01/2026'
        self.set_capture(HTML + '<p>Advertisement No: 02/2026</p>')
        self.assertEqual(self.recover()[2]['audit_log'][0]['status'], 'notice_advertisement_mismatch')
        extract.assert_not_called()

    @patch('notice_discovery.extract_bundle', side_effect=RuntimeError('failed'))
    def test_failed_fresh_extraction_preserves_old_draft(self, extract):
        candidate, source, report = self.recover()
        self.assertIs(candidate, self.extracted)
        self.assertIs(source, self.source)
        self.assertEqual(report['reason_codes'], ['official_notice_extraction_failed'])

    @patch('notice_discovery.extract_bundle')
    def test_unidentified_cycle_still_searches_but_cannot_accept_facts(self, extract):
        self.source['identity']['year'] = None
        self.extracted['facts']['posts'][0]['application_last_date'] = None
        self.assertEqual(self.recover()[2]['status'], 'unresolved')
        self.search.discover_notice.assert_called_once()
        extract.assert_not_called()

    @patch('notice_discovery.extract_bundle')
    def test_recovered_official_host_is_used_by_subsequent_field_healing(self, extract):
        extract.return_value = self.extracted
        failed = {'passed': False, 'findings': [{
            'field_path': 'posts.0.max_age', 'status': 'missing'}]}
        with patch('autonomous_pipeline.review_extracted_candidate', side_effect=[
                failed, {'passed': True, 'findings': []}]), \
             patch('autonomous_pipeline.run_targeted_enrichment', return_value={}) as enrich:
            review_and_repair(self.extracted, self.source,
                search_client=self.search, capture_client=self.capture)
        self.assertEqual(enrich.call_args.kwargs['issuer_hosts'], {
            'Example Board': ['board.example.gov.in']})

    @patch('notice_discovery.extract_bundle')
    def test_unreadable_pdf_does_not_stop_next_official_source(self, extract):
        from pdfminer.pdfparser import PDFSyntaxError
        extract.return_value = self.extracted
        self.search.discover_notice.return_value['data']['source_urls'].insert(0, URL + '.pdf')
        self.capture.capture_source.side_effect = [PDFSyntaxError('unreadable'),
                                                  self.capture.capture_source.return_value]
        result = self.recover()
        self.assertEqual(result[2]['status'], 'recovered')
        self.assertEqual(result[2]['audit_log'][0]['status'], 'official_capture_failed')
        self.assertEqual(self.capture.capture_source.call_count, 2)

    @patch('notice_discovery.extract_bundle')
    def test_saved_official_source_can_resume_field_healing_without_another_discovery(self, extract):
        extract.return_value = self.extracted
        candidate, source, _ = self.recover()
        self.search.reset_mock()
        failed = {'passed': False, 'findings': [{
            'field_path': 'posts.0.max_age', 'status': 'missing'}]}
        with patch('autonomous_pipeline.review_extracted_candidate', side_effect=[
                failed, {'passed': True, 'findings': []}]), \
             patch('autonomous_pipeline.run_targeted_enrichment', return_value={}) as enrich:
            review_and_repair(candidate, source, search_client=self.search, capture_client=self.capture)
        self.search.discover_notice.assert_not_called()
        self.assertEqual(enrich.call_args.kwargs['issuer_hosts'], {
            'Example Board': ['board.example.gov.in']})
