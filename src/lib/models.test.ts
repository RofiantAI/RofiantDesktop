import { describe, it, expect } from "vitest";
import {
  DEFAULT_FREE_MODEL,
  DEFAULT_PRO_MODEL,
  DMC_MODELS,
  clampModelForPlan,
  defaultModelForPlan,
  isDmcModel,
  isLogfareModel,
  isProModel,
  isVisionModel,
  VISION_MODEL_ID,
} from "./models";

describe("models", () => {
  it("isProModel is false for free models, true for pro-only models", () => {
    expect(isProModel(DEFAULT_FREE_MODEL)).toBe(false);
    expect(isProModel(DEFAULT_PRO_MODEL)).toBe(true);
  });

  it("defaultModelForPlan picks the right default per plan", () => {
    expect(defaultModelForPlan(true)).toBe(DEFAULT_PRO_MODEL);
    expect(defaultModelForPlan(false)).toBe(DEFAULT_FREE_MODEL);
  });

  it("clampModelForPlan passes custom: models through untouched", () => {
    expect(clampModelForPlan("custom:my-provider", false)).toBe("custom:my-provider");
    expect(clampModelForPlan("custom:my-provider", true)).toBe("custom:my-provider");
  });

  it("clampModelForPlan passes DMC models through untouched regardless of plan", () => {
    expect(clampModelForPlan(DMC_MODELS[0].id, false)).toBe(DMC_MODELS[0].id);
    expect(clampModelForPlan(DMC_MODELS[0].id, true)).toBe(DMC_MODELS[0].id);
  });

  it("isDmcModel flags DMC model ids only", () => {
    expect(isDmcModel(DMC_MODELS[0].id)).toBe(true);
    expect(isDmcModel(DEFAULT_FREE_MODEL)).toBe(false);
  });

  it("clampModelForPlan falls back to the plan default for unknown models", () => {
    expect(clampModelForPlan("does-not-exist", false)).toBe(DEFAULT_FREE_MODEL);
    expect(clampModelForPlan("does-not-exist", true)).toBe(DEFAULT_PRO_MODEL);
  });

  it("clampModelForPlan downgrades a pro model for a free plan", () => {
    expect(clampModelForPlan(DEFAULT_PRO_MODEL, false)).toBe(DEFAULT_FREE_MODEL);
  });

  it("clampModelForPlan leaves a valid model alone for the right plan", () => {
    expect(clampModelForPlan(DEFAULT_FREE_MODEL, false)).toBe(DEFAULT_FREE_MODEL);
    expect(clampModelForPlan(DEFAULT_PRO_MODEL, true)).toBe(DEFAULT_PRO_MODEL);
  });

  it("isVisionModel only matches the vision model id", () => {
    expect(isVisionModel(VISION_MODEL_ID)).toBe(true);
    expect(isVisionModel(DEFAULT_FREE_MODEL)).toBe(false);
  });

  it("isLogfareModel flags kiro-auto only", () => {
    expect(isLogfareModel("kiro-auto")).toBe(true);
    expect(isLogfareModel(DEFAULT_FREE_MODEL)).toBe(false);
  });
});
