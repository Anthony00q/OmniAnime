import { resolve } from 'node:path';

export default async function setup() {
  const { acquireTestLock } = await import('../scripts/test-lock.mjs');
  const lease = acquireTestLock(resolve(__dirname, '..'), process.env.OMNI_TEST_LOCK_TOKEN);
  return () => lease.release();
}
