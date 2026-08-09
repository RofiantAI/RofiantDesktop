import { describe, it, expect, beforeEach } from "vitest";
import { loadOnboarding, saveOnboarding } from "./onboarding";

describe("onboarding", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to not dismissed for a brand new user", () => {
    expect(loadOnboarding(false)).toEqual({
      sentMessage: false,
      pickedModel: false,
      openedSettings: false,
      dismissed: false,
    });
  });

  it("defaults to dismissed when the user already has existing data", () => {
    expect(loadOnboarding(true).dismissed).toBe(true);
  });

  it("saveOnboarding round-trips through loadOnboarding", () => {
    const state = { sentMessage: true, pickedModel: false, openedSettings: true, dismissed: false };
    saveOnboarding(state);
    expect(loadOnboarding(true)).toEqual(state);
  });

  it("falls back to default on corrupt JSON", () => {
    localStorage.setItem("rofiant_onboarding", "{not json");
    expect(loadOnboarding(false).dismissed).toBe(false);
  });
});
