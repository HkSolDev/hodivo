"""Resolve auxiliary task settings independently of extraction settings."""
import os

from providers.gemini import GeminiProvider, gemini_api_keys, gemini_purpose_model
from providers.xai import XaiProvider


def task_provider(purpose):
    if purpose not in {'search', 'review', 'vision'}:
        raise ValueError('Unknown provider purpose')
    provider = os.getenv(f'{purpose.upper()}_PROVIDER', 'gemini').strip().lower()
    model = os.getenv(f'{purpose.upper()}_MODEL', '').strip()
    if provider == 'gemini':
        return GeminiProvider(model=model or gemini_purpose_model(purpose)) if gemini_api_keys() else None
    if provider == 'xai':
        if not model:
            raise ValueError(f'{purpose.upper()}_MODEL is required for xai')
        return XaiProvider(model=model)
    raise ValueError(f'Unsupported {purpose.upper()}_PROVIDER')
