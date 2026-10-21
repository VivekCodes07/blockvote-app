# BlockVote — Project Status & Implementation Progress

## Project Overview
**BlockVote** is an academic prototype of a blockchain-based electronic voting system designed to demonstrate transparent, verifiable election tallies while strictly protecting voter anonymity and privacy. Individual ballot choices are never exposed through the blockchain explorer or linked to personal identities.

---

## Technology Stack

- **Frontend**: React 19, Vite 8, Lucide React icons, CSS Custom Properties (DM Sans & Space Grotesk typography)
- **Backend**: Node.js, Express 5, CORS, Dotenv, native `dns` module for configurable SRV resolution
- **Database**: MongoDB Atlas (Cloud M0 Cluster), Mongoose 9 ODM
- **Cryptography & Security**: `bcryptjs` (salt rounds: 10), native `crypto` (SHA-256 for future blockchain blocks)
- **Authentication**: `jsonwebtoken` (installed, ready for session tokens)

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

---

## Current Verification Status

| Component | Test Type | Status | Notes |
| :--- | :--- | :--- | :--- |
| **Backend Files** | Syntax (`node --check`) | Passed | Validated across `server.js`, `Voter.js`, and `auth.js`. |
| **Frontend Code** | Linting (`eslint .`) | Passed | 0 errors, 0 warnings. |
| **Production Build** | Bundling (`vite build`) | Passed | Built cleanly in ~500ms. |
| **Registration API** | Integration Test | Passed | Successfully tested valid creation, duplicates (`409`), missing fields (`400`), and verified bcrypt hash in Atlas. |
| **Proxy Communication** | Proxy Verification | Passed | Vite proxies `/api/*` to Express on port 5000 cleanly. |
| **Manual UI Testing** | Browser Check | Pending | Manual verification at `http://localhost:5173`. |

---

## Next Planned Feature

### Feature 5: Voter Login & JWT Authentication
- Implement `POST /api/auth/login` to verify credentials against bcrypt password hashes.
- Issue signed JSON Web Tokens (JWT) containing non-sensitive payload data.
- Build a lightweight login interface in the React client.
- Maintain client-side authenticated voter state.

---

## Future Roadmap & Progress Log

| Feature | Target Description | Status |
| :--- | :--- | :--- |
| **Feature 1** | Live backend connection status | Completed |
| **Feature 2** | MongoDB Atlas connection & DNS resolution | Completed |
| **Feature 3** | MongoDB status indicator in React dashboard | Completed |
| **Feature 4** | Voter registration API & frontend view | Completed |
| **Feature 5** | Voter login & JWT authentication | Planned Next |
| **Feature 6** | Elections & candidates management | Planned |
| **Feature 7** | One-vote-per-election enforcement (anonymous ballots) | Planned |
| **Feature 8** | Custom SHA-256 hash-linked blockchain demonstration | Planned |
| **Feature 9** | Blockchain integrity verification & election results | Planned |
