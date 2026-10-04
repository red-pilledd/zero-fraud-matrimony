# Thuna — AI-chaperoned matrimony & relationships (rebuilt 2026-10-04)

Public brand: **Thuna** (Malayalam തുണ, "companion"), set by `NEXT_PUBLIC_BRAND_NAME`. Matrimony-branded on the outside;
dating sections exist but are invisible to parents (see Pools). The May-2026 Python/Node/Expo prototype is in `legacy/`
— reference only, do not build on it.

## Run it (Windows)
- DB: private Postgres 16 cluster in `web/.pgdata`, port **5458**. Start: `web/scripts/start-db.ps1` (detached; safe if running).
  Never start pg_ctl from a Bash background task — the task timeout kills Postgres with it (happened 2026-10-04).
- App: `npm run dev` in `web/` → **:3840** (launch.json entry `thuna`). Migrations: `npm run db:migrate` (db/NNN_*.sql).
- Admin panel: `/admin`, password in `web/admin-password.txt` (local only, gitignored). Hash lives in `.env.local` as
  `ADMIN_PASSWORD_HASH_B64` — base64 because a raw bcrypt hash's `$` signs get mangled by .env expansion.
- Tests: `node scripts/test-rules.ts` (free rule layer), `node --conditions=react-server --env-file=.env.local scripts/test-screen.ts`
  (25 tricky Manglish/Malayalam messages through the live AI, costs ~₹3). Must stay 25/25.

## Stack
Next.js 16 (App Router) + TypeScript + raw SQL via `pg` + zod. Same pattern as construct-erp. One Node process does
everything: pages, JSON API routes (`app/api/**`), live updates over SSE (`/api/stream`, in-process bus — single instance
only), background jobs every 30 s from `instrumentation.ts` → `lib/jobs.ts`. Photos on local disk `web/uploads/`
(`UPLOAD_DIR`), always served through `/api/photo/[id]` with an access check, never statically.

## Pools — the hidden routing (lib/domain/onboarding.ts routeIntent)
- Profile created by PARENT/SIBLING/RELATIVE/FRIEND → always MARRIAGE; dating options are never shown to them.
- SELF → "Marriage" or "Something else" → purpose: dating-to-marry (→ MARRIAGE pool), LONG_TERM, CASUAL.
- Members only ever see/search/message their own pool (discover.ts, checkCanRequest, photoAccess). Marriage pool is
  opposite-gender only; legal age 21 men / 18 women. Other pools 18+ with a "seeking" choice.
- The character read can flag INTENT_MISMATCH → admin queue → one-click "Move to X" (admin.ts reroute).

## Money
One fee opens one conversation with one person (price per pool in admin Settings, default ₹99). Recipient accepts or
declines. Decline / no reply within `reply_window_hours` (48) → fee back as **credit** automatically (jobs.ts
expireRequests). Credit is spent first next time. One conversation per pair ever (no re-buy harassment loop).
Gateway: Razorpay (`RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET`); without keys and outside production a TEST gateway is used.

## Message screening (lib/domain/messages.ts)
send → PENDING → free rules (lib/moderation/rules.ts: digits in any script/words/split across messages, email, UPI,
links, @handles) → AI (lib/ai/screen.ts, Haiku) → DELIVERED or BLOCKED. Recipient only ever reads DELIVERED. AI down →
stays PENDING, job retries; never delivered unscreened. AI sees only DELIVERED history and judges only the new message
(a bug where it re-punished an earlier blocked message was fixed 2026-10-04).
Consequences are plain code (lib/domain/moderation.ts): sharing details HIGH → strike; asking for a number → blocked, no
strike; 2 strikes → 7-day pause; 3 → ban. SCAM/SOLICITATION/THREAT HIGH → instant ban + people who paid to talk to them
refunded. MINOR → ban + review. SELF_HARM → delivered + Tele-MANAS 14416 note + admin review.

## Contact exchange
Both must agree → floors (30 msgs, 10 each, 24 h — admin Settings) → AI review of the whole chat → APPROVED reveals both
verified phone numbers in the chat; contact-info screening switches off for that conversation. Notes stored bilingual
(`{"en","ml"}` JSON in contact_note, picked per viewer).

## AI (lib/ai/llm.ts — official Anthropic SDK; Gemini via REST is wired but GEMINI_API_KEY not set)
Jobs → model set in admin Settings: screen = claude-haiku-4-5; deep (interview, character, contact review) and vision
(photo + selfie) = claude-sonnet-5-5 — Haiku's Malayalam was grammatically broken, Sonnet's is natural.
Sonnet calls send `fallbacks: "default"` (server-side refusal fallback). A model refusal while screening blocks the
message with no strike and queues it for a human. Every call metered in `ai_usage`; dashboard shows ₹ cost.
askJson() lists the exact keys to return and schemas tolerate harmless variations — models DO invent key names
otherwise. Malayalam is token-heavy: keep max_tokens generous (interview 2000/4000, character 6000).

## Verification honesty
Selfie = live camera + random gesture + AI comparison with profile photos (not biometric-grade); MEDIUM confidence →
human review. Never verified with a real face on this machine (no camera in the Browser pane). AWS Rekognition
liveness is the upgrade path if fakes get through.

## Android (android/)
Kotlin WebView shell from the wesupportucc-android template, package `com.thuna.app`. Debug APK points at
`http://localhost:3840/` (run `adb reverse tcp:3840 tcp:3840`; localhost keeps the camera a secure origin). Release:
`android/build-apk.ps1 -Url https://domain/` — refuses to build without an https URL. `send-to-phone.ps1` installs over USB or
serves on LAN :8391. Signing key `thuna-release.jks` + `keystore.pass.txt` (gitignored) — lose them and updates can't
install over existing copies. Verified on emulator 2026-10-04: sign-in persists across force-stop, camera permission +
live selfie + AI verdict, live chat, tel: number opens the dialer. Not verified: Razorpay UPI hand-off (no keys),
push (WebView has no web push — needs FCM).

## Not done / needs Shibin
Domain + hosting (needs persistent disk or R2 for photos), MSG91 SMS keys (DLT), Razorpay keys, Gemini key (optional,
~10x cheaper screening), FCM for native push,
Play Store billing if listed there (Google takes ~15% of in-app digital purchases).
