import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import dotenv from 'dotenv';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import type {
  AppItem,
  SliderPhoto,
  SocialLinksMap,
  SocialPlatform,
} from './src/lib/types.ts';
import {
  extractFrameAncestorsDirective,
  isOriginAllowedByEmbedPolicy,
  type EmbedPolicy,
} from './src/lib/embedPolicy.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const DB_BACKUP_PATH = path.join(DATA_DIR, 'db.backup.json');
const PUBLIC_SNAPSHOT_PATH = path.resolve(__dirname, 'public', 'bootstrap-snapshot.json');
const DIST_DIR = path.resolve(__dirname, 'dist');
const DIST_SNAPSHOT_PATH = path.join(DIST_DIR, 'bootstrap-snapshot.json');

const SESSION_SECRET =
  process.env.SESSION_SECRET?.trim() || crypto.randomBytes(32).toString('hex');

interface AdminAuthRecord {
  email: string;
  salt: string;
  passwordHash: string;
}

interface DatabaseState {
  apps: AppItem[];
  linkCounters: Record<string, [number, number, number, number]>;
  sliderPhotos: SliderPhoto[];
  socialLinks: Record<SocialPlatform, string>;
  siteBranding: {
    header_title: string;
    updated_at: string;
  };
  adminAuth: AdminAuthRecord | null;
}

function createInitialState(): DatabaseState {
  const now = new Date().toISOString();
  const apps: AppItem[] = [
    {
      id: 'dc17d565-e07c-4aaa-aef7-2b8c198190dd',
      name: 'PHYSICS W',
      label: '',
      description: '',
      logo_url: '/logos/physics-w-logo.jpg',
      app_url: 'https://bat.pw1.workers.dev/',
      app_url_2: 'https://bat.pww2.workers.dev/',
      app_url_3: 'https://bat.pww3.workers.dev/',
      app_url_4: 'https://bat.pw4.workers.dev/',
      tone: 'app-card-amber',
      sort_order: 0,
      vip_text: 'VIP',
      open_text: 'OPEN THIS APP',
      is_active: true,
      created_at: now,
    },
  ];

  const linkCounters: Record<string, [number, number, number, number]> = {};
  for (const app of apps) {
    linkCounters[app.id] = [0, 0, 0, 0];
  }

  return {
    apps,
    linkCounters,
    sliderPhotos: [
      {
        id: 'f77e7a3e-0181-4042-8fd4-9ad8e4accdd9',
        image_data: '/src/assets/images/gb_slide_1_1795404472463.jpg',
        sort_order: 1,
        created_at: now,
      },
      {
        id: 'd4b2d202-5002-4dc0-98c8-0d8496bf92b2',
        image_data: '/src/assets/images/gb_slide_2_1795404472938.jpg',
        sort_order: 2,
        created_at: now,
      },
      {
        id: 'bd29c42a-7bd1-4030-af83-2eaf1f60ae6a',
        image_data: '/src/assets/images/gb_slide_3_1795404472484.jpg',
        sort_order: 3,
        created_at: now,
      },
    ],
    socialLinks: {
      telegram: 'https://t.me/gbstudy',
      youtube: 'https://youtube.com/@gbstudy',
      whatsapp: 'https://whatsapp.com/',
      instagram: 'https://instagram.com/gbstudy',
    },
    siteBranding: {
      header_title: '𝐆𝐁 𝐒𝐓𝐔𝐃𝐘',
      updated_at: now,
    },
    adminAuth: null,
  };
}

function normalizeState(parsed: Partial<DatabaseState>): DatabaseState {
  const fallback = createInitialState();
  return {
    apps: Array.isArray(parsed.apps) ? parsed.apps : fallback.apps,
    linkCounters:
      parsed.linkCounters && typeof parsed.linkCounters === 'object'
        ? parsed.linkCounters
        : fallback.linkCounters,
    sliderPhotos: Array.isArray(parsed.sliderPhotos)
      ? parsed.sliderPhotos
      : fallback.sliderPhotos,
    socialLinks: {
      ...fallback.socialLinks,
      ...(parsed.socialLinks ?? {}),
    },
    siteBranding: parsed.siteBranding ?? fallback.siteBranding,
    adminAuth: parsed.adminAuth ?? null,
  };
}

function getPublicSocialLinksFromState(state: DatabaseState): SocialLinksMap {
  const out: SocialLinksMap = {};
  for (const key of ['telegram', 'youtube', 'whatsapp', 'instagram'] as const) {
    const v = state.socialLinks[key]?.trim();
    if (v) out[key] = v;
  }
  return out;
}

// High-throughput RAM cache for 500k+ concurrent reads without disk I/O
let cachedBootstrapBuffer = Buffer.alloc(0);
let cachedBootstrapEtag = '';
let cachedAppsById = new Map<string, AppItem>();
const embedPolicyCache = new Map<string, { policy: EmbedPolicy; checkedAt: number }>();
const EMBED_POLICY_TTL_MS = 30 * 60 * 1000;

function isPrivateHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '::1' ||
    h === '0.0.0.0' ||
    h.endsWith('.local') ||
    h.endsWith('.internal')
  ) {
    return true;
  }
  if (/^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) {
    return true;
  }
  return false;
}

async function probeEmbedPolicy(rawUrl: string): Promise<EmbedPolicy | null> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || isPrivateHostname(parsed.hostname)) {
    return null;
  }
  const normalized = parsed.href;
  const cached = embedPolicyCache.get(normalized);
  if (cached && Date.now() - cached.checkedAt < EMBED_POLICY_TTL_MS) {
    return cached.policy;
  }

  try {
    let res = await fetch(normalized, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(3000),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
      },
    });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(normalized, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(3000),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
        },
      });
      await res.body?.cancel().catch(() => undefined);
    }
    const xfo = res.headers.get('x-frame-options');
    const rawCsp = res.headers.get('content-security-policy');
    const faTokens = extractFrameAncestorsDirective(rawCsp);
    const compactCsp = faTokens ? `frame-ancestors ${faTokens.join(' ')}` : null;
    const policy: EmbedPolicy = { xfo, csp: compactCsp };
    embedPolicyCache.set(normalized, { policy, checkedAt: Date.now() });
    return policy;
  } catch {
    return cached?.policy ?? null;
  }
}

async function probeAllAppUrls(state: DatabaseState): Promise<void> {
  const urls = new Set<string>();
  for (const app of state.apps) {
    for (const u of [app.app_url, app.app_url_2, app.app_url_3, app.app_url_4]) {
      if (typeof u === 'string' && u.trim()) {
        urls.add(u.trim());
      }
    }
  }
  let changed = false;
  await Promise.allSettled(
    Array.from(urls).map(async (u) => {
      const before = embedPolicyCache.get(u)?.checkedAt ?? 0;
      await probeEmbedPolicy(u);
      const after = embedPolicyCache.get(u)?.checkedAt ?? 0;
      if (after !== before) changed = true;
    }),
  );
  if (changed) {
    refreshMemoryCache(state);
  }
}

function getEmbedPoliciesSnapshot(state: DatabaseState): Record<string, EmbedPolicy> {
  const out: Record<string, EmbedPolicy> = {};
  for (const app of state.apps) {
    for (const u of [app.app_url, app.app_url_2, app.app_url_3, app.app_url_4]) {
      if (typeof u === 'string' && u.trim()) {
        const key = u.trim();
        const entry = embedPolicyCache.get(key);
        if (entry) {
          out[key] = entry.policy;
        }
      }
    }
  }
  return out;
}

function refreshMemoryCache(state: DatabaseState): void {
  const sortedApps = [...state.apps].sort((a, b) => a.sort_order - b.sort_order);
  const sortedSlides = [...state.sliderPhotos].sort((a, b) => a.sort_order - b.sort_order);
  const publicPayload = {
    apps: sortedApps,
    sliderPhotos: sortedSlides,
    socialLinks: getPublicSocialLinksFromState(state),
    headerTitle: state.siteBranding.header_title || '𝐆𝐁 𝐒𝐓𝐔𝐃𝐘',
    embedPolicies: getEmbedPoliciesSnapshot(state),
  };
  const jsonStr = JSON.stringify(publicPayload);
  cachedBootstrapBuffer = Buffer.from(jsonStr, 'utf8');
  cachedBootstrapEtag = `"${crypto.createHash('sha1').update(cachedBootstrapBuffer).digest('hex')}"`;
  cachedAppsById = new Map(sortedApps.map((app) => [app.id, app]));

  try {
    fs.mkdirSync(path.dirname(PUBLIC_SNAPSHOT_PATH), { recursive: true });
    fs.writeFileSync(PUBLIC_SNAPSHOT_PATH, jsonStr, 'utf8');
    if (fs.existsSync(DIST_DIR)) {
      fs.writeFileSync(DIST_SNAPSHOT_PATH, jsonStr, 'utf8');
    }
  } catch {
    // non-fatal if filesystem snapshot write fails
  }
}

const sseClients = new Set<Response>();

function notifyLiveSubscribers(): void {
  if (sseClients.size === 0) return;
  const payload = `event: update\ndata: ${JSON.stringify({ v: cachedBootstrapEtag })}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

function saveDatabase(state: DatabaseState, broadcastUpdate = true): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const serialized = JSON.stringify(state, null, 2);
  const tmpMain = `${DB_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmpMain, serialized, 'utf8');
  fs.renameSync(tmpMain, DB_PATH);

  const tmpBackup = `${DB_BACKUP_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmpBackup, serialized, 'utf8');
  fs.renameSync(tmpBackup, DB_BACKUP_PATH);

  refreshMemoryCache(state);
  if (broadcastUpdate) {
    notifyLiveSubscribers();
  }
}

function tryReadStateFile(filePath: string): DatabaseState | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return normalizeState(JSON.parse(raw) as Partial<DatabaseState>);
  } catch {
    return null;
  }
}

function tryReadSnapshotRecovery(): DatabaseState | null {
  if (!fs.existsSync(PUBLIC_SNAPSHOT_PATH)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(PUBLIC_SNAPSHOT_PATH, 'utf8')) as {
      apps?: AppItem[];
      sliderPhotos?: SliderPhoto[];
      socialLinks?: SocialLinksMap;
      headerTitle?: string;
    };
    const base = createInitialState();
    const recoveredApps = Array.isArray(raw.apps) && raw.apps.length > 0 ? raw.apps : base.apps;
    const linkCounters: Record<string, [number, number, number, number]> = {};
    for (const app of recoveredApps) {
      linkCounters[app.id] = [0, 0, 0, 0];
    }
    return normalizeState({
      ...base,
      apps: recoveredApps,
      linkCounters,
      sliderPhotos: Array.isArray(raw.sliderPhotos) ? raw.sliderPhotos : base.sliderPhotos,
      socialLinks: {
        ...base.socialLinks,
        ...(raw.socialLinks ?? {}),
      },
      siteBranding: {
        header_title:
          typeof raw.headerTitle === 'string' && raw.headerTitle.trim()
            ? raw.headerTitle.trim()
            : base.siteBranding.header_title,
        updated_at: new Date().toISOString(),
      },
    });
  } catch {
    return null;
  }
}

function loadDatabase(): DatabaseState {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const fromMain = tryReadStateFile(DB_PATH);
  if (fromMain) {
    refreshMemoryCache(fromMain);
    return fromMain;
  }
  const fromBackup = tryReadStateFile(DB_BACKUP_PATH);
  if (fromBackup) {
    saveDatabase(fromBackup, false);
    return fromBackup;
  }
  const fromSnapshot = tryReadSnapshotRecovery();
  if (fromSnapshot) {
    saveDatabase(fromSnapshot, false);
    return fromSnapshot;
  }
  const initial = createInitialState();
  saveDatabase(initial, false);
  return initial;
}

const db: DatabaseState = loadDatabase();

// Pure Node CRC32 & ZIP archive builder (no external zip binary required)
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function collectFilesRecursive(
  dir: string,
  baseDir: string,
  ignoreNames: Set<string>,
): Array<{ zipPath: string; fullPath: string }> {
  const results: Array<{ zipPath: string; fullPath: string }> = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoreNames.has(entry.name)) continue;
    if (entry.name.startsWith('.env') && entry.name !== '.env.example') continue;
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(baseDir, fullPath).split(path.sep).join('/');
    if (entry.isDirectory()) {
      results.push(...collectFilesRecursive(fullPath, baseDir, ignoreNames));
    } else if (entry.isFile()) {
      results.push({ zipPath: relPath, fullPath });
    }
  }
  return results;
}

function buildZipBuffer(entries: Array<{ zipPath: string; data: Buffer }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.zipPath, 'utf8');
    const raw = entry.data;
    const compressed = zlib.deflateRawSync(raw, { level: 6 });
    const useDeflate = compressed.length < raw.length;
    const payload = useDeflate ? compressed : raw;
    const method = useDeflate ? 8 : 0;
    const checksum = crc32(raw);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 filename flag
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0x5421, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(payload.length, 18);
    localHeader.writeUInt32LE(raw.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, payload);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0x5421, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(payload.length, 20);
    centralHeader.writeUInt32LE(raw.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + payload.length;
  }

  const centralSize = centralParts.reduce((s, b) => s + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, eocd]);
}

function ensureBuiltDist(): void {
  const indexHtml = path.join(DIST_DIR, 'index.html');
  if (!fs.existsSync(indexHtml)) {
    execSync('npm run build', { cwd: __dirname, stdio: 'inherit' });
  }
  refreshMemoryCache(db);
}

function sanitizeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
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

function sanitizeImageSource(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (
    trimmed.startsWith('/logos/') ||
    trimmed.startsWith('/src/assets/') ||
    trimmed.startsWith('/assets/')
  ) {
    return trimmed;
  }
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
    return trimmed;
  }
  try {
    const u = new URL(trimmed);
    if (u.protocol === 'https:' || u.protocol === 'http:') {
      return u.href;
    }
  } catch {
    return null;
  }
  return null;
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function signSessionToken(email: string): string {
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ email, exp })).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

function verifySessionToken(token: string): { email: string } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  if (!payload || !sig) return null;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  if (!timingSafeCompare(sig, expectedSig)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      email?: string;
      exp?: number;
    };
    if (!decoded.email || typeof decoded.exp !== 'number' || decoded.exp <= Date.now()) {
      return null;
    }
    return { email: decoded.email };
  } catch {
    return null;
  }
}

function getBearerAdmin(req: Request): { email: string } | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  return verifySessionToken(token);
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const admin = getBearerAdmin(req);
  if (!admin) {
    res.status(401).json({ error: 'Admin authentication required.' });
    return;
  }
  next();
}

// === Cloudflare-Style Bot & Flood Shield ===
const BAD_BOT_UA_RE =
  /(^$|curl\/|wget\/|python-requests|python-urllib|aiohttp|httpx|scrapy|go-http-client|java\/|okhttp|ruby|perl|php\/|nikto|sqlmap|nmap|masscan|headlesschrome|phantomjs|puppeteer|playwright|selenium|zgrab|censys|shodan)/i;

const SCANNER_PATH_RE =
  /^\/(\.env|\.git|wp-admin|wp-login\.php|xmlrpc\.php|phpmyadmin|pma|cgi-bin|\.htaccess|\.aws)/i;

interface RateEntry {
  count: number;
  resetAt: number;
  blockedUntil: number;
}

const rateBuckets = new Map<string, RateEntry>();

function getClientIp(req: Request): string {
  const cfIp = req.headers['cf-connecting-ip'];
  if (typeof cfIp === 'string' && cfIp.trim()) return cfIp.trim();
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) return xff.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

function checkRateLimit(bucketKey: string, maxRequests: number, windowMs: number, blockMs: number): {
  allowed: boolean;
  retryAfterSec: number;
} {
  const now = Date.now();
  if (rateBuckets.size > 20000) {
    for (const [k, v] of rateBuckets) {
      if (v.resetAt < now && v.blockedUntil < now) rateBuckets.delete(k);
    }
  }
  let entry = rateBuckets.get(bucketKey);
  if (!entry) {
    entry = { count: 1, resetAt: now + windowMs, blockedUntil: 0 };
    rateBuckets.set(bucketKey, entry);
    return { allowed: true, retryAfterSec: 0 };
  }
  if (entry.blockedUntil > now) {
    return { allowed: false, retryAfterSec: Math.ceil((entry.blockedUntil - now) / 1000) };
  }
  if (now > entry.resetAt) {
    entry.count = 1;
    entry.resetAt = now + windowMs;
    return { allowed: true, retryAfterSec: 0 };
  }
  entry.count += 1;
  if (entry.count > maxRequests) {
    entry.blockedUntil = now + blockMs;
    return { allowed: false, retryAfterSec: Math.ceil(blockMs / 1000) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

function signShieldToken(ip: string): string {
  const exp = Date.now() + 12 * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ ip, exp, v: 1 })).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(`shield:${payload}`).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyShieldToken(token: string | undefined): boolean {
  if (!token) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(`shield:${payload}`).digest('base64url');
  if (!timingSafeCompare(sig, expected)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp?: number };
    return typeof parsed.exp === 'number' && parsed.exp > Date.now();
  } catch {
    return false;
  }
}

function verifyBrowserProofHeader(headerVal: unknown): boolean {
  if (typeof headerVal !== 'string') return false;
  const [tsStr, sig] = headerVal.split('.');
  const ts = Number(tsStr);
  if (!Number.isFinite(ts) || !sig) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  return Math.abs(nowSec - ts) <= 300;
}

function botProtectionMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Security hardening headers on every response
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  if (SCANNER_PATH_RE.test(req.path)) {
    res.status(403).json({ error: 'Blocked by Cloudflare Security Shield.' });
    return;
  }

  const ua = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : '';
  const ip = getClientIp(req);
  const isProtectedPath = req.path.startsWith('/api/') || req.path.startsWith('/download/');

  if (isProtectedPath) {
    if (BAD_BOT_UA_RE.test(ua)) {
      res.status(403).json({
        error: 'Automated bot traffic blocked by GB STUDY Bot Shield.',
        challengeRequired: true,
      });
      return;
    }

    if (req.path.startsWith('/api/admin/auth/')) {
      const rl = checkRateLimit(`auth:${ip}`, 10, 15 * 60_000, 15 * 60_000);
      if (!rl.allowed) {
        res.setHeader('Retry-After', String(rl.retryAfterSec));
        res.status(429).json({
          error: `Too many attempts. ${rl.retryAfterSec}s baad try karein.`,
        });
        return;
      }
    } else if (req.path.startsWith('/download/')) {
      const rl = checkRateLimit(`dl:${ip}`, 15, 5 * 60_000, 5 * 60_000);
      if (!rl.allowed) {
        res.setHeader('Retry-After', String(rl.retryAfterSec));
        res.status(429).json({ error: 'Download rate limit exceeded.' });
        return;
      }
    } else if (req.path === '/api/public/events') {
      const rl = checkRateLimit(`sse:${ip}`, 30, 60_000, 30_000);
      if (!rl.allowed) {
        res.setHeader('Retry-After', String(rl.retryAfterSec));
        res.status(429).json({
          error: 'Live stream rate limit exceeded. Thodi der baad retry karein.',
        });
        return;
      }
    } else {
      const rl = checkRateLimit(`pub:${ip}`, 90, 10_000, 30_000);
      if (!rl.allowed) {
        res.setHeader('Retry-After', String(rl.retryAfterSec));
        res.status(429).json({
          error: 'Flood protection active. Thodi der baad retry karein.',
        });
        return;
      }
    }
  }

  next();
}

async function startServer(): Promise<void> {
  const app = express();
  app.set('trust proxy', true);
  app.use(botProtectionMiddleware);
  app.use(express.json({ limit: '12mb' }));

  app.post('/api/public/shield-handshake', (req, res) => {
    const proof = req.headers['x-gb-shield'];
    const ua = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : '';
    if (!verifyBrowserProofHeader(proof) || BAD_BOT_UA_RE.test(ua)) {
      res.status(403).json({ error: 'Bot verification failed.', challengeRequired: true });
      return;
    }
    const token = signShieldToken(getClientIp(req));
    res.setHeader(
      'Set-Cookie',
      `__gb_cf_shield=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200`,
    );
    res.json({ ok: true, token });
  });

  // Real-time Server-Sent Events stream for instant multi-device updates
  app.get('/api/public/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    res.write(`retry: 3000\nevent: connected\ndata: ${JSON.stringify({ v: cachedBootstrapEtag })}\n\n`);

    sseClients.add(res);
    const heartbeat = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(heartbeat);
        sseClients.delete(res);
      }
    }, 25_000);

    req.on('close', () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
    });
  });

  // High-throughput public bootstrap served from RAM cache with ETag validation
  app.get('/api/public/bootstrap', (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    res.setHeader('ETag', cachedBootstrapEtag);
    if (req.headers['if-none-match'] === cachedBootstrapEtag) {
      res.status(304).end();
      return;
    }
    res.status(200).send(cachedBootstrapBuffer);
  });

  app.get('/api/public/apps/:id', (req, res) => {
    const item = cachedAppsById.get(req.params.id);
    if (!item) {
      res.status(404).json({ error: 'App nahi mila.' });
      return;
    }
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    res.json({ app: item });
  });

  app.get('/api/public/embed-check', async (req, res) => {
    const targetUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    const currentOrigin =
      typeof req.query.origin === 'string' && req.query.origin.trim()
        ? req.query.origin.trim()
        : `${req.protocol}://${req.get('host') || 'localhost'}`;
    if (!targetUrl) {
      res.json({ embeddable: true });
      return;
    }
    const policy = await probeEmbedPolicy(targetUrl);
    const embeddable = isOriginAllowedByEmbedPolicy(policy, targetUrl, currentOrigin);
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({ embeddable });
  });

  let pendingCounterSave = false;
  app.post('/api/public/assign-link', (req, res) => {
    const shieldHeader =
      typeof req.headers['x-gb-shield-token'] === 'string'
        ? req.headers['x-gb-shield-token']
        : undefined;
    if (!verifyShieldToken(shieldHeader) && !verifyBrowserProofHeader(req.headers['x-gb-shield'])) {
      res.status(403).json({ error: 'Security check required.', challengeRequired: true });
      return;
    }
    const appId = typeof req.body?.appId === 'string' ? req.body.appId.trim() : '';
    const item = cachedAppsById.get(appId);
    if (!item) {
      res.status(404).json({ error: 'App not found' });
      return;
    }
    const availableSlots: number[] = [];
    if (item.app_url?.trim()) availableSlots.push(1);
    if (item.app_url_2?.trim()) availableSlots.push(2);
    if (item.app_url_3?.trim()) availableSlots.push(3);
    if (item.app_url_4?.trim()) availableSlots.push(4);

    if (availableSlots.length === 0) {
      res.json({ slot: 1 });
      return;
    }

    const counts = db.linkCounters[item.id] ?? [0, 0, 0, 0];
    let chosenSlot = availableSlots[0];
    let minCount = counts[chosenSlot - 1] ?? 0;
    for (const s of availableSlots) {
      const c = counts[s - 1] ?? 0;
      if (c < minCount) {
        minCount = c;
        chosenSlot = s;
      }
    }
    counts[chosenSlot - 1] = (counts[chosenSlot - 1] ?? 0) + 1;
    db.linkCounters[item.id] = counts;

    // Batch disk writes for counters to handle 500k+ traffic smoothly
    if (!pendingCounterSave) {
      pendingCounterSave = true;
      setTimeout(() => {
        pendingCounterSave = false;
        saveDatabase(db, false);
      }, 2000);
    }

    res.json({ slot: chosenSlot });
  });

  // Download ready-to-deploy Cloudflare Pages Direct Upload ZIP
  app.get('/download/gb-study-cloudpages.zip', async (_req, res) => {
    try {
      await probeAllAppUrls(db);
      ensureBuiltDist();
      const files = collectFilesRecursive(DIST_DIR, DIST_DIR, new Set(['.DS_Store']));
      const entries = files.map((f) => ({
        zipPath: f.zipPath,
        data: fs.readFileSync(f.fullPath),
      }));
      const zipBuffer = buildZipBuffer(entries);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="gb-study-cloudpages.zip"');
      res.setHeader('Content-Length', String(zipBuffer.length));
      res.setHeader('Cache-Control', 'no-store');
      res.send(zipBuffer);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'ZIP create failed',
      });
    }
  });

  // Download clean full-stack + Cloudflare Pages Functions project source ZIP
  app.get('/download/gb-study-source.zip', async (_req, res) => {
    try {
      await probeAllAppUrls(db);
      refreshMemoryCache(db);
      const ignore = new Set([
        'node_modules',
        'dist',
        'build',
        'data',
        '.git',
        '.env',
        '.env.local',
        '.env.production',
        '.aistudio',
        '.DS_Store',
        'workspace',
      ]);
      const files = collectFilesRecursive(__dirname, __dirname, ignore);
      const entries = files.map((f) => ({
        zipPath: f.zipPath,
        data: fs.readFileSync(f.fullPath),
      }));
      const zipBuffer = buildZipBuffer(entries);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="gb-study-source.zip"');
      res.setHeader('Content-Length', String(zipBuffer.length));
      res.setHeader('Cache-Control', 'no-store');
      res.send(zipBuffer);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'ZIP create failed',
      });
    }
  });

  // Admin Auth
  app.get('/api/admin/auth/status', (req, res) => {
    const envPassword = process.env.ADMIN_PASSWORD?.trim() || '';
    const admin = getBearerAdmin(req);
    res.json({
      authenticated: Boolean(admin),
      email: admin?.email ?? null,
      needsSetup: !envPassword && !db.adminAuth,
    });
  });

  app.post('/api/admin/auth/setup', (req, res) => {
    const envPassword = process.env.ADMIN_PASSWORD?.trim() || '';
    if (envPassword || db.adminAuth) {
      res.status(409).json({ error: 'Admin account pehle se set hai. Sign in karein.' });
      return;
    }
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !email.includes('@')) {
      res.status(400).json({ error: 'Valid email enter karein.' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'Password kam se kam 6 characters ka hona chahiye.' });
      return;
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, salt);
    db.adminAuth = { email, salt, passwordHash };
    saveDatabase(db);
    const token = signSessionToken(email);
    res.json({ token, email });
  });

  app.post('/api/admin/auth/login', (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    const envPassword = process.env.ADMIN_PASSWORD?.trim() || '';
    const envEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase() || '';

    if (envPassword) {
      const emailOk = !envEmail || timingSafeCompare(email, envEmail);
      const passOk = timingSafeCompare(password, envPassword);
      if (!emailOk || !passOk) {
        res.status(401).json({ error: 'Email ya password sahi nahi hai. Dobara try karein.' });
        return;
      }
      const token = signSessionToken(email || envEmail || 'admin@gbstudy.local');
      res.json({ token, email: email || envEmail });
      return;
    }

    if (!db.adminAuth) {
      res.status(400).json({ error: 'Pehle admin account setup karein.' });
      return;
    }

    const emailMatch = timingSafeCompare(email, db.adminAuth.email);
    const candidateHash = hashPassword(password, db.adminAuth.salt);
    const passMatch = timingSafeCompare(candidateHash, db.adminAuth.passwordHash);
    if (!emailMatch || !passMatch) {
      res.status(401).json({ error: 'Email ya password sahi nahi hai. Dobara try karein.' });
      return;
    }

    const token = signSessionToken(db.adminAuth.email);
    res.json({ token, email: db.adminAuth.email });
  });

  // Protected Admin Workspace
  app.get('/api/admin/workspace', requireAdmin, (_req, res) => {
    const sortedApps = [...db.apps].sort((a, b) => a.sort_order - b.sort_order);
    const sortedSlides = [...db.sliderPhotos].sort((a, b) => a.sort_order - b.sort_order);
    res.json({
      apps: sortedApps,
      linkCounters: db.linkCounters,
      headerTitle: db.siteBranding.header_title,
      socialLinks: db.socialLinks,
      sliderPhotos: sortedSlides,
    });
  });

  app.post('/api/admin/apps', requireAdmin, (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const appUrl = sanitizeHttpUrl(req.body?.app_url);
    if (!name || !appUrl) {
      res.status(400).json({ error: 'App name aur App URL link 1 required hain.' });
      return;
    }
    const maxSort = db.apps.reduce((m, a) => Math.max(m, a.sort_order), -1);
    const id = crypto.randomUUID();
    const newApp: AppItem = {
      id,
      name,
      label: typeof req.body?.label === 'string' ? req.body.label.trim() : '',
      description: typeof req.body?.description === 'string' ? req.body.description.trim() : '',
      logo_url: sanitizeImageSource(req.body?.logo_url) ?? null,
      app_url: appUrl,
      app_url_2: sanitizeHttpUrl(req.body?.app_url_2),
      app_url_3: sanitizeHttpUrl(req.body?.app_url_3),
      app_url_4: sanitizeHttpUrl(req.body?.app_url_4),
      tone: 'app-card-amber',
      sort_order: maxSort + 1,
      vip_text: 'VIP',
      open_text: 'OPEN THIS APP',
      is_active: req.body?.is_active === undefined ? true : Boolean(req.body?.is_active),
      created_at: new Date().toISOString(),
    };
    db.apps.push(newApp);
    db.linkCounters[id] = [0, 0, 0, 0];
    saveDatabase(db);
    res.json({ app: newApp });
  });

  app.put('/api/admin/apps/:id', requireAdmin, (req, res) => {
    const idx = db.apps.findIndex((a) => a.id === req.params.id);
    if (idx < 0) {
      res.status(404).json({ error: 'App nahi mila.' });
      return;
    }
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const appUrl = sanitizeHttpUrl(req.body?.app_url);
    if (!name || !appUrl) {
      res.status(400).json({ error: 'App name aur App URL link 1 required hain.' });
      return;
    }
    const current = db.apps[idx];
    const updated: AppItem = {
      ...current,
      name,
      logo_url:
        req.body?.logo_url === null
          ? null
          : sanitizeImageSource(req.body?.logo_url) ?? current.logo_url,
      app_url: appUrl,
      app_url_2: sanitizeHttpUrl(req.body?.app_url_2),
      app_url_3: sanitizeHttpUrl(req.body?.app_url_3),
      app_url_4: sanitizeHttpUrl(req.body?.app_url_4),
      is_active: Boolean(req.body?.is_active),
    };
    db.apps[idx] = updated;
    saveDatabase(db);
    res.json({ app: updated });
  });

  app.delete('/api/admin/apps/:id', requireAdmin, (_req, res) => {
    res.status(403).json({
      error: 'Platforms permanent hain — delete nahi kiye ja sakte. Edit ya OFF kar sakte hain.',
    });
  });

  app.put('/api/admin/branding', requireAdmin, (req, res) => {
    const headerTitle =
      typeof req.body?.header_title === 'string' && req.body.header_title.trim()
        ? req.body.header_title.trim().slice(0, 64)
        : '𝐆𝐁 𝐒𝐓𝐔𝐃𝐘';
    db.siteBranding = {
      header_title: headerTitle,
      updated_at: new Date().toISOString(),
    };
    saveDatabase(db);
    res.json({ header_title: headerTitle });
  });

  app.put('/api/admin/social-links', requireAdmin, (req, res) => {
    const incoming = req.body?.links as Record<string, unknown> | undefined;
    if (!incoming || typeof incoming !== 'object') {
      res.status(400).json({ error: 'Invalid social links payload.' });
      return;
    }
    for (const key of ['telegram', 'youtube', 'whatsapp', 'instagram'] as const) {
      const val = incoming[key];
      if (typeof val === 'string') {
        const trimmed = val.trim();
        db.socialLinks[key] = trimmed ? sanitizeHttpUrl(trimmed) ?? '' : '';
      }
    }
    saveDatabase(db);
    res.json({ socialLinks: db.socialLinks });
  });

  app.post('/api/admin/slider', requireAdmin, (req, res) => {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const maxSort = db.sliderPhotos.reduce((m, s) => Math.max(m, s.sort_order), 0);
    const added: SliderPhoto[] = [];
    items.forEach((item: { image_data?: unknown }, idx: number) => {
      const safeImg = sanitizeImageSource(item?.image_data);
      if (safeImg) {
        const slide: SliderPhoto = {
          id: crypto.randomUUID(),
          image_data: safeImg,
          sort_order: maxSort + idx + 1,
          created_at: new Date().toISOString(),
        };
        db.sliderPhotos.push(slide);
        added.push(slide);
      }
    });
    if (!added.length) {
      res.status(400).json({ error: 'Valid image file upload karein.' });
      return;
    }
    saveDatabase(db);
    res.json({ sliderPhotos: [...db.sliderPhotos].sort((a, b) => a.sort_order - b.sort_order) });
  });

  app.put('/api/admin/slider/:id', requireAdmin, (req, res) => {
    const safeImg = sanitizeImageSource(req.body?.image_data);
    if (!safeImg) {
      res.status(400).json({ error: 'Valid image file upload karein.' });
      return;
    }
    const idx = db.sliderPhotos.findIndex((s) => s.id === req.params.id);
    if (idx < 0) {
      res.status(404).json({ error: 'Slide nahi mila.' });
      return;
    }
    db.sliderPhotos[idx] = { ...db.sliderPhotos[idx], image_data: safeImg };
    saveDatabase(db);
    res.json({ sliderPhotos: [...db.sliderPhotos].sort((a, b) => a.sort_order - b.sort_order) });
  });

  app.post('/api/admin/slider/reorder', requireAdmin, (req, res) => {
    const id = typeof req.body?.id === 'string' ? req.body.id : '';
    const direction = req.body?.direction === -1 ? -1 : 1;
    const sorted = [...db.sliderPhotos].sort((a, b) => a.sort_order - b.sort_order);
    const index = sorted.findIndex((s) => s.id === id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= sorted.length) {
      res.json({ sliderPhotos: sorted });
      return;
    }
    const [moved] = sorted.splice(index, 1);
    sorted.splice(targetIndex, 0, moved);
    sorted.forEach((s, i) => {
      s.sort_order = i + 1;
    });
    db.sliderPhotos = sorted;
    saveDatabase(db);
    res.json({ sliderPhotos: sorted });
  });

  app.delete('/api/admin/slider/:id', requireAdmin, (req, res) => {
    db.sliderPhotos = db.sliderPhotos.filter((s) => s.id !== req.params.id);
    saveDatabase(db);
    res.json({ sliderPhotos: [...db.sliderPhotos].sort((a, b) => a.sort_order - b.sort_order) });
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
  });

  // Vite or Static Dist
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(DIST_DIR));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(DIST_DIR, 'index.html'));
    });
  }

  void probeAllAppUrls(db);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`GB STUDY server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
