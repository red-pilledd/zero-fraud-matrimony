# PROJECT: ZERO-FRAUD MATRIMONY

## CORE ARCHITECTURE & STACK

| Service | Stack | Port | Location |
|---|---|---|---|
| backend-core | FastAPI (Python) + SQLAlchemy + Pydantic | 8000 | `/backend-core` |
| backend-chat | Node.js + Socket.io | 3001 | `/backend-chat` |
| mobile-app | React Native (Expo) + TypeScript + Expo Router | 8081 | `/mobile-app` |

**DB:** SQLite in dev (`matrimony.db`), PostgreSQL in prod. ORM: SQLAlchemy async.

---

## STRICT DIRECTIVES (NEVER DEVIATE)

1. **Zero-Fraud:** NEVER store raw government IDs. SHA-256 hash only (`identity_hash` column, 64-char hex).
2. **Intent Silos:** `MATRIMONY` and `ALTERNATIVE` users are fully isolated at DB layer — never cross-query.
3. **Stake System:** Contact requires tokens/micropayments.
4. **No Swiping UI:** Frosted Glass mechanic only. Photos blurred until 15-message threshold (`photo_unlocked` flag in `user_relationships`).
5. **Aesthetic:** Navy, Slate, Gold. Data-Driven Elegance.
6. **AI Arbitrator:** Onboarding via AI interview, not static bios. All AI output validated against Pydantic schemas.

---

## DATABASE SCHEMA (SQLAlchemy models — `backend-core/models.py`)

### `users`
| Column | Type | Notes |
|---|---|---|
| id | Integer PK | |
| identity_hash | String(64) UNIQUE | SHA-256 of gov ID |
| intent_silo | Enum | MATRIMONY \| ALTERNATIVE |
| stake_balance | Integer | default 0 |
| reputation_score | Integer | default 0 |
| is_physically_verified | Boolean | default False |
| is_banned | Boolean | default False |
| compatibility_blueprint | JSON | from AI interview |
| lead_description | String(2000) | AI-generated bio |
| profile_confidence | Enum | HIGH \| MEDIUM \| LOW \| null |
| age, height_cm | Integer | nullable |
| marital_status, mother_tongue | String(50) | nullable |
| pref_age_min/max, pref_height_min/max | Integer | nullable |
| pref_marital_status, pref_mother_tongue | JSON | nullable |
| religion, caste, subcaste, gothram | String | nullable |
| pref_religion, pref_caste | JSON | nullable |
| nationality, country_of_residence, state, city | String | nullable |
| pref_nationality, pref_country, pref_state | JSON | nullable |
| education_level, field_of_study, occupation, annual_income | String | nullable |
| pref_education_level, pref_occupation, pref_income_range | String/JSON | nullable |
| diet, drinking, smoking | String(50) | nullable |
| has_disability | Boolean | nullable |
| pref_diet, pref_drinking_acceptable, pref_smoking_acceptable, pref_disability_acceptable | String/JSON | nullable |
| manual_bio | String(300) | nullable |
| bio_display_mode | String(20) | nullable |

### `leads`
| Column | Type | Notes |
|---|---|---|
| id | Integer PK | |
| phone_number | String(20) UNIQUE | |
| source | String(255) | |
| language_preference | String(50) | default "english" |
| ai_interview_completed | Boolean | default False |
| compatibility_blueprint | JSON | nullable |
| lead_description | String(2000) | nullable |

### `interview_sessions`
| Column | Type | Notes |
|---|---|---|
| id | Integer PK | |
| lead_id | FK → leads.id | |
| questions | JSON | list of {scenario, options} |
| answers | JSON | list of str |
| current_question_index | Integer | |
| is_complete | Boolean | |
| created_at | DateTime | |

### `user_relationships`
| Column | Type | Notes |
|---|---|---|
| id | Integer PK | |
| user_id | String(50) | |
| partner_id | String(50) | |
| message_count | Integer | default 0 |
| photo_unlocked | Boolean | default False |
| UNIQUE(user_id, partner_id) | | |

### `user_photos`
| Column | Type | Notes |
|---|---|---|
| id | Integer PK | |
| user_id | String(50) | |
| filename | String(255) | UUID filename on disk |
| is_primary | Boolean | |
| sort_order | Integer | |
| created_at | DateTime | |
Served at: `/static/photos/{user_id}/{filename}`

### `messages`
| Column | Type | Notes |
|---|---|---|
| id | Integer PK | |
| sender_id | String(50) | e.g. "lead-1", "user-bob" |
| receiver_id | String(50) | |
| content | String(4000) | |
| timestamp | DateTime | |
| is_read | Boolean | |

### `flags`
| Column | Type | Notes |
|---|---|---|
| id | Integer PK | |
| flagger_user_id | FK → users.id | nullable (null = SYSTEM) |
| flagged_user_id | FK → users.id | |
| reason | String(500) | |
| source | Enum | USER \| SYSTEM |
| created_at | DateTime | |

---

## API ROUTES (backend-core)

| Router file | Prefix | Key endpoints |
|---|---|---|
| routes_users.py | /users | GET /users/discover, GET/POST/PATCH users |
| routes_interview.py | /interview | AI interview session CRUD |
| routes_messages.py | /messages | Chat message history |
| routes_relationships.py | /relationships | message_count, photo_unlocked |
| routes_photos.py | /photos | upload/list/delete user photos |
| routes_flags.py | /flags | flag a user |
| routes_admin.py | /admin | admin operations |
| routes_ai.py | /ai | AI analysis endpoints |
| routes_internal.py | /internal | internal service calls |
| GET /health | — | health check |

---

## PYDANTIC SCHEMAS (backend-core/schemas.py & schemas_ai.py)

- `UserCreate`, `UserRead`, `UserUpdate`, `ProfileUpdate` — User CRUD
- `LeadCreate`, `LeadRead`, `LeadUpdate`, `LeadPromoteRequest` — Lead CRUD + promote to user
- `InterviewSessionRead`, `RespondRequest`, `RespondResult` — Interview flow
- `MessageCreate`, `MessageRead` — Chat
- `RelationshipRead` — photo unlock status
- `PhotoRead` — photo metadata + absolute URL
- `FlagCreate`, `FlagRead` — flagging
- `DiscoverUserRead` — slim card for discovery feed (no preference fields)
- AI schemas in `schemas_ai.py`

---

## MOBILE APP SCREENS (mobile-app/src/screens/)

| File | Screen |
|---|---|
| OnboardingScreen.tsx | User onboarding entry point |
| InterviewScreen.tsx | AI interview UI |
| ChatScreen.tsx | Real-time chat (Socket.io) |
| DiscoveryScreen.tsx | Profile discovery feed |
| ProfileScreen.tsx | Own profile view/edit |

**Services:** `src/services/api.ts` (HTTP → backend-core:8000), `src/services/socket.ts` (Socket.io → backend-chat:3001)

**Components:** `PhotoUploadSection.tsx`, `ProfileCard.tsx`

---

## BUILD STATUS

**BUILT:**
- Full backend-core: all models, schemas, all 9 route files
- backend-chat: Socket.io server (`server.js`) with tests
- Mobile: all 5 screens, api + socket services, photo upload, profile card

**NOT BUILT YET:**
- Stake/token payment system (backend)
- Physical verification flow
- Push notifications
- Production PostgreSQL migration (currently SQLite dev)
- App store deployment

---

## KEY FILES

```
backend-core/
  main.py          — FastAPI app, router registration, static files
  models.py        — All SQLAlchemy table definitions
  schemas.py       — All Pydantic request/response schemas
  schemas_ai.py    — AI-specific Pydantic schemas
  database.py      — DB session / init_db()
  config.py        — DEV_MODE flag, env config
  routes_*.py      — One file per domain

backend-chat/
  server.js        — Socket.io server (port 3001)

mobile-app/
  src/screens/     — All screens
  src/services/    — api.ts, socket.ts
  components/      — Reusable UI components
  src/data/profileOptions.ts — Dropdown option lists
```

---

## EXECUTION RULES

- Write Pydantic schemas before logic. Never assume DB schema — it's fully defined above.
- Keep I/O bounds separate from business logic.
- Python: strict typing. TypeScript: Zod/interfaces.
- `native_enum=False` on all SAEnum — portable across SQLite (dev) and PostgreSQL (prod).
