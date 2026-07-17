import type { Session } from "@supabase/supabase-js";

export function planFromSession(session: Session | null): string {
  return ((session?.user.user_metadata?.plan as string | undefined) ?? "free").toLowerCase();
}

export function isProPlan(plan: string): boolean {
  return plan !== "free";
}
