# Precision ERP — PRD

## Original Problem Statement
Build me a ERP with small scale mechanical engineering business in which Jig & fixtures manufacturing and precision machined job work is being done. Features include stock in/out/adjustment, AI bill scanning, lead management via WhatsApp + B2B website integration, Purchase Orders, Work Orders for outsource labour, SolidWorks design linking, HR linking, custom invoices, photo uploads, QC reports linked to projects/customers, ISO 9001:2015 QMS docs with revisions, AI auto-arrangement, marketing/social media, customer portal (track by PO/ref), repeated vs one-time customer segregation, accounting/taxation with CA access, granular employee permissions.

Modules requested: Manufacturing, BOM, Work Orders, Job Cards, Inventory, CRM, Quotations, Purchase Orders, GST, Accounting, HR, QC, Document attachment, User permissions, Customer portal, Mobile access.

## User Choices Confirmed
- LLM: Claude Sonnet 4.5 via Emergent Universal Key
- Auth: JWT email/password + role-based access (8 roles)
- WhatsApp: click-to-WhatsApp (wa.me) — Twilio API to be added later
- Currency: INR with India GST (CGST/SGST/IGST)

## User Personas
- **Owner/Admin** — full access, manages users, configuration
- **Manager** — production planning, work orders, BOM, customers, suppliers
- **Production / Operator** — job cards, stock movements
- **QC Inspector** — QC reports with photos
- **Accountant / CA** — accounting, GST report, expenses, invoices
- **Sales** — leads, customers, quotations
- **External Customer** — public portal track-by-reference

## Architecture
- Backend: FastAPI + MongoDB (motor), JWT auth, bcrypt
- Frontend: React + react-router + shadcn UI + Tailwind, design system "Industrial Steel"
- AI: emergentintegrations LlmChat with Claude Sonnet 4.5 for bill OCR
- Fonts: Cabinet Grotesk (display) + IBM Plex Sans (body) + JetBrains Mono

## What's been implemented (Feb 2026)
### P0 (core MVP)
- JWT auth with 8 roles (admin/manager/production/qc/accountant/ca/sales/employee), seeded admin@erp.com
- Inventory: items, stock in/out/adjust/in_process movements, low-stock alert
- AI Bill Scanner: Claude Sonnet 4.5 extracts supplier/items/GST/totals; one-click add to stock
- BOM with auto-generated Design Code + SolidWorks file URL linking
- Work Orders with customer linking + auto repeat-customer segregation
- Job Cards (operation-level tracking)
- Quotations, Purchase Orders, GST Invoices (auto CGST/SGST for intra-state, IGST for inter-state)
- CRM: Leads (B2B/website source), Customers (repeat/one_time), Suppliers — all with click-to-WhatsApp
- QC Reports with photo attachments, linked to WO + Customer
- Documents with category (ISO 9001, drawings, QC, packaging)
- Customer Portal — public lookup by WO code or PO ref → progress, job cards, QC results
- Dashboard with KPIs (open WO, QC pending, low stock, leads, customers, revenue)
- Industrial Steel design system; landing page + login + portal

### P1
- Accounting: Expenses ledger + GST input/output report (CGST/SGST/IGST split, net liability)
- HR: Employees roster + daily Attendance (present/absent/half_day/leave)
- Marketing: Multi-channel campaigns log (WhatsApp/Instagram/LinkedIn/Facebook/Email)
- ISO 9001 Document revisions: rev_no tracking + rev history viewer
- SolidWorks file URL/path field on BOM

### P2 (Twilio/Resend/PDF/B2B/GSTR/2FA/Audit)
- **Twilio WhatsApp Business** — outbound /api/whatsapp/send (creds stored in DB via Settings UI)
- **Resend email** — /api/email/send with PDF attachment support
- **PDF generation** (reportlab) — /api/invoices/{id}/pdf, /api/quotations/{id}/pdf, /api/purchase-orders/{id}/pdf
- **Indiamart sync** — /api/integrations/indiamart/sync pulls leads (last 7 days) using glusr_crm_key
- **TradeIndia webhook** — POST /api/integrations/tradeindia/webhook?token=secret → auto-creates lead, dedupes by external_id
- **GSTR-1 CSV** + **GSTR-3B CSV** — /api/accounting/gstr1.csv, /api/accounting/gstr3b.csv
- **2FA TOTP** — pyotp Google Authenticator compatible (setup/enable/disable/login flow)
- **Audit log** — captures sends, 2FA changes, integration imports
- **Admin Settings page** with Twilio + Resend + Indiamart + TradeIndia + Company GSTIN/address
- **In-app PDF preview** (iframe) + quick download/email actions on every doc row

### P3 (Denplex rebrand + Google + IMAP/SMTP) — SUPERSEDED
- **Denplex ERP rebrand** — red (#DC2626) + black (#0A0A0A) theme, Denplex logo in nav/login/portal/landing, favicon, page title
- **Branded PDF letterhead** — Denplex logo top-left, red+black header band, "DENPLEX ENGINEERING COMPANY" tagline, red total bar, "Yours faithfully / Authorised Signatory · Managing Partner" footer
- ~~Google OAuth (Drive + Gmail)~~ — REMOVED Feb 2026 per user request (caused invalid_client friction)
- ~~Microsoft Outlook OAuth~~ — REMOVED Feb 2026 per user request
- ~~Resend integration~~ — REMOVED Feb 2026 per user request

### P3.5 (Feb 2026 — Frictionless Email via App Password) ✅ CURRENT
- **Email Accounts (Gmail/Outlook/Yahoo via App Password + SMTP/IMAP)**: Each user can connect multiple mailboxes (own + central company email like sales@denplex.co). Zero Google Cloud Console setup. Just paste email + 16-char App Password.

### P3.6 (Feb 2026 — Vyapar-style Invoices + Vyapar Data Import) ✅ CURRENT
- **New Vyapar-style PDF generator** (`_build_doc_pdf`): top "ORIGINAL FOR RECIPIENT" label, company header card (logo + name + UDYAM + GSTIN + phone + email + state), Bill-To + Invoice Details two-column box, optional Ship-To, item table with HSN/SAC, Qty, Price/unit, Discount, GST, Amount, **HSN-wise Tax Summary** (CGST/SGST or IGST), Totals sidebar (Sub Total / Discount / Tax / Total in Denplex red), **Invoice Amount in Words** (Indian-English), Payment Mode, Description + Terms two-column box, Bank Details with **auto-generated UPI QR code** (via `qrcode` lib), and signatory image upload.
- **Invoice Template settings** (`GET/PUT /api/settings/invoice-template`): 21 togglable visibility flags mirroring Vyapar's "Print → Regular Printer" panel + paper size / orientation / amount-in-words locale.
- **Company settings extended**: company_phone, company_email, company_udyam, bank_name, bank_account_no, bank_ifsc, bank_branch, upi_id, signatory_image_b64, signatory_label, invoice_terms, invoice_description.
- **Vyapar Import** (`POST /api/integrations/vyapar/inspect`, `POST /api/integrations/vyapar/import`): user uploads `.vyb` / `.xlsx` / `.csv` / `.zip` / `.db`. We auto-detect format: plain SQLite (extract directly), ZIP with inner SQLite (extract & import), XLSX (heuristic column-mapping per sheet), or encrypted-unsupported (show Excel-export instructions). Imports Parties → Customers, Items → Inventory, Sale Invoices, Purchase Invoices. Dry-run option available. Dedupes by name / invoice code.
- **Frontend**: new Settings tabs "Invoice Template" (with live PDF preview iframe) and "Vyapar Import" (drag/drop upload + per-entity import toggles).
- **Updated brand assets**: higher-resolution Denplex logo extracted from user's 2026 letterhead.docx.
- Endpoints:
  - `POST /api/email/accounts` — add (auto-detects provider, real SMTP login test before persist)
  - `GET /api/email/accounts` — list user's accounts (encrypted password never returned)
  - `DELETE /api/email/accounts/{id}` — remove (auto-promotes next as default)
  - `POST /api/email/accounts/{id}/default` — set as default sender
  - `POST /api/email/accounts/{id}/test` — re-test SMTP + IMAP
  - `POST /api/email/send` — send (optional `account_id`, uses default if blank)
  - `GET /api/email/accounts/{id}/inbox?max=25` — read recent inbox (HTML snippets stripped)
  - `POST /api/email/accounts/{id}/sync-leads` — convert recent inbox to leads
  - `POST /api/email/sync-leads` — sync from ALL connected accounts (aggregated)
- Provider auto-detect: Gmail / Outlook / Yahoo / Zoho presets (smtp/imap host+port).
- Provider-aware error copy: Gmail-specific App Password URL for @gmail; Microsoft-specific URL for @outlook/@hotmail/@live; Yahoo-specific for @yahoo; etc.
- Password encryption: Fernet (key derived from JWT_SECRET via SHA-256). Stored under user-scoped collection `email_accounts`.
- **Per-row email button** consolidated to ONE icon (sends from default mailbox); WhatsApp web + Twilio WhatsApp buttons unchanged.
- **Lead sync** consolidated to ONE "Sync Email" button (aggregates all user's mailboxes); Indiamart sync button preserved.

## Backlog
### P2 (deferred)
- Twilio WhatsApp Business API for outbound automation
- Stripe/Razorpay for invoice payment links
- Real B2B website integration (Indiamart/TradeIndia connectors)
- AI auto-classification of uploaded documents
- PDF generation for quotations/invoices/POs
- Email delivery (Resend/SendGrid)
- Mobile native shell (React Native or PWA)
- SolidWorks PDM connector (deep)
- GSTR-1 / GSTR-3B export formats
- Social media direct posting via APIs
- Two-factor auth + audit logs

## Credentials
- **Owner**: `admin@denplex.co` / `Shivganesh4$` (full admin)
- **Demo sandbox**: `admin@erp.com` / `Admin@123` (for sharing without giving owner access)

## Trial Signup (added Feb 2026)
- Public form at `/trial` — collects name, company, phone, email, GSTIN, business type, purpose
- Backend: POST `/api/trial/request` (public). Admin reviews via `/app/trial-requests` → Approve/Reject
- Approval auto-creates a user with `role=trial`, `trial_expires_at = now + 30 days`, generates a `trial-<random>` temp password (copy-to-clipboard for sharing)
- **Trial role limits**: can READ everything + CREATE most modules, but global middleware blocks all PUT/PATCH/DELETE on `/api/*`
- Expired-trial guard at both login + every authenticated request → returns 403 with "contact admin@denplex.co"
- Red banner at top of dashboard for trial users showing expiry date
