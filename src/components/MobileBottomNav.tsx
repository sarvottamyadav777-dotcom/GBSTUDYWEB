import React, { useEffect, useState } from 'react';
import { Link } from '../lib/router';

export type NavTab = 'home' | 'owner' | 'soon';

const NAV_ITEMS: Array<{
  key: NavTab;
  to: string;
  label: string;
  color: string;
  rgb: string;
  icon: React.ReactNode;
}> = [
  {
    key: 'home',
    to: '/',
    label: 'HOME',
    color: '#00e5ff',
    rgb: '0,229,255',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    key: 'owner',
    to: '/owner',
    label: 'OWNER',
    color: '#fb7185',
    rgb: '251,113,133',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    key: 'soon',
    to: '/soon',
    label: 'SOON',
    color: '#a855f7',
    rgb: '168,85,247',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
];

export function MobileBottomNav({ active }: { active: NavTab }) {
  const [selected, setSelected] = useState<NavTab>(active);

  useEffect(() => {
    setSelected(active);
  }, [active]);

  const activeIdx = Math.max(
    0,
    NAV_ITEMS.findIndex((item) => item.key === selected),
  );
  const activeItem = NAV_ITEMS[activeIdx] ?? NAV_ITEMS[0];

  const handleTap = (e: React.MouseEvent<HTMLAnchorElement>, key: NavTab) => {
    if (
      key === active ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey
    ) {
      return;
    }
    setSelected(key);
  };

  return (
    <nav
      className="public-bottom-nav mobile-only-flex fixed inset-x-0 bottom-0 z-50 px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+12px)]"
      aria-label="Mobile navigation"
      data-active={selected}
    >
      <div className="public-bottom-dock relative mx-auto w-full max-w-[420px]">
        <div
          className="pointer-events-none absolute -inset-4 rounded-[44px] transition-[background-image] duration-500"
          style={{
            backgroundImage: `radial-gradient(60% 70% at 50% 60%, rgba(${activeItem.rgb},0.22), transparent 75%)`,
          }}
        />
        <div className="relative flex h-[72px] w-full items-stretch gap-2 overflow-hidden rounded-[22px] border border-cyan-400/20 bg-[#080d1d]/92 px-4 shadow-[0_24px_60px_rgba(0,0,0,0.72),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-2xl">
          <div
            className="pointer-events-none absolute top-2 bottom-2 left-4 rounded-2xl border transition-[transform,border-color] duration-500 ease-[cubic-bezier(0.34,1.4,0.5,1)] will-change-transform"
            style={{
              width: 'calc((100% - 48px) / 3)',
              transform: `translate3d(calc(${activeIdx} * (100% + 8px)), 0, 0)`,
              borderColor: `rgba(${activeItem.rgb},0.42)`,
              backgroundImage: `linear-gradient(135deg, rgba(${activeItem.rgb},0.24), rgba(${activeItem.rgb},0.05))`,
              boxShadow: `0 0 24px rgba(${activeItem.rgb},0.22)`,
            }}
          />
          {NAV_ITEMS.map((item, idx) => {
            const isCurrent = idx === activeIdx;
            return (
              <Link
                key={item.key}
                to={item.to}
                aria-label={item.label}
                aria-current={isCurrent ? 'page' : undefined}
                onClick={(e) => handleTap(e, item.key)}
                className={`group relative z-10 flex min-w-0 flex-1 flex-col items-center justify-center gap-1 overflow-hidden${
                  isCurrent ? ' active' : ''
                }`}
              >
                <div
                  className={`relative transition-transform duration-200 ${
                    isCurrent ? 'scale-105' : 'group-active:scale-90'
                  }`}
                >
                  <div
                    className="absolute -inset-3 rounded-full transition-opacity duration-500"
                    style={{
                      backgroundImage: `radial-gradient(circle, rgba(${item.rgb},0.38), transparent 70%)`,
                      opacity: isCurrent ? 1 : 0,
                    }}
                  />
                  <span
                    className="relative block transition-colors duration-300"
                    style={{ color: isCurrent ? item.color : '#64748b' }}
                  >
                    {item.icon}
                  </span>
                </div>
                <span
                  className="max-w-full truncate px-1 text-[9px] uppercase tracking-[0.1em] transition-colors duration-300"
                  style={{
                    color: isCurrent ? '#f8fafc' : '#64748b',
                    fontWeight: isCurrent ? 800 : 600,
                  }}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
