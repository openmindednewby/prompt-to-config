import { TierReplyKind } from './TierReplyKind';
import { TierStatus } from './TierStatus';

export interface WorkerLike {
  postMessage(message: unknown): void;
  terminate(): void;
  addEventListener(type: string, listener: (event: Event) => void): void;
}

export type TierReply<R> =
  | { kind: TierReplyKind.Done | `${TierReplyKind.Done}`; id: number; ms: number; result?: R; error?: string; nGpuLayers?: number }
  | { kind: TierReplyKind.Progress | `${TierReplyKind.Progress}`; tier: string; file: string; totalBytes: number };

export interface TierRunner<Q, R> {
  run(request: Q): Promise<R | TierStatus>;
}

export const DEFAULT_DEADLINE_MS = 90_000;

type Settle<R> = (result: R | TierStatus) => void;

/** A tier worker client that starts the worker on first run and fails pending runs on error or deadline. */
export function createTierRunner<Q extends object, R>(makeWorker: () => WorkerLike, deadlineMs = DEFAULT_DEADLINE_MS): TierRunner<Q, R> {
  let worker: WorkerLike | null = null;
  let next = 0;
  const pending = new Map<number, Settle<R>>();
  const failAll = (status: TierStatus): void => {
    for (const settle of pending.values()) {
      settle(status);
    }
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  const onReply = (event: Event): void => {
    const data = (event as MessageEvent<TierReply<R>>).data;
    if (data.kind !== TierReplyKind.Done) {
      return;
    }
    const settle = pending.get(data.id);
    pending.delete(data.id);
    settle?.(data.result ?? TierStatus.Failed);
  };
  const start = (): WorkerLike => {
    const w = makeWorker();
    w.addEventListener('message', onReply);
    w.addEventListener('error', () => failAll(TierStatus.Failed));
    return w;
  };
  return {
    run(request: Q): Promise<R | TierStatus> {
      const w = worker ?? start();
      worker = w;
      next += 1;
      const id = next;
      return new Promise<R | TierStatus>((resolve) => {
        const timer = setTimeout(() => failAll(TierStatus.TimedOut), deadlineMs);
        pending.set(id, (result) => {
          clearTimeout(timer);
          resolve(result);
        });
        w.postMessage({ id, ...request });
      });
    },
  };
}
