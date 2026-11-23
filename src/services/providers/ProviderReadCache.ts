export class ProviderReadCache<T> {
  private readonly entries = new Map<string, { value: T; until: number }>();
  private readonly pending = new Map<string, Promise<T>>();

  constructor(
    private readonly ttlMs: number,
    private readonly limit: number,
    private readonly cacheable: (value: T) => boolean,
  ) {}

  read(key: string, force: boolean, load: () => Promise<T>): Promise<T> {
    if (!force) {
      const active = this.pending.get(key);
      if (active) return active;
      const cached = this.entries.get(key);
      if (cached && cached.until > Date.now()) return Promise.resolve(cached.value);
    }
    this.entries.delete(key);
    const request = Promise.resolve()
      .then(load)
      .then((value) => {
        if (this.pending.get(key) === request && this.cacheable(value)) {
          this.entries.set(key, { value, until: Date.now() + this.ttlMs });
          if (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value!);
        }
        return value;
      })
      .finally(() => {
        if (this.pending.get(key) === request) this.pending.delete(key);
      });
    this.pending.set(key, request);
    return request;
  }
}
