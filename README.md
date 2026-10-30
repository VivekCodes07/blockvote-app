# BlockVote — Project Status & Implementation Progress

## Project Overview
**BlockVote** is an academic prototype of a blockchain-based electronic voting system designed to demonstrate transparent, verifiable election tallies while strictly protecting voter anonymity and privacy. Individual ballot choices are never exposed through the blockchain explorer or linked to personal identities.

---

## Technology Stack

- **Frontend**: React 19, Vite 8, Lucide React icons, CSS Custom Properties (DM Sans & Space Grotesk typography)
- **Backend**: Node.js, Express 5, CORS, Dotenv, native `dns` module for configurable SRV resolution
- **Database**: MongoDB Atlas (Cloud M0 Cluster), Mongoose 9 ODM
- **Cryptography & Security**: `bcryptjs` (salt rounds: 10), native `crypto` (SHA-256 for future blockchain blocks)
- **Authentication**: `jsonwebtoken` (JWT sessions with live MongoDB role verification)

---

## Completed Features

### 1. Live Backend Connection Status
- Added dynamic health check polling against `GET /api/health` via Vite's `/api` proxy.
- Replaced static overclaims with real-time service monitoring (`Backend connected`, `Checking backend...`, `Backend offline`).
- Updated the blockchain integrity banner to display live connectivity without falsely claiming cryptographic verification.

### 2. MongoDB Atlas Connection
- Established secure environment configuration with `.env` and `.env.example`.
- Configured resilient Mongoose connection lifecycle listeners (`connected`, `error`, `disconnected`) that prevent server crashes if the database is temporarily unreachable.
- Implemented configurable DNS resolver fallback (`1.1.1.1`, `1.0.0.1`) to resolve Windows local stub resolver `ECONNREFUSED` SRV record lookup issues.
- Added `GET /api/db-status` diagnostic endpoint reporting connection states (`connected`, `disconnected`, `connecting`) and sanitized diagnostics without exposing connection URIs or credentials.

### 3. Live Database Status Indicator in Dashboard
- Integrated periodic `/api/db-status` polling (10s interval) in the React dashboard with proper unmount cleanup.
- Styled system services status card in the sidebar showing independent status dots for both **Backend** and **MongoDB**.

### 4. Voter Registration (Backend & Frontend)
- **Backend Model & Route**:
  - Created Mongoose `Voter` model (`server/models/Voter.js`) with schema validation and automatic `toJSON` transformation that strips password hashes from serializations.
  - Implemented `POST /api/auth/register` with server-side validation, duplicate email enforcement (`409 Conflict`), and bcrypt password hashing (10 salt rounds).
  - Guaranteed sanitized responses returning only `id`, `fullName`, `email`, and `createdAt`.
- **Frontend Registration View**:
  - Built a dedicated voter registration view matching the dark visual aesthetic.
  - Implemented client-side validations for required fields, email format, minimum password length (6 characters), and password matching.
  - Added loading spinner states, anti-spam duplicate submission prevention, and clear error/success feedback banners.
  - Added "Register voter" action buttons and smooth two-way navigation back to the dashboard.

### 5. Voter Login & JWT Authentication
- **Backend Route & Session Token**:
  - Implemented `POST /api/auth/login` with normalized email lookup and `bcryptjs` password verification.
  - Signed JWTs with 24-hour expiration using `JWT_SECRET`.
  - Added `GET /api/auth/me` returning the current live database record to ensure role freshness.
  - Returns generic `401 Unauthorized` responses to protect against voter email enumeration.
- **Frontend Session Management**:
  - Integrated Sign In tab alongside registration with state preservation.
  - Persists authenticated voter session safely in `localStorage` without storing passwords.
  - Automatically verifies stored session tokens on page load and clears expired sessions.
  - Displays authenticated voter name, email, and initials in the sidebar and top navigation.
  - Provides instant one-click sign-out.

### 6. Elections & Candidates Management (with Safe Admin Provisioning)
- **Safe Admin Provisioning & Dynamic Role Verification**:
  - `POST /api/auth/register` strictly assigns `role: "voter"` for all public accounts, ignoring any client-provided role or `ADMIN_EMAIL`.
  - Removed automatic promotion from login.
  - Added safe operator promotion script (`npm run promote-admin` / `node scripts/promote-admin.js`) reading `ADMIN_EMAIL` from `server/.env`.
  - `requireAdmin` and `GET /api/auth/me` query MongoDB directly on each request, ensuring revoked privileges take effect immediately without relying on stale JWT claims.
- **Election & Candidate Models**:
  - Created `Election` model (`server/models/Election.js`) with title, description, start/end dates, draft flag (`isDraft`), and pre-vote deletion protection (`voteCount`).
  - Created `Candidate` model (`server/models/Candidate.js`) with name, party/affiliation, biography, image URL, and foreign key link to election.
  - Dynamic derived statuses (`Draft`, `Scheduled`, `Active`, `Completed`) calculated on read without pre-save hook drift.
  - Draft isolation: draft elections are strictly hidden from public and voter endpoints (`GET /api/elections` and `GET /api/elections/:id`), returning 404 for non-admins while allowing authenticated administrators to review them.
  - Strict type validation: `isDraft` must be a boolean; end date must be strictly later than start date.
  - Pre-vote deletion safeguard: elections and candidates cannot be deleted once ballots have been recorded (`voteCount > 0`).
- **Frontend Elections & Candidate Slate Interface**:
  - Connected React dashboard overview and stats cards to the live `/api/elections` endpoint.
  - Built dedicated `ElectionsView` with category filter tabs (`All`, `Active`, `Scheduled`, `Completed`, `Drafts`), keyword search, and dynamic status pills.
  - Election detail view displaying complete dates, full descriptions, and candidate nomination slate with candidate cards.
  - Administrator controls (Create Election modal, Nominate Candidate modal, pre-vote Delete buttons) conditionally rendered only when `currentUser?.voter?.role === "admin"`.

### 7. One Vote Per Election (Anonymous Ballots & Participation Separation)
- **Data Model Separation (Ballot Secrecy)**:
  - `Participation` model (`server/models/Participation.js`): tracks `{ voterId, electionId, createdAt }`. Enforces a strict MongoDB unique compound index `{ voterId: 1, electionId: 1 }` to guarantee at the database storage engine layer that a voter cannot cast multiple ballots in the same election.
  - `Ballot` model (`server/models/Ballot.js`): stores `{ electionId, candidateId, createdAt }`. Strictly omits any voter identifier, user token, or IP address, decoupling who voted from which candidate was selected.
- **Atomic Multi-Document Voting Transaction**:
  - `POST /api/votes` uses MongoDB multi-document transactions on replica sets (MongoDB Atlas) to atomically execute:
    1. Validation that election exists, is published, and has derived status `Active` (rejects `Draft`, `Scheduled`, and `Completed` elections with `400 Bad Request`).
    2. Validation that candidate belongs to the specified election slate (rejects mismatched candidate IDs with `400 Bad Request`).
    3. Authorization check ensuring administrators cannot cast ballots (`403 Forbidden`).
    4. Duplicate participation check and insert into `Participation`.
    5. Anonymous ballot insert into `Ballot`.
    6. Atomic increments for `candidate.voteCount` and `election.voteCount`.
  - Built-in transaction retry loop (`MAX_RETRIES = 3` with exponential backoff) handles WiredTiger transient write conflicts during high concurrency, converting collisions into deterministic `409 Conflict: You have already voted in this election`.
  - Compensating-write fallback protects atomic consistency in standalone or non-replica deployments.
- **Participation Query Endpoints**:
  - `GET /api/votes/status/:electionId`: Authenticated endpoint allowing voters to verify whether they have cast a ballot in an election, returning `{ success: true, electionId, hasVoted, participatedAt }`.
  - `GET /api/votes/my-participations`: Authenticated endpoint returning `{ success: true, participatedElectionIds }` to hydrate the frontend on session initialization and refresh.
- **Electoral Integrity Safeguards**:
  - Pre-vote deletion and edit guards in `server/routes/elections.js` reject deleting elections (`DELETE /api/elections/:id`), deleting candidates (`DELETE /api/elections/:id/candidates/:candidateId`), reverting active elections to draft (`PUT /api/elections/:id`), or renaming nominated candidates once ballots exist (`voteCount > 0` or existing `Ballot` records).
- **Frontend Voting Interface & Anti-Duplicate UX**:
  - Real-time voter status banners on candidate slates dynamically displaying:
    - **Guest**: "Authentication Required" prompt with quick sign-in navigation.
    - **Admin**: "Administrator Account Active" explaining electoral neutrality.
    - **Eligible Voter**: "Voting is Open" call-to-action banner.
    - **Already Voted**: "Ballot Cast & Verified" confirmation with timestamp and "One Vote Limit Enforced" badge.
    - **Inactive/Scheduled/Completed**: Informative status banners explaining voting windows.
  - Candidate cards featuring "Vote for [Candidate]" buttons when eligible, and persistent "Ballot Submitted" verified badges after voting.
  - Interactive vote confirmation modal with explicit one-vote permanent commitment warnings, candidate slate summary, loading spinners, and double-click prevention.
  - Persistent session restoration: voter participation state is restored from `/api/votes/my-participations` across browser reloads.
- **Academic Prototype Privacy Limitations Disclosure**:
  - While the database separates voter participation from ballot choices across two collections, this academic prototype operates on a centralized Express server and MongoDB Atlas cluster. Correlation could theoretically be inferred by administrators with direct database access via timestamp correlation (comparing `Participation.createdAt` and `Ballot.createdAt`) or server web access logs. Full mathematical privacy in production electronic voting systems requires cryptographic techniques such as blind signatures, zero-knowledge proofs (ZKPs), or mixnets.

---

## Current Verification Status

| Component | Test Type | Status | Notes |
| :--- | :--- | :--- | :--- |
| **Backend Files** | Syntax (`node --check`) | Passed | Validated across `server.js`, `models/`, `routes/`, `middleware/`, and `scripts/`. |
| **Frontend Code** | Linting (`eslint .`) | Passed | 0 errors, 0 warnings. |
| **Production Build** | Bundling (`vite build`) | Passed | Clean production bundle generated in ~1.4s. |
| **Admin Provisioning** | Integration Test | Passed | Public register assigns `voter`, login does not promote, script promotes designated email, DB revocation denies JWT immediately (`403`). |
| **Draft Isolation** | API Test | Passed | Public and voters see only published elections; draft queries return 404; admin token unlocks drafts. |
| **Candidate CRUD & Locks** | Integration Test | Passed | Pre-vote deletion allowed; deleting election or candidate with `voteCount > 0` returns `400 Bad Request`. |
| **One Vote Per Election** | Integration Test Suite | Passed | 15/15 tests passed: duplicate rejection (`409`), multi-election support, admin voting rejection (`403`), candidate mismatch (`400`), non-active states (`400`), concurrent duplicates (1 accepted, 4 rejected `409`), ballot/participation consistency. |
| **Database Connection** | Health & Diagnostics | Passed | Live connection to Atlas `blockvote` database confirmed. |

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
   *Or from project root:*
   ```bash
   npm --prefix server run promote-admin
   ```
4. The script locates the registered account in MongoDB Atlas, promotes it to `admin`, and confirms the update without leaking secrets or credentials.

---

## Future Roadmap & Progress Log

| Feature | Target Description | Status |
| :--- | :--- | :--- |
| **Feature 1** | Live backend connection status | Completed |
| **Feature 2** | MongoDB Atlas connection & DNS resolution | Completed |
| **Feature 3** | MongoDB status indicator in React dashboard | Completed |
| **Feature 4** | Voter registration API & frontend view | Completed |
| **Feature 5** | Voter login & JWT authentication | Completed |
| **Feature 6** | Elections & candidates management (Safe Admin Provisioning) | Completed |
| **Feature 7** | One-vote-per-election enforcement (anonymous ballots) | Completed |
| **Feature 8** | Custom SHA-256 hash-linked blockchain demonstration | Planned Next |
| **Feature 9** | Blockchain integrity verification & election results | Planned |
