import 'server-only'
import { z } from 'zod'
import { askJson, type Img } from './llm.ts'

// Photo and selfie checks. Honest about limits: a language model is not a biometric face matcher.
// It is good at: is this a real photo of one person, is it explicit, does it carry a phone number or QR,
// did the person perform the random gesture we asked for. Face-match confidence below HIGH goes to a human.

export const PhotoVerdict = z.object({
  decision: z.preprocess((v) => String(v).toUpperCase(), z.enum(['APPROVE', 'REJECT', 'REVIEW'])),
  face_count: z.coerce.number().int().min(0).catch(0),
  // descriptive only — the decision field is what acts, so free-form labels are accepted here
  issues: z.array(z.string().max(80)).catch([]),
  user_note: z.string().max(400).catch(''),
  internal: z.string().max(600).catch(''),
})
export type PhotoVerdict = z.infer<typeof PhotoVerdict>

const PHOTO_SYSTEM = `You check profile photos for an Indian matrimony & relationships app.
APPROVE: a genuine photograph where the member's face is clearly visible. Group photos are allowed only as extra photos if it is
obvious which person is the member — for a primary photo, exactly one main face.
REJECT for: no human face; nudity, underwear/swimwear posed sexually, or sexual gestures; visible phone numbers, emails, social
handles, watermarks with contact info, or QR codes; images of children alone; screenshots, memes, cartoons, drawings; obvious
celebrity or stock images.
REVIEW (a human will look) for: possibly AI-generated faces, heavy beauty filters that hide the real face, unclear cases.
user_note: if not APPROVE, one short friendly sentence telling the member what kind of photo to upload instead. Else "".`

export async function checkPhoto(img: Img, isPrimary: boolean, userId: number, lang: 'en' | 'ml' = 'en'): Promise<PhotoVerdict> {
  return askJson('vision', PhotoVerdict, PHOTO_SYSTEM, [{
    role: 'user', images: [img],
    text: `Check this ${isPrimary ? 'PRIMARY' : 'additional'} profile photo. Write user_note in ${lang === 'ml' ? 'simple Malayalam' : 'English'}.`,
  }], { maxTokens: 2000, userId, effort: 'low' })
}

export const SelfieVerdict = z.object({
  gesture_done: z.boolean(),
  live_capture: z.boolean(),           // false if it looks like a photo of a screen / printout / another photo
  single_person: z.boolean(),
  same_person: z.preprocess((v) => String(v).toUpperCase(), z.enum(['HIGH', 'MEDIUM', 'LOW', 'NO_REFERENCE'])),
  user_note: z.string().max(400).catch(''),
  internal: z.string().max(600).catch(''),
})
export type SelfieVerdict = z.infer<typeof SelfieVerdict>

const SELFIE_SYSTEM = `You verify that a dating/matrimony member is a real person who matches their profile photos.
The member was shown a RANDOM gesture instruction and took a live selfie with the in-app camera.
Image 1 is the live selfie. Any further images are the member's own profile photos.
- gesture_done: did they clearly perform the requested gesture?
- live_capture: false if the selfie looks like a photo of a phone/computer screen, a printout, or a photo of a photo (moire, bezels, glare, flatness).
- single_person: exactly one person in the selfie.
- same_person: how confident you are that the selfie shows the same person as the profile photos, using stable features
  (face shape, eyes, nose, ears, hairline, skin marks), allowing for lighting, angle, beard, glasses, age of photo.
  HIGH only when clearly the same person. LOW when clearly different. NO_REFERENCE if there are no profile photos.
user_note: if anything failed, one friendly sentence on how to retake it. Else "".`

export async function checkSelfie(selfie: Img, challenge: string, profile: Img[], userId: number, lang: 'en' | 'ml' = 'en'): Promise<SelfieVerdict> {
  return askJson('vision', SelfieVerdict, SELFIE_SYSTEM, [{
    role: 'user', images: [selfie, ...profile.slice(0, 2)],
    text: `Requested gesture: "${challenge}". Image 1 = live selfie. Images 2+ = profile photos (${Math.min(profile.length, 2)}). Write user_note in ${lang === 'ml' ? 'simple Malayalam' : 'English'}.`,
  }], { maxTokens: 2000, userId, effort: 'low' })
}

export const CHALLENGES = [
  'Hold up three fingers next to your face',
  'Touch your nose with one finger',
  'Give a thumbs-up next to your chin',
  'Cover one eye with your hand',
  'Make a peace (V) sign next to your face',
  'Put your hand flat on top of your head',
  'Touch your ear with your hand',
  'Hold up two fingers next to your cheek',
]
export const CHALLENGES_ML: Record<string, string> = {
  'Hold up three fingers next to your face': 'മുഖത്തിനരികിൽ മൂന്ന് വിരലുകൾ ഉയർത്തിപ്പിടിക്കുക',
  'Touch your nose with one finger': 'ഒരു വിരൽ കൊണ്ട് മൂക്കിൽ തൊടുക',
  'Give a thumbs-up next to your chin': 'താടിക്കരികിൽ തംബ്സ്-അപ്പ് കാണിക്കുക',
  'Cover one eye with your hand': 'കൈ കൊണ്ട് ഒരു കണ്ണ് മറയ്ക്കുക',
  'Make a peace (V) sign next to your face': 'മുഖത്തിനരികിൽ V ചിഹ്നം കാണിക്കുക',
  'Put your hand flat on top of your head': 'കൈപ്പത്തി തലയുടെ മുകളിൽ വയ്ക്കുക',
  'Touch your ear with your hand': 'കൈ കൊണ്ട് ചെവിയിൽ തൊടുക',
  'Hold up two fingers next to your cheek': 'കവിളിനരികിൽ രണ്ട് വിരലുകൾ ഉയർത്തിപ്പിടിക്കുക',
}
