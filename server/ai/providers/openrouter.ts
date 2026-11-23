import type { AIPoolName, ModelRegistryEntry } from '../types.ts';
import {
  type AIProviderAdapter,
  type ProviderImageResult,
  type ProviderInvokeImageParams,
  type ProviderInvokeTextParams,
  type ProviderTextResult,
  ProviderInvocationError,
} from './types.ts';

interface OpenRouterRawModel {
  id: string;
  name?: string;
  context_length?: number;
  architecture?: {
    modality?: string;
    input_modalities?: string[];
    output_modalities?: string[];
  };
  pricing?: {
    prompt?: string | number;
    completion?: string | number;
    request?: string | number;
    image?: string | number;
    web_search?: string | number;
    internal_reasoning?: string | number;
  };
  supported_parameters?: string[];
}

export function verifyOpenRouterPricing(pricing?: OpenRouterRawModel['pricing']): {
  isFreeVerified: boolean;
  inputPricing: number | null;
  outputPricing: number | null;
  requestPricing: number | null;
  imagePricing: number | null;
  reason: string;
} {
  if (!pricing || pricing.prompt === undefined || pricing.completion === undefined) {
    return {
      isFreeVerified: false,
      inputPricing: null,
      outputPricing: null,
      requestPricing: null,
      imagePricing: null,
      reason: 'Missing or unavailable input/output pricing metadata',
    };
  }

  const promptCost = Number(pricing.prompt);
  const completionCost = Number(pricing.completion);
  const requestCost = pricing.request !== undefined ? Number(pricing.request) : 0;
  const imageCost = pricing.image !== undefined ? Number(pricing.image) : 0;
  const webSearchCost = pricing.web_search !== undefined ? Number(pricing.web_search) : 0;
  const reasoningCost =
    pricing.internal_reasoning !== undefined ? Number(pricing.internal_reasoning) : 0;

  if (
    !Number.isFinite(promptCost) ||
    !Number.isFinite(completionCost) ||
    !Number.isFinite(requestCost) ||
    !Number.isFinite(imageCost) ||
    !Number.isFinite(webSearchCost) ||
    !Number.isFinite(reasoningCost)
  ) {
    return {
      isFreeVerified: false,
      inputPricing: Number.isFinite(promptCost) ? promptCost : null,
      outputPricing: Number.isFinite(completionCost) ? completionCost : null,
      requestPricing: Number.isFinite(requestCost) ? requestCost : null,
      imagePricing: Number.isFinite(imageCost) ? imageCost : null,
      reason: 'Non-numeric pricing metadata rejected',
    };
  }

  if (
    promptCost !== 0 ||
    completionCost !== 0 ||
    requestCost !== 0 ||
    imageCost !== 0 ||
    webSearchCost !== 0 ||
    reasoningCost !== 0
  ) {
    return {
      isFreeVerified: false,
      inputPricing: promptCost,
      outputPricing: completionCost,
      requestPricing: requestCost,
      imagePricing: imageCost,
      reason: `Non-zero pricing detected (prompt=${promptCost}, completion=${completionCost})`,
    };
  }

  return {
    isFreeVerified: true,
    inputPricing: 0,
    outputPricing: 0,
    requestPricing: 0,
    imagePricing: 0,
    reason: 'Verified zero-cost prompt and completion pricing via OpenRouter catalogue',
  };
}

const CHRONICLE_RANK: Record<string, number> = {
  'google/gemma-4-31b-it:free': 10,
  'nvidia/nemotron-3.5-super-vl:free': 20,
  'baidu/ernie-5.5-flash-preview:free': 30,
  'inclusionai/ling-3.2-flash:free': 40,
  'particle-ai/particle-1:free': 50,
  'dots-studio/dots-3-note-preview:free': 60,
  'google/gemma-4-26b-a4b-it:free': 70,
  'recursive/flint-v1.0:free': 80,
  'openrouter/free': 90,
  'liquid/lfm-3-1.7b:free': 120,
};

const QUEST_RANK: Record<string, number> = {
  'baidu/ernie-5.5-flash-preview:free': 10,
  'google/gemma-4-31b-it:free': 20,
  'particle-ai/particle-1:free': 30,
  'inclusionai/ling-3.2-flash:free': 40,
  'nvidia/nemotron-3.5-super-vl:free': 50,
  'google/gemma-4-26b-a4b-it:free': 60,
  'dots-studio/dots-3-note-preview:free': 70,
  'recursive/flint-v1.0:free': 80,
  'openrouter/free': 90,
  'liquid/lfm-3-1.7b:free': 120,
};

const ACHIEVEMENT_RANK: Record<string, number> = {
  'baidu/ernie-5.5-flash-preview:free': 10,
  'inclusionai/ling-3.2-flash:free': 20,
  'google/gemma-4-26b-a4b-it:free': 30,
  'particle-ai/particle-1:free': 40,
  'google/gemma-4-31b-it:free': 50,
  'nvidia/nemotron-3.5-super-vl:free': 60,
  'recursive/flint-v1.0:free': 70,
  'openrouter/free': 90,
  'liquid/lfm-3-1.7b:free': 110,
};

function computeBaseRank(modelId: string, rankMap: Record<string, number>): number {
  if (rankMap[modelId] !== undefined) return rankMap[modelId];
  return 100;
}

export class OpenRouterProvider implements AIProviderAdapter {
  readonly providerId = 'openrouter' as const;

  private getApiKey(): string {
    return (process.env.OPENROUTER_API_KEY || '').trim();
  }

  private getBaseUrl(): string {
    const raw = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').trim();
    return raw.replace(/\/+$/, '');
  }

  isConfigured(): boolean {
    const key = this.getApiKey();
    return Boolean(key && key !== 'MY_OPENROUTER_API_KEY');
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new ProviderInvocationError({
          message: `OpenRouter request timed out after ${timeoutMs}ms`,
          category: 'temporary',
          httpStatus: 504,
          code: 'OPENROUTER_TIMEOUT',
        });
      }
      throw new ProviderInvocationError({
        message: 'Network error communicating with OpenRouter',
        category: 'temporary',
        httpStatus: 503,
        code: 'OPENROUTER_NETWORK_ERROR',
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async discoverModels(): Promise<ModelRegistryEntry[]> {
    const nowIso = new Date().toISOString();
    const res = await this.fetchWithTimeout(
      `${this.getBaseUrl()}/models`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...(this.isConfigured() ? { Authorization: `Bearer ${this.getApiKey()}` } : {}),
        },
      },
      15000
    );

    if (!res.ok) {
      throw new ProviderInvocationError({
        message: `OpenRouter model catalogue returned HTTP ${res.status}`,
        category: res.status === 429 ? 'quota' : res.status >= 500 ? 'temporary' : 'permanent',
        httpStatus: res.status,
        code: 'CATALOG_FETCH_FAILED',
      });
    }

    const payload = (await res.json()) as { data?: OpenRouterRawModel[] };
    const rawModels = Array.isArray(payload.data) ? payload.data : [];
    const entries: ModelRegistryEntry[] = [];

    for (const raw of rawModels) {
      const pricingCheck = verifyOpenRouterPricing(raw.pricing);
      if (!pricingCheck.isFreeVerified) {
        // Strictly ignore non-free models during catalogue registration
        continue;
      }

      const inputMods = Array.isArray(raw.architecture?.input_modalities)
        ? raw.architecture.input_modalities
        : ['text'];
      const outputMods = Array.isArray(raw.architecture?.output_modalities)
        ? raw.architecture.output_modalities
        : ['text'];
      const params = Array.isArray(raw.supported_parameters) ? raw.supported_parameters : [];

      const supportsStructuredOutput =
        params.includes('response_format') || params.includes('structured_outputs');
      const supportsToolCalling = params.includes('tools');
      const supportsImageGeneration = outputMods.includes('image');
      const isAudioOutput = outputMods.includes('audio');
      const supportsTextReasoning = outputMods.includes('text') && !isAudioOutput;

      const pools: AIPoolName[] = [];
      const priorityByPool: Partial<Record<AIPoolName, number>> = {};

      if (supportsTextReasoning && supportsStructuredOutput) {
        pools.push('chronicle', 'quest', 'achievement');
        priorityByPool.chronicle = computeBaseRank(raw.id, CHRONICLE_RANK);
        priorityByPool.quest = computeBaseRank(raw.id, QUEST_RANK);
        priorityByPool.achievement = computeBaseRank(raw.id, ACHIEVEMENT_RANK);
      }

      if (supportsImageGeneration) {
        pools.push('image');
        priorityByPool.image = 10;
      }

      // Skip audio-only or non-JSON models from routing pools, or keep them marked unavailable for JSON pools
      if (pools.length === 0) {
        continue;
      }

      entries.push({
        id: `openrouter:${raw.id}`,
        modelId: raw.id,
        provider: 'openrouter',
        displayName: raw.name || raw.id,
        inputPricing: pricingCheck.inputPricing,
        outputPricing: pricingCheck.outputPricing,
        requestPricing: pricingCheck.requestPricing,
        imagePricing: pricingCheck.imagePricing,
        isFreeVerified: true,
        freeVerificationReason: pricingCheck.reason,
        supportedModalities: {
          input: inputMods,
          output: outputMods,
        },
        contextLength: Number(raw.context_length) || 32768,
        supportsStructuredOutput,
        supportsToolCalling,
        supportsImageGeneration,
        pools,
        priorityByPool,
        healthStatus: 'healthy',
        cooldownUntil: null,
        consecutiveFailures: 0,
        lastSuccessAt: null,
        lastFailureAt: null,
        lastFailureReason: null,
        lastErrorType: null,
        rateLimitInfo: null,
        pricingLastVerifiedAt: nowIso,
      });
    }

    return entries;
  }

  async checkSingleModelPricing(modelId: string) {
    const models = await this.discoverModelsRawMap();
    const raw = models.get(modelId);
    if (!raw) {
      return {
        exists: false,
        isFreeVerified: false,
        inputPricing: null,
        outputPricing: null,
        reason: 'Model no longer present in OpenRouter catalogue',
      };
    }
    const check = verifyOpenRouterPricing(raw.pricing);
    return {
      exists: true,
      isFreeVerified: check.isFreeVerified,
      inputPricing: check.inputPricing,
      outputPricing: check.outputPricing,
      reason: check.reason,
    };
  }

  private async discoverModelsRawMap(): Promise<Map<string, OpenRouterRawModel>> {
    const res = await this.fetchWithTimeout(
      `${this.getBaseUrl()}/models`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...(this.isConfigured() ? { Authorization: `Bearer ${this.getApiKey()}` } : {}),
        },
      },
      12000
    );
    if (!res.ok) {
      throw new ProviderInvocationError({
        message: `OpenRouter catalogue check failed with HTTP ${res.status}`,
        category: res.status >= 500 ? 'temporary' : 'quota',
        httpStatus: res.status,
        code: 'CATALOG_CHECK_FAILED',
      });
    }
    const payload = (await res.json()) as { data?: OpenRouterRawModel[] };
    const map = new Map<string, OpenRouterRawModel>();
    for (const m of payload.data || []) {
      map.set(m.id, m);
    }
    return map;
  }

  async getAccountQuota(): Promise<{
    used: number;
    limit: number;
    remaining: number;
    isFreeTier: boolean;
  } | null> {
    if (!this.isConfigured()) return null;
    try {
      const res = await this.fetchWithTimeout(
        `${this.getBaseUrl()}/key`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.getApiKey()}`,
            Accept: 'application/json',
          },
        },
        8000
      );
      if (!res.ok) return null;
      const payload = (await res.json()) as {
        data?: {
          is_free_tier?: boolean;
          free_model_daily_requests?: {
            used?: number;
            limit?: number;
            remaining?: number;
          };
        };
      };
      const freeStats = payload.data?.free_model_daily_requests;
      if (!freeStats || typeof freeStats.limit !== 'number') return null;
      return {
        used: Number(freeStats.used) || 0,
        limit: Number(freeStats.limit) || 50,
        remaining: Number(freeStats.remaining) || 0,
        isFreeTier: Boolean(payload.data?.is_free_tier),
      };
    } catch {
      return null;
    }
  }

  private classifyOpenRouterError(
    status: number,
    errorPayload?: { message?: string; code?: number | string; metadata?: { raw?: string } }
  ): ProviderInvocationError {
    const code = Number(errorPayload?.code || status);
    const rawMsg =
      errorPayload?.metadata?.raw || errorPayload?.message || `OpenRouter HTTP ${status}`;

    if (status === 429 || code === 429 || /rate[- ]?limit|quota|limit/i.test(rawMsg)) {
      return new ProviderInvocationError({
        message: 'OpenRouter free-tier rate limit reached for this model.',
        category: 'quota',
        httpStatus: 429,
        code: 'OPENROUTER_RATE_LIMITED',
      });
    }

    if (status === 401 || status === 403 || code === 401 || code === 403) {
      return new ProviderInvocationError({
        message: 'OpenRouter API key was rejected or lacks permission.',
        category: 'permanent',
        httpStatus: status,
        code: 'OPENROUTER_AUTH_ERROR',
      });
    }

    if (
      status === 400 ||
      status === 404 ||
      status === 422 ||
      /invalid model|not a valid model|does not support|unsupported/i.test(rawMsg)
    ) {
      return new ProviderInvocationError({
        message: `OpenRouter model/request rejected: ${rawMsg.slice(0, 140)}`,
        category: 'permanent',
        httpStatus: status >= 400 ? status : 400,
        code: 'OPENROUTER_INVALID_REQUEST',
      });
    }

    return new ProviderInvocationError({
      message: `OpenRouter temporary provider error (HTTP ${status}).`,
      category: 'temporary',
      httpStatus: status >= 500 ? status : 503,
      code: 'OPENROUTER_TEMPORARY_ERROR',
    });
  }

  async invokeTextJson(params: ProviderInvokeTextParams): Promise<ProviderTextResult> {
    if (!this.isConfigured()) {
      throw new ProviderInvocationError({
        message: 'OPENROUTER_API_KEY is not configured in the server environment.',
        category: 'permanent',
        httpStatus: 503,
        code: 'OPENROUTER_MISSING_KEY',
      });
    }

    const appUrl = (process.env.APP_URL || 'https://chronicle-rpg.local').trim();
    const requestBody: Record<string, unknown> = {
      model: params.modelId,
      messages: [
        { role: 'system', content: params.systemInstruction },
        { role: 'user', content: params.userPrompt },
      ],
      max_tokens: params.maxOutputTokens,
      temperature: 0.3,
    };

    if (params.requireJson) {
      requestBody.response_format = { type: 'json_object' };
    }

    const res = await this.fetchWithTimeout(
      `${this.getBaseUrl()}/chat/completions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.getApiKey()}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'HTTP-Referer': appUrl,
          'X-Title': 'Chronicle Real-Life RPG',
        },
        body: JSON.stringify(requestBody),
      },
      params.timeoutMs
    );

    const rateLimitLimit = res.headers.get('x-ratelimit-limit');
    const rateLimitRemaining = res.headers.get('x-ratelimit-remaining');
    const rateLimitInfo =
      rateLimitLimit || rateLimitRemaining
        ? `limit=${rateLimitLimit ?? '?'}, remaining=${rateLimitRemaining ?? '?'}`
        : null;

    let payload: {
      id?: string;
      model?: string;
      choices?: Array<{
        message?: { content?: string | null };
        finish_reason?: string;
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
        cost?: number;
      };
      error?: {
        message?: string;
        code?: number | string;
        metadata?: { raw?: string };
      };
    };

    try {
      payload = (await res.json()) as typeof payload;
    } catch {
      throw new ProviderInvocationError({
        message: `OpenRouter returned non-JSON response (HTTP ${res.status})`,
        category: res.status >= 500 ? 'temporary' : 'permanent',
        httpStatus: res.status || 502,
        code: 'OPENROUTER_MALFORMED_HTTP',
        rateLimitInfo,
      });
    }

    if (!res.ok || payload.error) {
      const err = this.classifyOpenRouterError(res.status, payload.error);
      err.rateLimitInfo = rateLimitInfo;
      throw err;
    }

    // Extra runtime safeguard: if OpenRouter ever bills non-zero cost, flag pricing_changed immediately
    if (typeof payload.usage?.cost === 'number' && payload.usage.cost > 0) {
      throw new ProviderInvocationError({
        message: `Model ${params.modelId} reported non-zero cost (${payload.usage.cost}); blocked by FREE_ONLY_MODE.`,
        category: 'pricing_changed',
        httpStatus: 402,
        code: 'NON_ZERO_COST_BLOCKED',
        rateLimitInfo,
      });
    }

    const content = payload.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string' || !content.trim()) {
      throw new ProviderInvocationError({
        message: `Model ${params.modelId} returned empty response content.`,
        category: 'temporary',
        httpStatus: 502,
        code: 'OPENROUTER_EMPTY_CONTENT',
        rateLimitInfo,
      });
    }

    return {
      rawText: content,
      actualModelUsed: payload.model || params.modelId,
      usage: {
        inputTokens:
          typeof payload.usage?.prompt_tokens === 'number' ? payload.usage.prompt_tokens : null,
        outputTokens:
          typeof payload.usage?.completion_tokens === 'number'
            ? payload.usage.completion_tokens
            : null,
        totalTokens:
          typeof payload.usage?.total_tokens === 'number' ? payload.usage.total_tokens : null,
      },
      rateLimitInfo,
    };
  }

  async invokeImageGeneration(
    params: ProviderInvokeImageParams
  ): Promise<ProviderImageResult> {
    if (!this.isConfigured()) {
      throw new ProviderInvocationError({
        message: 'OPENROUTER_API_KEY is not configured in the server environment.',
        category: 'permanent',
        httpStatus: 503,
        code: 'OPENROUTER_MISSING_KEY',
      });
    }

    const appUrl = (process.env.APP_URL || 'https://chronicle-rpg.local').trim();
    const res = await this.fetchWithTimeout(
      `${this.getBaseUrl()}/chat/completions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.getApiKey()}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'HTTP-Referer': appUrl,
          'X-Title': 'Chronicle Real-Life RPG',
        },
        body: JSON.stringify({
          model: params.modelId,
          messages: [{ role: 'user', content: params.prompt }],
          modalities: ['image', 'text'],
          ...(params.aspectRatio ? { image_config: { aspect_ratio: params.aspectRatio } } : {}),
        }),
      },
      params.timeoutMs
    );

    let payload: {
      model?: string;
      choices?: Array<{
        message?: {
          images?: Array<{ image_url?: { url?: string } }>;
        };
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
        cost?: number;
      };
      error?: {
        message?: string;
        code?: number | string;
        metadata?: { raw?: string };
      };
    };

    try {
      payload = (await res.json()) as typeof payload;
    } catch {
      throw new ProviderInvocationError({
        message: `OpenRouter image endpoint returned non-JSON response (HTTP ${res.status})`,
        category: 'temporary',
        httpStatus: res.status || 502,
        code: 'OPENROUTER_IMAGE_MALFORMED_HTTP',
      });
    }

    if (!res.ok || payload.error) {
      throw this.classifyOpenRouterError(res.status, payload.error);
    }

    if (typeof payload.usage?.cost === 'number' && payload.usage.cost > 0) {
      throw new ProviderInvocationError({
        message: `Image model ${params.modelId} reported non-zero cost; blocked by FREE_ONLY_MODE.`,
        category: 'pricing_changed',
        httpStatus: 402,
        code: 'NON_ZERO_COST_BLOCKED',
      });
    }

    const dataUrl = payload.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!dataUrl || typeof dataUrl !== 'string') {
      throw new ProviderInvocationError({
        message: 'No generated image payload returned by provider.',
        category: 'temporary',
        httpStatus: 502,
        code: 'EMPTY_IMAGE_OUTPUT',
      });
    }

    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!match) {
      throw new ProviderInvocationError({
        message: 'Unsupported or temporary image URL format rejected.',
        category: 'permanent',
        httpStatus: 502,
        code: 'UNSUPPORTED_IMAGE_FORMAT',
      });
    }

    const mimeType = match[1] as 'image/png' | 'image/jpeg' | 'image/webp';
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length < 256) {
      throw new ProviderInvocationError({
        message: 'Generated image buffer failed minimum size validation.',
        category: 'temporary',
        httpStatus: 502,
        code: 'CORRUPT_IMAGE_BUFFER',
      });
    }

    return {
      mimeType,
      buffer,
      actualModelUsed: payload.model || params.modelId,
      usage: {
        inputTokens:
          typeof payload.usage?.prompt_tokens === 'number' ? payload.usage.prompt_tokens : null,
        outputTokens:
          typeof payload.usage?.completion_tokens === 'number'
            ? payload.usage.completion_tokens
            : null,
        totalTokens:
          typeof payload.usage?.total_tokens === 'number' ? payload.usage.total_tokens : null,
      },
    };
  }
}
