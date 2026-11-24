import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ExternalLink, LoaderCircle } from 'lucide-react';
import { Link } from '../lib/router';
import { api } from '../lib/api';
import { LINK_SLOT_PREFIX, normalizeExternalUrl, safeStorage } from '../lib/storage';
import type { AppItem } from '../lib/types';
import { SafeAppLogo } from '../components/BrandLogo';

export function AppEmbedPage({ appId }: { appId: string }) {
  const [app, setApp] = useState<AppItem | null>(null);
  const [slot, setSlot] = useState<number | null>(null);
  const [embedAllowed, setEmbedAllowed] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setEmbedAllowed(true);
    async function load() {
      try {
        const { app: found } = await api.getApp(appId);
        if (!active) return;
        setApp(found);

        const candidateUrls = [found.app_url, found.app_url_2, found.app_url_3, found.app_url_4]
          .map((u) => normalizeExternalUrl(u))
          .filter((u): u is string => Boolean(u));

        const storageKey = `${LINK_SLOT_PREFIX}${appId}`;
        let chosen = Number(safeStorage.getItem(storageKey));
        if (!Number.isInteger(chosen) || chosen < 1 || chosen > 4) {
          const assigned = await api.assignAppLink(appId);
          if (!active) return;
          chosen = Number.isInteger(assigned.slot) ? assigned.slot : 1;
          safeStorage.setItem(storageKey, String(chosen));
        }
        setSlot(chosen);

        const resolvedUrl = candidateUrls.length
          ? candidateUrls[Math.min(Math.max(chosen - 1, 0), candidateUrls.length - 1)]
          : null;

        if (resolvedUrl) {
          const allowed = await api.checkEmbedAllowed(resolvedUrl);
          if (!active) return;
          setEmbedAllowed(allowed);
        }

        setLoading(false);
      } catch {
        if (active) {
          setApp(null);
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [appId]);

  const urls = useMemo(() => {
    if (!app) return [];
    return [app.app_url, app.app_url_2, app.app_url_3, app.app_url_4]
      .map((u) => normalizeExternalUrl(u))
      .filter((u): u is string => Boolean(u));
  }, [app]);

  const targetUrl = useMemo(() => {
    if (!urls.length) return null;
    const idx = slot ? Math.min(Math.max(slot - 1, 0), urls.length - 1) : 0;
    return urls[idx];
  }, [urls, slot]);

  useEffect(() => {
    if (app) {
      document.title = `${app.name} — GB STUDY`;
    }
  }, [app]);

  useEffect(() => {
    if (loading || embedAllowed || !targetUrl) return;
    const timer = window.setTimeout(() => {
      window.location.replace(targetUrl);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [loading, embedAllowed, targetUrl]);

  if (loading) {
    return (
      <main className="embed-page">
        <h1 className="sr-only">Opening study app — GB STUDY</h1>
        <div className="embed-loading">
          <LoaderCircle className="animate-spin" size={26} />
          <p>𝘼𝙋𝙋 𝙇𝙊𝘼𝘿𝙄𝙉𝙂...</p>
        </div>
      </main>
    );
  }

  if (!app || !targetUrl) {
    return (
      <main className="embed-page">
        <h1 className="sr-only">
          {app ? `${app.name} — link unavailable` : 'App not found'}
        </h1>
        <div className="embed-loading">
          <p>{app ? 'Is app ke liye koi link set nahi hai.' : 'App nahi mila.'}</p>
          <Link to="/" className="embed-back">
            <ArrowLeft size={15} /> Back to workspace
          </Link>
        </div>
      </main>
    );
  }

  if (!embedAllowed) {
    return (
      <main className="embed-page flex items-center justify-center p-5">
        <div className="w-full max-w-sm rounded-3xl border border-cyan-400/30 bg-[#091124]/95 p-6 text-center shadow-2xl">
          <div className="mx-auto mb-4 h-16 w-16 overflow-hidden rounded-2xl border border-white/10">
            <SafeAppLogo
              src={app.logo_url}
              alt={`${app.name} logo`}
              name={app.name}
              loading="eager"
            />
          </div>
          <h1 className="text-lg font-extrabold tracking-wide text-white">{app.name}</h1>
          <p className="mt-2 text-xs text-slate-300">
            Mobile aur desktop par smooth playback ke liye seedha full screen khul raha hai...
          </p>
          <div className="mt-5 flex flex-col gap-2.5">
            <a
              href={targetUrl}
              rel="noopener noreferrer"
              className="app-open-btn inline-flex items-center justify-center gap-2 no-underline"
            >
              <span>OPEN {app.name}</span>
              <ExternalLink size={15} />
            </a>
            <Link
              to="/"
              className="embed-back inline-flex items-center justify-center gap-1.5 no-underline"
            >
              <ArrowLeft size={14} /> Back to GB STUDY
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="embed-page">
      <h1 className="sr-only">{app.name} on GB STUDY</h1>
      <iframe
        src={targetUrl}
        title={app.name}
        className="embed-frame"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
      />
    </main>
  );
}
