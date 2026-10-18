"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const icon = {
  play: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="9" cy="9.5" r="0.9" fill="currentColor" />
      <circle cx="14.5" cy="9" r="0.9" fill="currentColor" />
      <circle cx="12" cy="13.5" r="0.9" fill="currentColor" />
      <circle cx="8.5" cy="15" r="0.9" fill="currentColor" />
      <circle cx="15.5" cy="14.5" r="0.9" fill="currentColor" />
    </svg>
  ),
  courts: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <rect x="3" y="6" width="18" height="12" rx="1.5" />
      <path d="M12 5v14M9 6v12M15 6v12" />
    </svg>
  ),
  host: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  stats: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M5 20V11M12 20V5M19 20v-6" />
    </svg>
  ),
  me: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c1.2-3.6 4-5.5 7-5.5s5.8 1.9 7 5.5" />
    </svg>
  ),
};

export default function TabBar() {
  const path = usePathname();
  const cur = (p: string) => (path.startsWith(p) ? "page" : undefined);
  return (
    <nav className="tabbar" aria-label="Main">
      <div className="tabbar-inner">
        <Link className="tab" href="/play" aria-current={cur("/play")}>
          {icon.play}Play
        </Link>
        <Link className="tab" href="/courts" aria-current={cur("/courts")}>
          {icon.courts}Courts
        </Link>
        <Link className="tab-host" href="/host" aria-label="Host a game" aria-current={cur("/host")}>
          {icon.host}
        </Link>
        <Link className="tab" href="/stats" aria-current={cur("/stats")}>
          {icon.stats}Stats
        </Link>
        <Link className="tab" href="/me" aria-current={cur("/me")}>
          {icon.me}Me
        </Link>
      </div>
    </nav>
  );
}
