interface KVLike {
  get(key: string, type?: 'text' | 'json'): Promise<any>;
  put(key: string, value: string): Promise<void>;
}

interface Env {
  GB_STUDY_KV?: KVLike;
  ADMIN_EMAIL?: string;
  ADMIN_PASSWORD?: string;
  SESSION_SECRET?: string;
  ASSETS?: { fetch(req: Request): Promise<Response> };
}

interface AppItem {
  id: string;
  name: string;
  label: string;
  description: string;
  logo_url: string | null;
  app_url: string | null;
  app_url_2: string | null;
  app_url_3: string | null;
  app_url_4: string | null;
  tone: string;
  sort_order: number;
  vip_text: string;
  open_text: string;
  is_active: boolean;
  created_at: string;
}

interface SliderPhoto {
  id: string;
  image_data: string;
  sort_order: number;
  created_at: string;
}

interface DatabaseState {
  apps: AppItem[];
  linkCounters: Record<string, [number, number, number, number]>;
  sliderPhotos: SliderPhoto[];
  socialLinks: Record<'telegram' | 'youtube' | 'whatsapp' | 'instagram', string>;
  siteBranding: { header_title: string; updated_at: string };
  adminAuth: { email: string; salt: string; passwordHash: string } | null;
}

const DB_KEY = 'gb_study_db_v1';
const CACHE_KEY = 'https://cache.gbstudy.internal/public-bootstrap-v1';

function createDefaultState(seed?: Partial<DatabaseState>): DatabaseState {
  const now = new Date().toISOString();
  return {
    apps: Array.isArray(seed?.apps) ? seed.apps : [],
    linkCounters: seed?.linkCounters ?? {},
    sliderPhotos: Array.isArray(seed?.sliderPhotos) ? seed.sliderPhotos : [],
    socialLinks: {
      telegram: seed?.socialLinks?.telegram ?? 'https://t.me/gbstudy',
      youtube: seed?.socialLinks?.youtube ?? 'https://youtube.com/@gbstudy',
      whatsapp: seed?.socialLinks?.whatsapp ?? 'https://whatsapp.com/',
      instagram: seed?.socialLinks?.instagram ?? 'https://instagram.com/gbstudy',
    },
    siteBranding: seed?.siteBranding ?? { header_title: '𝐆𝐁 𝐒𝐓𝐔𝐃𝐘', updated_at: now },
    adminAuth: seed?.adminAuth ?? null,
  };
}

async function readDb(env: Env, origin: string): Promise<DatabaseState> {
  if (env.GB_STUDY_KV) {
    const raw = await env.GB_STUDY_KV.get(DB_KEY, 'json');
    if (raw && typeof raw === 'object') {
      return createDefaultState(raw as Partial<DatabaseState>);
    }
    const backupRaw = await env.GB_STUDY_KV.get('gb_study_db_backup_v1', 'json');
    if (backupRaw && typeof backupRaw === 'object') {
      const healed = createDefaultState(backupRaw as Partial<DatabaseState>);
      try {
        await env.GB_STUDY_KV.put(DB_KEY, JSON.stringify(healed));
      } catch {
        // ignore heal write error if quota exhausted
      }
      return healed;
    }
  }
  try {
    const seedRes = await (env.ASSETS
      ? env.ASSETS.fetch(new Request(`${origin}/bootstrap-snapshot.json`))
      : fetch(`${origin}/bootstrap-snapshot.json`));
    if (seedRes.ok) {
      const seedJson = (await seedRes.json()) as Partial<DatabaseState> & { headerTitle?: string };
      const state = createDefaultState({
        apps: seedJson.apps,
        sliderPhotos: seedJson.sliderPhotos,
        socialLinks: seedJson.socialLinks,
        siteBranding: {
          header_title: seedJson.headerTitle || '𝐆𝐁 𝐒𝐓𝐔𝐃𝐘',
          updated_at: new Date().toISOString(),
        },
      });
      if (env.GB_STUDY_KV) {
        const serialized = JSON.stringify(state);
        await env.GB_STUDY_KV.put(DB_KEY, serialized);
        await env.GB_STUDY_KV.put('gb_study_db_backup_v1', serialized);
      }
      return state;
    }
  } catch {
    // ignore snapshot read error
  }
  return createDefaultState();
}

async function writeDb(env: Env, state: DatabaseState): Promise<void> {
  if (!env.GB_STUDY_KV) {
    throw new Error('Cloudflare KV binding GB_STUDY_KV is not configured in Pages Settings.');
  }
  const serialized = JSON.stringify(state);
  await env.GB_STUDY_KV.put(DB_KEY, serialized);
  await env.GB_STUDY_KV.put('gb_study_db_backup_v1', serialized);
  try {
    const cache = (caches as unknown as { default: Cache }).default;
    await cache.delete(new Request(CACHE_KEY));
  } catch {
    // ignore cache purge errors
  }
}

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

function sanitizeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed.replace(/^\/+/, '')}`;
  try {
    const u = new URL(candidate);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

function sanitizeImageSource(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('/logos/') || trimmed.startsWith('/src/assets/') || trimmed.startsWith('/assets/')) {
    return trimmed;
  }
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
    return trimmed;
  }
  try {
    const u = new URL(trimmed);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function signToken(email: string, secret: string): Promise<string> {
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const payload = btoa(JSON.stringify({ email, exp }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const sigHex = await sha256Hex(`${payload}.${secret}`);
  return `${payload}.${sigHex}`;
}

async function verifyToken(token: string, secret: string): Promise<{ email: string } | null> {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = await sha256Hex(`${payload}.${secret}`);
  if (sig !== expected) return null;
  try {
    const pad = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(atob(pad)) as { email?: string; exp?: number };
    if (!decoded.email || typeof decoded.exp !== 'number' || decoded.exp <= Date.now()) {
      return null;
    }
    return { email: decoded.email };
  } catch {
    return null;
  }
}

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  try {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();
  const origin = url.origin;
  const secret = env.SESSION_SECRET?.trim() || 'gb-study-edge-default-secret';

  if (path === '/api/public/shield-handshake' && method === 'POST') {
    const proof = request.headers.get('x-gb-shield') || '';
    const [tsStr, sig] = proof.split('.');
    const ts = Number(tsStr);
    const nowSec = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(ts) || !sig || Math.abs(nowSec - ts) > 300) {
      return jsonResponse({ error: 'Bot verification failed.', challengeRequired: true }, 403);
    }
    const token = await signToken('shield-browser', secret);
    return jsonResponse({ ok: true, token });
  }

  if (path === '/api/public/events' && method === 'GET') {
    return new Response('retry: 5000\nevent: connected\ndata: {"edge":true}\n\n', {
      status: 200,
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
      },
    });
  }

  if (path === '/api/public/bootstrap' && method === 'GET') {
    const db = await readDb(env, origin);
    const payloadStr = JSON.stringify({
      apps: [...db.apps].sort((a, b) => a.sort_order - b.sort_order),
      sliderPhotos: [...db.sliderPhotos].sort((a, b) => a.sort_order - b.sort_order),
      socialLinks: db.socialLinks,
      headerTitle: db.siteBranding.header_title || '𝐆𝐁 𝐒𝐓𝐔𝐃𝐘',
    });
    const etag = `"${(await sha256Hex(payloadStr)).slice(0, 24)}"`;
    if (request.headers.get('if-none-match') === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          etag,
          'cache-control': 'public, max-age=0, must-revalidate',
        },
      });
    }
    return new Response(payloadStr, {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        etag,
        'cache-control': 'public, max-age=0, must-revalidate',
      },
    });
  }

  if (path.startsWith('/api/public/apps/') && method === 'GET') {
    const id = decodeURIComponent(path.slice('/api/public/apps/'.length));
    const db = await readDb(env, origin);
    const app = db.apps.find((a) => a.id === id);
    return app ? jsonResponse({ app }) : jsonResponse({ error: 'App nahi mila.' }, 404);
  }

  if (path === '/api/public/embed-check' && method === 'GET') {
    const targetUrl = url.searchParams.get('url')?.trim() || '';
    const currentOrigin = url.searchParams.get('origin')?.trim() || origin;
    if (!targetUrl) return jsonResponse({ embeddable: true });
    try {
      const parsed = new URL(targetUrl);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return jsonResponse({ embeddable: true });
      }
      const h = parsed.hostname.toLowerCase();
      if (
        h === 'localhost' ||
        h === '127.0.0.1' ||
        h === '::1' ||
        h === '0.0.0.0' ||
        h.endsWith('.local') ||
        h.endsWith('.internal') ||
        /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)
      ) {
        return jsonResponse({ embeddable: true });
      }
      if (parsed.origin.toLowerCase() === currentOrigin.toLowerCase()) {
        return jsonResponse({ embeddable: true });
      }
      const res = await fetch(parsed.href, {
        method: 'HEAD',
        redirect: 'follow',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
        },
      });
      const xfo = (res.headers.get('x-frame-options') || '').toUpperCase();
      const csp = res.headers.get('content-security-policy') || '';
      const faMatch = csp.match(/(?:^|;)\s*frame-ancestors\s+([^;]+)/i);
      let embeddable = true;
      if (faMatch) {
        const tokens = faMatch[1].trim().split(/\s+/).map((t) => t.replace(/^['"]|['"]$/g, '').toLowerCase());
        const cur = new URL(currentOrigin);
        embeddable = tokens.some((tok) => {
          if (tok === '*') return true;
          if (tok === 'none') return false;
          if (tok === 'self') return parsed.origin.toLowerCase() === currentOrigin.toLowerCase();
          const m = tok.match(/^(https?):\/\/(.+)$/);
          const pat = (m ? m[2] : tok).split('/')[0].split(':')[0];
          if (m && `${m[1]}:` !== cur.protocol) return false;
          const re = new RegExp(`^${pat.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i');
          return re.test(cur.hostname);
        });
      } else if (xfo.includes('DENY') || xfo.includes('SAMEORIGIN')) {
        embeddable = false;
      }
      return jsonResponse({ embeddable }, 200, { 'cache-control': 'public, max-age=300' });
    } catch {
      return jsonResponse({ embeddable: true });
    }
  }

  if (path === '/api/public/assign-link' && method === 'POST') {
    const body = (await request.json().catch(() => ({}))) as { appId?: string };
    const db = await readDb(env, origin);
    const item = db.apps.find((a) => a.id === body.appId);
    if (!item) return jsonResponse({ error: 'App not found' }, 404);
    const slots = [item.app_url, item.app_url_2, item.app_url_3, item.app_url_4]
      .map((u, i) => (u?.trim() ? i + 1 : 0))
      .filter((s) => s > 0);
    const chosen = slots.length ? slots[Math.floor(Math.random() * slots.length)] : 1;
    return jsonResponse({ slot: chosen });
  }

  // Admin auth
  if (path === '/api/admin/auth/status' && method === 'GET') {
    const db = await readDb(env, origin);
    const envPass = env.ADMIN_PASSWORD?.trim() || '';
    const authHeader = request.headers.get('authorization') || '';
    const admin = authHeader.startsWith('Bearer ')
      ? await verifyToken(authHeader.slice(7).trim(), secret)
      : null;
    return jsonResponse({
      authenticated: Boolean(admin),
      email: admin?.email ?? null,
      needsSetup: !envPass && !db.adminAuth,
      kvBound: Boolean(env.GB_STUDY_KV),
    });
  }

  if (path === '/api/admin/auth/setup' && method === 'POST') {
    const db = await readDb(env, origin);
    const envPass = env.ADMIN_PASSWORD?.trim() || '';
    if (envPass || db.adminAuth) {
      return jsonResponse({ error: 'Admin account pehle se set hai. Sign in karein.' }, 409);
    }
    const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string };
    const email = (body.email || '').trim().toLowerCase();
    const password = body.password || '';
    if (!email || !email.includes('@') || password.length < 6) {
      return jsonResponse({ error: 'Valid email aur kam se kam 6 character password enter karein.' }, 400);
    }
    const salt = crypto.randomUUID().replace(/-/g, '');
    const passwordHash = await sha256Hex(`${salt}:${password}`);
    db.adminAuth = { email, salt, passwordHash };
    await writeDb(env, db);
    return jsonResponse({ token: await signToken(email, secret), email });
  }

  if (path === '/api/admin/auth/login' && method === 'POST') {
    const db = await readDb(env, origin);
    const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string };
    const email = (body.email || '').trim().toLowerCase();
    const password = body.password || '';
    const envPass = env.ADMIN_PASSWORD?.trim() || '';
    const envEmail = env.ADMIN_EMAIL?.trim().toLowerCase() || '';

    if (envPass) {
      if ((envEmail && email !== envEmail) || password !== envPass) {
        return jsonResponse({ error: 'Email ya password sahi nahi hai.' }, 401);
      }
      return jsonResponse({ token: await signToken(email || envEmail || 'admin@gbstudy.local', secret), email });
    }
    if (!db.adminAuth) {
      return jsonResponse({ error: 'Pehle admin account setup karein.' }, 400);
    }
    const candidateHash = await sha256Hex(`${db.adminAuth.salt}:${password}`);
    if (email !== db.adminAuth.email || candidateHash !== db.adminAuth.passwordHash) {
      return jsonResponse({ error: 'Email ya password sahi nahi hai.' }, 401);
    }
    return jsonResponse({ token: await signToken(db.adminAuth.email, secret), email: db.adminAuth.email });
  }

  // Protected Admin Routes
  if (path.startsWith('/api/admin/')) {
    const authHeader = request.headers.get('authorization') || '';
    const admin = authHeader.startsWith('Bearer ')
      ? await verifyToken(authHeader.slice(7).trim(), secret)
      : null;
    if (!admin) return jsonResponse({ error: 'Admin authentication required.' }, 401);

    const db = await readDb(env, origin);

    if (path === '/api/admin/workspace' && method === 'GET') {
      return jsonResponse({
        apps: [...db.apps].sort((a, b) => a.sort_order - b.sort_order),
        linkCounters: db.linkCounters,
        headerTitle: db.siteBranding.header_title,
        socialLinks: db.socialLinks,
        sliderPhotos: [...db.sliderPhotos].sort((a, b) => a.sort_order - b.sort_order),
      });
    }

    if (path === '/api/admin/apps' && method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const appUrl = sanitizeHttpUrl(body.app_url);
      if (!name || !appUrl) {
        return jsonResponse({ error: 'App name aur App URL link 1 required hain.' }, 400);
      }
      const maxSort = db.apps.reduce((m, a) => Math.max(m, a.sort_order), -1);
      const id = crypto.randomUUID();
      const newApp: AppItem = {
        id,
        name,
        label: '',
        description: '',
        logo_url: sanitizeImageSource(body.logo_url) ?? null,
        app_url: appUrl,
        app_url_2: sanitizeHttpUrl(body.app_url_2),
        app_url_3: sanitizeHttpUrl(body.app_url_3),
        app_url_4: sanitizeHttpUrl(body.app_url_4),
        tone: 'app-card-amber',
        sort_order: maxSort + 1,
        vip_text: 'VIP',
        open_text: 'OPEN THIS APP',
        is_active: body.is_active === undefined ? true : Boolean(body.is_active),
        created_at: new Date().toISOString(),
      };
      db.apps.push(newApp);
      db.linkCounters[id] = [0, 0, 0, 0];
      await writeDb(env, db);
      return jsonResponse({ app: newApp });
    }

    if (path.startsWith('/api/admin/apps/') && method === 'PUT') {
      const id = decodeURIComponent(path.slice('/api/admin/apps/'.length));
      const idx = db.apps.findIndex((a) => a.id === id);
      if (idx < 0) return jsonResponse({ error: 'App nahi mila.' }, 404);
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const appUrl = sanitizeHttpUrl(body.app_url);
      if (!name || !appUrl) {
        return jsonResponse({ error: 'App name aur App URL link 1 required hain.' }, 400);
      }
      const cur = db.apps[idx];
      db.apps[idx] = {
        ...cur,
        name,
        logo_url: body.logo_url === null ? null : sanitizeImageSource(body.logo_url) ?? cur.logo_url,
        app_url: appUrl,
        app_url_2: sanitizeHttpUrl(body.app_url_2),
        app_url_3: sanitizeHttpUrl(body.app_url_3),
        app_url_4: sanitizeHttpUrl(body.app_url_4),
        is_active: Boolean(body.is_active),
      };
      await writeDb(env, db);
      return jsonResponse({ app: db.apps[idx] });
    }

    if (path.startsWith('/api/admin/apps/') && method === 'DELETE') {
      return jsonResponse({ error: 'Platforms permanent hain — delete nahi kiye ja sakte.' }, 403);
    }

    if (path === '/api/admin/branding' && method === 'PUT') {
      const body = (await request.json().catch(() => ({}))) as { header_title?: string };
      const title = body.header_title?.trim() ? body.header_title.trim().slice(0, 64) : '𝐆𝐁 𝐒𝐓𝐔𝐃𝐘';
      db.siteBranding = { header_title: title, updated_at: new Date().toISOString() };
      await writeDb(env, db);
      return jsonResponse({ header_title: title });
    }

    if (path === '/api/admin/social-links' && method === 'PUT') {
      const body = (await request.json().catch(() => ({}))) as { links?: Record<string, unknown> };
      for (const key of ['telegram', 'youtube', 'whatsapp', 'instagram'] as const) {
        const val = body.links?.[key];
        if (typeof val === 'string') {
          db.socialLinks[key] = val.trim() ? sanitizeHttpUrl(val) ?? '' : '';
        }
      }
      await writeDb(env, db);
      return jsonResponse({ socialLinks: db.socialLinks });
    }

    if (path === '/api/admin/slider' && method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as { items?: Array<{ image_data?: unknown }> };
      const maxSort = db.sliderPhotos.reduce((m, s) => Math.max(m, s.sort_order), 0);
      const items = Array.isArray(body.items) ? body.items : [];
      items.forEach((item, i) => {
        const img = sanitizeImageSource(item?.image_data);
        if (img) {
          db.sliderPhotos.push({
            id: crypto.randomUUID(),
            image_data: img,
            sort_order: maxSort + i + 1,
            created_at: new Date().toISOString(),
          });
        }
      });
      await writeDb(env, db);
      return jsonResponse({ sliderPhotos: [...db.sliderPhotos].sort((a, b) => a.sort_order - b.sort_order) });
    }

    if (path === '/api/admin/slider/reorder' && method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as { id?: string; direction?: number };
      const sorted = [...db.sliderPhotos].sort((a, b) => a.sort_order - b.sort_order);
      const idx = sorted.findIndex((s) => s.id === body.id);
      const target = idx + (body.direction === -1 ? -1 : 1);
      if (idx >= 0 && target >= 0 && target < sorted.length) {
        const [moved] = sorted.splice(idx, 1);
        sorted.splice(target, 0, moved);
        sorted.forEach((s, i) => (s.sort_order = i + 1));
        db.sliderPhotos = sorted;
        await writeDb(env, db);
      }
      return jsonResponse({ sliderPhotos: db.sliderPhotos });
    }

    if (path.startsWith('/api/admin/slider/') && method === 'PUT') {
      const id = decodeURIComponent(path.slice('/api/admin/slider/'.length));
      const body = (await request.json().catch(() => ({}))) as { image_data?: unknown };
      const img = sanitizeImageSource(body.image_data);
      const idx = db.sliderPhotos.findIndex((s) => s.id === id);
      if (idx >= 0 && img) {
        db.sliderPhotos[idx] = { ...db.sliderPhotos[idx], image_data: img };
        await writeDb(env, db);
      }
      return jsonResponse({ sliderPhotos: [...db.sliderPhotos].sort((a, b) => a.sort_order - b.sort_order) });
    }

    if (path.startsWith('/api/admin/slider/') && method === 'DELETE') {
      const id = decodeURIComponent(path.slice('/api/admin/slider/'.length));
      db.sliderPhotos = db.sliderPhotos.filter((s) => s.id !== id);
      await writeDb(env, db);
      return jsonResponse({ sliderPhotos: [...db.sliderPhotos].sort((a, b) => a.sort_order - b.sort_order) });
    }
  }

  return jsonResponse({ error: 'API endpoint not found' }, 404);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error';
    const isKvMissing = message.includes('GB_STUDY_KV');
    return jsonResponse({ error: message, code: isKvMissing ? 'KV_NOT_CONFIGURED' : 'EDGE_ERROR' }, isKvMissing ? 503 : 500);
  }
}
