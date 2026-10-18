import { initials } from "@/lib/util";

const HUES = [210, 152, 28, 340, 265, 190, 95, 5];

export function hueFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return HUES[h % HUES.length];
}

export default function Avatar({ id, name, size = 36 }: { id: string; name: string; size?: number }) {
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.38, ["--h" as string]: hueFor(id) }}
      title={name}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
