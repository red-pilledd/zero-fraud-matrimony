import 'server-only'
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises'
import { join, dirname, normalize } from 'node:path'
import { randomBytes } from 'node:crypto'
import sharp from 'sharp'

// Private files (profile photos, selfies). Never served statically — every read goes through an
// authorised route. Stored on local disk under UPLOAD_DIR (a persistent volume in production).

const ROOT = process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads')

function safePath(key: string): string {
  const p = normalize(join(ROOT, key))
  if (!p.startsWith(normalize(ROOT))) throw new Error('bad storage key')
  return p
}

export async function put(key: string, data: Buffer) {
  const p = safePath(key)
  await mkdir(dirname(p), { recursive: true })
  await writeFile(p, data)
}
export const get = (key: string) => readFile(safePath(key))
export const remove = (key: string) => unlink(safePath(key)).catch(() => {})

export const newKey = (prefix: string, userId: number, ext = 'jpg') =>
  `${prefix}/${userId}/${Date.now()}-${randomBytes(6).toString('hex')}.${ext}`

/** Normalise an upload: auto-rotate, cap size, strip EXIF (GPS!), re-encode. Also makes a heavily blurred twin. */
export async function processPhoto(input: Buffer): Promise<{ full: Buffer; blur: Buffer; width: number; height: number }> {
  const img = sharp(input, { failOn: 'error' }).rotate()
  const meta = await img.metadata()
  if (!meta.width || !meta.height || meta.width < 200 || meta.height < 200) throw new Error('Photo is too small')
  const full = await img.resize({ width: 1080, height: 1350, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer()
  const blur = await sharp(full).resize({ width: 48 }).blur(3).resize({ width: 480 }).jpeg({ quality: 60 }).toBuffer()
  const m2 = await sharp(full).metadata()
  return { full, blur, width: m2.width ?? 0, height: m2.height ?? 0 }
}
