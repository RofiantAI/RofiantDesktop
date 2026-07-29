import { describe, it, expect } from "vitest";
import {
  customModelId,
  customProviderIdFromModel,
  DMC_BASE_URL,
  DMC_MODELS,
  isCustomModelId,
  isDmcProvider,
  reconcileDmcSettings,
  type CustomProvider,
} from "./providers";

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

describe("reconcileDmcSettings", () => {
  function manualDmcEntry(overrides: Partial<CustomProvider> = {}): CustomProvider {
    return {
      id: "user-added-uuid",
      name: "DMC",
      baseUrl: DMC_BASE_URL,
      apiKey: "sk-test-key",
      model: "GLM-4.7-Flash",
      ...overrides,
    };
  }

  it("leaves settings untouched when there's no DMC entry", () => {
    const settings = { customProviders: [], model: "openai/gpt-oss-120b" };
    expect(reconcileDmcSettings(settings)).toBe(settings);
  });

  it("expands a manually-added DMC entry into one canonical provider per model", () => {
    const settings = { customProviders: [manualDmcEntry()], model: "some-other-model" };
    const result = reconcileDmcSettings(settings);

    expect(result.customProviders).toHaveLength(DMC_MODELS.length);
    expect(result.customProviders.every(isDmcProvider)).toBe(true);
    expect(result.customProviders.every((p) => p.apiKey === "sk-test-key")).toBe(true);
    expect(new Set(result.customProviders.map((p) => p.model))).toEqual(
      new Set(DMC_MODELS.map((m) => m.id)),
    );
    // No prior selection pointed at the manual entry, so it's left alone.
    expect(result.model).toBe("some-other-model");
  });

  it("remaps the active model selection onto the canonical replacement", () => {
    const manual = manualDmcEntry();
    const settings = { customProviders: [manual], model: customModelId(manual.id) };
    const result = reconcileDmcSettings(settings);

    const canonical = result.customProviders.find((p) => p.model === "GLM-4.7-Flash");
    expect(canonical).toBeDefined();
    expect(result.model).toBe(customModelId(canonical!.id));
  });

  it("is idempotent once entries are already canonical", () => {
    const settings = { customProviders: [manualDmcEntry()], model: "unrelated" };
    const once = reconcileDmcSettings(settings);
    const twice = reconcileDmcSettings(once);
    expect(twice).toBe(once);
  });

  it("doesn't disturb non-DMC custom providers", () => {
    const other: CustomProvider = {
      id: "other-id",
      name: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "sk-other",
      model: "some/model",
    };
    const settings = { customProviders: [manualDmcEntry(), other], model: "unrelated" };
    const result = reconcileDmcSettings(settings);
    expect(result.customProviders).toContainEqual(other);
  });
});
