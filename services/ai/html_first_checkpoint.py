"""Checkpoint bounded evidence work before extraction and later draft reuse."""

import hashlib
import json

from build_extraction_input import prepare_extraction
from extraction_checkpoint import extract_or_resume
from html_first_evidence import recover_html_first_evidence
from stage_retry import StageRetries


def prepare_html_first(bundle, root, *, issuer_hosts, assess, discover, process=None,
                       recover_vision=None, model_identity=None, clock=None):
    request = {'bundle_id': bundle['bundle_id'], 'bundle': bundle,
               'issuer_hosts': issuer_hosts, 'model_identity': model_identity,
               'version': 'html-first-evidence-v1'}
    fingerprint = hashlib.sha256(json.dumps(request, sort_keys=True).encode()).hexdigest()
    retries = StageRetries(root, clock)
    checkpoint = {'llm_input': {'input': request}}

    def collect(_):
        options = {'process': process} if process is not None else {}
        result = recover_html_first_evidence(bundle, root / 'captures', assess=assess,
            discover=discover, issuer_hosts=issuer_hosts, recover_vision=recover_vision, **options)
        return {'bundle_id': bundle['bundle_id'], **result}

    with retries.lock('evidence', fingerprint):
        result, reused = extract_or_resume(retries, fingerprint, checkpoint, collect, stage='evidence')
    if result is None:
        return {'status': 'waiting', 'reason': 'evidence_checkpoint_unavailable'}
    return {'status': 'prepared', 'reused': reused, 'report': result,
            'prepared': prepare_extraction(result['bundle'])}
