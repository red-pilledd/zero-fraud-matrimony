-- Thuna core schema.
-- Pools are the hidden routing layer: MARRIAGE (matrimony + dating-to-marry), LONG_TERM, CASUAL.
-- A user only ever sees, searches and talks to members of their own pool.

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id                BIGSERIAL PRIMARY KEY,
  phone             TEXT NOT NULL UNIQUE,                -- +91XXXXXXXXXX, revealed only after an approved exchange
  session_version   INT  NOT NULL DEFAULT 1,             -- bump to sign the user out everywhere
  created_by        TEXT NOT NULL DEFAULT 'SELF' CHECK (created_by IN ('SELF','PARENT','SIBLING','RELATIVE','FRIEND')),
  track             TEXT CHECK (track IN ('MATRIMONY','DATING')),
  dating_purpose    TEXT CHECK (dating_purpose IN ('MARRIAGE','LONG_TERM','CASUAL')),
  pool              TEXT CHECK (pool IN ('MARRIAGE','LONG_TERM','CASUAL')),
  full_name         TEXT,
  display_name      TEXT,
  gender            TEXT CHECK (gender IN ('MAN','WOMAN')),
  seeking           TEXT CHECK (seeking IN ('MEN','WOMEN','EVERYONE')),
  dob               DATE,
  height_cm         INT CHECK (height_cm BETWEEN 120 AND 230),
  marital_status    TEXT CHECK (marital_status IN ('NEVER_MARRIED','DIVORCED','WIDOWED','SEPARATED')),
  religion          TEXT,
  caste             TEXT,
  mother_tongue     TEXT,
  district          TEXT,
  state             TEXT,
  country           TEXT NOT NULL DEFAULT 'India',
  education         TEXT,
  occupation        TEXT,
  income_band       TEXT,
  diet              TEXT,
  drinks            TEXT,
  smokes            TEXT,
  about             TEXT,
  pref_age_min      INT,
  pref_age_max      INT,
  pref_religions    TEXT[],
  photo_visibility  TEXT NOT NULL DEFAULT 'MEMBERS' CHECK (photo_visibility IN ('MEMBERS','ACCEPTED')),
  onboarding_step   TEXT NOT NULL DEFAULT 'INTENT' CHECK (onboarding_step IN ('INTENT','BASICS','INTERVIEW','PHOTOS','SELFIE','DONE')),
  status            TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','FROZEN','BANNED','DELETED')),
  frozen_until      TIMESTAMPTZ,
  ban_reason        TEXT,
  strikes           INT  NOT NULL DEFAULT 0,
  selfie_status     TEXT NOT NULL DEFAULT 'NONE' CHECK (selfie_status IN ('NONE','PENDING','REVIEW','VERIFIED','REJECTED')),
  credit_paise      INT  NOT NULL DEFAULT 0 CHECK (credit_paise >= 0),
  trust_score       INT  NOT NULL DEFAULT 50 CHECK (trust_score BETWEEN 0 AND 100),
  character         JSONB,                               -- internal only, never sent to other members
  character_at_msgs INT  NOT NULL DEFAULT 0,             -- msgs_delivered when the character was last rebuilt
  character_updated_at TIMESTAMPTZ,
  msgs_delivered    INT  NOT NULL DEFAULT 0,
  lang              TEXT NOT NULL DEFAULT 'en' CHECK (lang IN ('en','ml')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX users_discover_idx ON users (pool, gender, status, onboarding_step, selfie_status);

CREATE TABLE otp_codes (
  id         BIGSERIAL PRIMARY KEY,
  phone      TEXT NOT NULL,
  code_hash  TEXT NOT NULL,
  ip         TEXT,
  attempts   INT  NOT NULL DEFAULT 0,
  used       BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX otp_phone_idx ON otp_codes (phone, created_at DESC);

CREATE TABLE interview_turns (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('ai','user')),
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX interview_user_idx ON interview_turns (user_id, id);

CREATE TABLE photos (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_key   TEXT NOT NULL,
  blur_key   TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  status     TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REVIEW','REJECTED')),
  ai_result  JSONB,
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX photos_user_idx ON photos (user_id);

CREATE TABLE selfie_checks (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge  TEXT NOT NULL,
  file_key   TEXT,
  status     TEXT NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('ISSUED','VERIFIED','REVIEW','REJECTED','EXPIRED')),
  ai_result  JSONB,
  reviewed_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ
);
CREATE INDEX selfie_user_idx ON selfie_checks (user_id, id DESC);

CREATE TABLE payments (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES users(id),
  recipient_id  BIGINT NOT NULL REFERENCES users(id),
  intro         TEXT NOT NULL,
  amount_paise  INT NOT NULL CHECK (amount_paise > 0),
  provider      TEXT NOT NULL CHECK (provider IN ('RAZORPAY','TEST')),
  order_id      TEXT NOT NULL UNIQUE,
  payment_id    TEXT,
  status        TEXT NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED','PAID','FAILED')),
  conversation_id BIGINT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at       TIMESTAMPTZ
);

CREATE TABLE conversations (
  id               BIGSERIAL PRIMARY KEY,
  pool             TEXT NOT NULL,
  initiator_id     BIGINT NOT NULL REFERENCES users(id),
  recipient_id     BIGINT NOT NULL REFERENCES users(id),
  status           TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED','ACTIVE','DECLINED','EXPIRED','CLOSED')),
  intro            TEXT NOT NULL,
  price_paise      INT  NOT NULL,
  paid_via         TEXT NOT NULL CHECK (paid_via IN ('CREDIT','GATEWAY')),
  payment_id       BIGINT REFERENCES payments(id),
  refunded         BOOLEAN NOT NULL DEFAULT false,
  expires_at       TIMESTAMPTZ NOT NULL,
  responded_at     TIMESTAMPTZ,
  closed_by        BIGINT,
  closed_reason    TEXT,
  contact_state    TEXT NOT NULL DEFAULT 'NONE' CHECK (contact_state IN ('NONE','REQUESTED','AI_REVIEW','APPROVED','NOT_YET')),
  contact_requested_by BIGINT,
  contact_ai       JSONB,
  contact_note     TEXT,                                -- the message both users see about the exchange
  contact_retry_after TIMESTAMPTZ,
  contact_approved_at TIMESTAMPTZ,
  contact_review_started TIMESTAMPTZ,
  last_msg_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (initiator_id <> recipient_id)
);
-- one conversation per pair, ever (a declined pair cannot be re-bought into a harassment loop)
CREATE UNIQUE INDEX conversations_pair_uq ON conversations (LEAST(initiator_id, recipient_id), GREATEST(initiator_id, recipient_id));
CREATE INDEX conversations_initiator_idx ON conversations (initiator_id);
CREATE INDEX conversations_recipient_idx ON conversations (recipient_id);
CREATE INDEX conversations_expiry_idx ON conversations (expires_at) WHERE status = 'REQUESTED';

ALTER TABLE payments ADD CONSTRAINT payments_conversation_fk FOREIGN KEY (conversation_id) REFERENCES conversations(id);

CREATE TABLE messages (
  id              BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       BIGINT NOT NULL REFERENCES users(id),
  body            TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  status          TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','DELIVERED','BLOCKED')),
  category        TEXT,
  user_note       TEXT,                                 -- what the sender is told when blocked
  screen          JSONB,                                -- rule + AI verdict, internal
  attempts        INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at    TIMESTAMPTZ,
  read_at         TIMESTAMPTZ
);
CREATE INDEX messages_conv_idx ON messages (conversation_id, id);
CREATE INDEX messages_sender_idx ON messages (sender_id, id DESC);
CREATE INDEX messages_pending_idx ON messages (created_at) WHERE status = 'PENDING';

CREATE TABLE credit_ledger (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id),
  delta_paise     INT NOT NULL,
  reason          TEXT NOT NULL CHECK (reason IN ('REFUND_NO_REPLY','REFUND_DECLINED','REFUND_CLOSED_BY_SYSTEM','SPENT','ADMIN')),
  conversation_id BIGINT REFERENCES conversations(id),
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX credit_user_idx ON credit_ledger (user_id, id DESC);

CREATE TABLE moderation_events (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id),
  reporter_id     BIGINT REFERENCES users(id),
  conversation_id BIGINT REFERENCES conversations(id),
  message_id      BIGINT REFERENCES messages(id),
  kind            TEXT NOT NULL CHECK (kind IN ('MESSAGE_BLOCKED','WARNING','FREEZE','BAN','REPORT','INTENT_MISMATCH','RISK_FLAG','PHOTO_REVIEW','SELFIE_REVIEW','SAFETY')),
  category        TEXT,
  detail          TEXT,
  needs_review    BOOLEAN NOT NULL DEFAULT false,
  resolved_at     TIMESTAMPTZ,
  resolution      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX moderation_open_idx ON moderation_events (created_at DESC) WHERE needs_review AND resolved_at IS NULL;
CREATE INDEX moderation_user_idx ON moderation_events (user_id, id DESC);

CREATE TABLE blocks (
  blocker_id BIGINT NOT NULL REFERENCES users(id),
  blocked_id BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE TABLE ai_questions (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question    TEXT NOT NULL,
  why         TEXT,                                     -- internal reason
  kind        TEXT NOT NULL DEFAULT 'CLARIFY' CHECK (kind IN ('CLARIFY','INTENT_CHECK')),
  answer      TEXT,
  status      TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ANSWERED','SKIPPED')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered_at TIMESTAMPTZ
);
CREATE INDEX ai_questions_user_idx ON ai_questions (user_id, status);

CREATE TABLE push_subscriptions (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ai_usage (
  id            BIGSERIAL PRIMARY KEY,
  task          TEXT NOT NULL,
  provider      TEXT NOT NULL,
  model         TEXT NOT NULL,
  input_tokens  INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  cost_usd      NUMERIC(12,6) NOT NULL DEFAULT 0,
  ms            INT,
  ok            BOOLEAN NOT NULL DEFAULT true,
  user_id       BIGINT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_usage_time_idx ON ai_usage (created_at);

CREATE TABLE login_attempts (
  id      BIGSERIAL PRIMARY KEY,
  key     TEXT NOT NULL,
  ip      TEXT,
  success BOOLEAN NOT NULL,
  at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX login_attempts_idx ON login_attempts (key, at);
