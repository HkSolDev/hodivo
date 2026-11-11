"""Count HTTP request attempts independently of extraction and local validation."""
from contextlib import contextmanager
from contextvars import ContextVar

_current = ContextVar('provider_request_metrics', default=None)
_budget = ContextVar('provider_request_budget', default=None)


class ProviderRequestLimit(RuntimeError):
    retryable = True

    def __init__(self):
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
    budget_token = _budget.set({'max_attempts': max_attempts, 'exhausted': False})
    try:
        yield counts
    finally:
        _budget.reset(budget_token)
        _current.reset(token)


def provider_post(client, url, **kwargs):
    counts = _current.get()
    budget = _budget.get()
    if (budget is not None and budget['max_attempts'] is not None
            and counts['attempted'] >= budget['max_attempts']):
        budget['exhausted'] = True
        raise ProviderRequestLimit()
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
