import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Crown, X } from 'lucide-react';
import { Link } from '../lib/router';
import type { PublicBootstrapResponse } from '../lib/api';
import { api, subscribeLiveUpdates } from '../lib/api';
import { normalizeExternalUrl } from '../lib/storage';
import type { AppItem, SliderPhoto, SocialLinksMap } from '../lib/types';
import { SafeAppLogo } from '../components/BrandLogo';
import { MobileBottomNav } from '../components/MobileBottomNav';
import { SecretAdminBrand } from '../components/SecretAdminBrand';
import { TelegramIcon, WhatsAppIcon, YouTubeIcon } from '../components/SocialIcons';

const DEFAULT_HEADER_TITLE = '𝐆𝐁 𝐒𝐓𝐔𝐃𝐘';
const TICKER_MESSAGE = 'GB STUDY • NEW APPS AUR LATEST UPDATES KE LIYE TELEGRAM JOIN KARO';
const SLIDE_INTERVAL_MS = 5000;

function PhotoSlider({ photos }: { photos: SliderPhoto[] }) {
  const slides = useMemo(() => photos.map((p) => p.image_data).filter(Boolean), [photos]);
  const slidesSignature = useMemo(
    () => photos.map((p) => `${p.id}:${p.sort_order}:${p.image_data.slice(-24)}`).join(','),
    [photos],
  );
  const [index, setIndex] = useState(0);
  const [animate, setAnimate] = useState(true);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setPaused(document.hidden || mq.matches);
    sync();
    document.addEventListener('visibilitychange', sync);
    mq.addEventListener('change', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      mq.removeEventListener('change', sync);
    };
  }, []);

  useEffect(() => {
    setIndex(0);
  }, [slidesSignature]);

  useEffect(() => {
    if (slides.length < 2 || paused || index >= slides.length) return;
    const timer = window.setTimeout(() => {
      setAnimate(true);
      setIndex((prev) => prev + 1);
    }, SLIDE_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [index, slides.length, paused]);

  useEffect(() => {
    if (index === slides.length && slides.length > 1) {
      const resetTimer = window.setTimeout(() => {
        setAnimate(false);
        setIndex(0);
      }, 700);
      return () => window.clearTimeout(resetTimer);
    }
  }, [index, slides.length]);

  if (slides.length === 0) return null;

  const trackSlides = slides.length > 1 ? [...slides, slides[0]] : slides;
  const activeDot = index % slides.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="photo-slider"
      aria-hidden="true"
    >
      <div
        className="photo-slider-track"
        style={{
          transform: `translate3d(-${index * 100}%, 0, 0)`,
          transition: animate ? 'transform 0.7s cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
        }}
      >
        {trackSlides.map((src, i) => (
          <div key={i} className="photo-slide">
            <img
              src={src}
              alt=""
              loading={i <= index + 1 ? 'eager' : 'lazy'}
              decoding="async"
              width={1200}
              height={600}
              referrerPolicy="no-referrer"
            />
          </div>
        ))}
      </div>
      {slides.length > 1 && (
        <div className="photo-slider-dots">
          {slides.map((_, i) => (
            <span
              key={i}
              className={`photo-dot${i === activeDot ? ' is-active' : ''}`}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}

function CommunityStrip({ socialLinks }: { socialLinks: SocialLinksMap }) {
  const telegramUrl = normalizeExternalUrl(socialLinks.telegram);

  const buttonContent = (
    <>
      <svg className="community-telegram-icon" viewBox="0 0 32 32" role="img" aria-label="Telegram">
        <circle cx="16" cy="16" r="16" fill="currentColor" />
        <path
          className="community-telegram-plane"
          d="m7.5 15.4 16-6.2c.8-.3 1.4.2 1.1 1.3l-2.7 12.8c-.2.9-.7 1.1-1.4.7l-4.2-3.1-2 1.9c-.2.2-.4.4-.8.4l.3-4.3 7.8-7c.3-.3-.1-.4-.5-.2l-9.6 6-4.1-1.3c-.9-.3-.9-.7.1-1z"
        />
      </svg>
      <span className="community-join-copy">
        <span>TELEGRAM</span>
        <strong>JOIN NOW</strong>
      </span>
    </>
  );

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.08 }}
      className="community-strip"
      aria-label="GB STUDY community updates"
    >
      <div className="community-ticker">
        <p className="sr-only">{TICKER_MESSAGE}</p>
        <div className="community-ticker-track" aria-hidden="true">
          <span className="community-ticker-message">
            <span className="community-update-dot" />
            {TICKER_MESSAGE}
            <span className="community-ticker-star">✦</span>
          </span>
        </div>
      </div>
      {telegramUrl ? (
        <a
          href={telegramUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Join GB STUDY on Telegram"
          className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors community-join"
        >
          {buttonContent}
        </a>
      ) : (
        <button
          type="button"
          disabled
          aria-label="Telegram link unavailable"
          className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 community-join"
        >
          {buttonContent}
        </button>
      )}
    </motion.section>
  );
}

function JoinCommunityPopup({ socialLinks }: { socialLinks: SocialLinksMap }) {
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setOpen(true), 2000);
    return () => window.clearTimeout(timer);
  }, []);

  const close = () => {
    setLeaving(true);
    window.setTimeout(() => setOpen(false), 320);
  };

  useEffect(() => {
    if (!open || leaving) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, leaving]);

  if (!open) return null;

  const buttons = [
    { platform: 'telegram' as const, label: 'TELEGRAM', icon: TelegramIcon },
    { platform: 'whatsapp' as const, label: 'WHATSAPP', icon: WhatsAppIcon },
    { platform: 'youtube' as const, label: 'YOUTUBE', icon: YouTubeIcon },
  ]
    .map((item) => ({ ...item, href: normalizeExternalUrl(socialLinks[item.platform]) }))
    .filter((item): item is typeof item & { href: string } => Boolean(item.href));

  if (buttons.length === 0) return null;

  return (
    <div
      className={`join-popup-overlay ${leaving ? 'join-popup-leaving' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Join our channels"
      onClick={close}
    >
      <div className="join-popup-card" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="join-popup-close"
          onClick={close}
          aria-label="Close"
        >
          <X size={16} strokeWidth={2.5} />
        </button>
        <div className="join-popup-glow" aria-hidden="true" />
        <h2 className="join-popup-title">JOIN OUR COMMUNITY</h2>
        <p className="join-popup-sub">Updates aur naye apps sabse pehle paao</p>
        <div className="join-popup-buttons">
          {buttons.map(({ platform, label, href, icon: Icon }) => (
            <a
              key={platform}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={`join-popup-btn join-popup-btn-${platform}`}
            >
              <span className="join-popup-btn-icon">
                <Icon className="join-popup-svg" />
              </span>
              <span className="join-popup-btn-label">{label}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

export function HomePage({ initialData }: { initialData: PublicBootstrapResponse | null }) {
  const [search, setSearch] = useState('');
  const [apps, setApps] = useState<AppItem[]>(initialData?.apps ?? []);
  const [slides, setSlides] = useState<SliderPhoto[]>(initialData?.sliderPhotos ?? []);
  const [socialLinks, setSocialLinks] = useState<SocialLinksMap>(initialData?.socialLinks ?? {});
  const [headerTitle, setHeaderTitle] = useState(initialData?.headerTitle || DEFAULT_HEADER_TITLE);
  const [loaded, setLoaded] = useState(Boolean(initialData));
  const lastSignatureRef = useRef('');

  useEffect(() => {
    document.title = 'GB STUDY — Study Apps & Learning Resources';
  }, []);

  useEffect(() => {
    let active = true;
    const syncBootstrap = () => {
      api
        .getBootstrap()
        .then((res) => {
          if (!active) return;
          const sig = JSON.stringify({
            a: res.apps,
            s: res.sliderPhotos.map((p) => `${p.id}:${p.sort_order}:${p.image_data.slice(-24)}`),
            l: res.socialLinks,
            h: res.headerTitle,
          });
          if (sig !== lastSignatureRef.current) {
            lastSignatureRef.current = sig;
            setApps(res.apps);
            setSlides(res.sliderPhotos);
            setSocialLinks(res.socialLinks);
            setHeaderTitle(res.headerTitle || DEFAULT_HEADER_TITLE);
          }
          setLoaded(true);
        })
        .catch(() => {
          if (active) setLoaded(true);
        });
    };

    syncBootstrap();
    const unsubscribe = subscribeLiveUpdates(syncBootstrap);

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const visibleApps = useMemo(() => {
    const q = search.trim().toLowerCase();
    return apps.filter(
      (app) =>
        app.is_active &&
        `${app.name} ${app.description} ${app.label}`.toLowerCase().includes(q),
    );
  }, [apps, search]);

  return (
    <div className="study-shell min-h-screen overflow-hidden page-bg-dark">
      <div className="mesh-lines" />
      <main className="main-panel">
        <header className="topbar">
          <div className="mobile-header mobile-only-flex">
            <div className="mobile-header-top">
              <SecretAdminBrand title={headerTitle} asHeading />
              <div className="mobile-live">
                <span className="live-dot" />
                LIVE
              </div>
            </div>

            <div className="mobile-search-wrap">
              <div className="group relative w-full">
                <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-[#00e5ff]/30 via-[#7c3aed]/35 to-[#00e5ff]/30 opacity-60 blur-lg transition duration-500 group-focus-within:opacity-100" />
                <div className="relative flex items-center overflow-hidden rounded-xl border border-cyan-400/25 bg-[#090e1f]/90 shadow-2xl transition-all duration-300 group-focus-within:border-cyan-400/70">
                  <div className="flex flex-shrink-0 items-center justify-center pl-4 pr-2">
                    <svg
                      className="h-5 w-5 text-[#00e5ff] drop-shadow-[0_0_10px_rgba(0,229,255,0.75)]"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2.5}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  </div>
                  <input
                    type="search"
                    placeholder="SEARCH APP..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full border-none bg-transparent px-2 py-3.5 text-sm font-bold tracking-[0.15em] text-[#FFFFFF] outline-none placeholder:text-[#64748b]"
                  />
                  <div className="flex flex-shrink-0 items-center space-x-1 pr-4 opacity-60">
                    <div className="h-3 w-1 rounded-full bg-[#00e5ff]" />
                    <div className="h-5 w-1 rounded-full bg-[#7c3aed]" />
                    <div className="h-3 w-1 rounded-full bg-[#00e5ff]" />
                  </div>
                  <div className="search-scan-beam absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#00e5ff] to-transparent opacity-70" />
                </div>
              </div>
            </div>
          </div>
        </header>

        <PhotoSlider photos={slides} />
        <CommunityStrip socialLinks={socialLinks} />

        <div className="content-wrap apps-only tab-page-enter">
          <section className="apps-panel animate-fade-in">
            <div className="apps-grid">
              {visibleApps.map((app, idx) => {
                const isGold = app.tone === 'app-card-gold';
                return (
                  <motion.div
                    key={app.id}
                    initial={{ opacity: 0, y: 18, scale: 0.94 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{
                      duration: 0.48,
                      delay: Math.min(idx * 0.06, 0.36),
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    whileHover={{ y: -4, scale: 1.02 }}
                    whileTap={{ scale: 0.96 }}
                  >
                    <Link
                      to={`/app/${encodeURIComponent(app.id)}`}
                      className={`app-card ${app.tone || 'app-card-amber'}${
                        isGold ? ' app-card-gold' : ''
                      }`}
                    >
                      {isGold ? (
                        <span className="corner-vip">
                          <span className="corner-vip-inner">
                            <Crown size={11} strokeWidth={2.6} />
                            {app.vip_text || 'VIP'}
                          </span>
                        </span>
                      ) : (
                        <span className="vip-badge">
                          <Crown size={9} strokeWidth={2.4} />
                          {app.vip_text || 'VIP'}
                        </span>
                      )}
                      <div className="app-icon app-icon-logo">
                        <SafeAppLogo
                          src={app.logo_url}
                          alt={`${app.name} logo`}
                          name={app.name}
                        />
                      </div>
                      <div className="app-card-copy">
                        <strong>{app.name}</strong>
                      </div>
                      <div className="app-open-btn">
                        <span>{app.open_text || 'OPEN THIS APP'}</span>
                        <ArrowRight size={12} className="app-open-arrow" />
                      </div>
                    </Link>
                  </motion.div>
                );
              })}

              {loaded && visibleApps.length === 0 && (
                <div className="empty-search">
                  {search ? `No study apps match “${search}”.` : 'No apps yet.'}
                </div>
              )}
            </div>
          </section>
        </div>

        <JoinCommunityPopup socialLinks={socialLinks} />
        <MobileBottomNav active="home" />
      </main>
    </div>
  );
}
