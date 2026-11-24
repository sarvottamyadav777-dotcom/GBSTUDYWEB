import type {
  AppItem,
  SliderPhoto,
  SocialLinksMap,
  SocialPlatform,
} from './types';
import { isOriginAllowedByEmbedPolicy, type EmbedPolicy } from './embedPolicy';

export interface PublicBootstrapResponse {
  apps: AppItem[];
  sliderPhotos: SliderPhoto[];
  socialLinks: SocialLinksMap;
  headerTitle: string;
  embedPolicies?: Record<string, EmbedPolicy>;
}

export interface AdminAuthStatusResponse {
  authenticated: boolean;
  email: string | null;
  needsSetup: boolean;
  kvBound?: boolean;
}

export interface AdminWorkspaceResponse {
  apps: AppItem[];
  linkCounters: Record<string, [number, number, number, number]>;
  headerTitle: string;
  socialLinks: Record<SocialPlatform, string>;
  sliderPhotos: SliderPhoto[];
}

// Keep admin session token & 10-tap unlock state strictly in JS memory
let adminBearerToken: string | null = null;
let adminRouteUnlocked = false;
let shieldSolvedToken: string | null = null;

export function setAdminBearerToken(token: string | null): void {
  adminBearerToken = token;
}

export function getAdminBearerToken(): string | null {
  return adminBearerToken;
}

export function unlockAdminRoute(): void {
  adminRouteUnlocked = true;
}

export function lockAdminRoute(): void {
  adminRouteUnlocked = false;
  adminBearerToken = null;
}

export function isAdminRouteUnlocked(): boolean {
  return adminRouteUnlocked;
}

async function computeBrowserProof(): Promise<string> {
  const ts = Math.floor(Date.now() / 1000).toString();
  const nav = typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 32) : 'browser';
  const raw = `gb-shield:${ts}:${nav}`;
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
      const hex = Array.from(new Uint8Array(buf))
        .slice(0, 8)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      return `${ts}.${hex}`;
    }
  } catch {
    // fallback below
  }
  return `${ts}.gbweb`;
}

async function ensureShieldCookie(): Promise<void> {
  if (shieldSolvedToken) return;
  try {
    const proof = await computeBrowserProof();
    const res = await fetch('/api/public/shield-handshake', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-GB-Shield': proof,
      },
      body: JSON.stringify({ w: typeof window !== 'undefined' ? window.innerWidth : 1024 }),
    });
    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as { token?: string };
      if (data.token) shieldSolvedToken = data.token;
    }
  } catch {
    // non-fatal on static hosts
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  if (url !== '/api/public/shield-handshake') {
    await ensureShieldCookie();
  }
  const headers = new Headers(init?.headers);
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (shieldSolvedToken) {
    headers.set('X-GB-Shield-Token', shieldSolvedToken);
  }
  headers.set('X-GB-Shield', await computeBrowserProof());

  if (adminBearerToken && url.startsWith('/api/admin')) {
    headers.set('Authorization', `Bearer ${adminBearerToken}`);
  }
  const res = await fetch(url, { ...init, headers });
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`Request failed (${res.status})`);
  }
  const data = (await res.json()) as T & { error?: string; challengeRequired?: boolean };
  if (!res.ok) {
    if (res.status === 403 && data.challengeRequired) {
      shieldSolvedToken = null;
      await ensureShieldCookie();
    }
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

async function readStaticSnapshot(): Promise<PublicBootstrapResponse> {
  const res = await fetch('/bootstrap-snapshot.json', { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Snapshot unavailable (${res.status})`);
  }
  return (await res.json()) as PublicBootstrapResponse;
}

export const api = {
  async getBootstrap(): Promise<PublicBootstrapResponse> {
    try {
      return await requestJson<PublicBootstrapResponse>('/api/public/bootstrap', {
        cache: 'no-cache',
      });
    } catch {
      return readStaticSnapshot();
    }
  },
  async getApp(id: string): Promise<{ app: AppItem }> {
    try {
      return await requestJson<{ app: AppItem }>(`/api/public/apps/${encodeURIComponent(id)}`);
    } catch {
      const snap = await readStaticSnapshot();
      const found = snap.apps.find((a) => a.id === id);
      if (!found) throw new Error('App nahi mila.');
      return { app: found };
    }
  },
  async assignAppLink(appId: string): Promise<{ slot: number }> {
    try {
      return await requestJson<{ slot: number }>('/api/public/assign-link', {
        method: 'POST',
        body: JSON.stringify({ appId }),
      });
    } catch {
      return { slot: (Math.floor(Math.random() * 4) % 4) + 1 };
    }
  },
  async checkEmbedAllowed(targetUrl: string): Promise<boolean> {
    const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
    try {
      const res = await requestJson<{ embeddable?: boolean }>(
        `/api/public/embed-check?url=${encodeURIComponent(targetUrl)}&origin=${encodeURIComponent(currentOrigin)}`,
      );
      if (typeof res.embeddable === 'boolean') {
        return res.embeddable;
      }
    } catch {
      // fallback to snapshot embedPolicies (important for static Direct Upload ZIP)
    }
    try {
      const snap = await readStaticSnapshot();
      const policy = snap.embedPolicies?.[targetUrl];
      if (policy) {
        return isOriginAllowedByEmbedPolicy(policy, targetUrl, currentOrigin);
      }
    } catch {
      // default allow
    }
    return true;
  },

  // Admin auth
  getAdminAuthStatus(): Promise<AdminAuthStatusResponse> {
    return requestJson('/api/admin/auth/status');
  },
  setupAdmin(email: string, password: string): Promise<{ token: string; email: string }> {
    return requestJson('/api/admin/auth/setup', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },
  loginAdmin(email: string, password: string): Promise<{ token: string; email: string }> {
    return requestJson('/api/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  // Admin workspace
  getAdminWorkspace(): Promise<AdminWorkspaceResponse> {
    return requestJson('/api/admin/workspace');
  },
  async createApp(payload: Partial<AppItem>): Promise<{ app: AppItem }> {
    const res = await requestJson<{ app: AppItem }>('/api/admin/apps', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    notifyTabsOfChange();
    return res;
  },
  async updateApp(id: string, payload: Partial<AppItem>): Promise<{ app: AppItem }> {
    const res = await requestJson<{ app: AppItem }>(`/api/admin/apps/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    notifyTabsOfChange();
    return res;
  },
  async saveBranding(header_title: string): Promise<{ header_title: string }> {
    const res = await requestJson<{ header_title: string }>('/api/admin/branding', {
      method: 'PUT',
      body: JSON.stringify({ header_title }),
    });
    notifyTabsOfChange();
    return res;
  },
  async saveSocialLinks(
    links: Record<SocialPlatform, string>,
  ): Promise<{ socialLinks: Record<SocialPlatform, string> }> {
    const res = await requestJson<{ socialLinks: Record<SocialPlatform, string> }>(
      '/api/admin/social-links',
      {
        method: 'PUT',
        body: JSON.stringify({ links }),
      },
    );
    notifyTabsOfChange();
    return res;
  },
  async uploadSliderPhotos(
    items: Array<{ image_data: string }>,
  ): Promise<{ sliderPhotos: SliderPhoto[] }> {
    const res = await requestJson<{ sliderPhotos: SliderPhoto[] }>('/api/admin/slider', {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
    notifyTabsOfChange();
    return res;
  },
  async replaceSliderPhoto(
    id: string,
    image_data: string,
  ): Promise<{ sliderPhotos: SliderPhoto[] }> {
    const res = await requestJson<{ sliderPhotos: SliderPhoto[] }>(
      `/api/admin/slider/${encodeURIComponent(id)}`,
      {
        method: 'PUT',
        body: JSON.stringify({ image_data }),
      },
    );
    notifyTabsOfChange();
    return res;
  },
  async reorderSliderPhoto(
    id: string,
    direction: -1 | 1,
  ): Promise<{ sliderPhotos: SliderPhoto[] }> {
    const res = await requestJson<{ sliderPhotos: SliderPhoto[] }>('/api/admin/slider/reorder', {
      method: 'POST',
      body: JSON.stringify({ id, direction }),
    });
    notifyTabsOfChange();
    return res;
  },
  async deleteSliderPhoto(id: string): Promise<{ sliderPhotos: SliderPhoto[] }> {
    const res = await requestJson<{ sliderPhotos: SliderPhoto[] }>(
      `/api/admin/slider/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
      },
    );
    notifyTabsOfChange();
    return res;
  },
};

function notifyTabsOfChange(): void {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel('gb-study-live-sync');
      ch.postMessage({ updatedAt: Date.now() });
      ch.close();
    }
  } catch {
    // ignore BroadcastChannel errors
  }
}

export function subscribeLiveUpdates(onChange: () => void): () => void {
  const interval = window.setInterval(() => {
    if (!document.hidden) onChange();
  }, 5000);

  const onFocus = () => {
    if (!document.hidden) onChange();
  };
  window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', onFocus);

  let es: EventSource | null = null;
  try {
    if (typeof EventSource !== 'undefined') {
      es = new EventSource('/api/public/events');
      es.addEventListener('update', () => onChange());
    }
  } catch {
    es = null;
  }

  let ch: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      ch = new BroadcastChannel('gb-study-live-sync');
      ch.onmessage = () => onChange();
    }
  } catch {
    ch = null;
  }

  return () => {
    window.clearInterval(interval);
    window.removeEventListener('focus', onFocus);
    document.removeEventListener('visibilitychange', onFocus);
    es?.close();
    ch?.close();
  };
}
