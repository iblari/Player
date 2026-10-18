// Supabase's Vercel integration syncs these automatically. Newer projects may
// name the public key "publishable" instead of "anon"; accept either.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

// Web Push public key (safe to ship). The matching private key lives only in VAPID_PRIVATE_KEY.
export const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ??
  "BKeuhMVTdW1S7J3iDNjZwP6YgZgsWDava-YxAnLHd2MKo93sDXdZI5PKKRK7JJXuFdf3Bla2qV0hB1W7Kdz-aYI";
