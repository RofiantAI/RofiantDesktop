export interface OnboardingState {
  sentMessage: boolean;
  pickedModel: boolean;
  openedSettings: boolean;
  dismissed: boolean;
}

const KEY = "rofiant_onboarding";

// Existing users (data on disk before this feature shipped) skip the
// checklist entirely instead of seeing it pop up out of nowhere.
export function loadOnboarding(hasExistingData: boolean): OnboardingState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // fall through to default
  }
  return { sentMessage: false, pickedModel: false, openedSettings: false, dismissed: hasExistingData };
}

export function saveOnboarding(state: OnboardingState) {
  localStorage.setItem(KEY, JSON.stringify(state));
}
