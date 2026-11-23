import fs from 'fs';
import path from 'path';
import type {
  AIErrorCategory,
  AIPoolName,
  AIProviderId,
  SanitizedFailureEvent,
  UsageLimitsConfig,
  UsageTrackerState,
} from './types.ts';

const DEFAULT_LIMITS: UsageLimitsConfig = {
  dailyRequestBudget: 50,
  maxRequestsPerMinute: 16,
  perModelDailyLimit: 20,
  maxInputTokens: 8000,
  maxOutputTokens: 2400,
  perTaskRetryBudget: 6,
};

function todayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

export function sanitizeFailureMessage(raw: string): string {
  if (!raw) return 'Provider request failed.';
  if (/sk-or-[a-zA-Z0-9_-]+|AIza[0-9A-Za-z_-]{10,}|Bearer\s+\S+|apiKey=/i.test(raw)) {
    return 'Provider authentication or request error (details redacted).';
  }
  return raw.slice(0, 220);
}

export class UsageTracker {
  private readonly usageFilePath: string;
  private state: UsageTrackerState;
  private limits: UsageLimitsConfig;
  private recentTimestamps: number[] = [];

  constructor(dataDir: string, limits?: Partial<UsageLimitsConfig>) {
    this.usageFilePath = path.resolve(dataDir, 'ai-usage.json');
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    this.state = this.loadState();
  }

  private createInitialState(): UsageTrackerState {
    return {
      dailyDate: todayDateKey(),
      monthlyKey: currentMonthKey(),
      totalRequests: 0,
      dailyRequests: 0,
      monthlyRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rateLimitErrors: 0,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      estimatedCostUsd: 0,
      byProvider: {},
      byModel: {},
      byCategory: {},
      dailyByModel: {},
      recentFailures: [],
      openRouterAccountQuota: null,
    };
  }

  private loadState(): UsageTrackerState {
    try {
      if (!fs.existsSync(this.usageFilePath)) {
        return this.createInitialState();
      }
      const raw = fs.readFileSync(this.usageFilePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<UsageTrackerState>;
      const merged: UsageTrackerState = {
        ...this.createInitialState(),
        ...parsed,
      };
      this.rollPeriodsIfNeeded(merged);
      return merged;
    } catch {
      return this.createInitialState();
    }
  }

  private rollPeriodsIfNeeded(target: UsageTrackerState): void {
    const today = todayDateKey();
    const month = currentMonthKey();
    if (target.dailyDate !== today) {
      target.dailyDate = today;
      target.dailyRequests = 0;
      target.dailyByModel = {};
    }
    if (target.monthlyKey !== month) {
      target.monthlyKey = month;
      target.monthlyRequests = 0;
    }
  }

  private persist(): void {
    try {
      fs.mkdirSync(path.dirname(this.usageFilePath), { recursive: true });
      const tmp = `${this.usageFilePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), 'utf-8');
      fs.renameSync(tmp, this.usageFilePath);
    } catch {
      // Non-fatal persistence safeguard
    }
  }

  getLimits(): UsageLimitsConfig {
    return { ...this.limits };
  }

  updateLimits(partial: Partial<UsageLimitsConfig>): void {
    this.limits = { ...this.limits, ...partial };
  }

  updateOpenRouterQuota(quota: {
    used: number;
    limit: number;
    remaining: number;
    isFreeTier: boolean;
  }): void {
    this.state.openRouterAccountQuota = {
      ...quota,
      checkedAt: new Date().toISOString(),
    };
    this.persist();
  }

  getRequestsLastMinute(): number {
    const cutoff = Date.now() - 60000;
    this.recentTimestamps = this.recentTimestamps.filter((ts) => ts >= cutoff);
    return this.recentTimestamps.length;
  }

  canSendRequest(provider: AIProviderId, canonicalModelId: string): {
    allowed: boolean;
    reason?: string;
  } {
    this.rollPeriodsIfNeeded(this.state);

    if (this.getRequestsLastMinute() >= this.limits.maxRequestsPerMinute) {
      return {
        allowed: false,
        reason: `Global per-minute limit reached (${this.limits.maxRequestsPerMinute} req/min).`,
      };
    }

    if (this.state.dailyRequests >= this.limits.dailyRequestBudget) {
      return {
        allowed: false,
        reason: `Daily request budget reached (${this.limits.dailyRequestBudget}).`,
      };
    }

    const modelDaily = this.state.dailyByModel[canonicalModelId] || 0;
    if (modelDaily >= this.limits.perModelDailyLimit) {
      return {
        allowed: false,
        reason: `Per-model daily quota reached for ${canonicalModelId}.`,
      };
    }

    if (
      provider === 'openrouter' &&
      this.state.openRouterAccountQuota &&
      this.state.openRouterAccountQuota.remaining <= 0
    ) {
      return {
        allowed: false,
        reason: 'OpenRouter account-wide daily free request quota is exhausted.',
      };
    }

    return { allowed: true };
  }

  recordAttemptStart(
    provider: AIProviderId,
    canonicalModelId: string,
    category: AIPoolName
  ): void {
    this.rollPeriodsIfNeeded(this.state);
    this.recentTimestamps.push(Date.now());

    this.state.totalRequests += 1;
    this.state.dailyRequests += 1;
    this.state.monthlyRequests += 1;
    this.state.dailyByModel[canonicalModelId] =
      (this.state.dailyByModel[canonicalModelId] || 0) + 1;

    if (!this.state.byProvider[provider]) {
      this.state.byProvider[provider] = {
        requests: 0,
        successes: 0,
        failures: 0,
        rateLimits: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      };
    }
    this.state.byProvider[provider].requests += 1;

    if (!this.state.byModel[canonicalModelId]) {
      this.state.byModel[canonicalModelId] = {
        provider,
        requests: 0,
        successes: 0,
        failures: 0,
        rateLimits: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      };
    }
    this.state.byModel[canonicalModelId].requests += 1;

    if (!this.state.byCategory[category]) {
      this.state.byCategory[category] = { requests: 0, successes: 0, failures: 0 };
    }
    this.state.byCategory[category].requests += 1;

    this.persist();
  }

  recordSuccess(params: {
    provider: AIProviderId;
    canonicalModelId: string;
    category: AIPoolName;
    usage: {
      inputTokens: number | null;
      outputTokens: number | null;
      totalTokens: number | null;
    };
  }): void {
    this.rollPeriodsIfNeeded(this.state);
    this.state.successfulRequests += 1;

    if (this.state.byProvider[params.provider]) {
      this.state.byProvider[params.provider].successes += 1;
    }
    if (this.state.byModel[params.canonicalModelId]) {
      this.state.byModel[params.canonicalModelId].successes += 1;
    }
    if (this.state.byCategory[params.category]) {
      this.state.byCategory[params.category].successes += 1;
    }

    // Only count real token usage returned by providers; never fabricate counts
    const { inputTokens, outputTokens, totalTokens } = params.usage;
    if (inputTokens !== null) {
      this.state.inputTokens = (this.state.inputTokens ?? 0) + inputTokens;
      if (this.state.byProvider[params.provider]) {
        this.state.byProvider[params.provider].inputTokens += inputTokens;
      }
      if (this.state.byModel[params.canonicalModelId]) {
        this.state.byModel[params.canonicalModelId].inputTokens += inputTokens;
      }
    }
    if (outputTokens !== null) {
      this.state.outputTokens = (this.state.outputTokens ?? 0) + outputTokens;
      if (this.state.byProvider[params.provider]) {
        this.state.byProvider[params.provider].outputTokens += outputTokens;
      }
      if (this.state.byModel[params.canonicalModelId]) {
        this.state.byModel[params.canonicalModelId].outputTokens += outputTokens;
      }
    }
    if (totalTokens !== null) {
      this.state.totalTokens = (this.state.totalTokens ?? 0) + totalTokens;
      if (this.state.byProvider[params.provider]) {
        this.state.byProvider[params.provider].totalTokens += totalTokens;
      }
      if (this.state.byModel[params.canonicalModelId]) {
        this.state.byModel[params.canonicalModelId].totalTokens += totalTokens;
      }
    }

    if (params.provider === 'openrouter' && this.state.openRouterAccountQuota) {
      this.state.openRouterAccountQuota.used += 1;
      this.state.openRouterAccountQuota.remaining = Math.max(
        0,
        this.state.openRouterAccountQuota.remaining - 1
      );
    }

    this.persist();
  }

  recordFailure(params: {
    provider: AIProviderId;
    canonicalModelId: string;
    modelId: string;
    category: AIPoolName;
    errorType: AIErrorCategory;
    message: string;
  }): void {
    this.rollPeriodsIfNeeded(this.state);
    this.state.failedRequests += 1;
    if (params.errorType === 'quota') {
      this.state.rateLimitErrors += 1;
    }

    if (this.state.byProvider[params.provider]) {
      this.state.byProvider[params.provider].failures += 1;
      if (params.errorType === 'quota') {
        this.state.byProvider[params.provider].rateLimits += 1;
      }
    }
    if (this.state.byModel[params.canonicalModelId]) {
      this.state.byModel[params.canonicalModelId].failures += 1;
      if (params.errorType === 'quota') {
        this.state.byModel[params.canonicalModelId].rateLimits += 1;
      }
    }
    if (this.state.byCategory[params.category]) {
      this.state.byCategory[params.category].failures += 1;
    }

    const event: SanitizedFailureEvent = {
      timestamp: new Date().toISOString(),
      modelId: params.modelId,
      provider: params.provider,
      pool: params.category,
      errorType: params.errorType,
      message: sanitizeFailureMessage(params.message),
    };

    this.state.recentFailures = [event, ...this.state.recentFailures].slice(0, 20);
    this.persist();
  }

  getSnapshot() {
    this.rollPeriodsIfNeeded(this.state);
    return {
      dailyRequests: this.state.dailyRequests,
      dailyBudget: this.limits.dailyRequestBudget,
      monthlyRequests: this.state.monthlyRequests,
      requestsLastMinute: this.getRequestsLastMinute(),
      maxRequestsPerMinute: this.limits.maxRequestsPerMinute,
      successfulRequests: this.state.successfulRequests,
      failedRequests: this.state.failedRequests,
      rateLimitErrors: this.state.rateLimitErrors,
      inputTokens: this.state.inputTokens,
      outputTokens: this.state.outputTokens,
      totalTokens: this.state.totalTokens,
      estimatedCostUsd: 0,
      openRouterQuota: this.state.openRouterAccountQuota,
      recentFailures: [...this.state.recentFailures],
    };
  }
}
