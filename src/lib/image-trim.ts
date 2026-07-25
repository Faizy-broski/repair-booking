/**
 * Auto-trims transparent/near-white padding off an image so its content
 * fills the frame. Used for logo uploads, which get squeezed into a fixed
 * square box on printed receipts — baked-in padding shows up as a dead
 * gap next to the mark there.
 */
export async function trimImagePadding(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file)
    const { width, height } = bitmap
    if (width < 4 || height < 4) return file

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0)

    const { data } = ctx.getImageData(0, 0, width, height)
    const ALPHA_THRESHOLD = 10
    const WHITE_THRESHOLD = 245

    const isBackground = (i: number) => {
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3]
      if (a < ALPHA_THRESHOLD) return true
      return r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD
    }

    let minX = width, minY = height, maxX = -1, maxY = -1
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4
        if (!isBackground(i)) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }

    // Nothing found (blank image) — leave untouched.
    if (maxX < minX || maxY < minY) return file

    const contentW = maxX - minX + 1
    const contentH = maxY - minY + 1

    // Not meaningfully smaller than the original — skip, avoid trimming
    // photo-style logos that legitimately have no flat background.
    const shrinkX = 1 - contentW / width
    const shrinkY = 1 - contentH / height
    if (Math.max(shrinkX, shrinkY) < 0.03) return file

    const pad = Math.round(Math.max(contentW, contentH) * 0.04)
    const cropX = Math.max(0, minX - pad)
    const cropY = Math.max(0, minY - pad)
    const cropW = Math.min(width, maxX + 1 + pad) - cropX
    const cropH = Math.min(height, maxY + 1 + pad) - cropY

    const outCanvas = document.createElement('canvas')
    outCanvas.width = cropW
    outCanvas.height = cropH
    const outCtx = outCanvas.getContext('2d')
    if (!outCtx) return file
    outCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)

    const blob: Blob | null = await new Promise((resolve) =>
      outCanvas.toBlob(resolve, file.type || 'image/png', 0.95)
    )
    if (!blob) return file

    return new File([blob], file.name, { type: file.type || 'image/png' })
  } catch {
    // Any failure (unsupported format, decode error, canvas taint) — fall
    // back to the original file rather than blocking the upload.
    return file
  }
}
