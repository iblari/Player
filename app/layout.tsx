import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import { SessionProvider } from "@/components/Session";
import { ToastProvider } from "@/components/Toast";
import "./globals.css";

const figtree = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-figtree" });

export const metadata: Metadata = {
  title: "Fourth Up",
  description: "Find pickleball players near you. Go available, post a game at your court, and watch it fill.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Fourth Up", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#111111",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={figtree.variable}>
      <body>
        <SessionProvider>
          <ToastProvider>{children}</ToastProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
