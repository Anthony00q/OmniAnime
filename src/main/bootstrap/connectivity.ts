import axios from 'axios';

const CONNECTIVITY_CHECK_COOLDOWN_MS = 30_000;

let isOnline = true;
let lastConnectivityCheck = 0;

export async function checkConnectivity(): Promise<boolean> {
  const now = Date.now();
  if (now - lastConnectivityCheck < CONNECTIVITY_CHECK_COOLDOWN_MS) {
    return isOnline;
  }
  try {
    await axios.head('https://www.google.com', { timeout: 3000 });
    isOnline = true;
  } catch {
    isOnline = false;
  }
  lastConnectivityCheck = now;
  return isOnline;
}

export function getConnectivityStatus(): boolean {
  return isOnline;
}
