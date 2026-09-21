export type CompressedSitePhoto = {
  file: File
  originalSize: number
  compressedSize: number
  wasCompressed: boolean
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('ไม่สามารถอ่านรูปเพื่อบีบอัดได้'))
    }
    img.src = url
  })
}

export async function compressSitePhoto(
  file: File,
  maxDimension = 1600,
  quality = 0.78,
): Promise<CompressedSitePhoto> {
  const originalSize = file.size
  if (!file.type.startsWith('image/')) {
    return { file, originalSize, compressedSize: file.size, wasCompressed: false }
  }

  try {
    const img = await loadImage(file)
    const largest = Math.max(img.naturalWidth, img.naturalHeight)
    const scale = largest > maxDimension ? maxDimension / largest : 1
    const width = Math.max(1, Math.round(img.naturalWidth * scale))
    const height = Math.max(1, Math.round(img.naturalHeight * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas unavailable')

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)

    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    )
    if (!blob) throw new Error('Compression failed')

    if (blob.size >= file.size && file.size <= 900_000) {
      return { file, originalSize, compressedSize: file.size, wasCompressed: false }
    }

    const base = file.name.replace(/\.[^.]+$/, '') || 'site-photo'
    const compressedFile = new File([blob], `${base}.jpg`, {
      type: 'image/jpeg',
      lastModified: file.lastModified || Date.now(),
    })

    return {
      file: compressedFile,
      originalSize,
      compressedSize: compressedFile.size,
      wasCompressed: true,
    }
  } catch {
    return { file, originalSize, compressedSize: file.size, wasCompressed: false }
  }
}
