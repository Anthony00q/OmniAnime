import axios from 'axios';

const CONNECTIVITY_CHECK_COOLDOWN_MS = 30_000;

let isOnline = true;
let lastConnectivityCheck = 0;
let pendingCheck: Promise<boolean> | undefined;

export async function checkConnectivity(): Promise<boolean> {
  if (Date.now() - lastConnectivityCheck < CONNECTIVITY_CHECK_COOLDOWN_MS) {
    return isOnline;
  }
  return (pendingCheck ??= axios
    .head('https://www.google.com', { timeout: 3000, maxRedirects: 0 })
    .then(
      () => (isOnline = true),
      () => (isOnline = false),
    )
    .finally(() => {
      lastConnectivityCheck = Date.now();
      pendingCheck = undefined;
    }));
}
