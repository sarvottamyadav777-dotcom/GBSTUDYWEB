import { useState } from 'react';

export const GB_EMBLEM_URL = '/gb-study-icon.png';
export const GB_OWNER_AVATAR_URL = '/gb-study-icon.png';

export function SafeAppLogo({
  src,
  alt,
  name,
  width = 512,
  height = 512,
  loading = 'lazy',
}: {
  src: string | null | undefined;
  alt: string;
  name: string;
  width?: number;
  height?: number;
  loading?: 'eager' | 'lazy';
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <span className="flex h-full w-full items-center justify-center rounded-[16px] bg-[#1a183b] text-xs font-extrabold text-[#a5b4fc]">
        {name.slice(0, 2).toUpperCase()}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={loading}
      decoding="async"
      width={width}
      height={height}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
