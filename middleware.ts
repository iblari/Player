import { createServerClient, type CookieOptions } from "@supabase/ssr";

type CookieList = { name: string; value: string; options: CookieOptions }[];
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/env";

const APP_ROUTES = ["/play", "/host", "/courts", "/me", "/stats", "/activity"];

export async function middleware(request: NextRequest) {
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
