export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-label="NORTHKAIRN">
      <defs>
        <linearGradient id="nkg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#67e8f9" /><stop offset="1" stopColor="#3b82f6" /></linearGradient>
        <linearGradient id="nkg2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5eead4" /><stop offset="1" stopColor="#0ea5e9" /></linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="39" height="39" rx="11" fill="#0b1630" stroke="rgba(148,163,184,0.18)" />
      <ellipse cx="20" cy="30" rx="11" ry="4.6" fill="url(#nkg1)" opacity="0.95" />
      <ellipse cx="20.6" cy="21.6" rx="8.2" ry="3.9" fill="url(#nkg2)" opacity="0.9" />
      <ellipse cx="19.6" cy="14.4" rx="5.6" ry="3.1" fill="#a5f3fc" opacity="0.9" />
      <path d="M20 4.5 L20 9.5" stroke="#e0f2fe" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M17.6 7 L20 4.5 L22.4 7" fill="none" stroke="#e0f2fe" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
