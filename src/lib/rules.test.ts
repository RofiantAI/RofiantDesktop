import { describe, it, expect, beforeEach } from "vitest";
import { loadRules, saveRules, rulesToPrompt, type Rule } from "./rules";

describe("rules", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("loadRules returns [] when nothing stored", () => {
    expect(loadRules()).toEqual([]);
  });

  it("loadRules returns [] on corrupt JSON", () => {
    localStorage.setItem("rofiant_rules", "{not json");
    expect(loadRules()).toEqual([]);
  });

  it("saveRules round-trips through loadRules", () => {
    const rules: Rule[] = [{ id: "1", text: "Always use TypeScript", createdAt: 1 }];
    saveRules(rules);
    expect(loadRules()).toEqual(rules);
  });

  it("rulesToPrompt returns empty string for no rules", () => {
    expect(rulesToPrompt([])).toBe("");
  });

  it("rulesToPrompt formats rules as a bulleted list", () => {
    const rules: Rule[] = [
      { id: "1", text: "Use tabs", createdAt: 1 },
      { id: "2", text: "No semicolons", createdAt: 2 },
    ];
    expect(rulesToPrompt(rules)).toBe(
      "Rules to follow:\n- Use tabs\n- No semicolons",
    );
  });
});
