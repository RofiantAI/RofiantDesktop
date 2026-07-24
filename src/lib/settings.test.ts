import { describe, it, expect, beforeEach, vi } from "vitest";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, resolveTheme } from "./settings";

describe("settings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("loadSettings returns defaults when nothing stored", () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("loadSettings merges stored partial settings over defaults", () => {
    localStorage.setItem("rofiant_settings", JSON.stringify({ theme: "dark", fontSize: "lg" }));
    const s = loadSettings();
    expect(s.theme).toBe("dark");
    expect(s.fontSize).toBe("lg");
    expect(s.model).toBe(DEFAULT_SETTINGS.model);
  });

  it("loadSettings falls back to defaults on corrupt JSON", () => {
    localStorage.setItem("rofiant_settings", "{not json");
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("saveSettings persists and round-trips through loadSettings", () => {
    const s = { ...DEFAULT_SETTINGS, theme: "dark" as const };
    saveSettings(s);
    expect(loadSettings()).toEqual(s);
  });

  it("resolveTheme passes through light/dark", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("resolveTheme resolves system via matchMedia", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: true }),
    );
    expect(resolveTheme("system")).toBe("dark");
    vi.unstubAllGlobals();
  });
});
