export type AIProviderId = 'openrouter';

export type AIPoolName = 'chronicle' | 'quest' | 'achievement' | 'image';

export type ModelHealthStatus =
  | 'healthy'
  | 'degraded'
  | 'cooldown'
  | 'unavailable'
  | 'circuit_open'
  | 'rejected_paid';

export type AIErrorCategory = 'temporary' | 'quota' | 'permanent' | 'pricing_changed';

export type PendingTaskStatus =
  | 'Pending'
  | 'Processing'
  | 'Completed'
  | 'Failed'
  | 'Awaiting user input'
  | 'Awaiting artwork'
  | 'Cancelled';

export type OverallAIStatus =
  | 'Operational'
  | 'Limited'
  | 'Switching model'
  | 'Waiting for free capacity'
  | 'Pending'
  | 'Temporarily unavailable';

export interface ModelRegistryEntry {
  /** Canonical unique registry key: `${provider}:${modelId}` */
  id: string;
  modelId: string;
  provider: AIProviderId;
  displayName: string;
  inputPricing: number | null;
  outputPricing: number | null;
  requestPricing: number | null;
  imagePricing: number | null;
  isFreeVerified: boolean;
  freeVerificationReason: string;
  supportedModalities: {
    input: string[];
    output: string[];
  };
  contextLength: number;
  supportsStructuredOutput: boolean;
  supportsToolCalling: boolean;
  supportsImageGeneration: boolean;
  pools: AIPoolName[];
  priorityByPool: Partial<Record<AIPoolName, number>>;
  healthStatus: ModelHealthStatus;
  cooldownUntil: number | null;
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailureReason: string | null;
  lastErrorType: AIErrorCategory | null;
  rateLimitInfo: string | null;
  pricingLastVerifiedAt: string;
}

export interface PendingTaskRecord {
  id: string;
  userId: string;
  taskType: AIPoolName;
  priority: number;
  idempotencyKey: string;
  originalInput: Record<string, unknown>;
  context: Record<string, unknown>;
  expectedFormat: string;
  status: PendingTaskStatus;
  attemptCount: number;
  maxAttempts: number;
  modelsAttempted: string[];
  failureReason: string | null;
  createdAt: string;
  lastAttemptAt: string | null;
  nextRetryAt: string | null;
  result: unknown | null;
}

export interface ProviderUsageBucket {
  requests: number;
  successes: number;
  failures: number;
  rateLimits: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface ModelUsageBucket {
  provider: AIProviderId;
  requests: number;
  successes: number;
  failures: number;
  rateLimits: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface SanitizedFailureEvent {
  timestamp: string;
  modelId: string;
  provider: AIProviderId;
  pool: AIPoolName;
  errorType: AIErrorCategory;
  message: string;
}

export interface UsageLimitsConfig {
  dailyRequestBudget: number;
  maxRequestsPerMinute: number;
  perModelDailyLimit: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  perTaskRetryBudget: number;
}

export interface UsageTrackerState {
  dailyDate: string;
  monthlyKey: string;
  totalRequests: number;
  dailyRequests: number;
  monthlyRequests: number;
  successfulRequests: number;
  failedRequests: number;
  rateLimitErrors: number;
  /** Null if no provider has reported token counts yet; never fabricated */
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  estimatedCostUsd: number;
  byProvider: Record<string, ProviderUsageBucket>;
  byModel: Record<string, ModelUsageBucket>;
  byCategory: Record<string, { requests: number; successes: number; failures: number }>;
  dailyByModel: Record<string, number>;
  recentFailures: SanitizedFailureEvent[];
  openRouterAccountQuota: {
    used: number;
    limit: number;
    remaining: number;
    isFreeTier: boolean;
    checkedAt: string;
  } | null;
}

export interface AIStatusSnapshot {
  freeOnlyMode: true;
  overallStatus: OverallAIStatus;
  activeModelId: string | null;
  activeModelName: string | null;
  activeProvider: AIProviderId | null;
  imageGenerationAvailable: boolean;
  imageGenerationReason: string;
  availableFreeModels: Array<{
    id: string;
    modelId: string;
    provider: AIProviderId;
    displayName: string;
    pools: AIPoolName[];
    healthStatus: ModelHealthStatus;
    contextLength: number;
    supportsStructuredOutput: boolean;
    supportsImageGeneration: boolean;
    lastSuccessAt: string | null;
  }>;
  cooldownModels: Array<{
    id: string;
    displayName: string;
    provider: AIProviderId;
    cooldownUntil: string | null;
    lastFailureReason: string | null;
  }>;
  unavailableModels: Array<{
    id: string;
    displayName: string;
    provider: AIProviderId;
    healthStatus: ModelHealthStatus;
    lastFailureReason: string | null;
  }>;
  pendingTaskCount: number;
  failedTaskCount: number;
  awaitingArtworkCount: number;
  usage: {
    dailyRequests: number;
    dailyBudget: number;
    monthlyRequests: number;
    requestsLastMinute: number;
    maxRequestsPerMinute: number;
    successfulRequests: number;
    failedRequests: number;
    rateLimitErrors: number;
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
    estimatedCostUsd: number;
    openRouterQuota: UsageTrackerState['openRouterAccountQuota'];
  };
  recentFailures: SanitizedFailureEvent[];
  providers: Array<{
    provider: AIProviderId;
    configured: boolean;
    enabled: boolean;
    note: string;
  }>;
}
