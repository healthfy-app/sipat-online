/**
 * Redraws a picture as a plain PNG that fits `maxSide` pixels and `maxBytes`, so the person never has to resize or
 * re-export a file by hand. The PDF only reads plain PNG and JPEG: an interlaced or 16-bit PNG, a WebP or a picture
 * wider than 4000 px were refused with a message about the file size. Null when this browser cannot draw the picture.
 */
export async function fitPicture(file: File, maxSide: number, maxBytes: number): Promise<string | null> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }
  try {
    let scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) return null;
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) return null;
      if (blob.size <= maxBytes) return await base64Of(blob);
      // still too heavy: a quarter fewer pixels on each side and try again
      scale *= 0.75;
    }
    return null;
  } finally {
    bitmap.close();
  }
}

function base64Of(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result.slice(reader.result.indexOf(',') + 1) : null);
    reader.readAsDataURL(blob);
  });
}
