"""Direct xAI structured generation, vision and Responses web search."""
import base64
import copy
import json
import os
import re

import httpx

from providers.openai import _openai_schema
from provider_metrics import provider_post
from schema import PostBatch


class XaiProvider:
    def __init__(self, *, model=None, client=None, env=None):
        env = os.environ if env is None else env
        self.model = (model or env.get('LLM_MODEL') or '').strip()
        if not re.fullmatch(r'[A-Za-z0-9._-]{1,100}', self.model):
            raise ValueError('An explicit valid xAI model is required')
        self.api_key = env.get('XAI_API_KEY', '').strip()
        if not self.api_key:
            raise RuntimeError('provider_credential_unavailable')
        self.client = client or httpx

    def _request(self, endpoint, payload, *, search=False, timeout=120):
        result = {'status': 'unresolved', 'retryable': False, 'reason': None,
                  'data': None, 'raw_text': None, 'grounding_metadata': None,
                  'attempt_count': 1}
        try:
            response = provider_post(self.client, 'https://api.x.ai/v1/' + endpoint,
                headers={'Authorization': 'Bearer ' + self.api_key},
                json=payload, timeout=timeout)
        except (httpx.NetworkError, httpx.TimeoutException):
            return {**result, 'reason': 'xai_network_failed', 'retryable': True}
        except httpx.HTTPError:
            return {**result, 'reason': 'xai_transport_error'}
        if not response.is_success:
            return {**result, 'reason': f'xai_http_{response.status_code}',
                    'retryable': response.status_code in {408, 429, 500, 502, 503, 504}}
        try:
            body = response.json()
            citations = []
            if search:
                if body.get('status') != 'completed':
                    return {**result, 'reason': 'xai_incomplete_or_refused'}
                blocks = [block for item in body['output'] if item.get('type') == 'message'
                          for block in item.get('content', [])]
                text = ''.join(block.get('text', '') for block in blocks
                               if block.get('type') == 'output_text')
                citations = [a for block in blocks for a in block.get('annotations', [])
                             if a.get('type') == 'url_citation']
                tool_usage = {name: body[name] for name in ('server_side_tool_usage', 'tool_usage')
                              if name in body}
                tool_usage['web_search_calls'] = sum(
                    item.get('type') == 'web_search_call' for item in body['output'])
            else:
                choice = body['choices'][0]
                if choice.get('finish_reason') != 'stop' or choice['message'].get('refusal'):
                    return {**result, 'reason': 'xai_incomplete_or_refused'}
                text = choice['message']['content']
                tool_usage = {}
            parsed = json.loads(text)
            if not isinstance(parsed, dict):
                raise ValueError
        except (KeyError, IndexError, TypeError, ValueError, AttributeError):
            return {**result, 'reason': 'xai_response_invalid'}
        return {**result, 'status': 'ok', 'data': parsed, 'raw_text': text,
                'grounding_metadata': {'citations': citations} if search else None,
                'citations': citations, 'tool_usage': tool_usage, 'usage': body.get('usage', {})}

    def request_json(self, *, system_prompt, parts, response_schema=None, timeout=120):
        content = []
        for part in parts:
            if 'text' in part:
                content.append({'type': 'text', 'text': part['text']})
            elif 'inline_data' in part:
                image = part['inline_data']
                content.append({'type': 'image_url', 'image_url': {
                    'url': f"data:{image['mime_type']};base64,{image['data']}"}})
            else:
                raise ValueError('Unsupported xAI content part')
        payload = {'model': self.model, 'messages': [
            {'role': 'system', 'content': system_prompt}, {'role': 'user', 'content': content}]}
        if response_schema is not None:
            payload['response_format'] = {'type': 'json_schema', 'json_schema': {
                'name': 'review', 'strict': True, 'schema': _openai_schema(copy.deepcopy(response_schema))}}
        else:
            payload['response_format'] = {'type': 'json_object'}
        return self._request('chat/completions', payload, timeout=timeout)

    def discover_sources(self, *, query, system_prompt, response_schema):
        return self._request('responses', {'model': self.model,
            'instructions': system_prompt, 'input': query,
            'tools': [{'type': 'web_search'}],
            'text': {'format': {'type': 'json_schema', 'name': 'research', 'strict': True,
                              'schema': _openai_schema(copy.deepcopy(response_schema))}}}, search=True)

    def recover_pdf_page(self, *, image_bytes, prompt, response_schema, system_prompt,
                         mime_type='image/png'):
        return self.request_json(system_prompt=system_prompt, response_schema=response_schema,
            parts=[{'text': prompt}, {'inline_data': {'mime_type': mime_type,
                    'data': base64.b64encode(image_bytes).decode('ascii')}}])

    def extract_posts(self, system_prompt, user_prompt):
        result = self.request_json(system_prompt=system_prompt, parts=[{'text': user_prompt}],
                                   response_schema=PostBatch.model_json_schema())
        if result['status'] != 'ok':
            raise RuntimeError(result['reason'])
        return PostBatch.model_validate(result['data'])
