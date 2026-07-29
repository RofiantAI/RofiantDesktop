export interface CustomProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

const CUSTOM_PREFIX = "custom:";

export function customModelId(providerId: string): string {
  return `${CUSTOM_PREFIX}${providerId}`;
}

export function isCustomModelId(id: string): boolean {
  return id.startsWith(CUSTOM_PREFIX);
}

export function customProviderIdFromModel(id: string): string | null {
  return isCustomModelId(id) ? id.slice(CUSTOM_PREFIX.length) : null;
}

// DMC is a built-in gateway rather than something added through the
// generic "Add provider" flow — it shows up as its own group in the model
// picker instead of in Settings → Providers.
export const DMC_BASE_URL = "https://dmc.cc/v1";

export interface DmcModelDef {
  id: string;
  name: string;
}

export const DMC_MODELS: DmcModelDef[] = [
  { id: "GLM-4.7-Flash", name: "GLM 4.7 Flash" },
  { id: "Qwen3.6-35B-A3B-NVFP4", name: "Qwen 3.6 35B A3B" },
  { id: "Qwen3-Coder-Next-FP8", name: "Qwen3 Coder Next" },
];

function dmcProviderId(modelId: string): string {
  return `dmc-${modelId}`;
}

export function isDmcProvider(p: CustomProvider): boolean {
  return p.baseUrl === DMC_BASE_URL;
}

// Whoever set up DMC did it through the old generic "Add provider" dialog,
// which created one freeform entry with one model. This expands that
// entry's API key into one CustomProvider per DMC_MODELS entry (stable ids,
// so the selection survives restarts) and drops the original — remapping
// the active model selection onto its canonical replacement if that's what
// was selected, so switching to the built-in group doesn't lose the
// in-progress pick.
export function reconcileDmcSettings<T extends { customProviders: CustomProvider[]; model: string }>(
  settings: T,
): T {
  const dmcEntries = settings.customProviders.filter(isDmcProvider);
  if (dmcEntries.length === 0) return settings;

  const canonicalIds = new Set(DMC_MODELS.map((m) => dmcProviderId(m.id)));
  const nonCanonical = dmcEntries.filter((p) => !canonicalIds.has(p.id));
  if (nonCanonical.length === 0 && dmcEntries.length === DMC_MODELS.length) return settings;

  const apiKey = dmcEntries.find((p) => canonicalIds.has(p.id))?.apiKey ?? dmcEntries[0].apiKey;
  const canonical: CustomProvider[] = DMC_MODELS.map((m) => ({
    id: dmcProviderId(m.id),
    name: `DMC · ${m.name}`,
    baseUrl: DMC_BASE_URL,
    apiKey,
    model: m.id,
  }));

  const activeId = customProviderIdFromModel(settings.model);
  const replaced = nonCanonical.find((p) => p.id === activeId);
  const matched = replaced
    ? DMC_MODELS.find((m) => m.id.toLowerCase() === replaced.model.toLowerCase())
    : undefined;
  const model = replaced ? customModelId(dmcProviderId((matched ?? DMC_MODELS[0]).id)) : settings.model;

  const rest = settings.customProviders.filter((p) => !isDmcProvider(p));
  return { ...settings, customProviders: [...rest, ...canonical], model };
}
