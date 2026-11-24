import { useRef, useState } from 'react';
import { unlockAdminRoute } from '../lib/api';
import { useNavigate } from '../lib/router';
import { GB_EMBLEM_URL } from './BrandLogo';

const REQUIRED_TAPS = 10;
const TAP_RESET_MS = 1800;

export function SecretAdminBrand({
  title,
  asHeading = false,
}: {
  title: string;
  asHeading?: boolean;
}) {
  const navigate = useNavigate();
  const tapCountRef = useRef(0);
  const lastTapAtRef = useRef(0);
  const [pulseKey, setPulseKey] = useState(0);

  function handleSecretTap() {
    const now = Date.now();
    if (now - lastTapAtRef.current > TAP_RESET_MS) {
      tapCountRef.current = 0;
    }
    lastTapAtRef.current = now;
    tapCountRef.current += 1;
    setPulseKey((k) => k + 1);

    if (tapCountRef.current >= REQUIRED_TAPS) {
      tapCountRef.current = 0;
      lastTapAtRef.current = 0;
      unlockAdminRoute();
      navigate('/admin');
    }
  }

  return (
    <button
      type="button"
      onClick={handleSecretTap}
      className="mobile-brand mobile-brand-bat secret-brand-trigger"
      aria-label="GB STUDY"
      style={{
        background: 'transparent',
        border: 0,
        padding: 0,
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <div key={pulseKey} className="brand-symbol brand-symbol-bat brand-tap-pulse">
        <img
          src={GB_EMBLEM_URL}
          alt="GB STUDY"
          width={32}
          height={32}
          referrerPolicy="no-referrer"
        />
      </div>
      {asHeading ? (
        <h1 className="brand-name-bat">{title}</h1>
      ) : (
        <strong className="brand-name-bat">{title}</strong>
      )}
    </button>
  );
}
