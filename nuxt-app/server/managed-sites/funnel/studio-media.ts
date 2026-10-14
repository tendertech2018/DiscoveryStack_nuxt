import { createHash } from 'node:crypto'
import { createError } from 'h3'
import sharp from 'sharp'
import { STUDIO_IMAGE_MAX_BYTES, type StudioMedia } from '../../../utils/managedSitePresentation'

/** Small pre-project assets travel with the immutable proposal; no public bucket or third-party vision upload. */
export async function normalizeStudioMedia(input: Record<string, unknown>): Promise<StudioMedia> {
  const reject = (): never => { throw createError({ statusCode: 422, statusMessage: 'Use your own still JPG, PNG or WebP image with a short description. This image could not be safely prepared.' }) }
  if (!['hero', 'detail'].includes(String(input.slot)) || input.rightsConfirmed !== true || typeof input.alt !== 'string' || !input.alt.trim() || input.alt.length > 200 || /[<>\u0000-\u001f]/u.test(input.alt) || typeof input.dataUrl !== 'string') reject()
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/u.exec(input.dataUrl as string)
  if (!match) return reject()
  if (match[2]!.length > 220_000) reject()
  const bytes = Buffer.from(match[2]!, 'base64')
  if (bytes.toString('base64') !== match[2]) reject()
  try {
    const options = { animated: false, failOn: 'warning' as const, limitInputPixels: 16_000_000 }
    const metadata = await sharp(bytes, options).metadata()
    if (!metadata.width || !metadata.height || !['jpeg', 'png', 'webp'].includes(metadata.format || '') || metadata.format !== match[1] || (metadata.pages || 1) > 1) reject()
    // Sharp re-encodes pixels and drops EXIF/GPS, comments, ICC and source filenames.
    for (const [size, quality] of [[1400, 76], [1100, 64], [850, 54], [640, 46]] as const) {
      const output = await sharp(bytes, options).rotate().resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true }).webp({ quality, effort: 3 }).toBuffer({ resolveWithObject: true })
      if (output.data.byteLength <= STUDIO_IMAGE_MAX_BYTES) return { slot: input.slot as StudioMedia['slot'], dataUrl: `data:image/webp;base64,${output.data.toString('base64')}`, alt: (input.alt as string).trim(), width: output.info.width, height: output.info.height, sha256: createHash('sha256').update(output.data).digest('hex') }
    }
  } catch { reject() }
  return reject()
}
