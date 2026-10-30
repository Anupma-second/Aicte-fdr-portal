# AICTE Security Deposit / FDR Portal

Smart India Hackathon 2026, problem statement SIH26265. A central portal for submitting, verifying, monitoring, renewing and releasing institution security deposits and Fixed Deposit Receipts.

> A prototype. All data is synthetic, and bank verification is simulated.

## Setup

You need Node.js 20 or later and MySQL 8.0 or 9.x installed on Windows. The project can run its own private MySQL, so you don't need a database login or admin rights.

**1. Configure the environment.** Copy `.env.example` to `.env` and fill in `JWT_SECRET` and `FILE_ENCRYPTION_KEY`. The file explains how to generate them. Leave `DATABASE_URL` as it is.

**2. Install and run.**

```bash
npm install
npm run db:start
npx prisma migrate dev
npx prisma db seed
npm run dev
```

Open http://localhost:3000. These commands work from IntelliJ's terminal.

`npm run db:start` creates a MySQL server on port 3307 with its data in `mysql-data/`, and saves a generated password to `.env`. It uses your installed MySQL program but leaves your other servers and their data alone. `npm run dev` starts it automatically after a restart, and `npm run db:stop` stops it.

**Using your own MySQL server instead:** create a database and put its address in `DATABASE_URL`. The private server is then skipped.

## Run it on this computer (production mode)

No online database or hosting is needed. One command sets up the private database, adds demo data if it's empty, builds the app and starts it:

```bash
npm run local
```

Open http://localhost:3000. Press Ctrl+C to stop, or run `npm run local:stop` if it's running in another window.

Your data and uploaded files stay in `mysql-data/` and `uploads/` between runs. Only this computer can open the app, and logins work at `localhost`, not from other devices. The demo accounts box doesn't appear in this mode, so use the accounts listed below.

## Deploy on Render

Render needs a MySQL database somewhere else, such as Aiven. Use a database of its own for this project.

- **Build command:** `npm install; npm run build`
- **Start command:** `npm start`
- **Environment:** `DATABASE_URL`, `JWT_SECRET`, `FILE_ENCRYPTION_KEY`, `STORAGE_DRIVER=database` and, for demo data, `DEMO_SEED=true`

`STORAGE_DRIVER=database` keeps encrypted documents in MySQL, because the free plan wipes its disk on restart. `DEMO_SEED=true` adds demo data only when the database is empty. The demo accounts have a published password, so remove them before any real use.

On the free plan the app sleeps when idle, so the 6:00 AM alert check won't run reliably. Admins can use **Run check now** instead.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | `mysql://user:password@localhost:3306/aicte_fdr`. URL-encode special characters in the password. |
| `JWT_SECRET` | Yes | Signs session cookies. At least 32 characters. |
| `FILE_ENCRYPTION_KEY` | Yes | AES-256 key for stored documents, 64 hex characters. Changing it makes existing uploads unreadable. |
| `UPLOAD_DIR` | No | Encrypted file location. Defaults to `uploads`. |
| `ALLOW_TAMPER_SIMULATION` | No | Set to `true` to allow the audit tamper demo in production. It's always available in development. |
| `SMTP_*` | No | Mail server. Without `SMTP_HOST`, emails are logged to the console. |

## Demo accounts

Password for all four: `Demo@12345`

| Role | Email |
|---|---|
| Institution | `institution@demo.test` |
| Scrutiny Officer | `officer@demo.test` |
| Competent Authority | `authority@demo.test` |
| Admin | `admin@demo.test` |

`npx prisma db seed` wipes the database and recreates this data. It refuses to run when `NODE_ENV=production`.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript check |
| `npm test` | Unit tests |
| `node tests/live-check.mjs` | Login and role checks against the running app. Run on fresh seed data, because it creates a test account and locks one address out. |
| `npx tsx --env-file=.env tests/db-check.ts` | Seed data, audit chain and encryption checks against the database |
| `npx tsx --env-file=.env tests/institution-check.ts` | The full institution flow against the running app. Run on fresh seed data, then reseed. |
| `npx tsx --env-file=.env tests/officer-check.ts` | The full scrutiny officer flow against the running app. Run on fresh seed data, then reseed. |
| `npx tsx --env-file=.env tests/alerts-check.ts` | Alerts, escalation, release workflow, notifications and calendar against the running app. Run on fresh seed data, then reseed. |
| `npx tsx --env-file=.env tests/admin-check.ts` | Reports, audit integrity, user management and reassignment against the running app. Run on fresh seed data, then reseed. |
| `npx tsx --env-file=.env tests/scenarios-check.ts` | The six scenarios from the brief, start to finish. Run on fresh seed data, then reseed. |
| `node tests/hindi-check.mjs` | Lists English text left on pages viewed in Hindi. |

## 5-minute demo script

Before you start, reset the demo data and start the app:

```bash
npx prisma db seed
npm run dev
```

The password for every account is `Demo@12345`. A browser window for each role makes switching faster.

| Time | Who | What to do | What to say |
|---|---|---|---|
| 0:00 | Public | Open the landing page. Click through the lifecycle explorer and drag the maturity slider. | Deposits are tracked today in scattered records. This is one place for the whole lifecycle. |
| 0:30 | Public | In **Track an FDR**, click a demo reference. | Anyone can check a status, but amounts and names stay private. |
| 0:45 | `institution@demo.test` | **Submit new FDR**, then upload a receipt image. The form fills in. Change the amount and submit. | OCR saves typing. It starts as self-declared, because nobody has confirmed it yet. |
| 1:30 | Institution | On the FDR page, show **Submitted vs confirmed** and the red amount, then the discrepancy that was raised automatically. | The portal never mixes what was submitted with what was confirmed. |
| 2:00 | `officer@demo.test` | Open the dashboard queue and hover over a risk level. Open an FDR under scrutiny, then **Mark documents verified**, **Verify with bank (simulated)** and **Approve as verified**. | Riskiest cases first, and the score explains itself. The bank check is simulated and can be swapped for a real API. |
| 3:00 | `admin@demo.test` | On the dashboard, click **Run check now**. | Reminders go at 90, 60, 30 and 7 days. Overdue cases climb to the officer, then the authority. |
| 3:20 | `authority@demo.test` | Show the notifications, KPIs and charts. Open the **Release approval queue**, then an FDR, and approve it. | Only the competent authority can release a deposit, and every step is enforced on the server. |
| 4:00 | Authority | Open **Maturity calendar** and click a dark day. Open **Reports** and download a PDF. | Clusters are visible in advance, and reports take one click. |
| 4:30 | `admin@demo.test` | In **Audit log**, click **Verify integrity**, then **Tamper simulation**, then **Verify integrity** again. Finish with **Restore the entry**. | Every action is chained. Even someone with database access can't change the past unnoticed. |
| 4:50 | Any | Switch to Hindi and dark mode from the top bar. | It works in English and Hindi, on phones too. |

**To show a failed bank check,** submit an FDR number containing `NF` (not found) or `MM` (mismatch), then run the bank check as the officer.

**After the demo,** run `npx prisma db seed` to put everything back. It wipes the database and any uploaded files.

## Simulated bank verification

No real bank is contacted. The mock in `src/lib/bank` answers from the FDR number, so results repeat:

- A number containing `NF` is not found.
- A number containing `MM` is a mismatch.
- Other numbers: about 10% not found, 10% mismatch, the rest confirmed.

To connect a real bank, implement the `BankVerificationService` interface and return it from `getBankVerificationService()`.

## Alerts and email

A daily check runs at 6:00 AM India time while the app is running. An admin can also run it from the Admin dashboard with **Run check now**, and change the reminder and escalation rules there. Running it again doesn't send anything twice.

Without `SMTP_HOST` in `.env`, emails are written to the app's console instead of being sent. To send real email, fill in the `SMTP_*` values, for example with a Gmail app password or a Brevo account.

## Reports and audit trail

Officers, authorities and admins can download five reports as Excel or PDF from **Reports**. Report files are in English, and each download is recorded in the audit log.

**Audit log** is for authorities and admins. **Verify integrity** recalculates the whole hash chain. Admins also get **Tamper simulation**, which really changes one stored entry so the check can catch it, then **Restore the entry** puts it back.

## Known limits

- Bank verification is simulated. No bank is contacted.
- OCR reads only the first page of a PDF, and has been tested on clean sample files. Real phone photos may read less accurately, so people should always check what it fills in.
- Emails go to the console until SMTP is set up.
- The daily check runs only while the app is running, and doesn't catch up on missed days.
- A new FDR with one discrepancy can still show low risk, because each open discrepancy adds 15 points.
- Report files are in English.
- Some packages have published security advisories whose fixes need major upgrades (`next`, `next-intl`, `prisma`, `zod`, `exceljs`). They were reviewed for this prototype, not fixed. Upgrade them before any real deployment.
- Before any real deployment, also replace the demo accounts, set `ALLOW_TAMPER_SIMULATION` to false, and move the private MySQL to a managed server.
