import { API_URL, API_VERSION } from '../config/constants';

export async function callAnthropic({
  apiKey,
  model,
  system,
  messages,
  maxTokens = 16000,
  signal,
  maxSearchUses = 10,
}) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': API_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages,
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: maxSearchUses,
        },
      ],
    }),
    signal,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const msg = err.error?.message || `API error ${response.status}`;

    if (response.status === 401) throw new ApiError(msg, 'auth');
    if (response.status === 429) throw new ApiError(msg, 'rate_limit');
    if (response.status >= 500) throw new ApiError(msg, 'server');
    throw new ApiError(msg, 'unknown');
  }

  const data = await response.json();

  // If the model made tool_use calls (web_search), we may need to continue the conversation
  // The API returns the full content including search results inline
  const textBlocks = data.content?.filter(b => b.type === 'text') || [];
  const text = textBlocks.map(b => b.text).join('');
  const hasToolUse = data.content?.some(b => b.type === 'tool_use');
  const searchResults = data.content?.filter(b => b.type === 'web_search_tool_result') || [];

  return {
    text,
    content: data.content,
    hasToolUse,
    searchResults,
    stopReason: data.stop_reason,
    usage: data.usage,
  };
}

// Multi-turn agent: keeps calling until we get a final text response
export async function runAgent({
  apiKey,
  model,
  system,
  userMessage,
  maxTurns = 4,
  maxTokens = 16000,
  signal,
  onTurn,
  maxSearchUses = 10,
}) {
  const messages = [{ role: 'user', content: userMessage }];

  for (let turn = 0; turn < maxTurns; turn++) {
    if (signal?.aborted) throw new ApiError('Aborted', 'abort');

    onTurn?.(turn, messages.length);

    const result = await callAnthropic({
      apiKey, model, system, messages, maxTokens, signal, maxSearchUses,
    });

    // If we got a final text response (stop_reason is end_turn or stop_sequence)
    if (result.stopReason === 'end_turn' || !result.hasToolUse) {
      return result;
    }

    // The model wants to use tools — add assistant response and continue
    messages.push({ role: 'assistant', content: result.content });

    // For web_search, the API handles it server-side. We just need to prompt for the next turn.
    messages.push({
      role: 'user',
      content: 'Continue with your analysis. If you have gathered enough data from your searches, provide your final structured JSON response now.',
    });
  }

  // If we exhausted turns, return whatever we have
  const lastResult = await callAnthropic({
    apiKey, model, system, messages, maxTokens, signal, maxSearchUses,
  });
  return lastResult;
}

export class ApiError extends Error {
  constructor(message, type) {
    super(message);
    this.name = 'ApiError';
    this.type = type;
  }
}
