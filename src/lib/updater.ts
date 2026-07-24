import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

// Deliberately does not swallow errors: a failed check (network error, or a
// signature that no longer verifies against this build's embedded pubkey
// after a signing-key rotation) must be distinguishable from "no update
// available", or a broken updater silently reports "you're up to date"
// forever. Callers decide how to surface the rejection.
export async function checkForUpdate(): Promise<Update | null> {
  const update = await check();
  return update?.available ? update : null;
}

export async function installUpdate(
  update: Update,
  onProgress?: (downloaded: number, total: number | null) => void,
): Promise<void> {
  let downloaded = 0;
  let total: number | null = null;
  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        total = event.data.contentLength ?? null;
        onProgress?.(0, total);
        break;
      case "Progress":
        downloaded += event.data.chunkLength;
        onProgress?.(downloaded, total);
        break;
      case "Finished":
        onProgress?.(total ?? downloaded, total);
        break;
    }
  });
  await relaunch();
}
