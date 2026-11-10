"""Stage 7: approval binds bytes, and delivery resumes without model work."""
import json
import tempfile
import unittest
from pathlib import Path

import httpx

from review_publication import approve, is_retired, publish
from store_candidate import prepare_storage
import test_validate_candidate


def fixture(path):
    result, source = test_validate_candidate.CandidateValidationTests().candidate()
    result['bundle_id'] = source['bundle_id']
    draft = prepare_storage(result, source, source_name='Illustrative recruitment')
    draft['source_evidence'] = source['documents']
    path.write_text(json.dumps(draft))
    return draft


class RetirementMarkerTests(unittest.TestCase):
    def test_only_wellformed_matching_markers_retire_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            digest = 'c' * 64
            self.assertFalse(is_retired(root, digest))
            self.assertFalse(is_retired(root, None))
            self.assertFalse(is_retired(root, ''))
            retirements = root / 'publication' / 'retirements'
            retirements.mkdir(parents=True)
            marker_path = retirements / f'{digest}.json'
            marker_path.write_text('{not json', encoding='utf-8')
            self.assertFalse(is_retired(root, digest))
            marker_path.write_text(json.dumps({'reason': 'missing digest field'}), encoding='utf-8')
            self.assertFalse(is_retired(root, digest))
            marker_path.write_text(json.dumps({'draft_sha256': 'd' * 64, 'reason': 'foreign digest'}),
                                   encoding='utf-8')
            self.assertFalse(is_retired(root, digest))
            marker_path.write_text(json.dumps({'draft_sha256': digest, 'bundle_id': 'bnd_x',
                                               'retired_at': '2026-11-10T00:00:00+00:00',
                                               'reason': 'operator decision'}), encoding='utf-8')
            self.assertTrue(is_retired(root, digest))

    def test_publish_refuses_retired_exact_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / 'draft.json'
            fixture(path)
            approval = approve(root, path, 'Test reviewer', 'Checked original evidence')
            digest = approval['draft_sha256']
            retirements = root / 'publication' / 'retirements'
            retirements.mkdir(parents=True)
            (retirements / f'{digest}.json').write_text(
                json.dumps({'draft_sha256': digest, 'bundle_id': approval['bundle_id'],
                            'retired_at': '2026-11-10T00:00:00+00:00',
                            'reason': 'operator retired these bytes'}), encoding='utf-8')
            calls = []
            with self.assertRaises(ValueError) as ctx:
                publish(root, path, send=calls.append)
            self.assertIn('retired', str(ctx.exception))
            self.assertEqual(calls, [])
            self.assertFalse((root / 'publication' / 'receipts').exists())


class ReviewedPublicationTests(unittest.TestCase):
    def test_non_job_and_ungrounded_drafts_cannot_be_approved(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / 'draft.json'
            draft = fixture(path)
            draft['facts']['purpose'] = 'result'
            path.write_text(json.dumps(draft))
            with self.assertRaises(ValueError):
                approve(root, path, 'Fixture reviewer', 'Checked')
            draft = fixture(path)
            draft['facts']['purpose_evidence'][0]['quote'] = 'Invented evidence'
            path.write_text(json.dumps(draft))
            with self.assertRaises(ValueError):
                approve(root, path, 'Fixture reviewer', 'Checked')
            self.assertFalse((root / 'publication').exists())

    def test_unapproved_or_changed_draft_never_sends(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / 'draft.json'
            fixture(path)
            calls = []
            with self.assertRaises(OSError):
                publish(root, path, send=calls.append)
            approve(root, path, 'Test reviewer', 'Checked original evidence')
            path.write_text(path.read_text() + ' ')
            with self.assertRaises(OSError):
                publish(root, path, send=calls.append)
            self.assertEqual(calls, [])

    def test_network_failure_retries_only_delivery_then_reuses_receipt(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / 'draft.json'
            draft = fixture(path)
            approval = approve(root, path, 'Test reviewer', 'Checked original evidence')
            clock = [1000]
            calls = []
            def send(body):
                calls.append(body)
                if len(calls) == 1:
                    raise httpx.ReadTimeout('Illustrative lost response')
                return {'draft_sha256': approval['draft_sha256'], 'candidate_id': 'candidate1',
                        'content_hash': 'a' * 64,
                        'post_ids': [f'post{i}' for i in range(len(draft['facts']['posts']))]}
            with self.assertRaises(RuntimeError):
                publish(root, path, send=send, clock=lambda: clock[0])
            self.assertEqual(publish(root, path, send=send, clock=lambda: clock[0])['status'], 'retry_wait')
            clock[0] += 31
            receipt = publish(root, path, send=send, clock=lambda: clock[0])
            self.assertEqual(publish(root, path, send=send), receipt)
            self.assertEqual(len(calls), 2)
            self.assertEqual(calls[0], calls[1])


if __name__ == '__main__':
    unittest.main()
