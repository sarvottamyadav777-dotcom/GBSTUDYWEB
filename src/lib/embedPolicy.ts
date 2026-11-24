export interface EmbedPolicy {
  xfo: string | null;
  csp: string | null;
}

function matchCspSource(source: string, currentOrigin: string, targetOrigin: string): boolean {
  const token = source.trim().replace(/^['"]|['"]$/g, '').toLowerCase();
  if (!token) return false;
  if (token === '*') return true;
  if (token === 'none') return false;
  if (token === 'self') return currentOrigin.toLowerCase() === targetOrigin.toLowerCase();

  let cur: URL;
  try {
    cur = new URL(currentOrigin);
  } catch {
    return false;
  }

  // Handle scheme-only sources like https:
  if (token.endsWith(':') && !token.includes('//')) {
    return cur.protocol === token;
  }

  // Extract optional scheme://host[:port]
  const schemeMatch = token.match(/^(https?):\/\/(.+)$/);
  let expectedScheme: string | null = null;
  let hostAndPort = token;
  if (schemeMatch) {
    expectedScheme = `${schemeMatch[1]}:`;
    hostAndPort = schemeMatch[2].split('/')[0];
  } else {
    hostAndPort = token.split('/')[0];
  }

  if (expectedScheme && cur.protocol !== expectedScheme) {
    return false;
  }

  const colonIdx = hostAndPort.indexOf(':');
  const hostPattern = colonIdx >= 0 ? hostAndPort.slice(0, colonIdx) : hostAndPort;
  const portPattern = colonIdx >= 0 ? hostAndPort.slice(colonIdx + 1) : '';

  if (portPattern && portPattern !== '*') {
    const curPort = cur.port || (cur.protocol === 'https:' ? '443' : '80');
    if (curPort !== portPattern) return false;
  }

  // Convert CSP wildcard pattern (supports both *.domain and prefix-*.domain) to anchored RegExp
  const escaped = hostPattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  const hostRegex = new RegExp(`^${escaped}$`, 'i');
  return hostRegex.test(cur.hostname);
}

export function extractFrameAncestorsDirective(csp: string | null | undefined): string[] | null {
  if (!csp || typeof csp !== 'string') return null;
  const directives = csp.split(';');
  for (const raw of directives) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    if (parts[0]?.toLowerCase() === 'frame-ancestors') {
      return parts.slice(1);
    }
  }
  return null;
}

export function isOriginAllowedByEmbedPolicy(
  policy: EmbedPolicy | null | undefined,
  targetUrl: string,
  currentOrigin: string,
): boolean {
  let targetOrigin: string;
  try {
    targetOrigin = new URL(targetUrl).origin;
  } catch {
    return true;
  }

  if (targetOrigin.toLowerCase() === currentOrigin.toLowerCase()) {
    return true;
  }

  if (!policy) return true;

  const frameAncestors = extractFrameAncestorsDirective(policy.csp);
  if (frameAncestors !== null) {
    if (frameAncestors.length === 0) return false;
    return frameAncestors.some((src) => matchCspSource(src, currentOrigin, targetOrigin));
  }

  const xfo = policy.xfo?.trim().toUpperCase() || '';
  if (xfo.includes('DENY') || xfo.includes('SAMEORIGIN')) {
    return false;
  }

  return true;
}
