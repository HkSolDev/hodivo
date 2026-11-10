"""Backfill operator retirement markers from the saved cleanup manifests (offline).

Reads both retirement manifests from the archive root, verifies each referenced
archived draft still hashes to its recorded sha256, and writes
`publication/retirements/{sha256}.json` markers into a designated output
directory. The archive is read-only evidence: nothing is ever written into it.
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

from capture_store import atomic_write, now

DEFAULT_ARCHIVE_ROOT = Path('/private/tmp/aptus-backlog-review-20261110')
MANIFEST_NAMES = ('cleanup-payload.json', 'final-payload.json')


def read_retire_entries(manifest_path):
    """Return the manifest's retire entries; both saved manifest shapes are supported."""
    payload = json.loads(manifest_path.read_text(encoding='utf-8'))
    entries = payload.get('retire') if isinstance(payload, dict) else None
    if not isinstance(entries, list):
        raise ValueError(f'Manifest {manifest_path.name} has no retire list')
    return [entry for entry in entries if isinstance(entry, dict)]


def verify_entry(archive_root, entry):
    """Return ('verified', digest), ('mismatch', actual_digest) or ('missing', None)."""
    folder = entry.get('folder')
    notice_id = entry.get('id')
    recorded_sha = entry.get('sha256')
    if not all(isinstance(value, str) and value for value in (folder, notice_id, recorded_sha)):
        return 'mismatch', None
    draft_file = Path(archive_root) / folder / f'{notice_id}.json'
    if not draft_file.is_file():
        return 'missing', None
    actual_sha = hashlib.sha256(draft_file.read_bytes()).hexdigest()
    if actual_sha != recorded_sha:
        return 'mismatch', actual_sha
    return 'verified', actual_sha


def marker_payload(entry, digest):
    return {'draft_sha256': digest, 'bundle_id': entry.get('id'),
            'retired_at': now(), 'reason': entry.get('reason')}


def run_backfill(archive_root, out_dir):
    """Verify every manifest entry against the archive and write markers to out_dir.

    Mismatches and missing drafts are reported, never guessed into markers.
    Markers are deduplicated by digest across both manifests.
    """
    archive_root = Path(archive_root)
    out_dir = Path(out_dir)
    resolved_archive = archive_root.resolve()
    resolved_out = out_dir.resolve()
    if resolved_out == resolved_archive or resolved_archive in resolved_out.parents:
        raise ValueError('Backfill output must never be written into the archive')
    report = {'verified': 0, 'mismatch': 0, 'missing': 0, 'markers_written': 0,
              'mismatch_details': [], 'missing_details': []}
    written = set()
    for manifest_name in MANIFEST_NAMES:
        manifest_path = archive_root / manifest_name
        if not manifest_path.is_file():
            raise FileNotFoundError(f'Missing retirement manifest: {manifest_path}')
        for entry in read_retire_entries(manifest_path):
            status, digest = verify_entry(archive_root, entry)
            if status == 'verified':
                report['verified'] += 1
                if digest not in written:
                    atomic_write(
                        out_dir / 'publication' / 'retirements' / f'{digest}.json',
                        json.dumps(marker_payload(entry, digest), ensure_ascii=False).encode())
                    written.add(digest)
                    report['markers_written'] += 1
            elif status == 'mismatch':
                report['mismatch'] += 1
                report['mismatch_details'].append({
                    'manifest': manifest_name, 'folder': entry.get('folder'),
                    'id': entry.get('id'), 'recorded_sha256': entry.get('sha256'),
                    'actual_sha256': digest,
                })
            else:
                report['missing'] += 1
                report['missing_details'].append({
                    'manifest': manifest_name, 'folder': entry.get('folder'),
                    'id': entry.get('id'),
                })
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(
        description='Backfill retirement markers from saved manifests (archive stays read-only)')
    parser.add_argument('--archive-root', type=Path, default=DEFAULT_ARCHIVE_ROOT)
    parser.add_argument('--out', type=Path, default=Path('retirement-backfill-out'))
    args = parser.parse_args(argv)
    try:
        report = run_backfill(args.archive_root, args.out)
    except (OSError, ValueError) as err:
        print(json.dumps({'status': 'blocked', 'reason': str(err)}))
        return 1
    print(json.dumps(report, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
