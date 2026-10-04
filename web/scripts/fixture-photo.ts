// TEST ONLY: gives a test account an approved placeholder photo (no real face available on this machine).
//   node --conditions=react-server --env-file=.env.local scripts/fixture-photo.ts <userId> <label> <hexColour>
import sharp from 'sharp'
import { put, newKey, processPhoto } from '../lib/server/storage.ts'
import { pool } from '../lib/server/db.ts'

if (process.env.NODE_ENV === 'production') throw new Error('test fixture — never in production')
const [userId, label, colour] = [Number(process.argv[2]), process.argv[3] ?? 'T', process.argv[4] ?? '7b1e3a']
const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000">
  <rect width="800" height="1000" fill="#${colour}"/><circle cx="400" cy="380" r="170" fill="#f3e4c4"/>
  <rect x="190" y="580" width="420" height="420" rx="200" fill="#f3e4c4"/>
  <text x="400" y="440" font-size="180" text-anchor="middle" font-family="Georgia" fill="#${colour}">${label}</text></svg>`)
const img = await processPhoto(await sharp(svg).jpeg().toBuffer())
const key = newKey('photos', userId)
await put(key, img.full)
await put(key.replace('.jpg', '.blur.jpg'), img.blur)
await pool.query(
  `INSERT INTO photos (user_id, file_key, blur_key, is_primary, status, ai_result)
   VALUES ($1,$2,$3, NOT EXISTS (SELECT 1 FROM photos WHERE user_id = $1 AND is_primary), 'APPROVED', '{"fixture":true}')`,
  [userId, key, key.replace('.jpg', '.blur.jpg')])
console.log(`fixture photo added for user ${userId}`)
await pool.end()
