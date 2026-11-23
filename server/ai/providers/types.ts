import type { AIErrorCategory, AIProviderId, ModelRegistryEntry } from '../types.ts';

export interface ProviderInvokeTextParams {
  modelId: string;
  systemInstruction: string;
  userPrompt: string;
  maxOutputTokens: number;
  requireJson: boolean;
  jsonSchema?: Record<string, unknown>;
  timeoutMs: number;
}

export interface ProviderTextResult {
  rawText: string;
  actualModelUsed?: string;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  };
  rateLimitInfo?: string | null;
}

export interface ProviderInvokeImageParams {
  modelId: string;
  prompt: string;
  aspectRatio?: string;
  timeoutMs: number;
}

export interface ProviderImageResult {
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  buffer: Buffer;
  actualModelUsed?: string;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  };
}

export class ProviderInvocationError extends Error {
  category: AIErrorCategory;
  httpStatus: number;
  code: string;
  rateLimitInfo?: string | null;

  constructor(params: {
    message: string;
    category: AIErrorCategory;
    httpStatus: number;
    code: string;
    rateLimitInfo?: string | null;
  }) {
    super(params.message);
    this.name = 'ProviderInvocationError';
    this.category = params.category;
    this.httpStatus = params.httpStatus;
    this.code = params.code;
    this.rateLimitInfo = params.rateLimitInfo;
  }
}

export interface AIProviderAdapter {
  readonly providerId: AIProviderId;
  isConfigured(): boolean;
  discoverModels(): Promise<ModelRegistryEntry[]>;
  checkSingleModelPricing?(modelId: string): Promise<{
    exists: boolean;
    isFreeVerified: boolean;
    inputPricing: number | null;
    outputPricing: number | null;
    reason: string;
  }>;
  invokeTextJson(params: ProviderInvokeTextParams): Promise<ProviderTextResult>;
  invokeImageGeneration?(params: ProviderInvokeImageParams): Promise<ProviderImageResult>;
  getAccountQuota?(): Promise<{
    used: number;
    limit: number;
    remaining: number;
    isFreeTier: boolean;
  } | null>;
}
