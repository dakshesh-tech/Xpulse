import { auth } from '../lib/firebase';
import {
  ActivityDifficulty,
  Collectible,
  CollectibleType,
  ExperienceActivity,
  GameState,
  GeneratedQuestDraft,
  GMEvaluationProposal,
  Rarity,
} from '../types/rpg';

export interface PendingAITask {
  id: string;
  userId: string;
  taskType: 'chronicle' | 'quest' | 'achievement' | 'image';
  priority: number;
  status:
    | 'Pending'
    | 'Processing'
    | 'Completed'
    | 'Failed'
    | 'Awaiting user input'
    | 'Awaiting artwork'
    | 'Cancelled';
  attemptCount: number;
  maxAttempts: number;
  modelsAttempted: string[];
  failureReason: string | null;
  createdAt: string;
  lastAttemptAt: string | null;
  nextRetryAt: string | null;
  result?: unknown;
}

export interface GMServiceResponse {
  type: 'clarification' | 'evaluation' | 'queued';
  message: string;
  proposal?: GMEvaluationProposal;
  task?: PendingAITask;
  modelUsed?: string;
}

export interface QuestGenerationResponse {
  status: 'ok' | 'queued';
  draft?: GeneratedQuestDraft;
  task?: PendingAITask;
  message?: string;
  modelUsed?: string;
}

export interface CollectibleGenerationResult {
  status: 'ok' | 'pending_artwork';
  collectible?: Collectible;
  task?: PendingAITask;
  message?: string;
}

export interface AIStatusSnapshot {
  freeOnlyMode: true;
  overallStatus:
    | 'Operational'
    | 'Limited'
    | 'Switching model'
    | 'Waiting for free capacity'
    | 'Pending'
    | 'Temporarily unavailable';
  activeModelId: string | null;
  activeModelName: string | null;
  activeProvider: string | null;
  imageGenerationAvailable: boolean;
  imageGenerationReason: string;
  availableFreeModels: Array<{
    id: string;
    modelId: string;
    provider: string;
    displayName: string;
    pools: string[];
    healthStatus: string;
    contextLength: number;
    supportsStructuredOutput: boolean;
    supportsImageGeneration: boolean;
    lastSuccessAt: string | null;
  }>;
  cooldownModels: Array<{
    id: string;
    displayName: string;
    provider: string;
    cooldownUntil: string | null;
    lastFailureReason: string | null;
  }>;
  unavailableModels: Array<{
    id: string;
    displayName: string;
    provider: string;
    healthStatus: string;
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
    openRouterQuota: {
      used: number;
      limit: number;
      remaining: number;
      isFreeTier: boolean;
      checkedAt: string;
    } | null;
  };
  recentFailures: Array<{
    timestamp: string;
    modelId: string;
    provider: string;
    pool: string;
    errorType: string;
    message: string;
  }>;
  providers: Array<{
    provider: string;
    configured: boolean;
    enabled: boolean;
    note: string;
  }>;
}

export class ApiHttpError extends Error {
  status: number;
  code?: string;
  payload?: unknown;

  constructor(message: string, status: number, code?: string, payload?: unknown) {
    super(message);
    this.name = 'ApiHttpError';
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

async function getBearerHeaders(extra?: HeadersInit): Promise<Headers> {
  const headers = new Headers(extra);
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }
  const currentUser = auth.currentUser;
  if (currentUser) {
    const token = await currentUser.getIdToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }
  return headers;
}

async function safeFetchJson<T>(url: string, init: RequestInit, fallbackError: string): Promise<T> {
  let res: Response;
  try {
    const headers = await getBearerHeaders(init.headers);
    res = await fetch(url, { ...init, headers });
  } catch (networkErr) {
    console.error('[Chronicle API] Network error:', {
      url,
      reason: networkErr instanceof Error ? networkErr.message : 'network_failure',
    });
    throw new Error('Unable to reach the Chronicle server. Please check your connection and retry.');
  }

  const contentType = res.headers.get('content-type') || '';
  let rawText = '';
  try {
    rawText = await res.text();
  } catch {
    throw new ApiHttpError(`${fallbackError} (HTTP ${res.status})`, res.status);
  }

  const looksLikeJson =
    contentType.toLowerCase().includes('application/json') ||
    rawText.trim().startsWith('{') ||
    rawText.trim().startsWith('[');

  if (!looksLikeJson) {
    console.error('[Chronicle API] Non-JSON response received:', {
      url,
      status: res.status,
      contentType,
      bodyPreview: rawText.slice(0, 160),
    });
    throw new ApiHttpError(
      `Server returned an unexpected non-JSON response (HTTP ${res.status}). Please retry.`,
      res.status
    );
  }

  let data: T & { error?: string; code?: string };
  try {
    data = JSON.parse(rawText) as T & { error?: string; code?: string };
  } catch (parseErr) {
    console.error('[Chronicle API] Invalid JSON payload:', {
      url,
      status: res.status,
      contentType,
      reason: parseErr instanceof Error ? parseErr.message : 'json_parse_error',
    });
    throw new ApiHttpError(
      `Received malformed server response (HTTP ${res.status}). Please retry.`,
      res.status
    );
  }

  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('chronicle:auth-expired'));
    }
    throw new ApiHttpError(
      data?.error || `${fallbackError} (HTTP ${res.status})`,
      res.status,
      data?.code,
      data
    );
  }

  return data;
}

export async function evaluateExperienceWithGM(
  userInput: string,
  playerName: string,
  recentSameDayActivities: ExperienceActivity[],
  clarificationContext?: string
): Promise<GMServiceResponse> {
  const data = await safeFetchJson<GMServiceResponse>(
    '/api/gm/evaluate',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        userInput,
        playerName,
        recentSameDayActivities,
        clarificationContext,
      }),
    },
    'Game Master evaluation failed.'
  );

  if (
    data.type !== 'clarification' &&
    data.type !== 'queued' &&
    (!data.proposal || typeof data.proposal !== 'object')
  ) {
    throw new Error('Game Master returned an incomplete evaluation. Please retry.');
  }

  return data;
}

export async function generateQuestFromDescription(
  goalDescription: string,
  options?: { playerLevel?: number; existingQuestTitles?: string[] }
): Promise<QuestGenerationResponse> {
  const data = await safeFetchJson<{
    draft?: GeneratedQuestDraft;
    queued?: boolean;
    task?: PendingAITask;
    message?: string;
    modelUsed?: string;
  }>(
    '/api/quests/generate',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        goalDescription,
        playerLevel: options?.playerLevel,
        existingQuestTitles: options?.existingQuestTitles,
      }),
    },
    'Failed to generate quest blueprint.'
  );

  if (data.queued && data.task) {
    return {
      status: 'queued',
      task: data.task,
      message: data.message,
    };
  }

  if (!data.draft) {
    throw new Error('Failed to generate quest blueprint.');
  }
  return {
    status: 'ok',
    draft: data.draft,
    modelUsed: data.modelUsed,
  };
}

export async function generateCollectibleAsset(params: {
  collectibleId?: string;
  sourceLabel: string;
  sourceDescription: string;
  difficulty: ActivityDifficulty;
  suggestedType: CollectibleType;
  rarity: Rarity;
  existingNames: string[];
}): Promise<CollectibleGenerationResult> {
  const data = await safeFetchJson<{
    collectible?: Collectible;
    pendingArtwork?: boolean;
    task?: PendingAITask;
    message?: string;
  }>(
    '/api/collectibles/generate',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(params),
    },
    'Failed to generate collectible artwork.'
  );

  if (data.pendingArtwork) {
    return {
      status: 'pending_artwork',
      task: data.task,
      message: data.message,
    };
  }

  if (!data.collectible) {
    throw new Error('Failed to generate collectible artwork.');
  }
  return {
    status: 'ok',
    collectible: data.collectible,
  };
}

export async function fetchAIStatus(): Promise<AIStatusSnapshot> {
  return safeFetchJson<AIStatusSnapshot>(
    '/api/ai/status',
    { method: 'GET', headers: { Accept: 'application/json' } },
    'Failed to load AI status.'
  );
}

export async function refreshAIModels(): Promise<AIStatusSnapshot> {
  return safeFetchJson<AIStatusSnapshot>(
    '/api/ai/models/refresh',
    { method: 'POST', headers: { Accept: 'application/json' } },
    'Failed to refresh AI models.'
  );
}

export async function fetchPendingAITasks(): Promise<PendingAITask[]> {
  const data = await safeFetchJson<{ tasks: PendingAITask[] }>(
    '/api/ai/tasks',
    { method: 'GET', headers: { Accept: 'application/json' } },
    'Failed to load pending AI tasks.'
  );
  return data.tasks || [];
}

export async function processPendingAITasks(): Promise<{
  processed: number;
  tasks: PendingAITask[];
}> {
  return safeFetchJson<{ processed: number; tasks: PendingAITask[] }>(
    '/api/ai/tasks/process',
    { method: 'POST', headers: { Accept: 'application/json' } },
    'Failed to process pending AI tasks.'
  );
}

export async function retryPendingAITask(taskId: string): Promise<PendingAITask | undefined> {
  const data = await safeFetchJson<{ task?: PendingAITask }>(
    `/api/ai/tasks/${encodeURIComponent(taskId)}/retry`,
    { method: 'POST', headers: { Accept: 'application/json' } },
    'Failed to retry AI task.'
  );
  return data.task;
}

export interface AccountProfileResponse {
  user: {
    uid: string;
    email: string;
    username: string;
    emailVerified: boolean;
    signInProvider: string;
  };
  profileExists: boolean;
  legacyServerAvailable: boolean;
  revision: number;
  state: GameState | null;
}

export async function fetchAccountProfile(): Promise<AccountProfileResponse> {
  return safeFetchJson<AccountProfileResponse>(
    '/api/account/profile',
    { method: 'GET' },
    'Failed to load account profile.'
  );
}

export async function initializeAccountProfile(params: {
  username: string;
  localCandidateState?: Partial<GameState> | null;
  claimLegacyServer?: boolean;
}): Promise<{
  state: GameState;
  revision: number;
  migrated: boolean;
  alreadyExisted: boolean;
}> {
  return safeFetchJson(
    '/api/account/initialize',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    },
    'Failed to initialize character profile.'
  );
}

export async function fetchCloudState(): Promise<{ state: GameState | null; revision: number }> {
  return safeFetchJson<{ state: GameState | null; revision: number }>(
    '/api/state',
    { method: 'GET' },
    'Failed to load cloud Chronicle state.'
  );
}

export async function saveCloudState(
  state: GameState,
  expectedRevision?: number
): Promise<{ ok: true; state: GameState; revision: number }> {
  return safeFetchJson<{ ok: true; state: GameState; revision: number }>(
    '/api/state',
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, expectedRevision }),
    },
    'Failed to save Chronicle progress to cloud.'
  );
}

export async function updateAccountUsername(
  username: string
): Promise<{ ok: true; username: string; state?: GameState; revision?: number }> {
  return safeFetchJson(
    '/api/account/username',
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    },
    'Failed to update adventurer name.'
  );
}

export async function deleteAccountOnServer(): Promise<{ ok: true }> {
  return safeFetchJson(
    '/api/account',
    { method: 'DELETE' },
    'Failed to delete account data.'
  );
}

export const GM_SAMPLE_EXPERIENCES = [
  'I attended a 3-hour Agentic AI workshop, learned about tool calling and built a small working prototype.',
  'I talked to a random girl at a coffee shop and overcame my hesitation to start a genuine conversation.',
  'I skipped my planned gym session and scrolled on my phone instead.',
  'Completed a 45-minute strength workout with barbell squats and deadlifts.',
];

export const QUEST_SAMPLE_GOALS = [
  'Learn Python Pandas and complete a data analysis project.',
  'Build a full-stack AI application.',
  'Go to the gym four times a week for a month.',
  'Prepare for my upcoming mathematics examination.',
  'Participate in an offline hackathon.',
];
