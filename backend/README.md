# Event Check-in backend

NestJS TypeScript REST API with TypeORM and SQLite. Start with the
[root README](../README.md) for full setup, REST request/response examples,
design decisions, verification evidence, and the five-minute walkthrough.
The React manual/webcam check-in, admin dashboard, and QR display/printing
are implemented in `../frontend`.

## Existing demo: preserve it

`event-checkin.sqlite` currently has 15 tickets and two successful logs:
EVT-STANDARD-001 by QR and EVT-VIP-001 by MANUAL. Both are checked in. There
are 13 unchecked tickets remaining. Do not delete/reset the file or its logs.

## Run from the workspace root in Windows PowerShell

```powershell
cd backend
$env:NODE_ENV = 'development'
npm.cmd run start:dev
```

For a new checkout, install dependencies with `npm.cmd install` first and follow
the root README's guarded **NEW database** seed instructions. The existing
workspace needs neither another install nor a seed for a normal restart.
Use npm.cmd/npx.cmd to avoid the blocked PowerShell wrappers; do not change
execution policy. Stop the server with Ctrl+C before build/test commands.

Backend URL: http://127.0.0.1:3000/. The root route returns Hello World!.
React runs separately at http://127.0.0.1:5173/ and uses Vite's /api proxy.

## Endpoints

| Method | Path | Behavior |
| --- | --- | --- |
| GET | /api/tickets/:reference | 200 with reference/type/checkedIn/checkedInAt; 404 if unknown. No mutation. |
| POST | /api/check-ins | Body reference and method QR/MANUAL. 201 with ticket fields and method; 400 invalid fields, 404 unknown, 409 already used. |
| GET | /api/admin/tickets | 200 sorted array of public ticket fields. |
| GET | /api/admin/summary | 200 with total/checkedIn/notCheckedIn and byType counts for all three types. |

Admin endpoints are **unauthenticated** for this local MVP. Refer to the root
README for actual response examples and 400/404/409 message bodies.

## Models and transactions

Ticket has an integer primary key, required unique nonempty reference, a type
constrained to VIP/Standard/Student, checkedIn default false, and a nullable
checkedInAt datetime. CheckInLog has an integer key, required unique ticketId
foreign key, a timestamp, and method constrained to QR/MANUAL. The one-to-one
relation enforces at most one successful log per ticket. Deleting a referenced
ticket is restricted; log deletion does not cascade.

The service conditionally updates an unchecked ticket and inserts its log in
one transaction, using the same timestamp and transaction manager. Errors roll
back both. Duplicate status/unique-log violations become 409 responses.
Operations share a process-local queue to avoid overlapping transactions or
uncommitted reads on SQLite's shared TypeORM connection. A five-second SQLite
busy timeout supports a friendly 503 message if storage remains locked; other
transaction failures return a generic 500, without exposing raw SQLite errors.

SQLite needs no external database server and keeps this small local MVP simple.
The file path is anchored to backend/. Development schema synchronization is
enabled only with NODE_ENV unset or development. It is **not production-safe**;
other environments disable it, and no production migrations are included.

## Seed and test commands

`npm.cmd run seed:tickets` builds and inserts 15 stable sample references on a
new database, five per type. ON CONFLICT(reference) DO NOTHING preserves existing
status, timestamps, and logs. It is not a reset command; use the guarded setup
instructions in the root README for a new checkout.

`npm.cmd run verify:seed` asserts the initial 15-ticket, zero-check-in, zero-log
state. It is expected to fail on the current legitimate two-check-in demo. Do
not reset records to satisfy it.

```powershell
npm.cmd run build
npm.cmd run test:database
npm.cmd run test:api
npm.cmd run test:admin
```

The database tests use in-memory SQLite. HTTP suites use isolated temporary
SQLite files and compare demo rows before/after. API tests previously passed
10 reported tests, including the parent test (9 scenarios). The admin suite
previously passed 7 reported tests including its parent; it was not rerun in
the documentation review. Source files under test/ show exactly what is covered.

Recorded responses are in the ignored test-results directory. Their old demo
snapshot with zero check-ins predates the user's physical walkthrough; the live
state is now 15 total / 2 checked in / 13 remaining with two logs. The final
review preserved existing evidence, ran the final build, and used GET/SELECT
checks without sending a check-in POST, deleting data, or reseeding.

SQLite journals, dependencies, build output, build metadata, and test artifacts
are Git-ignored; source, seed code, and package lockfiles are retained. See the
root README for tooling warnings and the full acceptance record.
