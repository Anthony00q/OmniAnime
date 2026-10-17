import type { ThumbnailPriority, ThumbnailRequest } from '../../types/thumbnails';

interface ThumbnailConsumer {
  priority: ThumbnailPriority;
  resolve: (result: string | null) => void;
}

interface ThumbnailJob {
  key: string;
  run: (signal: AbortSignal) => Promise<string | null>;
  controller: AbortController;
  consumers: Set<ThumbnailConsumer>;
  running: boolean;
  done: Promise<void>;
  finish: () => void;
}

export class ThumbnailTaskQueue {
  private readonly jobs = new Map<string, ThumbnailJob>();
  private readonly active = new Set<ThumbnailJob>();
  private scheduled = false;
  private closed = false;

  request(
    key: string,
    run: (signal: AbortSignal) => Promise<string | null>,
    priority: ThumbnailPriority = 'visible',
  ): ThumbnailRequest {
    if (this.closed) return { promise: Promise.resolve(null), release: () => {}, setPriority: () => {} };
    let job = this.jobs.get(key);
    if (!job) {
      let finish!: () => void;
      const done = new Promise<void>((resolve) => {
        finish = resolve;
      });
      job = { key, run, controller: new AbortController(), consumers: new Set(), running: false, done, finish };
      this.jobs.set(key, job);
    }
    const current = job;
    let consumer!: ThumbnailConsumer;
    const promise = new Promise<string | null>((resolve) => {
      consumer = { priority, resolve };
      current.consumers.add(consumer);
    });
    this.schedule();
    return {
      promise,
      release: () => {
        if (!current.consumers.delete(consumer)) return;
        consumer.resolve(null);
        if (!current.consumers.size) this.abandon(current);
      },
      setPriority: (value) => {
        if (!current.consumers.has(consumer)) return;
        consumer.priority = value;
        this.schedule();
      },
    };
  }

  async cancel(matches: (key: string) => boolean): Promise<void> {
    const jobs = new Set([...this.jobs.values(), ...this.active]);
    const canceled = [...jobs].filter((job) => matches(job.key));
    for (const job of canceled) this.abandon(job);
    await Promise.all(canceled.map((job) => job.done));
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.cancel(() => true);
  }

  private abandon(job: ThumbnailJob): void {
    if (this.jobs.get(job.key) === job) this.jobs.delete(job.key);
    for (const consumer of job.consumers) consumer.resolve(null);
    job.consumers.clear();
    job.controller.abort();
    if (!job.running) job.finish();
    this.schedule();
  }

  private schedule(): void {
    if (this.scheduled || this.closed) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      this.pump();
    });
  }

  private pump(): void {
    while (!this.closed && this.active.size < 2) {
      const activeKeys = new Set([...this.active].map((job) => job.key));
      const pending = [...this.jobs.values()].filter((job) => !job.running && !activeKeys.has(job.key));
      const job =
        pending.find((candidate) => [...candidate.consumers].some((c) => c.priority === 'visible')) ?? pending[0];
      if (!job) return;
      job.running = true;
      this.active.add(job);
      void this.execute(job);
    }
  }

  private async execute(job: ThumbnailJob): Promise<void> {
    let result: string | null = null;
    try {
      if (!job.controller.signal.aborted) result = await job.run(job.controller.signal);
    } catch {
      result = null;
    } finally {
      if (this.jobs.get(job.key) === job) this.jobs.delete(job.key);
      for (const consumer of job.consumers) consumer.resolve(job.controller.signal.aborted ? null : result);
      job.consumers.clear();
      this.active.delete(job);
      job.finish();
      this.schedule();
    }
  }
}
