"""Backfill of retirement markers from saved manifests, verified against archived bytes."""
import hashlib
import json
import shutil
import tempfile
import unittest
from pathlib import Path

from backfill_retirements import main, run_backfill

FIXTURE_ROOT = Path(__file__).parent / 'fixtures' / 'backfill'
DRAFT_ONE_SHA = 'f43a28366e807177b92a44eef70c9df31b4f5576632ac7038c6d90b2d266a40b'
DRAFT_TWO_SHA = '9b23b0c72f518cada68ecea26937107a85edb525e69070fae7649ba8cc163dc8'


class BackfillRetirementsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.archive_root = Path(self.temp.name) / 'archive'
        self.out_dir = Path(self.temp.name) / 'out'
        shutil.copytree(FIXTURE_ROOT, self.archive_root)

    def archive_snapshot(self):
        return {str(p.relative_to(self.archive_root)): hashlib.sha256(p.read_bytes()).hexdigest()
                for p in sorted(self.archive_root.rglob('*')) if p.is_file()}

    def test_verified_entries_get_deduplicated_markers_and_mismatches_are_reported(self):
        before = self.archive_snapshot()
        report = run_backfill(self.archive_root, self.out_dir)
        # The archive is read-only evidence and must be untouched.
        self.assertEqual(self.archive_snapshot(), before)
        self.assertFalse((self.archive_root / 'publication').exists())

        self.assertEqual(report['verified'], 3)
        self.assertEqual(report['mismatch'], 1)
        self.assertEqual(report['missing'], 1)
        # draft_one is verified in both manifests but yields exactly one marker.
        self.assertEqual(report['markers_written'], 2)

        self.assertEqual(report['mismatch_details'], [{
            'manifest': 'cleanup-payload.json', 'folder': 'drafts', 'id': 'draft_two',
            'recorded_sha256': '1' * 64, 'actual_sha256': DRAFT_TWO_SHA,
        }])
        self.assertEqual(report['missing_details'], [{
            'manifest': 'cleanup-payload.json', 'folder': 'drafts', 'id': 'draft_missing',
        }])

        retirements = self.out_dir / 'publication' / 'retirements'
        self.assertEqual(sorted(p.name for p in retirements.glob('*.json')),
                         sorted([f'{DRAFT_ONE_SHA}.json', f'{DRAFT_TWO_SHA}.json']))
        marker = json.loads((retirements / f'{DRAFT_TWO_SHA}.json').read_text())
        self.assertEqual(marker['draft_sha256'], DRAFT_TWO_SHA)
        self.assertEqual(marker['bundle_id'], 'draft_two')
        self.assertEqual(marker['reason'], 'scanned_mirrored_notice_no_verified_readable_issuer_copy')
        self.assertTrue(marker['retired_at'])

    def test_cli_prints_the_verification_report(self):
        exit_code = main(['--archive-root', str(self.archive_root), '--out', str(self.out_dir)])
        self.assertEqual(exit_code, 0)
        self.assertTrue((self.out_dir / 'publication' / 'retirements' / f'{DRAFT_ONE_SHA}.json').is_file())

    def test_refuses_to_write_markers_into_the_archive(self):
        with self.assertRaises(ValueError):
            run_backfill(self.archive_root, self.archive_root / 'retirement-backfill-out')


if __name__ == '__main__':
    unittest.main()
