"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ActivityIcon, CourtIcon, HomeIcon, UserIcon } from "./Icons";

const TABS = [
  { href: "/play", label: "Home", icon: <HomeIcon />, match: ["/play", "/host"] },
  { href: "/courts", label: "Courts", icon: <CourtIcon />, match: ["/courts"] },
  { href: "/activity", label: "Activity", icon: <ActivityIcon />, match: ["/activity", "/stats", "/g/"] },
  { href: "/me", label: "Account", icon: <UserIcon />, match: ["/me"] },
];

export default function TabBar() {
  const path = usePathname();
  if (path.startsWith("/host")) return null;
  return (
    <nav className="tabbar" aria-label="Main">
      <div className="tabbar-inner">
        {TABS.map((t) => (
          <Link key={t.href} className="tab" href={t.href} aria-current={t.match.some((m) => path.startsWith(m)) ? "page" : undefined}>
            {t.icon}
            {t.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
