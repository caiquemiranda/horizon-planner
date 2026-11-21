import type { SVGProps } from 'react';

/** Horizon mark: a sunrise arc over the horizon line. Mirrors `public/favicon.svg`. */
export function Logo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
      <rect width="32" height="32" rx="8" className="fill-foreground/5" />
      <path
        d="M8 20a8 8 0 0 1 16 0"
        className="stroke-horizon-long"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path d="M5 24h22" className="stroke-foreground" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
