# Event Check-in System

A one-week assignment MVP: find an event ticket manually or scan its QR code,
review it, and confirm admission once. An admin dashboard lists tickets, counts
arrivals by ticket type, and displays printable reference-only QR codes.

## Current demo state: preserve these records

The existing `backend/event-checkin.sqlite` contains **15 tickets: 5 VIP, 5
Standard, and 5 Student**. The user completed the physical browser walkthrough:

| Reference | Entry method | Current status | Recorded timestamp (UTC) |
| --- | --- | --- | --- |
| EVT-STANDARD-001 | QR | Checked in | 2026-10-14T17:24:32.172Z |
| EVT-VIP-001 | MANUAL | Checked in | 2026-10-14T17:27:03.555Z |

Final read-only review confirmed **15 total, 2 checked in, 13 not checked in**,
with one checked-in VIP, one Standard, and zero Students. Each used ticket has
exactly one log with the same timestamp. Keep this database and its logs. Do not
delete, reset, or recreate it to repeat a demo. QR generation, lookup, and printing
do not change status; confirmation does.

## Prerequisites

- Windows PowerShell and Node.js/npm. The verified environment is **Node.js
  v24.13.0 and npm 11.6.2**.
- VS Code or another editor, with two terminals.
- Chrome or Edge and a usable webcam for physical scanning. The automated browser
  suite specifically uses locally installed **Google Chrome**.
- Internet access for the initial dependency install. No database server, Docker,
  API keys, or external service accounts are required.

Some installed Nest CLI transitive dependencies warn that Node 24.15.0 or newer
is required on the Node 24 line. Builds passed on the verified environment; the
engine warnings remain a tooling compatibility limitation. No dependency or Node
upgrade was performed during the final review.

## Folder structure

```text
Event-Checkin-System/
├── README.md
├── .gitignore
├── frontend/                     React JavaScript + Vite
│   ├── src/
│   │   ├── App.jsx               Navigation and shared shell
│   │   ├── CheckInScreen.jsx     Lookup, review, confirmation
│   │   ├── CameraScanner.jsx     Webcam lifecycle and QR decoding
│   │   ├── AdminDashboard.jsx    Counts, ticket list, refresh
│   │   ├── TicketQR.jsx          Reference-only QR and print dialog
│   │   └── api.js                Relative /api requests and error messages
│   ├── tests/                    Isolated Playwright browser tests
│   ├── vite.config.js            Development /api proxy
│   └── package.json
└── backend/                      NestJS TypeScript + TypeORM
    ├── src/
    │   ├── app.module.ts
    │   ├── tickets/              Entity, service, module, ticket/admin controllers
    │   ├── check-in-logs/         Log entity, request pipe, check-in controller
    │   └── database/             Shared configuration, seed, initial-state check
    ├── test/                     Database and HTTP integration tests
    ├── event-checkin.sqlite      Local runtime data, Git-ignored
    └── package.json
```

`node_modules/`, `dist/`, and `test-results/` are generated and Git-ignored.
Keep both package lockfiles so installs retain the recorded dependency resolution.
There is no root package script: run commands in the indicated subfolder.

## Install dependencies

From the workspace root, once per new checkout:

```powershell
node --version
npm.cmd --version
npm.cmd --prefix backend install
npm.cmd --prefix frontend install
```

Use **npm.cmd** and **npx.cmd**, rather than their PowerShell `.ps1` wrappers.
If PowerShell reports `npm.ps1 cannot be loaded because running scripts is
disabled`, replace `npm` with `npm.cmd` in the command. Do not change the
PowerShell execution policy.

## Seed a NEW database only

Skip this section for the existing demo database. With the backend stopped,
from the workspace root:

```powershell
cd backend
$env:NODE_ENV = 'development'
if (Test-Path .\event-checkin.sqlite) {
    Write-Host 'Existing database preserved; initial seed skipped.'
} else {
    npm.cmd run seed:tickets
}
cd ..
```

The seed command builds the backend and creates 15 samples in a new database:

- `EVT-VIP-001` through `EVT-VIP-005`.
- `EVT-STANDARD-001` through `EVT-STANDARD-005`.
- `EVT-STUDENT-001` through `EVT-STUDENT-005`.

Each starts unchecked with a null timestamp. References are stable and unique.
The seed uses a transaction and `ON CONFLICT(reference) DO NOTHING`, so reruns
insert missing sample references without updating existing tickets or deleting
logs. It is not a reset command. SQLite data is not committed; a new checkout
needs this initialization before its first walkthrough.

`npm.cmd run verify:seed` in `backend/` asserts the initial 15/0/0 ticket/check-in/log
state. It is only useful immediately after a fresh seed. **It is expected to fail
on the current database with two legitimate check-ins; do not reset data to make
that initial-state assertion pass.**

## Run the app in two VS Code terminals

Start both terminals at the workspace root. Dependencies are already installed
in the current workspace; no install or seed is needed for a normal restart.

Terminal 1 — backend:

```powershell
cd backend
$env:NODE_ENV = 'development'
npm.cmd run start:dev
```

Terminal 2 — frontend:

```powershell
cd frontend
npm.cmd run dev
```

- Browser: **http://127.0.0.1:5173/**.
- Backend: **http://127.0.0.1:3000/** (`Hello World!` starter response).
- Summary: **http://127.0.0.1:3000/api/admin/summary**.

Stop each server with Ctrl+C. Run build/test commands with the backend watch
server stopped to avoid concurrent compilation of `dist/`.

Vite proxies relative `/api` requests to `http://127.0.0.1:3000`. The browser
uses one origin, so local development needs no backend CORS changes. The proxy
is development configuration, not a deployment configuration. `vite preview`
does not supply this configured development proxy; use `npm.cmd run dev` for the
local assignment walkthrough. No deployed API URL is embedded in client code.

## Using the screens

**Check-in:** type the reference and select Find ticket, or select Scan QR code
and allow camera access. A successful scan stops the camera and looks up the
reference once. Review type/status/time, then select Confirm check-in. Finding
or scanning alone never checks in a ticket. Confirmation is disabled while
pending. The app distinguishes invalid input, unknown tickets, duplicates,
unavailable backend, camera permission denial, and missing cameras. Manual
entry remains usable after camera failure.

**Admin Dashboard:** totals, checked-in counts per type, and every ticket sorted
by reference. Navigating to the dashboard and selecting Refresh fetch current
backend data. On small screens the ticket table scrolls horizontally.

**View QR / Print ticket:** display a QR and printed reference for any ticket,
including used tickets. Print CSS hides the dashboard and controls. To use a
phone as the QR display, transfer a screenshot of the QR to the phone and show
the image to the computer's webcam. The frontend binds to computer loopback;
the computer's localhost URL is not a phone-hosted page.

## Short design decisions

### Architecture and SQLite choice

```text
React UI -> Vite /api proxy -> NestJS controllers -> TicketsService -> TypeORM -> SQLite
```

SQLite keeps the one-week local MVP easy to run: no database service or credentials,
one durable file, and real foreign-key, uniqueness, check, and transaction support.
The file path is anchored to `backend/`, rather than the shell's current directory.
This fits a small assignment walkthrough; it is not a claim of production readiness
or suitability for many concurrent writers.

### Entities

| Entity | Fields and constraints |
| --- | --- |
| Ticket (`tickets`) | Generated integer `id`; required unique nonempty `reference`; `type` constrained to VIP/Standard/Student; `checkedIn` boolean default false; nullable `checkedInAt` datetime. |
| CheckInLog (`check_in_logs`) | Generated integer `id`; required unique `ticketId` foreign key; required `checkedInAt`; `method` constrained to QR/MANUAL. |

One ticket has **zero or one successful check-in log**. The owning TypeORM
one-to-one relation puts a unique constraint on `ticketId`. Deleting a ticket
with a log is restricted; no cascading log deletion is configured.

### References, QR codes, and one check-in API

`TicketQR.jsx` passes only `ticket.reference` to `QRCodeSVG`. No URL, JSON, type,
status, or image is stored in the QR payload or database. Black-on-white rendering,
a quiet zone, and the displayed reference support scanning and manual fallback.
The current rendering uses QR version 2 minimum and high error correction; all
15 generated samples were decoded in automated tests.

The scanner produces the same string a person types. Both flows call the same
GET lookup and POST check-in endpoint; only the recorded method differs. This
keeps business rules and duplicate prevention on the server.

### Transactions and duplicate prevention

`TicketsService.checkIn()` conditionally updates a matching unchecked ticket,
then inserts its log using the same transaction manager and timestamp. Any
failure rolls back the update and log together. No matching ticket gives 404;
an already-checked-in ticket gives 409. The unique log foreign key is a second
database guard. Raw SQLite transaction errors are not returned to API users.

This single-instance SQLite MVP queues API database operations on TypeORM's
shared connection, including reads, so they cannot observe an uncommitted ticket
update. The queue recovers after errors. It is a process-local queue, not a
distributed lock. SQLite also has a five-second busy timeout and a friendly 503
response if storage remains busy.

## REST API

Base URL: `http://127.0.0.1:3000`. React calls equivalent relative `/api` paths.
JSON dates are ISO UTC strings or null; the UI formats dates in browser local time.

| Method | Path | Success | Purpose |
| --- | --- | --- | --- |
| GET | `/` | 200 text | Starter availability response. |
| GET | `/api/tickets/:reference` | 200 JSON | Read one ticket without changing status. |
| POST | `/api/check-ins` | 201 JSON | Atomically check in once and create the log. |
| GET | `/api/admin/tickets` | 200 JSON array | All public ticket fields, sorted by reference. |
| GET | `/api/admin/summary` | 200 JSON | Overall and per-type counts, including types with zero tickets. |

### Lookup

Actual final-review response to `GET /api/tickets/EVT-STANDARD-001` (HTTP 200):

```json
{
  "reference": "EVT-STANDARD-001",
  "type": "Standard",
  "checkedIn": true,
  "checkedInAt": "2026-10-14T17:24:32.172Z"
}
```

For an unchecked ticket, `checkedIn` is false and `checkedInAt` is null. Matching
is exact and case-sensitive; manual UI entry trims surrounding whitespace.

### Check-in

Request body (Content-Type: application/json):

```json
{"reference":"EVT-VIP-001","method":"MANUAL"}
```

Use `"method":"QR"` for a scanned reference. Recorded HTTP 201 response from the
isolated API test fixture (not the preserved live demo's timestamp):

```json
{
  "reference": "EVT-VIP-001",
  "type": "VIP",
  "checkedIn": true,
  "checkedInAt": "2026-10-14T17:05:28.487Z",
  "method": "MANUAL"
}
```

The current live `EVT-VIP-001` is already used, so that request now returns 409.
For a future live success demo, first find an unused ticket such as EVT-VIP-002;
confirming it will permanently add a legitimate check-in to this local database.

### Dashboard responses

`GET /api/admin/tickets` returns an array of objects with the same four fields as
the lookup example above; it does not include database IDs or log rows. Example
record for an unchecked ticket:

```json
{"reference":"EVT-STANDARD-002","type":"Standard","checkedIn":false,"checkedInAt":null}
```

Actual final-review `GET /api/admin/summary` response (HTTP 200):

```json
{
  "total": 15,
  "checkedIn": 2,
  "notCheckedIn": 13,
  "byType": [
    {"type":"VIP","total":5,"checkedIn":1,"notCheckedIn":4},
    {"type":"Standard","total":5,"checkedIn":1,"notCheckedIn":4},
    {"type":"Student","total":5,"checkedIn":0,"notCheckedIn":5}
  ]
}
```

### Error cases

| Status | Trigger | Message |
| --- | --- | --- |
| 400 | Missing/blank/nonstrings in `reference` | `reference must be a nonempty string.` |
| 400 | Missing method, `qr`, or any value other than QR/MANUAL | `method must be QR or MANUAL.` |
| 400 | Body is not a JSON object | `Request body must be a JSON object.` |
| 404 | Unknown reference in lookup or check-in | `Ticket not found.` |
| 409 | Ticket already used, including a close duplicate request | `Ticket has already been checked in.` |
| 503 | SQLite still busy after waiting | `Check-in storage is busy. Please try again.` |
| 500 | Unexpected transaction failure | `Unable to complete check-in. Please try again.` |

For example, POSTing `{"reference":"EVT-VIP-002","method":"INVALID"}` gives 400:

```json
{"message":"method must be QR or MANUAL.","error":"Bad Request","statusCode":400}
```

Unknown `UNKNOWN` gives 404:

```json
{"message":"Ticket not found.","error":"Not Found","statusCode":404}
```

A repeated check-in gives 409:

```json
{"message":"Ticket has already been checked in.","error":"Conflict","statusCode":409}
```

The UI also handles network failures and request timeouts. If a confirmation
request loses its response, find the ticket again before retrying: the server
may already have committed it.

## Verification evidence

### Automated tests: previously executed, separate from physical checks

| Command and working directory | Actual recorded result | Scope |
| --- | --- | --- |
| `npm.cmd run test:e2e` in frontend | **14 passed**, zero failed/skipped/flaky | Existing 8 check-in cases plus 6 dashboard/QR cases in headless Chrome. |
| `npm.cmd run test:api` in backend | **10 reported tests passed**, including parent test | 9 HTTP scenarios: lookup, MANUAL/QR, 400/404/409, simultaneous requests, matching logs, forced-failure rollback, unchanged demo rows. |

The frontend suite's saved result is
`frontend/test-results/browser-results.json` (recorded 2026-10-14). All **15**
rendered SVG QR codes decoded to their exact reference using the **real ZXing
image reader**. Webcam lifecycle cases use simulated media/decoder callbacks.
Print tests intercept the print button and emulate print CSS. Neither is a
physical camera or paper-printing test.

Tests use uniquely named temporary SQLite files and remove them afterward.
The saved `frontend/test-results/database-verification.json` and
`backend/test-results/api-verification.json` describe isolated test runs. Their
old demo snapshot of zero check-ins predates the user's physical walkthrough;
it does not describe the current two-check-in database. No evidence files were
deleted or replaced during this documentation review.

### User-reported physical browser checks

The user explicitly confirmed these observations in their own browser:

- Initial dashboard: 15 total, zero checked in, five of each type.
- A physical webcam scanned EVT-STANDARD-001 and displayed Ready to check in.
- QR confirmation succeeded with a timestamp; a second attempt showed Already
  checked in.
- Manual confirmation of EVT-VIP-001 succeeded.
- Dashboard refresh then showed 15/2/13, with Standard 1, VIP 1, Student 0 checked in.
- The actual browser print preview showed the selected QR and printed reference
  without the dashboard.

These are user-reported manual acceptance results, not automated camera claims.
**Physical paper output has not been confirmed.** No new manual screenshots or
performance measurements are claimed. The final read-only API/database review
independently confirmed the two stored tickets and matching log timestamps.

### Final documentation review commands

From the workspace root:

```powershell
npm.cmd --prefix frontend run build
npm.cmd --prefix backend run build
```

Both final builds passed. No application code changed, so the previously passing
suites were inspected rather than broadly rerun. The review used GET requests
and database SELECTs only; it sent no check-in POST, seed, reset, or delete.

## Five-minute presentation and code walkthrough

Prepare a QR for an unused ticket on a second screen before presenting. Keep
the two verified check-ins. Additional successful live demos add records; they
should not be undone.

| Time | What to explain/show | Code to open |
| --- | --- | --- |
| 0:00–0:30 | Goal: admit each valid ticket once, by reference or QR, and track arrivals. Show navigation. | `frontend/src/App.jsx` |
| 0:30–1:00 | React → Vite proxy → Nest REST → TypeORM → local SQLite. Explain why no separate DB server is needed. | `frontend/src/api.js`, `frontend/vite.config.js`, `backend/src/app.module.ts` |
| 1:00–1:40 | Ticket reference/type/status/time; log relationship/method/time; one successful log per ticket. Show stable 5/5/5 seed references. | `backend/src/tickets/ticket.entity.ts`, `backend/src/check-in-logs/check-in-log.entity.ts`, `backend/src/database/seed-tickets.ts` |
| 1:40–2:25 | Manual demo: find unused EVT-VIP-002, review, confirm once. Acknowledge the live record change. | `frontend/src/CheckInScreen.jsx` |
| 2:25–3:15 | QR demo: show EVT-STANDARD-002's View QR/print option, scan it, review, confirm. QR payload is only its reference. | `frontend/src/TicketQR.jsx`, `frontend/src/CameraScanner.jsx` |
| 3:15–3:45 | Find/scan a used ticket again. Explain UI duplicate message, HTTP 409, conditional update, transaction rollback, and unique log key. | `backend/src/tickets/tickets.service.ts`, `backend/src/check-in-logs/check-in-request.pipe.ts` |
| 3:45–4:15 | Open dashboard and Refresh; show totals, per-type arrivals, sorted rows. If both extra demos succeeded and nothing else changed, expect 4 checked in and 11 remaining (VIP 2, Standard 2, Student 0). | `frontend/src/AdminDashboard.jsx`, `backend/src/tickets/admin.controller.ts` |
| 4:15–5:00 | Summarize automated vs physical evidence; explain unauthenticated local scope, development sync, and future production needs. | `frontend/tests/admin-dashboard.spec.js`, `backend/test/check-in-api.integration.mjs`, `backend/src/database/database.config.ts` |

If a suggested ticket has since been used, pick another unchecked ticket shown
by the dashboard. Do not reset records to recreate an initial count.

## Troubleshooting and limitations

- **npm.ps1 blocked:** use `npm.cmd`/`npx.cmd`. No execution-policy change needed.
- **Port in use:** stop the existing server in its terminal with Ctrl+C. Backend
  normally uses 3000; Vite requires 5173. Do not start duplicate instances.
- **Backend unavailable:** keep both terminals running; verify
  `http://127.0.0.1:3000/`, then retry via the frontend. Use the Vite dev server.
- **No tickets on a fresh checkout:** stop the backend and run the guarded NEW
  database seed instructions above. Existing used tickets are not a seed error.
- **Camera denied/missing/busy:** allow browser and Windows camera access, close
  another camera app, or use manual entry. Camera access requires localhost or
  HTTPS. This walkthrough does not configure mobile LAN hosting or HTTPS.
- **Initial seed check fails after use:** expected once there are legitimate
  check-ins. Preserve records and inspect dashboard/log state instead.
- **No authentication:** both the admin UI and APIs are unauthenticated. There
  is no claim that ticket references provide production security.
- **Development schema sync:** enabled only when NODE_ENV is unset or
  `development`. Other values disable synchronization. Entity changes with sync
  enabled can alter data. No reviewed migrations are included; synchronization
  is **not production-safe**. A real deployment needs migrations and backups.
- **Single-instance MVP:** no distributed locking, production load testing,
  authorization, or deployment configuration is supplied. No production-readiness
  claim is made.
- **Dependency warnings:** prior backend installation reported 5 vulnerabilities
  (2 low, 1 moderate, 2 high), engine warnings, and deprecated transitive packages.
  That is the last reported audit, not a new final audit. QR decoder tests emitted
  nonblocking source-map warnings; builds and tests passed. No audit fix or upgrade
  was run in this review.

## Git exclusions and evidence preservation

The root and package `.gitignore` files exclude SQLite files/journals,
node_modules, dist, TypeScript build metadata, test-results, Playwright reports,
coverage, and generated logs. This does not delete local data or evidence.
Package lockfiles, source, seed scripts, and documentation remain eligible for Git.

The supplied workspace is not currently a Git repository. Ignore patterns were
checked in an isolated temporary Git fixture without initializing this workspace.
If files were already tracked in another repository, ignore rules alone would
not remove them from that index; review tracking before committing.

## Assignment coverage

| Requirement | Implementation |
| --- | --- |
| ReactJS UI and dashboard | `CheckInScreen.jsx`, `CameraScanner.jsx`, `AdminDashboard.jsx` |
| NestJS REST API | Ticket, check-in, and admin controllers under `backend/src/` |
| Database and models | SQLite + TypeORM Ticket and CheckInLog entities |
| 10–15 typed sample tickets | Idempotent seed creates exactly 15 on a new database, five per type |
| Ticket QR codes | Reference-only `QRCodeSVG`, View QR, selected-ticket print view |
| Manual/webcam admission | Shared lookup/confirmation API with MANUAL/QR log method |
| Duplicate prevention | Conditional update, atomic transaction, unique log foreign key, HTTP 409 |
| Dashboard statuses/counts | Read-only list/summary API plus navigation refresh and Refresh button |
| Local setup/design decisions | This README and package READMEs |
| System/code presentation | Timed walkthrough above, with source locations and evidence |

Backend details: [backend/README.md](backend/README.md). Frontend details:
[frontend/README.md](frontend/README.md).
