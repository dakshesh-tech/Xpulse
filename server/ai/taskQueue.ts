import fs from 'fs';
import path from 'path';
import type { AIPoolName, PendingTaskRecord, PendingTaskStatus } from './types.ts';

const POOL_PRIORITIES: Record<AIPoolName, number> = {
  chronicle: 1,
  quest: 2,
  achievement: 3,
  image: 4,
};

export class PersistentTaskQueue {
  private readonly tasksFilePath: string;
  private tasks: PendingTaskRecord[] = [];
  private readonly inFlightLocks: Set<string> = new Set();

  constructor(dataDir: string) {
    this.tasksFilePath = path.resolve(dataDir, 'ai-tasks.json');
    this.loadAndRecover();
  }

  private loadAndRecover(): void {
    try {
      if (!fs.existsSync(this.tasksFilePath)) {
        this.tasks = [];
        return;
      }
      const raw = fs.readFileSync(this.tasksFilePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        this.tasks = [];
        return;
      }
      // Recover tasks left in 'Processing' if the server restarted mid-flight
      let changed = false;
      this.tasks = (parsed as PendingTaskRecord[]).map((t) => {
        if (t.status === 'Processing') {
          changed = true;
          return {
            ...t,
            status: t.taskType === 'image' ? 'Awaiting artwork' : 'Pending',
            nextRetryAt: new Date(Date.now() + 5000).toISOString(),
          };
        }
        return t;
      });
      if (changed) {
        this.persist();
      }
    } catch {
      this.tasks = [];
    }
  }

  private persist(): void {
    try {
      fs.mkdirSync(path.dirname(this.tasksFilePath), { recursive: true });
      const tmp = `${this.tasksFilePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.tasks, null, 2), 'utf-8');
      fs.renameSync(tmp, this.tasksFilePath);
    } catch {
      // Non-fatal persistence safeguard
    }
  }

  /**
   * Enqueues a task with idempotency deduplication scoped by userId.
   * Returns existing task if an identical idempotencyKey is already active or recently completed.
   */
  enqueue(params: {
    userId: string;
    taskType: AIPoolName;
    idempotencyKey: string;
    originalInput: Record<string, unknown>;
    context: Record<string, unknown>;
    expectedFormat: string;
    maxAttempts?: number;
    initialStatus?: PendingTaskStatus;
    modelsAttempted?: string[];
    failureReason?: string | null;
    backoffSeconds?: number;
  }): { task: PendingTaskRecord; deduplicated: boolean } {
    const existing = this.tasks.find(
      (t) =>
        t.userId === params.userId &&
        t.idempotencyKey === params.idempotencyKey &&
        t.status !== 'Cancelled' &&
        t.status !== 'Failed'
    );
    if (existing) {
      return { task: existing, deduplicated: true };
    }

    const now = Date.now();
    const backoffMs = (params.backoffSeconds ?? 45) * 1000;
    const task: PendingTaskRecord = {
      id: `task_${now}_${Math.random().toString(36).slice(2, 7)}`,
      userId: params.userId,
      taskType: params.taskType,
      priority: POOL_PRIORITIES[params.taskType] ?? 5,
      idempotencyKey: params.idempotencyKey,
      originalInput: params.originalInput,
      context: params.context,
      expectedFormat: params.expectedFormat,
      status:
        params.initialStatus ??
        (params.taskType === 'image' ? 'Awaiting artwork' : 'Pending'),
      attemptCount: params.modelsAttempted && params.modelsAttempted.length > 0 ? 1 : 0,
      maxAttempts: params.maxAttempts ?? 6,
      modelsAttempted: params.modelsAttempted || [],
      failureReason: params.failureReason ?? null,
      createdAt: new Date(now).toISOString(),
      lastAttemptAt:
        params.modelsAttempted && params.modelsAttempted.length > 0
          ? new Date(now).toISOString()
          : null,
      nextRetryAt: new Date(now + backoffMs).toISOString(),
      result: null,
    };

    this.tasks = [task, ...this.tasks].slice(0, 250);
    this.persist();
    return { task, deduplicated: false };
  }

  getById(taskId: string, userId?: string): PendingTaskRecord | undefined {
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task) return undefined;
    if (userId && task.userId !== userId) return undefined;
    return task;
  }

  findByIdempotency(userId: string, idempotencyKey: string): PendingTaskRecord | undefined {
    return this.tasks.find(
      (t) =>
        t.userId === userId &&
        t.idempotencyKey === idempotencyKey &&
        t.status !== 'Cancelled' &&
        t.status !== 'Failed'
    );
  }

  listForUser(userId: string): PendingTaskRecord[] {
    return this.tasks.filter((t) => t.userId === userId);
  }

  listAll(): PendingTaskRecord[] {
    return [...this.tasks];
  }

  getDueTasks(nowMs = Date.now()): PendingTaskRecord[] {
    return this.tasks
      .filter((t) => {
        if (this.inFlightLocks.has(t.id)) return false;
        if (t.status !== 'Pending' && t.status !== 'Awaiting artwork') return false;
        if (t.attemptCount >= t.maxAttempts) return false;
        if (t.nextRetryAt && new Date(t.nextRetryAt).getTime() > nowMs) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
  }

  acquireLock(taskId: string): boolean {
    if (this.inFlightLocks.has(taskId)) return false;
    this.inFlightLocks.add(taskId);
    return true;
  }

  releaseLock(taskId: string): void {
    this.inFlightLocks.delete(taskId);
  }

  markProcessing(taskId: string): void {
    const t = this.tasks.find((item) => item.id === taskId);
    if (!t) return;
    t.status = 'Processing';
    t.lastAttemptAt = new Date().toISOString();
    t.attemptCount += 1;
    this.persist();
  }

  markCompleted(taskId: string, result: unknown, modelsAttempted?: string[]): void {
    const t = this.tasks.find((item) => item.id === taskId);
    if (!t) return;
    t.status = 'Completed';
    t.result = result;
    t.failureReason = null;
    t.nextRetryAt = null;
    if (modelsAttempted) {
      t.modelsAttempted = Array.from(new Set([...t.modelsAttempted, ...modelsAttempted]));
    }
    this.persist();
  }

  markAwaitingUserInput(taskId: string, result: unknown, modelsAttempted?: string[]): void {
    const t = this.tasks.find((item) => item.id === taskId);
    if (!t) return;
    t.status = 'Awaiting user input';
    t.result = result;
    t.failureReason = null;
    t.nextRetryAt = null;
    if (modelsAttempted) {
      t.modelsAttempted = Array.from(new Set([...t.modelsAttempted, ...modelsAttempted]));
    }
    this.persist();
  }

  rescheduleRetry(taskId: string, reason: string, modelsAttempted: string[]): void {
    const t = this.tasks.find((item) => item.id === taskId);
    if (!t) return;
    t.modelsAttempted = Array.from(new Set([...t.modelsAttempted, ...modelsAttempted]));
    t.failureReason = reason;

    if (t.attemptCount >= t.maxAttempts) {
      t.status = 'Failed';
      t.nextRetryAt = null;
    } else {
      t.status = t.taskType === 'image' ? 'Awaiting artwork' : 'Pending';
      // Exponential backoff: 60s, 120s, 240s, 480s, 900s
      const backoffSec = Math.min(900, 60 * Math.pow(2, Math.max(0, t.attemptCount - 1)));
      t.nextRetryAt = new Date(Date.now() + backoffSec * 1000).toISOString();
    }
    this.persist();
  }

  markCancelled(taskId: string, userId: string): boolean {
    const t = this.tasks.find((item) => item.id === taskId && item.userId === userId);
    if (!t) return false;
    t.status = 'Cancelled';
    t.nextRetryAt = null;
    this.persist();
    return true;
  }

  scheduleImmediateRetry(taskId: string, userId: string): PendingTaskRecord | null {
    const t = this.tasks.find((item) => item.id === taskId && item.userId === userId);
    if (!t) return null;
    if (t.status === 'Completed' || t.status === 'Processing') return t;
    t.status = t.taskType === 'image' ? 'Awaiting artwork' : 'Pending';
    t.nextRetryAt = new Date().toISOString();
    if (t.attemptCount >= t.maxAttempts) {
      t.maxAttempts = t.attemptCount + 2;
    }
    this.persist();
    return t;
  }

  removeTasksForUser(userId: string): number {
    const before = this.tasks.length;
    this.tasks = this.tasks.filter((t) => t.userId !== userId);
    const removed = before - this.tasks.length;
    if (removed > 0) {
      this.persist();
    }
    return removed;
  }
}
