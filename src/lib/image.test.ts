import { describe, it, expect } from "vitest";
import { readImageFile, MAX_IMAGE_BYTES } from "./image";

function makeFile(bytes: number, type: string): File {
  return new File([new Uint8Array(bytes)], "test", { type });
}

describe("readImageFile", () => {
  it("rejects non-image files", async () => {
    const result = await readImageFile(makeFile(10, "text/plain"));
    expect(result).toEqual({ ok: false, error: "Only image files are supported." });
  });

  it("rejects images over the size limit", async () => {
    const result = await readImageFile(makeFile(MAX_IMAGE_BYTES + 1, "image/png"));
    expect(result).toEqual({ ok: false, error: "Image is too large (max 5MB)." });
  });

  it("accepts an image at exactly the size limit", async () => {
    const result = await readImageFile(makeFile(MAX_IMAGE_BYTES, "image/png"));
    expect(result.ok).toBe(true);
  });

  it("resolves with a data URL for a valid image", async () => {
    const result = await readImageFile(makeFile(10, "image/png"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.dataUrl.startsWith("data:image/png")).toBe(true);
    }
  });
});
