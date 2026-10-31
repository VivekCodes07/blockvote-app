# BlockVote — Blockchain-Based Electronic Voting System

## Project Overview
**BlockVote** is an academic prototype of an electronic voting system engineered to demonstrate transparent, verifiable election management and tamper-evident audit trails while strictly protecting voter anonymity and secret-ballot privacy. Individual ballot choices are never exposed through the blockchain explorer or linked to personal voter identities.

---

## Technology Stack

- **Frontend**: React 19, Vite 8, Recharts 3, Lucide React icons, CSS Custom Properties (DM Sans & Space Grotesk typography)
- **Backend**: Node.js, Express 5, CORS, Dotenv, native `dns` module for configurable SRV resolution
- **Database**: MongoDB Atlas (Cloud M0 Cluster), Mongoose 9 ODM
- **Cryptography & Security**: Native Node.js `crypto` module (SHA-256 for blockchain block hashing), `bcryptjs` (salt rounds: 10)
- **Authentication**: `jsonwebtoken` (JWT sessions with live MongoDB role verification)

---

## Implemented Features

### 1. Live Backend Connection Status
- Added dynamic health check polling against `GET /api/health` via Vite's `/api` proxy.
- Real-time service monitoring with clear indicators (`Connected`, `Checking...`, `Offline`).

### 2. MongoDB Atlas Connection
- Established secure environment configuration with `.env` and `.env.example`.
- Configured resilient Mongoose connection lifecycle listeners (`connected`, `error`, `disconnected`) preventing crashes during temporary database outages.
- Implemented configurable DNS resolver fallback (`1.1.1.1`, `1.0.0.1`) resolving Windows local stub resolver `ECONNREFUSED` SRV lookup issues.
- Added `GET /api/db-status` diagnostic endpoint reporting connection states without exposing URIs or credentials.

### 3. Live Database Status Indicator in Dashboard
- Integrated periodic `/api/db-status` polling in the React dashboard with unmount cleanup.
- Styled system services status card in the sidebar showing independent status dots for Backend and MongoDB.

### 4. Voter Registration (Backend & Frontend)
- **Backend Model & Route**:
  - Created Mongoose `Voter` model (`server/models/Voter.js`) with schema validation and automatic `toJSON` transformation stripping password hashes.
  - Implemented `POST /api/auth/register` with server-side validation, duplicate email enforcement (`409 Conflict`), and bcrypt password hashing (10 salt rounds).
  - Sanitized responses returning only `id`, `fullName`, `email`, and `createdAt`.
- **Frontend Registration View**:
  - Dedicated voter registration view matching the dark visual aesthetic.
  - Client-side validations for required fields, email format, minimum password length (6 characters), and password matching.
  - Loading spinner states, anti-spam duplicate submission prevention, and feedback banners.

### 5. Voter Login & JWT Authentication
- **Backend Route & Session Token**:
  - Implemented `POST /api/auth/login` with normalized email lookup and `bcryptjs` password verification.
  - Signed JWTs with 24-hour expiration using `JWT_SECRET`.
  - Added `GET /api/auth/me` returning current live database role to prevent stale JWT privilege escalation.
  - Generic `401 Unauthorized` responses to protect against voter email enumeration.
- **Frontend Session Management**:
  - Integrated Sign In tab alongside registration with state preservation.
  - Persists authenticated voter session in `localStorage` without storing credentials.
  - Automatically verifies stored session tokens on page load and clears expired sessions.
  - Displays authenticated voter name, email, and initials in the sidebar and top navigation with instant sign-out.

### 6. Elections & Candidates Management (with Safe Admin Provisioning)
- **Safe Admin Provisioning & Dynamic Role Verification**:
  - Public registration strictly assigns `role: "voter"`, ignoring any client-provided role.
  - Removed automatic promotion from login.
  - Added safe operator promotion script (`npm run promote-admin` / `node scripts/promote-admin.js`) reading `ADMIN_EMAIL` from `server/.env`.
  - `requireAdmin` and `GET /api/auth/me` query MongoDB directly on each request, ensuring revoked privileges take effect immediately.
- **Election & Candidate Models**:
  - `Election` model (`server/models/Election.js`) with title, description, start/end dates, draft flag (`isDraft`), and pre-vote deletion protection (`voteCount`).
  - `Candidate` model (`server/models/Candidate.js`) with name, party/affiliation, biography, image URL, and foreign key link to election.
  - Dynamic derived statuses (`Draft`, `Scheduled`, `Active`, `Completed`) calculated on read without pre-save hook drift.
  - Draft isolation: draft elections are strictly hidden from public and voter endpoints (`GET /api/elections` and `GET /api/elections/:id`), returning 404 for non-admins.
  - Pre-vote deletion safeguard: elections and candidates cannot be deleted once ballots have been recorded (`voteCount > 0`).
- **Draft Publishing & Editing Workflow**:
  - `PATCH /api/elections/:id/publish`: Admin-only endpoint to publish draft elections after validating candidate presence (>= 1 candidate) and future end date. Sets `isDraft: false`, deriving `Scheduled` (if start date is in the future) or `Active`.
  - `PUT /api/elections/:id`: Supports updating parameters with validation.
  - Frontend admin controls: "Publish Election" banner and button on detail view, direct "Publish" on cards, and "Edit Details" modal.

### 7. One Vote Per Election (Anonymous Ballots & Participation Separation)
- **Data Model Separation (Ballot Secrecy)**:
  - `Participation` model (`server/models/Participation.js`): tracks `{ voterId, electionId, createdAt }` with unique compound index `{ voterId: 1, electionId: 1 }` enforcing exactly one vote per voter per election at the database engine layer.
  - `Ballot` model (`server/models/Ballot.js`): stores `{ electionId, candidateId, createdAt }`. Strictly omits voter identifiers, decoupling identity from ballot choice.
- **Atomic Multi-Document Voting Transaction**:
  - `POST /api/votes` uses MongoDB multi-document transactions on replica sets to atomically execute:
    1. Validation that election is published and currently `Active`.
    2. Validation that candidate belongs to the specified election slate.
    3. Administrator check ensuring admins cannot cast ballots (`403 Forbidden`).
    4. Participation record insert.
    5. Anonymous ballot insert.
    6. Atomic increments for candidate and election vote counts.
    7. Atomic append of `VOTE_RECORDED` audit block.
  - Built-in retry loop (`MAX_RETRIES = 3` with exponential backoff) handling WiredTiger transient write conflicts, resolving collisions into deterministic `409 Conflict: You have already voted in this election`.
  - Safe compensating-write fallback: when transactions are unsupported, a sequential write sequence verifies `matchedCount === 1` on every update, tracks writes, attempts rollbacks independently, and flags manual administrator reconciliation if needed.
- **Participation Query Endpoints**:
  - `GET /api/votes/status/:electionId`: Allows voters to verify whether they have cast a ballot.
  - `GET /api/votes/my-participations`: Hydrates voter participation history across browser reloads.

### 8. Post-Election Results & Analytics Dashboard
- **Backend Results API (`GET /api/elections/:id/results`)**:
  - Accessible to all authenticated users (voters and administrators).
  - Strict confidentiality: candidate-wise tallies are sealed and inaccessible while an election is `Draft`, `Scheduled`, or `Active` (`403 Forbidden`). Neither voters nor admins can bypass this restriction.
  - Authoritative tallying: aggregates votes directly from the anonymous `Ballot` collection via MongoDB aggregation pipeline.
  - Winner determination: detects clear winners, electoral ties, and zero-vote scenarios safely without division-by-zero or `NaN` errors.
  - Turnout calculation: calculates voter turnout percentage based on registered voter counts.
- **Frontend Results Dashboard (`ElectionResultsView.jsx`)**:
  - Golden Trophy showcase card highlighting the declared winner with vote count, vote percentage share, and victory margin.
  - Electoral tie deadlock banner detailing all tied candidates with equal top vote shares.
  - Recharts visual horizontal bar chart displaying candidate vote distribution with custom tooltips.
  - Ranked candidate standings table with percentage progress bars.
  - Sealed tally indicators on candidate cards while voting is in progress.

### 9. Blockchain-Based Audit Trail & Tamper Verification
- **Cryptographic Hash-Chained Audit Ledger (`AuditBlock.js` & `blockchain.js`)**:
  - Implements a lightweight SHA-256 hash-linked ledger stored in MongoDB (`AuditBlock` collection).
  - Each block contains:
    - `index`: Sequential integer (0, 1, 2, ...).
    - `timestamp`: Date/time of event.
    - `eventType`: Event category (`GENESIS`, `ELECTION_CREATED`, `ELECTION_PUBLISHED`, `CANDIDATE_ADDED`, `CANDIDATE_REMOVED`, `VOTE_RECORDED`).
    - `electionId`: Associated election ID or `null`.
    - `previousHash`: SHA-256 hash of the immediately preceding block (Index 0 has fixed genesis hash `0000000000000000000000000000000000000000000000000000000000000000`).
    - `hash`: Current block SHA-256 hash computed deterministically from block contents.
    - `metadata`: Sanitized, non-sensitive event payload.
- **Deterministic Hashing Mechanics**:
  - Deterministic serialization formats block data into a normalized string with recursively sorted JSON keys:
    $$\text{Serialized} = \text{index} \mid \text{timestamp} \mid \text{eventType} \mid \text{electionId} \mid \text{previousHash} \mid \text{JSON.stringify}(\text{sortedKeys}(\text{metadata}))$$
  - SHA-256 hash generation:
    $$\text{Hash} = \text{SHA256}(\text{Serialized})$$
  - Any alteration to metadata, event type, timestamp, election ID, or previous hash produces a completely different hash, immediately breaking the chain.
- **Events Audited**:
  - `GENESIS`: Ledger initialization block.
  - `ELECTION_CREATED`: Recorded when an election is created.
  - `ELECTION_PUBLISHED`: Recorded when a draft election is published.
  - `CANDIDATE_ADDED`: Recorded when a candidate is nominated.
  - `CANDIDATE_REMOVED`: Recorded when a candidate is removed before voting begins.
  - `VOTE_RECORDED`: Recorded automatically when a ballot is accepted.
- **Voter Privacy & Secret-Ballot Architecture**:
  - **Zero Voter Identifiers**: Audit blocks strictly omit voter IDs, voter names, emails, passwords, and tokens.
  - **Zero Candidate Linkage**: The `VOTE_RECORDED` event records only that a ballot was cast in the election at a given timestamp. It strictly omits which candidate was selected, preserving complete secret-ballot privacy.
  - Ballot and Participation documents are decoupled from audit records.
- **Cryptographic Verification Algorithm (`verifyAuditChain`)**:
  - Read-only integrity check validating:
    1. Genesis block (Index 0) exists with valid previous hash and matching computed hash.
    2. Sequential indexing: ensures no blocks have been inserted or deleted ($index_i = index_{i-1} + 1$).
    3. Cryptographic hash linking: ensures $previousHash_i = hash_{i-1}$.
    4. Content integrity: recomputes SHA-256 hash for every block and verifies equality with stored hash.
  - Returns clear verification results: `{ isValid, totalBlocks, brokenBlockIndex, reason, message }`.
  - Read-only guarantee: never alters, overwrites, or auto-repairs corrupted records.
- **Backend Audit APIs (`server/routes/audit.js`)**:
  - `GET /api/audit/summary`: Authenticated summary (accessible to voters and admins) showing total blocks, latest hash, and genesis anchor.
  - `GET /api/audit/verify`: Admin-only endpoint executing complete cryptographic verification across all blocks.
  - `GET /api/audit/chain`: Admin-only paginated endpoint returning chronologically sorted audit blocks for inspection.
- **Frontend Blockchain Explorer (`AuditDashboard.jsx`)**:
  - Integrated into main navigation via the **Blockchain Explorer** tab.
  - **Verify Blockchain** button: triggers live backend verification, displaying interactive green/red confirmation banners.
  - KPI Stat Cards: Total Blocks, Latest Block Hash (with one-click copy), Genesis Anchor, and Chain Health status.
  - Event category filter pills (`ALL`, `VOTES`, `ELECTIONS`, `CANDIDATES`, `GENESIS`).
  - Interactive Block Timeline visualizer showing block numbers, event badges, timestamps, previous-hash linkage pointers, and formatted event payloads.

---

## Academic Prototype Limitations & Security Disclosure

> [!IMPORTANT]
> **Tamper-Evidence vs. Decentralized Immutability**:
> BlockVote's audit ledger provides mathematical **tamper-evidence**, not decentralized immutability.
> 
> Because the audit ledger is stored within a MongoDB database on an Express backend:
> - **Tamper-Evident**: Any unauthorized modification to an existing block's metadata, timestamp, or link immediately breaks the cryptographic hash chain. Running verification will identify the exact block number and reason for failure.
> - **Database Threat Model**: A malicious operator with direct, unrestricted write access to the underlying MongoDB database could theoretically alter a block and rewrite all subsequent blocks by recomputing all subsequent SHA-256 hashes.
> - **Scope**: BlockVote is an academic prototype designed to demonstrate cryptographic chaining principles. It intentionally omits proof-of-work mining, proof-of-stake consensus, peer-to-peer gossip protocols, and external cryptocurrency networks.

---

## Verification & Testing Suite

Run the automated backend test suites:

```bash
# Feature 9: Blockchain Audit Trail & Tamper Verification Suite (16 tests)
node server/scripts/test-feature9-backend.js

# Feature 8: Election Results & Analytics Suite (13 tests)
node server/scripts/test-feature8-backend.js

# Feature 7: One Vote Per Election & Transaction Reliability Suite (16 tests)
node server/scripts/test-feature7-backend.js

# Publish Workflow Suite (7 tests)
node server/scripts/test-publish-workflow.js
```

Run code quality and build checks:

```bash
# Frontend ESLint
npm --prefix client run lint

# Frontend Production Build
npm --prefix client run build

# Backend Syntax Validation
node --check server/server.js server/routes/audit.js server/routes/elections.js server/routes/votes.js server/utils/blockchain.js
```

---

## How to Configure & Run Admin Setup

To designate an administrator safely without exposing credentials or allowing public self-promotion:

1. In `server/.env`, set the designated administrator's email:
   ```env
   ADMIN_EMAIL=admin@college.edu
   ```
2. The administrator registers an ordinary voter profile through the frontend (`http://localhost:5173`) or via `POST /api/auth/register`. The account will initially receive the `voter` role.
3. The system operator executes the local promotion command from the `server` directory:
   ```bash
   npm run promote-admin
   ```
4. The script locates the registered account in MongoDB Atlas, promotes it to `admin`, and confirms the update without leaking secrets or credentials.

---

## Feature Roadmap Summary

| Feature | Target Description | Status |
| :--- | :--- | :--- |
| **Feature 1** | Live backend connection status | Completed |
| **Feature 2** | MongoDB Atlas connection & DNS resolution | Completed |
| **Feature 3** | MongoDB status indicator in React dashboard | Completed |
| **Feature 4** | Voter registration API & frontend view | Completed |
| **Feature 5** | Voter login & JWT authentication | Completed |
| **Feature 6** | Elections & candidates management (Safe Admin Provisioning) | Completed |
| **Feature 7** | One-vote-per-election enforcement (anonymous ballots) | Completed |
| **Feature 8** | Election results & post-election analytics dashboard | Completed |
| **Feature 9** | Blockchain audit trail & tamper verification | Completed |
