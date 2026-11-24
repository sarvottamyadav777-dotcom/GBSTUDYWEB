import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowUpRight, BadgeCheck, BellRing, Globe, ShieldCheck, Users, Zap } from 'lucide-react';
import type { PublicBootstrapResponse } from '../lib/api';
import { api, subscribeLiveUpdates } from '../lib/api';
import { normalizeExternalUrl } from '../lib/storage';
import type { SocialLinksMap, SocialPlatform } from '../lib/types';
import { GB_EMBLEM_URL } from '../components/BrandLogo';
import { MobileBottomNav } from '../components/MobileBottomNav';
import { InstagramIcon, TelegramIcon, WhatsAppIcon, YouTubeIcon } from '../components/SocialIcons';

const SOCIAL_ITEMS: Array<{
  platform: SocialPlatform;
  label: string;
  fallbackHref: string;
  icon: typeof TelegramIcon;
}> = [
  { platform: 'telegram', label: 'TELEGRAM', fallbackHref: 'https://t.me/gbstudy', icon: TelegramIcon },
  { platform: 'youtube', label: 'YOUTUBE', fallbackHref: 'https://youtube.com/@gbstudy', icon: YouTubeIcon },
  { platform: 'whatsapp', label: 'WHATSAPP', fallbackHref: 'https://whatsapp.com/', icon: WhatsAppIcon },
  { platform: 'instagram', label: 'INSTAGRAM', fallbackHref: 'https://instagram.com/gbstudy', icon: InstagramIcon },
];

const STATS = [
  { value: '10+', label: 'APPS BUILT', highlight: false },
  { value: '50K+', label: 'TOTAL USERS', highlight: true },
  { value: '3 YRS', label: 'EXPERIENCE', highlight: false },
  { value: '100%', label: 'ALWAYS FREE', highlight: false },
];

const VALUES = [
  {
    icon: ShieldCheck,
    title: 'FREE FOREVER',
    text: 'Koi paywall nahi, koi subscription nahi. Premium apps sabke liye — yeh haq hai, privilege nahi.',
    tone: 'amber',
  },
  {
    icon: Users,
    title: 'STUDENT-FIRST',
    text: 'Har design decision, har feature — student ke liye bana, investor ke liye nahi.',
    tone: 'blue',
  },
  {
    icon: Zap,
    title: 'SPEED & ACCESS',
    text: 'Low-end devices aur slow connections ke liye optimised. 2G pe chale, tabhi ship hota hai.',
    tone: 'green',
  },
  {
    icon: Globe,
    title: 'PAN-INDIA REACH',
    text: 'Metro se gaon tak — students aur success ke beech ka har barrier todna hai.',
    tone: 'purple',
  },
];

const QUOTES = [
  {
    text: 'The best investment you can make is in yourself and the people around you.',
    author: 'Warren Buffett',
  },
  {
    text: 'Education is the most powerful weapon you can use to change the world.',
    author: 'Nelson Mandela',
  },
  {
    text: 'Knowledge should be free. Every student deserves a fair shot — regardless of their wallet.',
    author: 'Sarvottam',
  },
];

export function OwnerPage({ initialData }: { initialData: PublicBootstrapResponse | null }) {
  const [socialLinks, setSocialLinks] = useState<SocialLinksMap>(initialData?.socialLinks ?? {});

  useEffect(() => {
    document.title = 'Owner — GB STUDY';
  }, []);

  useEffect(() => {
    let active = true;
    const sync = () => {
      api
        .getBootstrap()
        .then((res) => {
          if (active) setSocialLinks(res.socialLinks);
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

  return (
    <div className="study-shell min-h-screen overflow-hidden page-bg-dark">
      <div className="mesh-lines" />
      <main className="main-panel">
        <div className="content-wrap owner-wrap tab-page-enter">
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="owner-profile"
          >
            <div className="owner-social-circles">
              {SOCIAL_ITEMS.map(({ platform, fallbackHref, icon: Icon, label }) => {
                const href = normalizeExternalUrl(socialLinks[platform]) || fallbackHref;
                return (
                  <a
                    key={platform}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={label}
                    className={`owner-social-circle ${platform}`}
                  >
                    <Icon className="owner-brand-logo" />
                  </a>
                );
              })}
            </div>

            <div className="owner-avatar-ring">
              <img
                src={GB_EMBLEM_URL}
                alt="GB STUDY icon"
                className="owner-avatar"
                referrerPolicy="no-referrer"
              />
              <span className="owner-verified">
                <BadgeCheck size={26} strokeWidth={2.4} />
              </span>
            </div>

            <h1 className="owner-name">
              𝐒𝐀𝐑𝐕𝐎𝐓𝐓𝐀𝐌 ✦
              <span className="sr-only">
                {' '}
                — Founder of GB STUDY, free study apps for students
              </span>
            </h1>

            <p className="owner-bio">
              Founder of <strong>GB STUDY</strong> — students tak free, high-quality apps aur
              education pahunchana, poore India mein.
            </p>
          </motion.section>

          <section className="owner-quote-card">
            <span className="owner-quote-mark">“</span>
            <p className="owner-quote-text">“{QUOTES[0].text}”</p>
            <p className="owner-quote-author">— {QUOTES[0].author}</p>
          </section>

          <section className="owner-stats" aria-label="Stats">
            {STATS.map((stat) => (
              <div
                key={stat.label}
                className={`owner-stat${stat.highlight ? ' owner-stat-hot' : ''}`}
              >
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </div>
            ))}
          </section>

          <section className="owner-mission">
            <span className="owner-mission-icon">
              <BellRing size={26} strokeWidth={2.2} />
            </span>
            <h2>“Sabko Free, High-Quality Apps.”</h2>
            <p>
              Koi bhi student paise ki wajah se peeche na rahe. Main aise free platforms banata
              hoon jo India ke har aspirant — sheher se gaon tak — ko wahi quality dete hain jo
              pehle hazaaron mein milti thi.
            </p>
          </section>

          <section className="owner-values" aria-label="Values">
            <h2 className="sr-only">Our values</h2>
            {VALUES.map(({ icon: Icon, title, text, tone }) => (
              <article key={title} className={`owner-value-card ${tone}`}>
                <Icon size={24} strokeWidth={2.2} className="owner-value-icon" />
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </section>

          {QUOTES.slice(1).map((q) => (
            <section key={q.author} className="owner-quote-card">
              <span className="owner-quote-mark">“</span>
              <p className="owner-quote-text">“{q.text}”</p>
              <p className="owner-quote-author">— {q.author}</p>
            </section>
          ))}

          <section className="owner-links" aria-label="Social links">
            {SOCIAL_ITEMS.map(({ platform, label, fallbackHref, icon: Icon }) => {
              const href = normalizeExternalUrl(socialLinks[platform]) || fallbackHref;
              return (
                <a
                  key={platform}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className={`owner-link-row ${platform}`}
                >
                  <span className="owner-link-row-icon">
                    <Icon className="owner-brand-logo" />
                  </span>
                  <span className="owner-link-row-label">{label}</span>
                  <ArrowUpRight size={17} className="owner-link-row-arrow" />
                </a>
              );
            })}
          </section>
        </div>

        <MobileBottomNav active="owner" />
      </main>
    </div>
  );
}
