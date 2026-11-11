"""Checkpoint bounded evidence work before extraction and later draft reuse."""

import hashlib
import json

from build_extraction_input import prepare_extraction
from extraction_checkpoint import extract_or_resume
from html_first_evidence import recover_html_first_evidence
from stage_retry import StageRetries


def prepare_html_first(bundle, root, *, issuer_hosts, assess, discover, process=None,
                       recover_vision=None, model_identity=None, vision_model_identity=None, clock=None):
    request = {'bundle_id': bundle['bundle_id'], 'bundle': bundle,
               'issuer_hosts': issuer_hosts, 'model_identity': model_identity,
               'version': 'html-first-evidence-v1'}
    if vision_model_identity is not None:
        request['vision_model_identity'] = vision_model_identity
    fingerprint = hashlib.sha256(json.dumps(request, sort_keys=True).encode()).hexdigest()
    retries = StageRetries(root, clock)
    call_retries = StageRetries(root / 'calls', clock)
    checkpoint = {'llm_input': {'input': request}}

    def saved_call(kind, callback):
        if callback is None:
            return None
        def invoke(value):
            request = {'bundle_id': bundle['bundle_id'], 'kind': kind,
                       'model_identity': (vision_model_identity if kind == 'vision'
                                          and vision_model_identity is not None else model_identity),
                       'request': value}
            key = hashlib.sha256(json.dumps(request, sort_keys=True).encode()).hexdigest()
            def execute(_):
                try:
                    result = callback(value)
                except (TimeoutError, ConnectionError) as error:
                    failure = RuntimeError('provider_network_failed')
                    failure.retryable = True
                    raise failure from error
                if isinstance(result, dict) and result.get('retryable'):
                    failure = RuntimeError('provider_network_failed')
                    failure.retryable = True
                    raise failure
                return {'bundle_id': bundle['bundle_id'], 'result': result}
            with call_retries.lock('evidence', key):
                result, _ = extract_or_resume(call_retries, key,
                    {'llm_input': {'input': request}}, execute, stage='evidence')
            if result is None:
                failure = RuntimeError('evidence_call_waiting')
                failure.retryable = True
                raise failure
            return result['result']
        return invoke

    def collect(_):
        options = {'process': process} if process is not None else {}
        result = recover_html_first_evidence(bundle, root / 'captures', assess=saved_call('assessment', assess),
            discover=saved_call('research', discover), issuer_hosts=issuer_hosts, recover_vision=saved_call('vision', recover_vision), **options)
        if result.get('retryable'):
            failure = RuntimeError('provider_network_failed')
            failure.retryable = True
            raise failure
        return {'bundle_id': bundle['bundle_id'], **result}

    with retries.lock('evidence', fingerprint):
        try:
            result, reused = extract_or_resume(retries, fingerprint, checkpoint, collect, stage='evidence')
        except RuntimeError as error:
            if not getattr(error, 'retryable', False):
                raise
            return {'status': 'waiting', 'reason': 'evidence_provider_retry_wait'}
    if result is None:
        return {'status': 'waiting', 'reason': 'evidence_checkpoint_unavailable'}
    if reused and result.get('reason') in {'research_failed', 'assessment_failed'}:
        # Old records did not retain enough failure detail for a safe paid retry.
        return {'status': 'waiting', 'reason': 'legacy_evidence_failure_needs_review'}
    return {'status': 'prepared', 'reused': reused, 'report': result,
            'prepared': prepare_extraction(result['bundle'])}
