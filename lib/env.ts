// Supabase's Vercel integration syncs these automatically. Newer projects may
// name the public key "publishable" instead of "anon"; accept either.
// Fallbacks are the production project's public URL and anon key (safe to ship: every visitor's
// browser already receives them, and row-level security protects the data). They keep the site
// up if a deploy ever builds without the integration's env vars, which happened once.
const FALLBACK_URL = "https://xqpwwbfbzqfpbvrzabfb.supabase.co";
const FALLBACK_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxcHd3YmZienFmcGJ2cnphYmZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIyODM4NzYsImV4cCI6MjEwNzg1OTg3Nn0.hsEZwe4jF1OTd11niIfuOX5Cx6-CMqmIfKnVOi7QIc4";
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_URL;
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || FALLBACK_KEY;

// Web Push public key (safe to ship). The matching private key lives only in VAPID_PRIVATE_KEY.
export const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ??
  "BIYYLnapaiu5U981ha5jM0H6MXe6k8NcpJkHkEwyypm4j31tL5ufnldIG3hQXQE2mNAf_YY9q8y0j19N72rsrOE";
