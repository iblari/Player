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
};

export type Sport = "pickleball" | "tennis";
export const SPORTS: { id: Sport; label: string }[] = [
  { id: "pickleball", label: "Pickleball" },
  { id: "tennis", label: "Tennis" },
];

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
