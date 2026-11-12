"""Resolve auxiliary task settings independently of extraction settings."""
import os

from providers.gemini import GeminiProvider, gemini_api_keys, gemini_purpose_model
from providers.xai import XaiProvider
from providers.deepseek import DeepSeekTaskProvider


def task_provider(purpose):
    if purpose not in {'search', 'review', 'vision'}:
        raise ValueError('Unknown provider purpose')
    provider = os.getenv(f'{purpose.upper()}_PROVIDER', 'gemini').strip().lower()
    model = os.getenv(f'{purpose.upper()}_MODEL', '').strip()
    if provider == 'gemini':
        return GeminiProvider(model=model or gemini_purpose_model(purpose)) if gemini_api_keys() else None
    if provider == 'deepseek':
        if purpose == 'search' and model != 'deepseek-v4-pro':
            raise ValueError('SEARCH_MODEL must be deepseek-v4-pro for DeepSeek web search')
        if purpose == 'vision' and model != 'deepseek-flash':
            raise ValueError('VISION_MODEL must be deepseek-flash for DeepSeek vision')
        return DeepSeekTaskProvider(model=model)
    if provider == 'xai':
        if not model:
            raise ValueError(f'{purpose.upper()}_MODEL is required for xai')
        return XaiProvider(model=model)
    raise ValueError(f'Unsupported {purpose.upper()}_PROVIDER')
