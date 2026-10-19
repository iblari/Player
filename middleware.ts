import { createServerClient, type CookieOptions } from "@supabase/ssr";

type CookieList = { name: string; value: string; options: CookieOptions }[];
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/env";

const APP_ROUTES = ["/play", "/host", "/courts", "/me", "/stats", "/activity"];

// The one address production should be seen on. Vercel also serves production on its own
// *.vercel.app aliases; send those here so sign-ins, cookies and shared links stay on one domain.
// Preview deployments (VERCEL_ENV=preview) keep their own URLs for testing.
const CANONICAL_HOST = process.env.CANONICAL_HOST || "www.playersclub.io";

const FORWARD_OLD_DOMAIN = false;

export async function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  // Production answers on one address only: the old domain (letslarp.io), www, and Vercel's
  // own *.vercel.app aliases all forward here, keeping the path and query.
  // While playersclub.io's DNS is still spreading, old letslarp.io links keep working in place
  // (FORWARD_OLD_DOMAIN=1 or the flag below turns forwarding back on). Vercel aliases always forward.
  const forwardOld = process.env.FORWARD_OLD_DOMAIN === "1" || FORWARD_OLD_DOMAIN;
  const isOld = host.endsWith("letslarp.io");
  if (
    process.env.VERCEL_ENV === "production" && host && host !== CANONICAL_HOST && host !== CANONICAL_HOST.replace(/^www\./, "") &&
    !host.startsWith("localhost") && (!isOld || forwardOld)
  ) {
    const to = request.nextUrl.clone();
    to.protocol = "https:";
    to.host = CANONICAL_HOST;
    to.port = "";
    return NextResponse.redirect(to, 308);
  }

  // Supabase falls back to the Site URL (often "/") when a redirect URL isn't allow-listed,
  // so catch a sign-in code on any page and finish sign-in properly.
  const code = request.nextUrl.searchParams.get("code");
  if (code && request.nextUrl.pathname !== "/auth/callback") {
    const to = request.nextUrl.clone();
    to.pathname = "/auth/callback";
    to.search = "";
    to.searchParams.set("code", code);
    to.searchParams.set("next", request.nextUrl.pathname === "/" || request.nextUrl.pathname === "/login" ? "/play" : request.nextUrl.pathname);
    return NextResponse.redirect(to);
  }

  let response = NextResponse.next({ request });
  const url = SUPABASE_URL;
  const key = SUPABASE_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list: CookieList) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  if (!data.user && APP_ROUTES.some((r) => path.startsWith(r))) {
    const to = request.nextUrl.clone();
    to.pathname = "/login";
    to.searchParams.set("next", path);
    return NextResponse.redirect(to);
  }
  if (data.user && (path === "/" || path === "/login")) {
    const to = request.nextUrl.clone();
    to.pathname = "/play";
    to.search = "";
    return NextResponse.redirect(to);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|sw.js|api/).*)"],
};
