# M-Koba Tracker

M-Koba groups collect a fixed amount from every member each month, with a deadline such as the 28th. The money sits in M-Koba, but leaders still have to work out by hand who paid in full, who paid part, who hasn't paid and who was late.

This app does that for them. Leaders record deposits, or upload the M-Pesa / M-Koba statement, and the app shows each member's status for every month:

- **Monthly report:** required, fine, paid, balance and status (Paid / Paid late / Partial / Unpaid) for every member, downloadable as Excel or PDF.
- **Yearly summary:** each member's twelve months, totals, late months and credit.
- **Reminders:** who still owes this month (and from earlier months), with a ready-to-paste WhatsApp message in Kiswahili or English.
- **Members** can log in and see only their own contributions.

Built with Node.js, Express 5 and PostgreSQL for the API, and React, Vite and Tailwind for the web app.

## Run it locally

You need Node.js 20+ and PostgreSQL.

```bash
# 1. Create a database (and a separate one for tests)
createdb mkoba
createdb mkoba_test

# 2. Configure: copy the example, then set DATABASE_URL, TEST_DATABASE_URL and JWT_SECRET
cp .env.example .env

# 3. Install, create the tables, and load demo data
npm install
npm run migrate
npm run seed            # demo group with every kind of payment status

# 4. Start the API (http://localhost:4000)
npm run dev

# 5. In another terminal, start the web app (http://localhost:5173)
npm --prefix client install
npm run client
```

Demo logins (phone / password):

| Role   | Phone      | Password  |
| ------ | ---------- | --------- |
| Leader | 0712345678 | leader123 |
| Member | 0754111222 | member123 |
| Admin  | 0700000001 | admin123  |

`npm run seed -- --reset` wipes the database and reloads the demo. **Never run it against real data.**

To create a real admin: `npm run create-admin -- "Full Name" 0712345678 "a-strong-password"`. A group leader can also sign up from the login page ("Register your group") without an admin.

## How it works

**Months.** A leader *starts* a month, which creates one row per active member. That row records what they owe (the group's monthly amount) and the deadline. Starting the same month again only adds members who were missing. Members are not charged for months before they joined.

**Payments.** Each payment is spread over the member's months automatically:

1. If the leader picked a month for the payment, that month is filled first.
2. Otherwise it goes to the **oldest month that still has a balance**.
3. One payment can cover several months. Money left over becomes **credit** and is used when the next month starts.

**Late fines.** If a month is not fully paid by its deadline, its fine is added to that month's balance. A leader can waive it from the monthly report. A month's amount and fine are copied from the group settings when the month starts, so changing the settings later does not rewrite history.

Statuses are calculated whenever they are read (see the `due_status` view in [db/migrations/001_init.sql](db/migrations/001_init.sql)), so they are always up to date with the latest payments.

**Statement upload.** Upload a CSV or Excel statement. The app finds the table even if there is a title block above it, and suggests which column holds the date, amount, reference and payer details. Rows are then matched to members:

- **By phone number**, including numbers inside M-Pesa's "Details" text (e.g. `Funds received from - 2557… - NAME`).
- **Otherwise by name**, if exactly one member has that name.

Withdrawals and charges are skipped. A reference that is already recorded is flagged as a duplicate, so uploading the same statement twice is safe. Rows with no matching member wait for a leader to assign them or dismiss them. Try it with [examples/sample-mpesa-statement.csv](examples/sample-mpesa-statement.csv).

**Roles.**

- **Admin:** manages every group.
- **Leader:** manages their own group's members, payments and reports.
- **Member:** sees only their own record.

## API

Every endpoint except login and registration needs an `Authorization: Bearer <token>` header. Admins add `?group_id=` to choose a group. Errors come back as `{ "error": "...", "details": [...] }`. [src/routes.rest](src/routes.rest) has an example request for each endpoint.

| Area     | Endpoints |
| -------- | --------- |
| Auth     | `POST /auth/login`, `POST /auth/register-group`, `GET /auth/me`, `POST /auth/change-password` |
| Groups   | `GET/POST /groups`, `GET/PUT/DELETE /groups/:id` |
| Members  | `GET/POST /users`, `GET/PUT/DELETE /users/:id` (DELETE deactivates) |
| Months   | `POST /dues/generate`, `GET /dues`, `GET/PUT/DELETE /dues/:id` |
| Payments | `GET/POST /payments`, `GET/PUT/DELETE /payments/:id` |
| Imports  | `POST /imports/preview`, `POST /imports`, `GET /imports`, `GET /imports/:id`, `POST /imports/rows/:id/assign`, `POST /imports/rows/:id/skip` |
| Reports  | `GET /reports/monthly`, `GET /reports/yearly` (both take `format=xlsx\|pdf`), `GET /reports/reminders`, `GET /reports/members/:id`, `GET /me/summary` |

## Tests

```bash
npm test
```

The tests rebuild the database named in `TEST_DATABASE_URL` from scratch, and refuse to run if it is the same as `DATABASE_URL`. They cover:

- how payments are spread over months
- statement parsing and member matching
- statuses, fines and credit
- what each role is allowed to do
- report totals and the Excel/PDF downloads

## Project layout

```
db/            migrations, migration runner, seed and create-admin scripts
src/
  config/      settings from .env, database pool
  middleware/  login checks, JSON error handling
  modules/     auth, groups, users, dues, payments, imports, reports
               (each with routes, controller and model/service files)
  utils/       dates, phone numbers, validation schemas
client/        React web app
tests/         vitest + supertest
examples/      sample statement to try the upload
```
