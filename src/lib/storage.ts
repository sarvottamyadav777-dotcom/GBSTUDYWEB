const memoryFallback = new Map<string, string>();

function getSafeLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    const ls = window.localStorage;
    if (!ls) return null;
    const probe = '__gb_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return null;
  }
}

function getCookieFallback(name: string): string | null {
  try {
    if (typeof document === 'undefined') return null;
    const prefix = `gb_${encodeURIComponent(name)}=`;
    for (const part of document.cookie.split('; ')) {
      if (part.startsWith(prefix)) {
        return decodeURIComponent(part.slice(prefix.length));
      }
    }
  } catch {
    return null;
  }
  return null;
}

function setCookieFallback(name: string, value: string | null): void {
  try {
    if (typeof document === 'undefined') return;
    const key = `gb_${encodeURIComponent(name)}`;
    document.cookie =
      value === null
        ? `${key}=; path=/; max-age=0; SameSite=Lax`
        : `${key}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {
    // ignore cookie errors in restricted contexts
  }
}

export const safeStorage = {
  getItem(key: string): string | null {
    const ls = getSafeLocalStorage();
    if (ls) {
      try {
        return ls.getItem(key);
      } catch {
        // fallback below
      }
    }
    return memoryFallback.get(key) ?? getCookieFallback(key);
  },
  setItem(key: string, value: string): void {
    const ls = getSafeLocalStorage();
    if (ls) {
      try {
        ls.setItem(key, value);
        return;
      } catch {
        // fallback below
      }
    }
    memoryFallback.set(key, value);
    setCookieFallback(key, value);
  },
  removeItem(key: string): void {
    const ls = getSafeLocalStorage();
    if (ls) {
      try {
        ls.removeItem(key);
        return;
      } catch {
        // fallback below
      }
    }
    memoryFallback.delete(key);
    setCookieFallback(key, null);
  },
};

export const LINK_SLOT_PREFIX = 'studyos-link-slot-';

export function normalizeExternalUrl(raw?: string | null): string | null {
  if (!raw || !raw.trim()) return null;
  const trimmed = raw.trim();
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed.replace(/^\/+/, '')}`;
  try {
    const u = new URL(candidate);
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      return u.href;
    }
    return null;
  } catch {
    return null;
  }
}
