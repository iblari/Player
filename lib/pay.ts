// Pay-the-host links. Handles are cleaned of @ / $ / URL prefixes so pasted values work.
export type Handles = { venmo?: string | null; cashapp?: string | null; paypal?: string | null; zelle?: string | null };

export const clean = {
  venmo: (s: string) => s.trim().replace(/^https?:\/\/(account\.)?venmo\.com\/(u\/)?/i, "").replace(/^@/, "").replace(/[/?].*$/, ""),
  cashapp: (s: string) => s.trim().replace(/^https?:\/\/cash\.app\//i, "").replace(/^\$/, "").replace(/[/?].*$/, ""),
  paypal: (s: string) => s.trim().replace(/^https?:\/\/(www\.)?paypal\.me\//i, "").replace(/^@/, "").replace(/[/?].*$/, ""),
  zelle: (s: string) => s.trim(),
};

export const money = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);
/** Everyone in the game (host included) splits the court evenly, rounded up to the cent. */
export const share = (total: number, slots: number) => Math.ceil((total / slots) * 100) / 100;
export const durationLabel = (m: number) => (m % 60 === 0 ? `${m / 60} hr${m > 60 ? "s" : ""}` : m < 60 ? `${m} min` : `${(m / 60).toFixed(1).replace(/\.0$/, "")} hrs`);

export function payLinks(h: Handles, amount: number, note: string) {
  const amt = amount.toFixed(2);
  const out: { id: string; label: string; href: string }[] = [];
  if (h.venmo) out.push({ id: "venmo", label: "Venmo", href: `https://venmo.com/${encodeURIComponent(h.venmo)}?txn=pay&amount=${amt}&note=${encodeURIComponent(note)}` });
  if (h.cashapp) out.push({ id: "cashapp", label: "Cash App", href: `https://cash.app/$${encodeURIComponent(h.cashapp)}/${amt}` });
  if (h.paypal) out.push({ id: "paypal", label: "PayPal", href: `https://paypal.me/${encodeURIComponent(h.paypal)}/${amt}USD` });
  return out;
}
