/**
 * Client-side image compression. Downscales an image so its longest edge is at
 * most `maxDim` and re-encodes it to WebP — keeping Supabase Storage tiny
 * (typically ~100–300 KB per image). Dependency-free (uses <canvas>).
 *
 * Note: animated GIFs are flattened to a static first-frame WebP.
 */
export interface CompressedImage {
  blob: Blob
  width: number
  height: number
}

const DEFAULTS = { maxDim: 1600, quality: 0.82 }

/** File types the picker/compressor accepts. */
export const ACCEPTED_IMAGE_TYPES = 'image/png,image/jpeg,image/webp,image/gif'

export async function compressToWebP(
  file: File | Blob,
  opts: { maxDim?: number; quality?: number } = {},
): Promise<CompressedImage> {
  const maxDim = opts.maxDim ?? DEFAULTS.maxDim
  const quality = opts.quality ?? DEFAULTS.quality

  const bitmap = await loadBitmap(file)
  const { width: sw, height: sh } = bitmap
  const scale = Math.min(1, maxDim / Math.max(sw, sh))
  const width = Math.max(1, Math.round(sw * scale))
  const height = Math.max(1, Math.round(sh * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not process image (no canvas context).')
  ctx.drawImage(bitmap, 0, 0, width, height)
  if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', quality),
  )
  if (!blob) throw new Error('Could not encode image to WebP.')
  return { blob, width, height }
}

/** Decode a file into something drawable, preferring createImageBitmap. */
async function loadBitmap(file: File | Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file)
    } catch {
      /* fall back to <img> below (e.g. some SVGs/edge cases) */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Could not read image file.'))
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}
