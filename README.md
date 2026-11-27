# M-Koba Tracker

M-Koba groups collect a fixed amount from every member each month, with a deadline such as the 28th. The money sits in M-Koba, but leaders still have to work out by hand who paid in full, who paid part, who hasn't paid, who was late, and where the money went.

This app does that for them. Leaders record deposits, or upload the M-Pesa / M-Koba statement, and get:

- **Monthly report:** required, fine, paid, balance and status (Paid / Paid late / Partial / Unpaid) for every member, downloadable as Excel or PDF.
- **Yearly summary:** each member's twelve months, totals, late months and credit, with a chart.
- **Cash book:** every shilling in and out of the group. Money going out has to be approved by a second leader. You can compare the system's balance with the real M-Koba balance.
- **Reminders:** who still owes this month (and from earlier months), with a ready-to-paste WhatsApp message.
- **Approvals:** members report their own payments with the M-Pesa code, and a leader confirms them.
- **Receipts:** a one-page PDF receipt for every payment.
- **Activity log:** who recorded, edited, approved or deleted what, and when. Entries can't be changed.
- **Kiswahili and English** across the whole app, in a dark glass design that works well on phones.

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
npm run seed            # demo group showing every feature

# 4. Start the API (http://localhost:4000)
npm run dev

# 5. In another terminal, start the web app (http://localhost:5173)
npm --prefix client install
npm run client
```

Demo logins (phone / password):

| Role          | Phone      | Password  | What to look at |
| ------------- | ---------- | --------- | --------------- |
| Leader        | 0712345678 | leader123 | Dashboard approvals, cash book, reports |
| Second leader | 0713000111 | leader123 | Approving money that the first leader recorded |
| Member        | 0754111222 | member123 | "My contributions", "I have paid", receipts |
| Admin         | 0700000001 | admin123  | All groups |

`npm run seed -- --reset` wipes the database and reloads the demo. **Never run it against real data.**

To create a real admin: `npm run create-admin -- "Full Name" 0712345678 "a-strong-password"`. A group leader can also sign up from the login page ("Register your group") without an admin.

## How it works

### Months and payments

Each month, every active member owes the group's monthly amount by the deadline day.

**Starting a month.** A month starts automatically on the 1st, or a leader can start it by hand. Automatic start can be turned off in Settings. Starting a month again only adds members who were missing, and members are not charged for months before they joined. (The server checks every hour, so a month is never skipped.)

**Payments without a month.** Each payment is spread over the member's months automatically. If the leader picked a month, that month is filled first. Otherwise it follows the group's **payment order** setting:

- **Month it was paid in first (default):** a November payment counts for November, and any extra clears older months.
- **Oldest unpaid month first:** older debts are always cleared before the current month.

One payment can cover several months. Money left over is kept as **credit** and used when the next month starts. Changing the payment order recalculates every member's months straight away.

**Late fines.** If a month is not fully paid by its deadline, its fine is added to that month's balance. A leader can waive it from the monthly report. A month's amount and fine are copied from the group settings when the month starts, so changing the settings later does not rewrite history.

Statuses are calculated whenever they are read (see the `due_status` view in [db/migrations/001_init.sql](db/migrations/001_init.sql)), so they are always up to date.

### Cash book

The cash book shows every movement of money:

- contributions (member payments)
- other money in: bank interest, adjustments
- money out: withdrawals, expenses, M-Pesa charges, payouts to members

**Approval.** Money in counts straight away. Money out stays **pending** until a different leader (or an admin) approves or rejects it. Only approved entries change the balance. If a group has only one leader, the app asks them to make a second member a leader.

**Expected balance** = opening balance + contributions + approved money in − approved money out.

Set the opening balance in Settings. It is the money that was already in M-Koba on the day you started using the system.

Use **Check balance** to type in the real figure from the M-Koba app. The system stores both numbers and shows any difference. Each month can be downloaded as an Excel or PDF statement.

### Statement upload

Upload a CSV or Excel statement. The app finds the table even if there is a title block above it, and suggests which column holds the date, amount, reference, payer details and money out. Then:

- Deposits are matched to members by phone number, including numbers inside M-Pesa's "Details" text (e.g. `Funds received from - 2557… - NAME`), or by name if exactly one member has that name.
- Withdrawals and charges (a "Withdrawn" column, or negative amounts) become **pending cash book entries** for a second leader to approve.
- A reference that is already recorded is flagged as a duplicate, so uploading the same statement twice is safe.
- Deposits with no matching member wait for a leader to assign them to someone or dismiss them.

Try it with [examples/sample-mpesa-statement.csv](examples/sample-mpesa-statement.csv).

### Trust and control

- **Member-reported payments.** A member taps "I have paid" and enters the amount, the date and the M-Pesa code. The code is refused if it has already been recorded or is already waiting. A leader checks it in M-Koba and confirms it, which records the payment, or rejects it with a reason. A leader's own report has to be confirmed by someone else.
- **Receipts.** Every payment has a PDF receipt (`RCT-000123`) showing which months it paid and what is still owed. Members can only download their own.
- **Activity log.** Every change is logged, in the same database transaction as the change itself:
  - payments, months and members
  - cash book entries, approvals and balance checks
  - imports and settings

  Leaders can filter it by area or member, and each member's page shows their own history.
- **Sessions.** Changing a password logs out every other device, and so does "Log out all other devices" in Settings. When a leader resets a member's password, that member is logged out too.
- **Login limits.** After 10 wrong passwords for the same phone number from the same device, logins are blocked for 15 minutes. Security headers come from `helmet`.

### Roles

- **Admin:** manages every group.
- **Leader:** manages their own group: members, payments, cash book, reports and approvals.
- **Member:** sees only their own record, reports payments and downloads receipts.

### Language

The app is in Kiswahili and English. The language can be switched on the login page, in the sidebar and in Settings, and the choice is saved for each user. Interface text is translated in [client/src/i18n/sw.js](client/src/i18n/sw.js). Error messages from the API and activity log summaries are in English.

## API

Every endpoint except login and registration needs an `Authorization: Bearer <token>` header. Admins add `?group_id=` to choose a group. Errors come back as `{ "error": "...", "details": [...] }`. [src/routes.rest](src/routes.rest) has an example request for each endpoint.

| Area      | Endpoints |
| --------- | --------- |
| Auth      | `POST /auth/login`, `POST /auth/register-group`, `GET/PATCH /auth/me`, `POST /auth/change-password`, `POST /auth/logout-all` |
| Groups    | `GET/POST /groups`, `GET/PUT/DELETE /groups/:id` |
| Members   | `GET/POST /users`, `GET/PUT/DELETE /users/:id` (DELETE deactivates) |
| Months    | `POST /dues/generate`, `GET /dues`, `GET/PUT/DELETE /dues/:id` |
| Payments  | `GET/POST /payments`, `GET/PUT/DELETE /payments/:id`, `GET /payments/:id/receipt` |
| Imports   | `POST /imports/preview`, `POST /imports`, `GET /imports`, `GET /imports/:id`, `POST /imports/rows/:id/assign`, `POST /imports/rows/:id/skip` |
| Cash book | `GET /cashbook/summary`, `GET /cashbook/report` (`format=xlsx\|pdf`), `GET/POST /cashbook/entries`, `POST /cashbook/entries/:id/approve`, `POST /cashbook/entries/:id/reject`, `DELETE /cashbook/entries/:id`, `GET/POST /cashbook/checks` |
| Approvals | `GET/POST /me/submissions`, `GET /submissions`, `GET /submissions/counts`, `POST /submissions/:id/approve`, `POST /submissions/:id/reject` |
| Reports   | `GET /reports/monthly`, `GET /reports/yearly` (both take `format=xlsx\|pdf`), `GET /reports/reminders`, `GET /reports/trend`, `GET /reports/members/:id`, `GET /me/summary` |
| Activity  | `GET /audit` (filter by `area`, `subject_user_id`, `actor_id`, `from`, `to`; page with `before`) |

## Tests

```bash
npm test
```

The tests rebuild the database named in `TEST_DATABASE_URL` from scratch, and refuse to run if it is the same as `DATABASE_URL`. They cover:

- both payment orders, fines and credit
- statement parsing, member matching and cash book rows
- cash book approvals and balance checks
- member-reported payments and receipts
- the activity log
- sessions and login limits
- automatic month start
- what each role is allowed to do

## Project layout

```
db/            migrations, migration runner, seed and create-admin scripts
src/
  config/      settings from .env, database pool
  jobs/        automatic month start
  middleware/  login checks, JSON error handling
  modules/     auth, groups, users, dues, payments, imports, cashbook,
               submissions, reports, audit (routes, controller, model/service)
  utils/       dates, phone numbers, validation schemas, audit log helper
client/        React web app (pages/, i18n/, charts, glass components)
tests/         vitest + supertest
examples/      sample statement to try the upload
```
