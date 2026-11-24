import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Clock3 } from 'lucide-react';
import type { PublicBootstrapResponse } from '../lib/api';
import { api, subscribeLiveUpdates } from '../lib/api';
import type { AppItem } from '../lib/types';
import { SafeAppLogo } from '../components/BrandLogo';
import { MobileBottomNav } from '../components/MobileBottomNav';
import { SecretAdminBrand } from '../components/SecretAdminBrand';

export function SoonPage({ initialData }: { initialData: PublicBootstrapResponse | null }) {
  const [apps, setApps] = useState<AppItem[]>(initialData?.apps ?? []);
  const [headerTitle, setHeaderTitle] = useState(initialData?.headerTitle || '𝐆𝐁 𝐒𝐓𝐔𝐃𝐘');

  useEffect(() => {
    document.title = 'Coming Soon Apps — GB STUDY';
  }, []);

  useEffect(() => {
    let active = true;
    const sync = () => {
      api
        .getBootstrap()
        .then((res) => {
          if (!active) return;
          setApps(res.apps);
          setHeaderTitle(res.headerTitle || '𝐆𝐁 𝐒𝐓𝐔𝐃𝐘');
        })
        .catch(() => undefined);
    };
    sync();
    const unsubscribe = subscribeLiveUpdates(sync);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const upcomingApps = useMemo(() => apps.filter((app) => !app.is_active), [apps]);

  return (
    <div className="study-shell min-h-screen overflow-hidden page-bg-dark">
      <div className="mesh-lines" />
      <main className="main-panel">
        <header className="topbar">
          <div className="mobile-header mobile-only-flex">
            <div className="mobile-header-top">
              <SecretAdminBrand title={headerTitle} />
              <div className="mobile-live">
                <span className="live-dot" />
                LIVE
              </div>
            </div>
          </div>
        </header>

        <div className="content-wrap apps-only tab-page-enter soon-page-wrap">
          <section className="soon-heading soon-heading-center">
            <h1>UPCOMING RELEASES</h1>
            <div className="soon-heading-tag">
              <Clock3 size={13} strokeWidth={2.4} />
              <span>COMING SOON</span>
            </div>
          </section>

          <section className="apps-panel animate-fade-in">
            <div className="apps-grid">
              {upcomingApps.map((app, idx) => (
                <motion.article
                  key={app.id}
                  initial={{ opacity: 0, y: 16, scale: 0.94 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{
                    duration: 0.45,
                    delay: Math.min(idx * 0.06, 0.36),
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className={`app-card ${app.tone || 'app-card-amber'} soon-app-card`}
                >
                  <span className="vip-badge">
                    <Clock3 size={9} strokeWidth={2.4} />
                    COMING SOON
                  </span>
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
                  <div className="app-open-btn soon-card-status">NOT AVAILABLE YET</div>
                </motion.article>
              ))}

              {upcomingApps.length === 0 && (
                <div className="empty-search">Abhi koi upcoming app nahi hai.</div>
              )}
            </div>
          </section>
        </div>

        <MobileBottomNav active="soon" />
      </main>
    </div>
  );
}
