\# PROJECT: ZERO-FRAUD MATRIMONY (INDEPENDENT DISRUPTOR)



\## CORE ARCHITECTURE \& STACK

\- \*\*Backend (Core Logic \& DB):\*\* Python (FastAPI), PostgreSQL, SQLAlchemy, Pydantic. Located in `/backend-core`.

\- \*\*Backend (Real-time):\*\* Node.js, Socket.io. Located in `/backend-chat`. Runs on **port 3001**.

\- \*\*Frontend (Mobile):\*\* React Native (Expo), TypeScript, Expo Router. Located in `/mobile-app`.



\## STRICT DIRECTIVES (DO NOT HALLUCINATE OR DEVIATE)

1\. \*\*Zero-Fraud / Identity Vault:\*\* NEVER store raw government IDs. Always assume cryptographic hashing (SHA-256) for identity verification. We use this hash to permanently blacklist bad actors.

2\. \*\*Intent Silos:\*\* Users are either in the 'Matrimony' silo or 'Alternative' silo. They must NEVER query or see each other. This must be enforced at the database layer (PostgreSQL Enums).

3\. \*\*The Stake System:\*\* Contact requires tokens/micropayments.

4\. \*\*No Swiping UI:\*\* The mobile app strictly uses a "Frosted Glass" (blurred) mechanic. Photos are blurred until a 15-message threshold is met. Do not implement Tinder-like swiping components.

5\. \*\*Aesthetic:\*\* Data-Driven Elegance. Navy, Slate, Gold.

6\. \*\*AI Arbitrator:\*\* Onboarding is done via an AI interview blueprint, not static bios. All AI output must be validated against strict Pydantic schemas.



\## PORT MAP

\| Service | Stack | Port |
\|---|---|---|
\| backend-core | FastAPI (Python) | 8000 (uvicorn default) |
\| backend-chat | Node.js / Socket.io | 3001 |
\| mobile-app | Expo / React Native | 8081 (Metro bundler) |



\## EXECUTION RULES

\- Always write strict type definitions (Pydantic in Python, Zod/Interfaces in TS) before writing logic.

\- Do not make assumptions about database schemas. If a schema is not defined in this document, ask for clarification.

\- Write modular, testable code. Keep I/O bounds separate from business logic.

