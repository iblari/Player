// Supabase's Vercel integration syncs these automatically. Newer projects may
// name the public key "publishable" instead of "anon"; accept either.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

// Web Push public key (safe to ship). The matching private key lives only in VAPID_PRIVATE_KEY.
export const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ??
  "BIYYLnapaiu5U981ha5jM0H6MXe6k8NcpJkHkEwyypm4j31tL5ufnldIG3hQXQE2mNAf_YY9q8y0j19N72rsrOE";
