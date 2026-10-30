# AICTE Security Deposit / FDR Portal (SIH26265)

Smart India Hackathon 2026 project for the AICTE Regulation Bureau. A central portal for the FDR lifecycle: submission, verification, maturity monitoring, renewal/replacement, release/refund, alerts, reporting and audit.

**Core rule:** always distinguish what an institution SUBMITTED from what a bank or authorized source CONFIRMED. Declared values live on `Fdr`, document values on `OcrExtraction`, bank values on `BankVerificationLog`. They never overwrite each other.

## Stack (strict)

- Next.js 15 App Router, TypeScript, Tailwind 4, shadcn/ui, Framer Motion, Lucide, Recharts
- **MySQL only**, through Prisma 6. No SQLite, Postgres or Mongo. Local development uses a private server on port 3307 (`scripts/local-mysql.mjs`, data in `mysql-data/`). Its data folder name must not start with a dot, or MySQL won't restart.
- The user works in IntelliJ, not VS Code or Workbench. They aren't comfortable with database setup, so handle it for them.
- JWT (`jose`) in an httpOnly cookie, `bcryptjs`, RBAC
- Local `uploads/` behind `StorageProvider`, AES-256-GCM encrypted
- `tesseract.js` for OCR, `node-cron` for the scheduler, `exceljs` and `pdfkit` for exports, `nodemailer` for email
- `next-intl` 3.x with a cookie locale (English and Hindi), no locale in URLs. Stay on 3.x: 4.x needs the native `@swc/core` binding, which fails here because npm install scripts are blocked.

## Folder structure

```
prisma/            schema, migrations, seed/
messages/          en.json, hi.json
public/images/     local SVG illustrations and photo slot README
uploads/           encrypted files (gitignored)
tests/unit/        Vitest
src/middleware.ts  session and role routing, CSRF origin check (Edge runtime)
src/instrumentation.ts  startup env validation; scheduler starts here later
src/app/(public)   landing
src/app/(auth)     login, register
src/app/(portal)   shared shell: institution/ officer/ authority/ admin/ + shared pages
src/app/api/       route handlers
src/components/    ui/ (shadcn), shell/, fdr/, common/, charts/, landing/
src/lib/           db, env, errors, rbac, nav, auth/, audit/, storage/, alerts/, bank/, dashboard/, fdr/, notifications/, ocr/, reports/, validation/
src/i18n/          next-intl request config
```

## Conventions

- Route handlers stay thin: wrap with `handler()`, validate with zod, call `requireRole()`, then call a service in `lib/`.
- `middleware.ts` is a first filter only. Every handler and page re-checks with `requireRole()` / `requirePageRole()`, which verify status and `tokenVersion` in the database.
- Every state change writes its audit entry with `appendAudit()` in the same transaction.
- FDR status changes go only through `lib/fdr/status-machine.ts`. Never set `status` from a client value.
- Edge-safe modules (`lib/auth/jwt.ts`, `lib/rbac.ts`) must not import Prisma or Node APIs.
- `validity` is calculated from `maturityDate`, not stored. `status` is the administrative state.
- `referenceNo` is the portal's globally unique ID. `fdrNumber` is the bank's number and may repeat across institutions; that's what duplicate detection looks for.
- All UI text comes from `messages/*.json`, with the same keys in both files. User data is not translated.
- Colours come from CSS tokens in `globals.css`. Green, amber and red are for status only.
- Trust badge wherever an FDR appears. Mock bank verification must be labelled as simulated in the UI.
- No plain white pages: use `bg-mesh` or a similar background.
- Animation respects `prefers-reduced-motion`.
- Users are deactivated, never deleted. No hard-coded secrets; all come from `.env`.
- `lib/fdr/service.ts` holds FDR writes. After any change to an FDR or its documents, call `syncDiscrepancies()`, which re-runs the checks and the risk score.
- Officer actions all go through `performScrutinyAction()` in `lib/fdr/scrutiny.ts`. `availableActions()` in `lib/fdr/scrutiny-rules.ts` decides both the buttons shown and what the server allows.
- Bank checks go through the `BankVerificationService` interface in `lib/bank`. The mock answers from the FDR number: one containing `NF` is not found, one containing `MM` is a mismatch.
- An automatic finding that still applies can only be waived with a note, and a waived type is not raised again. Officer notes (`ScrutinyObservation`) must never reach institution users.
- The daily job is `runAlertJob()` in `lib/alerts/job.ts`, scheduled from `instrumentation.ts`. It can run any number of times: dedupe keys and `EscalationLog` stop repeats. Keep the `process.env.NEXT_RUNTIME === "nodejs"` block in `instrumentation.ts` exactly as it is, or server-only packages break the Edge build.
- Release actions go through `performReleaseAction()` in `lib/fdr/release.ts`, with rules in `lib/fdr/release-rules.ts`. Only the competent authority can approve or reject.
- Notification text is stored as a key plus values (`encodeText()`), so it shows in the reader's language. Render it with `renderText()`.
- Charts use Recharts with one series in `--primary`, a table view beside each (`ChartTable`), and no status colours. Report files are English only, because the PDF fonts have no Devanagari.
- The audit tamper simulation (`lib/audit/simulation.ts`) really edits one row and keeps the original inside it. It's on in development and off in production unless `ALLOW_TAMPER_SIMULATION=true`.
- OCR packages (`tesseract.js`, `pdfjs-dist`, `@napi-rs/canvas`) are listed in `serverExternalPackages`. Language data ships in `@tesseract.js-data/eng`, so OCR works offline.
- Don't run `next build` while a dev server is up, because they share `.next`. Set `NEXT_DIST_DIR=.next-verify` for the build instead.
- Audit payload is canonical JSON in a `LongText` column, because MySQL's `JSON` type reorders keys and would break hashes.

## Working rules

- Hosting: local with `npm run local`, and Render (`npm start` runs `scripts/deploy-start.mjs`) with an external MySQL and `STORAGE_DRIVER=database`. Render installs production packages only, so anything needed to build or run must be in `dependencies`.
- Work in phases and stop after each for review.
- Don't commit unless asked.
- Keep this file updated as the project grows.

## Commands

```
npm run dev | build | typecheck | test
npx prisma migrate dev
npx prisma db seed
npm run db:start | db:stop
npm run local | local:stop                   (production mode on this computer, built into .next-local)
node tests/live-check.mjs                    (app running, fresh seed)
npx tsx --env-file=.env tests/db-check.ts
npx tsx --env-file=.env tests/institution-check.ts   (app running, fresh seed)
npx tsx --env-file=.env tests/officer-check.ts       (app running, fresh seed)
npx tsx --env-file=.env tests/alerts-check.ts        (app running, fresh seed)
npx tsx --env-file=.env tests/admin-check.ts         (app running, fresh seed)
npx tsx --env-file=.env tests/scenarios-check.ts     (app running, fresh seed, then reseed: the six brief scenarios)
node tests/hindi-check.mjs                           (app running: lists English left on Hindi pages)
```

## Status

- [x] Phase 1: setup, schema, seed, auth + RBAC, layout shell
- [x] Phase 2: landing, login, register design
- [x] Phase 3: institution flow
- [x] Phase 4: officer flow
- [x] Phase 5: alerts, release workflow, calendar
- [x] Phase 6: management and admin dashboards, reports, audit UI, Hindi
- [x] Phase 7: polish and scenario testing
