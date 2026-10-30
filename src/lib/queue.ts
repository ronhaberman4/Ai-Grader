/** Small in-process work queue with bounded concurrency; failures of one job never stop the others. */
export function createQueue(worker: (id: string) => Promise<void>, concurrency: number) {
  const pending: string[] = [];
  const running = new Set<string>();
  let waiters: (() => void)[] = [];

  function pump() {
    while (running.size < concurrency && pending.length > 0) {
      const id = pending.shift()!;
      running.add(id);
      worker(id)
        .catch((e) => console.error("[queue] job failed", id, e))
        .finally(() => {
          running.delete(id);
          pump();
        });
    }
    if (running.size === 0 && pending.length === 0) {
      const w = waiters;
      waiters = [];
      w.forEach((fn) => fn());
    }
  }

  return {
    enqueue(id: string) {
      if (running.has(id) || pending.includes(id)) return false;
      pending.push(id);
      pump();
      return true;
    },
    has(id: string) {
      return running.has(id) || pending.includes(id);
    },
    stats() {
      return { pending: pending.length, running: running.size };
    },
    idle(): Promise<void> {
      if (running.size === 0 && pending.length === 0) return Promise.resolve();
      return new Promise((resolve) => waiters.push(resolve));
    },
  };
}

export type Queue = ReturnType<typeof createQueue>;
