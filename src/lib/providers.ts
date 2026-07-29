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
