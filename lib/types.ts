export type Profile = {
  id: string;
  display_name: string;
  skill: number;
  radius_mi: number;
  available_until: string | null;
  location: unknown | null;
  avatar_url: string | null;
  clubs: string[];
  sports: Partial<Record<Sport, number>>;
  activity_visibility?: "everyone" | "followers" | "private";
};

export type Sport = "pickleball" | "tennis";
export const SPORTS: { id: Sport; label: string }[] = [
  { id: "pickleball", label: "Pickleball" },
  { id: "tennis", label: "Tennis" },
];

/** Rating scale per sport. Matches public.sport_params / public.self_level in SQL. */
export const SPORT_META: Record<Sport, { label: string; rating: string; lo: number; hi: number }> = {
  pickleball: { label: "Pickleball", rating: "DUPR", lo: 2, hi: 8 },
  tennis: { label: "Tennis", rating: "NTRP", lo: 1.5, hi: 7 },
};

/** Self-rated 1-10 level -> the sport's rating scale (the prior before scored games). */
export function selfLevel(sport: Sport, level: number): number {
  if (sport === "tennis") return Math.round((1.5 + ((level - 1) * 5) / 9) * 4) / 4;
  return levelToSkill(level);
}

/** Self-rated 1-10 pickleball level <-> DUPR-style 2.0-5.5 used for matching. */
export function levelToSkill(level: number): number {
  return Math.round((2 + ((level - 1) * 3.5) / 9) * 4) / 4;
}
export function skillToLevel(skill: number): number {
  return Math.min(10, Math.max(1, Math.round(((skill - 2) / 3.5) * 9) + 1));
}

export type Court = {
  id: string;
  name: string;
  address: string | null;
  court_count: number | null;
  notes: string | null;
  lat: number;
  lng: number;
  distance_mi: number;
  available_players: number;
  open_games: number;
  town?: string | null;
  kind?: string | null;
  indoor?: boolean;
  members_only?: boolean;
  lit?: boolean;
  source?: string;
  club?: string | null;
  sports?: Sport[];
};

export type Game = {
  id: string;
  host_id: string;
  court_id: string;
  slots: 2 | 4;
  skill_min: number;
  skill_max: number;
  starts_at: string;
  expires_at: string;
  status: "open" | "full" | "cancelled";
  note: string | null;
  attendance_done: boolean;
  members_only?: boolean;
  club?: string | null;
  created_at: string;
  filled_at: string | null;
  ended_at?: string | null;
  fee_total?: number | null;
  fee_minutes?: number | null;
  sport: Sport;
};

export type PlayerLite = { id: string; display_name: string; skill: number; avatar_url?: string | null };

export function isAvailable(p: Pick<Profile, "available_until"> | null | undefined): boolean {
  return !!p?.available_until && new Date(p.available_until).getTime() > Date.now();
}

export function gameState(g: Pick<Game, "status" | "expires_at">, count: number, slots: number) {
  if (g.status === "cancelled") return "cancelled" as const;
  if (g.status === "full" || count >= slots) return "full" as const;
  if (new Date(g.expires_at).getTime() < Date.now()) return "expired" as const;
  return "open" as const;
}
