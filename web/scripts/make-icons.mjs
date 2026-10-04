// Generates the app icons. node scripts/make-icons.mjs
import sharp from 'sharp'

const svg = (size) => Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="0" fill="#7b1e3a"/>
  <rect x="0" y="440" width="512" height="18" fill="#c08a2e"/>
  <rect x="0" y="470" width="512" height="6" fill="#c08a2e"/>
  <path d="M256 360s-96-58-96-138a54 54 0 0 1 96-34 54 54 0 0 1 96 34c0 80-96 138-96 138z" fill="none" stroke="#f3e4c4" stroke-width="22" stroke-linejoin="round"/>
  <circle cx="256" cy="226" r="18" fill="#c08a2e"/>
</svg>`)

for (const size of [192, 512]) {
  await sharp(svg(size)).resize(size, size).png().toFile(`public/icon-${size}.png`)
  console.log(`public/icon-${size}.png`)
}
