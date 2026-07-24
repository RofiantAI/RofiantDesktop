import { describe, it, expect } from "vitest";
import type { Session } from "@supabase/supabase-js";
import { planFromSession, isProPlan } from "./plan";

function sessionWithPlan(plan: unknown): Session {
  return {
    user: { user_metadata: { plan } },
  } as unknown as Session;
}

describe("plan", () => {
  it("planFromSession defaults to free for null session", () => {
    expect(planFromSession(null)).toBe("free");
  });

  it("planFromSession defaults to free when metadata missing", () => {
    expect(planFromSession({ user: { user_metadata: {} } } as unknown as Session)).toBe("free");
  });

  it("planFromSession lowercases the stored plan", () => {
    expect(planFromSession(sessionWithPlan("PRO"))).toBe("pro");
  });

  it("isProPlan is false only for 'free'", () => {
    expect(isProPlan("free")).toBe(false);
    expect(isProPlan("pro")).toBe(true);
    expect(isProPlan("")).toBe(true);
  });
});
