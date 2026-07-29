import { describe, it, expect } from "vitest";
import { customModelId, customProviderIdFromModel, isCustomModelId } from "./providers";

describe("providers", () => {
  it("customModelId prefixes the provider id", () => {
    expect(customModelId("abc123")).toBe("custom:abc123");
  });

  it("isCustomModelId detects the custom: prefix", () => {
    expect(isCustomModelId("custom:abc123")).toBe(true);
    expect(isCustomModelId("openai/gpt-oss-120b")).toBe(false);
  });

  it("customProviderIdFromModel round-trips with customModelId", () => {
    const id = customModelId("abc123");
    expect(customProviderIdFromModel(id)).toBe("abc123");
  });

  it("customProviderIdFromModel returns null for non-custom ids", () => {
    expect(customProviderIdFromModel("openai/gpt-oss-120b")).toBeNull();
  });
});
