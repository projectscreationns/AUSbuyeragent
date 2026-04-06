import { CACHE_TTL } from '../config/constants';

const PREFIX = 'auba:';

export function cacheGet(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    const stageKey = key.split(':')[0]; // e.g. 'macro' from 'macro' or 'regions'
    const ttl = CACHE_TTL[stageKey] ?? CACHE_TTL.regions;
    if (ttl !== Infinity && Date.now() - entry.timestamp > ttl) {
      localStorage.removeItem(PREFIX + key);
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

export function cacheSet(key, data, selections = null) {
  try {
    const entry = { data, selections, timestamp: Date.now() };
    localStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {}
}

export function cacheClear(key) {
  try { localStorage.removeItem(PREFIX + key); } catch {}
}

export function cacheClearDownstream(fromStageKey) {
  const order = ['macro', 'regions', 'suburbs', 'listings', 'dd'];
  const idx = order.indexOf(fromStageKey);
  if (idx < 0) return;
  for (let i = idx; i < order.length; i++) {
    cacheClear(order[i]);
  }
}

export function getApiKey() {
  try { return localStorage.getItem(PREFIX + 'api-key') || null; } catch { return null; }
}

export function setApiKey(key) {
  try { localStorage.setItem(PREFIX + 'api-key', key); } catch {}
}

export function clearApiKey() {
  try { localStorage.removeItem(PREFIX + 'api-key'); } catch {}
}

export function getProfile() {
  try {
    const raw = localStorage.getItem(PREFIX + 'investor-profile');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function setProfile(profile) {
  try { localStorage.setItem(PREFIX + 'investor-profile', JSON.stringify(profile)); } catch {}
}
