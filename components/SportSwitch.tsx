"use client";
import { SPORTS, type Sport } from "@/lib/types";

/** Pickleball / Tennis switch. New sports get added to SPORTS and show up here. */
export default function SportSwitch({ value, onChange }: { value: Sport; onChange: (s: Sport) => void }) {
  return (
    <div className="sport-switch" role="group" aria-label="Sport">
      {SPORTS.map((s) => (
        <button key={s.id} type="button" aria-pressed={value === s.id} onClick={() => onChange(s.id)}>
          {s.label}
        </button>
      ))}
      <span className="soon">More soon</span>
    </div>
  );
}
