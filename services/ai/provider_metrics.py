"""Count HTTP request attempts independently of extraction and local validation."""
from contextlib import contextmanager
from contextvars import ContextVar
import json
from pathlib import Path

from capture_store import atomic_write
from stage_retry import file_lock

_current = ContextVar('provider_request_metrics', default=None)
_budget = ContextVar('provider_request_budget', default=None)


class ProviderRequestLimit(RuntimeError):
    retryable = True

    def __init__(self, *, retryable=True):
        self.retryable = retryable
        super().__init__('provider_request_budget_exhausted')


def provider_budget_exhausted():
    budget = _budget.get()
    return budget is not None and budget['exhausted']


@contextmanager
def track_provider_requests(*, max_attempts=None):
    if max_attempts is not None and (type(max_attempts) is not int or max_attempts < 1):
        raise ValueError('max_attempts must be a positive integer')
    counts = {'attempted': 0, 'succeeded': 0, 'failed': 0}
    token = _current.set(counts)
    budget_token = _budget.set({'max_attempts': max_attempts, 'exhausted': False, 'path': None})
    try:
        yield counts
    finally:
        _budget.reset(budget_token)
        _current.reset(token)


def bind_provider_budget(path):
    """Bind this notice's durable allowance before its first provider request."""
    budget = _budget.get()
    if budget is None or budget['max_attempts'] is None or _current.get()['attempted']:
        raise ValueError('provider_budget_requires_unused_limited_scope')
    budget['path'] = Path(path)


def _reserve_attempt(budget):
    path = budget['path']
    with file_lock(path.with_suffix('.lock')):
        try:
            state = json.loads(path.read_text()) if path.exists() else {'attempted': 0}
            if (not isinstance(state, dict) or set(state) != {'attempted'}
                    or type(state['attempted']) is not int or state['attempted'] < 0):
                raise ValueError('provider_request_budget_invalid')
        except (ValueError, UnicodeError) as error:
            raise RuntimeError('provider_request_budget_invalid') from error
        if state['attempted'] >= budget['max_attempts']:
            budget['exhausted'] = True
            raise ProviderRequestLimit(retryable=False)
        # Reserve before transport: an interrupted/uncertain call still costs one slot.
        state['attempted'] += 1
        atomic_write(path, json.dumps(state).encode())


def provider_post(client, url, **kwargs):
    counts = _current.get()
    budget = _budget.get()
    if (budget is not None and budget['max_attempts'] is not None
            and counts['attempted'] >= budget['max_attempts']):
        budget['exhausted'] = True
        raise ProviderRequestLimit(retryable=budget['path'] is None)
    if budget is not None and budget['path'] is not None:
        _reserve_attempt(budget)
    if counts is not None:
        counts['attempted'] += 1
    try:
        response = client.post(url, **kwargs)
    except Exception:
        if counts is not None:
            counts['failed'] += 1
        raise
    if counts is not None:
        counts['succeeded' if response.is_success else 'failed'] += 1
    return response
