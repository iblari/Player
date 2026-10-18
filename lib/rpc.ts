"use client";
import { supabase } from "@/lib/supabase/client";

type RpcResult<T> = { data: T | null; error: { message: string; code?: string } | null };

/** PostgREST says the function (with these argument names) or table doesn't exist yet. */
export function isMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "PGRST202" || error.code === "PGRST205" || error.code === "42703" || error.code === "42P01";
}

/**
 * Call a database function with its newest arguments, and if the database hasn't been
 * migrated yet (the function doesn't accept them), retry with the older arguments.
 * This keeps the app working when code is deployed before its migrations run.
 * Pass `legacy: null` when there is no safe older call.
 */
export async function rpcCompat<T>(fn: string, args: Record<string, unknown>, legacy: Record<string, unknown> | null): Promise<RpcResult<T>> {
  const sb = supabase();
  const first = (await sb.rpc(fn, args)) as RpcResult<T>;
  if (!isMissing(first.error) || legacy === null) return first;
  if (process.env.NODE_ENV !== "production") console.warn(`[db] ${fn}: new signature missing, using legacy call. Run the latest migrations.`);
  return (await sb.rpc(fn, legacy)) as RpcResult<T>;
}

/** Drop keys from an args object (for the legacy call). */
export function without(args: Record<string, unknown>, ...keys: string[]): Record<string, unknown> {
  const out = { ...args };
  keys.forEach((k) => delete out[k]);
  return out;
}
