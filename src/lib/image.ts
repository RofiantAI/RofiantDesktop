export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function readImageFile(
  file: File,
): Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }> {
  if (!file.type.startsWith("image/")) {
    return { ok: false, error: "Only image files are supported." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: "Image is too large (max 5MB)." };
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  return { ok: true, dataUrl };
}
