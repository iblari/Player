import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import { SessionProvider } from "@/components/Session";
import { ToastProvider } from "@/components/Toast";
import { Analytics } from "@vercel/analytics/next";
import Script from "next/script";
import "./globals.css";

const barlow = Barlow({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-barlow" });
const barlowCondensed = Barlow_Condensed({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-barlow-condensed" });

const DESC = "Match with pickleball and tennis players near you within minutes. Pick a court, post a game, and watch it fill. Free.";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.letslarp.io"),
  title: "Let's Rally · Find pickleball & tennis players near you",
  description: DESC,
  openGraph: { title: "Let's Rally", description: DESC, url: "https://www.letslarp.io", siteName: "Let's Rally", type: "website" },
  twitter: { card: "summary_large_image", title: "Let's Rally", description: DESC },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Let's Rally", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#111111",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${barlow.variable} ${barlowCondensed.variable}`}>
      <body>
        <SessionProvider>
          <ToastProvider>{children}</ToastProvider>
        </SessionProvider>
        <Analytics />
        {/* Microsoft Clarity: heatmaps and session recordings (sensitive areas are masked with data-clarity-mask). */}
        <Script id="clarity" strategy="afterInteractive">
          {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window, document, "clarity", "script", "yzv3qy3glu");`}
        </Script>
      </body>
    </html>
  );
}
