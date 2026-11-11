"""Offline capture comparison; no extraction, provider calls or publication."""
import json
import time
import unittest
from pathlib import Path

import test_shared_pipeline as shared_fixture

FIXTURES = Path(__file__).parent / 'fixtures'


class HtmlFirstBaselineTests(unittest.TestCase):
    def test_four_capture_cases(self):
        measurements = []
        expected_notices = {
            'iiit_saved_text': {'IIITP/ECE/0002': 'IIIT Pune'},
            'complete_html': {'EB/01/2026': 'Example Board'},
            'multi_notice': {'EB/01/2026': 'Example Board', 'EB/02/2026': 'Example Board'},
            'poor_text_pdf': {'EB/01/2026': 'Example Board'},
        }
        for case in ('iiit_saved_text', 'complete_html', 'multi_notice', 'poor_text_pdf'):
            for html_first in (False, True):
                with self.subTest(case=case, html_first=html_first):
                    harness = shared_fixture.SharedPipelineTests()
                    harness.setUp()
                    try:
                        if case == 'iiit_saved_text':
                            saved = json.loads((FIXTURES / 'iiit-pune-jrf-pages.json').read_text())
                            # Reconstructed selectable-text PDF tests saved public text,
                            # not original PDF layout, OCR accuracy or live grounding.
                            lines = ['Recruitment Notice', 'Issuer: IIIT Pune',
                                     'Advertisement No: IIITP/ECE/0002', 'Year: 2026']
                            lines += [line.encode('ascii', 'replace').decode()
                                      for page in saved['pages'] for line in page['text'].splitlines()]
                            harness.pages['/notice'] = ('html', '<h1>JRF Recruitment</h1>'
                                '<p>Issuer: IIIT Pune</p><p>Advertisement No: IIITP/ECE/0002</p>'
                                '<p>Year: 2026</p><a href="/files/details">Official PDF</a>')
                            harness.pages['/files/details'] = ('pdf', shared_fixture.pdf_bytes(lines))
                        elif case == 'complete_html':
                            kind, html = harness.pages['/notice']
                            harness.pages['/notice'] = (kind, html + '<p>Bachelor degree required.</p>'
                                '<p>Minimum age 18 years. Maximum age 27 years.</p>')
                        elif case == 'multi_notice':
                            harness.pages['/'] = ('xml', '<rss version="2.0"><channel><title>Jobs</title>'
                                '<item><title>Engineer recruitment</title><link>https://example.gov.in/a.pdf</link></item>'
                                '<item><title>Clerk recruitment</title><link>https://example.gov.in/b.pdf</link></item>'
                                '</channel></rss>')
                            harness.pages['/a.pdf'] = harness.pages['/files/details']
                            harness.pages['/b.pdf'] = ('pdf', shared_fixture.pdf_bytes([
                                line.replace('EB/01/2026', 'EB/02/2026') for line in harness.identity]))
                        else:
                            harness.pages['/files/details'] = ('pdf', b'%PDF-1.4 broken')
                        started = time.perf_counter()
                        summary = harness.run_source(html_first=html_first)
                        elapsed = time.perf_counter() - started
                        crawl = json.loads(Path(summary['crawl_path']).read_text())
                        bundles = json.loads(Path(summary['bundles_path']).read_text())['bundles']
                        row = dict(case=case, html_first=html_first,
                            elapsed_seconds=round(elapsed, 4), capture_calls=len(harness.fetched),
                            pdf_calls=sum(url.endswith(('.pdf', '/files/details')) for url in harness.fetched),
                            bundles=len(bundles), identities=[b['identity'] for b in bundles],
                            documents=len(crawl['documents']), provider_requests=0,
                            provider_mode='offline_no_providers', published=False)
                        measurements.append(row)
                        self.assertFalse(summary['ai_called'])
                        self.assertFalse(summary['published'])
                        notices = [b for b in bundles if b['identity']['advertisement_number']]
                        actual_notices = {b['identity']['advertisement_number']: b['identity']['issuer']
                                          for b in notices}
                        self.assertEqual(actual_notices, expected_notices[case])
                        self.assertEqual(len(notices), len(expected_notices[case]))
                        for notice in notices:
                            text = json.dumps(notice['documents'])
                            if case == 'complete_html':
                                for fact in ('30 November 2026', 'Bachelor degree required',
                                             'Minimum age 18 years', 'Maximum age 27 years'):
                                    self.assertIn(fact, text)
                            elif case == 'iiit_saved_text':
                                self.assertIn('JRF Recruitment', text)
                                if not html_first:
                                    self.assertIn('Junior Research Fellow (JRF)', text)
                                    self.assertIn('No. of Positions One (01)', text)
                            elif case == 'poor_text_pdf':
                                self.assertIn('30 November 2026', text)
                        if html_first and case != 'multi_notice':
                            self.assertEqual(row['pdf_calls'], 0)
                        if case == 'poor_text_pdf':
                            self.assertTrue(any(d['format'] == 'html' for d in crawl['documents']))
                    finally:
                        harness.doCleanups()
        self.assertEqual(len(measurements), 8)
        print('HTML_FIRST_CAPTURE_BASELINE=' + json.dumps(measurements, sort_keys=True))
