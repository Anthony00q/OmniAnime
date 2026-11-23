export const EPISODE_AVAILABILITY_CONCURRENCY = 2;

export async function scanEpisodeAvailability(
  episodes: readonly number[],
  signal: AbortSignal,
  priority: () => readonly number[],
  check: (episode: number) => Promise<void>,
): Promise<void> {
  const pending = new Set(episodes);
  const worker = async () => {
    while (!signal.aborted && pending.size > 0) {
      const episode = priority().find((num) => pending.has(num)) ?? pending.values().next().value!;
      pending.delete(episode);
      await check(episode);
    }
  };
  await Promise.all(Array.from({ length: EPISODE_AVAILABILITY_CONCURRENCY }, worker));
}
