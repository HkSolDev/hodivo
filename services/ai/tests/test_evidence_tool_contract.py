"""Offline tests for read_notice request validation; no provider or network work."""

import unittest

from build_extraction_input import BundleFacts
from compact_inline import field_catalogue
from evidence_tool_contract import (
    ACCEPTED_KEYS,
    TOOL_NAME,
    compile_field_patterns,
    validate_document_url,
    validate_read_notice_request,
)

KNOWN_URLS = [
    'https://ssc.example.gov.in/notices/jer-2026.pdf',
    'https://ssc.example.gov.in/notice/jer-2026.html',
]


def schema_field_paths():
    return [item['field'] for item in field_catalogue(BundleFacts.model_json_schema())]


def request(*, url=KNOWN_URLS[0], fields=('min_age',)):
    return {
        'tool_name': TOOL_NAME,
        'arguments': {'document_url': url, 'fields': list(fields)},
    }


class CompileFieldPatternsTest(unittest.TestCase):
    def test_index_pattern_matches_concrete_indices_only(self):
        patterns = compile_field_patterns(['posts.<index>.min_age'])
        self.assertTrue(patterns[0].fullmatch('posts.0.min_age'))
        self.assertTrue(patterns[0].fullmatch('posts.12.min_age'))
        self.assertIsNone(patterns[0].fullmatch('posts.00.min_age'))
        self.assertIsNone(patterns[0].fullmatch('posts.-1.min_age'))

    def test_catalogue_input_must_be_a_nonempty_string_list(self):
        with self.assertRaises(ValueError):
            compile_field_patterns([])
        with self.assertRaises(ValueError):
            compile_field_patterns([None])
        with self.assertRaises(ValueError):
            compile_field_patterns([''])


class ValidateDocumentUrlTest(unittest.TestCase):
    def test_known_official_url_is_accepted(self):
        parts, reason = validate_document_url(KNOWN_URLS[0], KNOWN_URLS)
        self.assertIsNone(reason)
        self.assertEqual(parts.hostname, 'ssc.example.gov.in')

    def test_non_https_or_credential_urls_are_invalid(self):
        for url in (
            'http://ssc.example.gov.in/notices/jer-2026.pdf',
            'https://user:pass@ssc.example.gov.in/notices/jer-2026.pdf',
            'ftp://ssc.example.gov.in/notices/jer-2026.pdf',
            'https://ssc.example.gov.in:8443/notices/jer-2026.pdf',
            'https://ssc.example.gov.in:bad/notices/jer-2026.pdf',
            'not a url',
            '',
            None,
        ):
            with self.subTest(url=url):
                _, reason = validate_document_url(url, KNOWN_URLS)
                self.assertEqual(reason, 'invalid_document_url')

    def test_unrelated_urls_are_rejected_even_on_a_known_host(self):
        for url in (
            'https://ssc.example.gov.in/notices/other-notice.pdf',
            'https://other.example.gov.in/notices/jer-2026.pdf',
            'https://ssc.example.gov.in/notices/jer-2026.pdf?download=1',
        ):
            with self.subTest(url=url):
                _, reason = validate_document_url(url, KNOWN_URLS)
                self.assertEqual(reason, 'unrelated_document_url')

    def test_malformed_known_url_is_a_wiring_error(self):
        with self.assertRaises(ValueError):
            validate_document_url(KNOWN_URLS[0], ['http://insecure.example/notice.pdf'])


class ValidateReadNoticeRequestTest(unittest.TestCase):
    def setUp(self):
        self.field_paths = schema_field_paths()

    def test_existing_schema_field_paths_are_available(self):
        self.assertIn('min_age', self.field_paths)
        self.assertIn('eligibility_rules.age_rules.<index>.min_age', self.field_paths)

    def test_valid_request_against_real_schema_catalogue(self):
        accepted, reason, payload = validate_read_notice_request(
            **request(fields=('min_age', 'application_last_date')),
            known_urls=KNOWN_URLS,
            field_paths=self.field_paths,
        )
        self.assertTrue(accepted)
        self.assertIsNone(reason)
        self.assertEqual(set(payload), ACCEPTED_KEYS)
        self.assertEqual(payload['tool'], TOOL_NAME)
        self.assertEqual(payload['fields'], ['min_age', 'application_last_date'])

    def test_unknown_tool_is_rejected(self):
        for name in ('read_document', 'run_shell', ''):
            req = request()
            req['tool_name'] = name
            accepted, reason, _ = validate_read_notice_request(
                **req, known_urls=KNOWN_URLS, field_paths=self.field_paths)
            with self.subTest(name=name):
                self.assertFalse(accepted)
                self.assertEqual(reason, 'unknown_tool')

    def test_argument_keys_must_match_exactly(self):
        for arguments in (
            None,
            {},
            {'document_url': KNOWN_URLS[0]},
            {'fields': ['min_age']},
            {'document_url': KNOWN_URLS[0], 'fields': ['min_age'], 'mode': 'full'},
        ):
            with self.subTest(arguments=arguments):
                accepted, reason, _ = validate_read_notice_request(
                    TOOL_NAME, arguments,
                    known_urls=KNOWN_URLS, field_paths=self.field_paths)
                self.assertFalse(accepted)
                self.assertEqual(reason, 'invalid_arguments')

    def test_url_failures_keep_their_specific_reasons(self):
        accepted, reason, _ = validate_read_notice_request(
            **request(url='http://ssc.example.gov.in/notices/jer-2026.pdf'),
            known_urls=KNOWN_URLS, field_paths=self.field_paths)
        self.assertEqual((accepted, reason), (False, 'invalid_document_url'))
        accepted, reason, _ = validate_read_notice_request(
            **request(url='https://ssc.example.gov.in/notices/jer-2026.pdf?download=1'),
            known_urls=KNOWN_URLS, field_paths=self.field_paths)
        self.assertEqual((accepted, reason), (False, 'unrelated_document_url'))

    def test_invented_or_container_fields_are_rejected(self):
        for fields in (
            ('estimated_salary',),
            ('posts.0.min_age',),
            ('<index>',),
            ('min_age.min_age',),
            (),
            'min_age',
            (None,),
        ):
            with self.subTest(fields=fields):
                accepted, reason, _ = validate_read_notice_request(
                    **request(fields=fields),
                    known_urls=KNOWN_URLS, field_paths=self.field_paths)
                self.assertFalse(accepted)
                self.assertTrue(reason.startswith(('unknown_field_path', 'invalid_fields')))

    def test_duplicate_fields_are_rejected(self):
        accepted, reason, _ = validate_read_notice_request(
            **request(fields=('min_age', 'min_age')),
            known_urls=KNOWN_URLS, field_paths=self.field_paths)
        self.assertEqual((accepted, reason), (False, 'duplicate_field'))

    def test_malformed_field_path_list_is_a_wiring_error(self):
        with self.assertRaises(ValueError):
            validate_read_notice_request(
                **request(), known_urls=KNOWN_URLS, field_paths=None)


if __name__ == '__main__':
    unittest.main()
