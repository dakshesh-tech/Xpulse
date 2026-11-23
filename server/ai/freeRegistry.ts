import type { AIErrorCategory, AIPoolName, AIProviderId, ModelRegistryEntry } from './types.ts';
import type { AIProviderAdapter } from './providers/types.ts';

/**
 * Immutable server-side enforcement flag: paid models are strictly prohibited.
 */
export const FREE_ONLY_MODE = true as const;

const REFRESH_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const TEMP_COOLDOWN_BASE_MS = 45 * 1000;
const QUOTA_COOLDOWN_MS = 4 * 60 * 1000;
const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_OPEN_COOLDOWN_MS = 6 * 60 * 1000;

export class FreeModelRegistry {
  private readonly providers: Map<AIProviderId, AIProviderAdapter> = new Map();
  private models: Map<string, ModelRegistryEntry> = new Map();
  private lastRefreshAt = 0;
  private refreshPromise: Promise<void> | null = null;

  registerProvider(adapter: AIProviderAdapter): void {
    this.providers.set(adapter.providerId, adapter);
  }

  getProvider(providerId: AIProviderId): AIProviderAdapter | undefined {
    return this.providers.get(providerId);
  }

  getAllProviders(): AIProviderAdapter[] {
    return Array.from(this.providers.values());
  }

  async ensureDiscovered(force = false): Promise<void> {
    const now = Date.now();
    if (!force && this.models.size > 0 && now - this.lastRefreshAt < REFRESH_INTERVAL_MS) {
      return;
    }
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.performRefresh().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  private async performRefresh(): Promise<void> {
    const nextModels = new Map<string, ModelRegistryEntry>();

    for (const adapter of this.providers.values()) {
      if (!adapter.isConfigured()) continue;
      try {
        const discovered = await adapter.discoverModels();
        for (const fresh of discovered) {
          // Enforce FREE_ONLY_MODE invariant at registration boundary
          if (
            FREE_ONLY_MODE &&
            (!fresh.isFreeVerified ||
              fresh.inputPricing !== 0 ||
              fresh.outputPricing !== 0 ||
              (fresh.requestPricing !== null && fresh.requestPricing !== 0) ||
              (fresh.imagePricing !== null && fresh.imagePricing !== 0))
          ) {
            continue;
          }

          const existing = this.models.get(fresh.id);
          if (existing) {
            // Preserve runtime health, cooldown, and telemetry state across refreshes
            nextModels.set(fresh.id, {
              ...fresh,
              healthStatus:
                existing.healthStatus === 'rejected_paid'
                  ? 'rejected_paid'
                  : existing.healthStatus,
              cooldownUntil: existing.cooldownUntil,
              consecutiveFailures: existing.consecutiveFailures,
              lastSuccessAt: existing.lastSuccessAt,
              lastFailureAt: existing.lastFailureAt,
              lastFailureReason: existing.lastFailureReason,
              lastErrorType: existing.lastErrorType,
              rateLimitInfo: existing.rateLimitInfo,
            });
          } else {
            nextModels.set(fresh.id, fresh);
          }
        }
      } catch (err) {
        // Keep previously discovered models for this provider if discovery transiently fails
        for (const [id, existing] of this.models.entries()) {
          if (existing.provider === adapter.providerId) {
            nextModels.set(id, existing);
          }
        }
        console.warn(
          `[AI Registry] Model discovery skipped for ${adapter.providerId}:`,
          err instanceof Error ? err.message : 'discovery_failed'
        );
      }
    }

    this.models = nextModels;
    this.lastRefreshAt = Date.now();
  }

  /**
   * Immediately blocks a model if its pricing is discovered to have changed from free to paid.
   */
  markPricingChangedToPaid(canonicalId: string, reason: string): void {
    const entry = this.models.get(canonicalId);
    if (!entry) return;
    entry.isFreeVerified = false;
    entry.healthStatus = 'rejected_paid';
    entry.cooldownUntil = null;
    entry.lastFailureAt = new Date().toISOString();
    entry.lastFailureReason = reason;
    entry.lastErrorType = 'pricing_changed';
    entry.pools = [];
  }

  /**
   * Re-verifies a model's live pricing & eligibility immediately prior to invocation.
   * Returns false if the model changed to paid or is no longer verified zero-cost.
   */
  async verifyFreeBeforeRequest(entry: ModelRegistryEntry): Promise<boolean> {
    if (FREE_ONLY_MODE !== true) return false;
    if (!entry.isFreeVerified || entry.inputPricing !== 0 || entry.outputPricing !== 0) {
      this.markPricingChangedToPaid(entry.id, 'Failed zero-cost pre-flight verification');
      return false;
    }

    // Re-check live pricing if older than 5 minutes for OpenRouter models
    const verifiedAgeMs = Date.now() - new Date(entry.pricingLastVerifiedAt).getTime();
    if (entry.provider === 'openrouter' && verifiedAgeMs > 5 * 60 * 1000) {
      const adapter = this.providers.get(entry.provider);
      if (adapter?.checkSingleModelPricing) {
        try {
          const check = await adapter.checkSingleModelPricing(entry.modelId);
          entry.pricingLastVerifiedAt = new Date().toISOString();
          if (!check.exists || !check.isFreeVerified || check.inputPricing !== 0 || check.outputPricing !== 0) {
            this.markPricingChangedToPaid(entry.id, check.reason);
            return false;
          }
        } catch {
          // If live catalogue ping fails transiently, do not falsely reject already-verified 0/0 entry
        }
      }
    }

    return true;
  }

  recordSuccess(canonicalId: string, rateLimitInfo?: string | null): void {
    const entry = this.models.get(canonicalId);
    if (!entry) return;
    entry.healthStatus = 'healthy';
    entry.cooldownUntil = null;
    entry.consecutiveFailures = 0;
    entry.lastSuccessAt = new Date().toISOString();
    if (rateLimitInfo) {
      entry.rateLimitInfo = rateLimitInfo;
    }
  }

  recordFailure(
    canonicalId: string,
    errorType: AIErrorCategory,
    reason: string,
    rateLimitInfo?: string | null
  ): void {
    const entry = this.models.get(canonicalId);
    if (!entry) return;

    const now = Date.now();
    entry.lastFailureAt = new Date(now).toISOString();
    entry.lastFailureReason = reason;
    entry.lastErrorType = errorType;
    entry.consecutiveFailures += 1;
    if (rateLimitInfo) {
      entry.rateLimitInfo = rateLimitInfo;
    }

    if (errorType === 'pricing_changed') {
      this.markPricingChangedToPaid(canonicalId, reason);
      return;
    }

    if (errorType === 'permanent') {
      entry.healthStatus = 'unavailable';
      entry.cooldownUntil = null;
      return;
    }

    if (entry.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
      entry.healthStatus = 'circuit_open';
      entry.cooldownUntil = now + CIRCUIT_OPEN_COOLDOWN_MS;
      return;
    }

    if (errorType === 'quota') {
      entry.healthStatus = 'cooldown';
      entry.cooldownUntil = now + QUOTA_COOLDOWN_MS;
      return;
    }

    // Temporary error -> exponential per-model cooldown
    const cooldownMs = TEMP_COOLDOWN_BASE_MS * Math.pow(2, Math.max(0, entry.consecutiveFailures - 1));
    entry.healthStatus = 'cooldown';
    entry.cooldownUntil = now + Math.min(cooldownMs, 5 * 60 * 1000);
  }

  /**
   * Inserts or updates a model record cleanly (also supports testing dynamic pricing/health changes).
   */
  upsertModelForRegistry(entry: ModelRegistryEntry): void {
    this.models.set(entry.id, entry);
  }

  /**
   * Returns eligible verified-free models for a specific pool, sorted by rank and health.
   * Half-opens expired cooldowns/circuit breakers automatically.
   */
  getEligibleModelsForPool(
    pool: AIPoolName,
    options?: { requireStructuredOutput?: boolean; requireImageGeneration?: boolean }
  ): ModelRegistryEntry[] {
    const now = Date.now();
    const eligible: ModelRegistryEntry[] = [];

    for (const entry of this.models.values()) {
      // Transition expired cooldowns/circuits to degraded half-open state
      if (
        (entry.healthStatus === 'cooldown' || entry.healthStatus === 'circuit_open') &&
        entry.cooldownUntil !== null &&
        now >= entry.cooldownUntil
      ) {
        entry.healthStatus = 'degraded';
        entry.cooldownUntil = null;
      }

      if (!entry.isFreeVerified || entry.inputPricing !== 0 || entry.outputPricing !== 0) {
        continue;
      }
      if (!entry.pools.includes(pool)) {
        continue;
      }
      if (options?.requireStructuredOutput && !entry.supportsStructuredOutput) {
        continue;
      }
      if (options?.requireImageGeneration && !entry.supportsImageGeneration) {
        continue;
      }
      if (
        entry.healthStatus === 'cooldown' ||
        entry.healthStatus === 'circuit_open' ||
        entry.healthStatus === 'unavailable' ||
        entry.healthStatus === 'rejected_paid'
      ) {
        continue;
      }

      const adapter = this.providers.get(entry.provider);
      if (!adapter || !adapter.isConfigured()) {
        continue;
      }

      eligible.push(entry);
    }

    return eligible.sort((a, b) => {
      // Healthy models before degraded half-open models
      const healthScore = (m: ModelRegistryEntry) => (m.healthStatus === 'healthy' ? 0 : 1);
      const hDiff = healthScore(a) - healthScore(b);
      if (hDiff !== 0) return hDiff;

      const rankA = a.priorityByPool?.[pool] ?? 999;
      const rankB = b.priorityByPool?.[pool] ?? 999;
      return rankA - rankB;
    });
  }

  getAllModels(): ModelRegistryEntry[] {
    const now = Date.now();
    for (const entry of this.models.values()) {
      if (
        (entry.healthStatus === 'cooldown' || entry.healthStatus === 'circuit_open') &&
        entry.cooldownUntil !== null &&
        now >= entry.cooldownUntil
      ) {
        entry.healthStatus = 'degraded';
        entry.cooldownUntil = null;
      }
    }
    return Array.from(this.models.values());
  }
}
