export type Profile = {
  id: string;
  display_name: string;
  skill: number;
  radius_mi: number;
  available_until: string | null;
  location: unknown | null;
};

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
  created_at: string;
  filled_at: string | null;
};

export type PlayerLite = { id: string; display_name: string; skill: number };

export function isAvailable(p: Pick<Profile, "available_until"> | null | undefined): boolean {
  return !!p?.available_until && new Date(p.available_until).getTime() > Date.now();
}

export function gameState(g: Pick<Game, "status" | "expires_at">, count: number, slots: number) {
  if (g.status === "cancelled") return "cancelled" as const;
  if (g.status === "full" || count >= slots) return "full" as const;
  if (new Date(g.expires_at).getTime() < Date.now()) return "expired" as const;
  return "open" as const;
}
