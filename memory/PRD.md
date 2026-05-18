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

### P3 (Denplex rebrand + Google + IMAP/SMTP)
- **Denplex ERP rebrand** — red (#DC2626) + black (#0A0A0A) theme, Denplex logo in nav/login/portal/landing, favicon, page title
- **Branded PDF letterhead** — Denplex logo top-left, red+black header band, "DENPLEX ENGINEERING COMPANY" tagline, red total bar, "Yours faithfully / Authorised Signatory · Managing Partner" footer
- **Google OAuth (Drive + Gmail)** — per-user OAuth, /api/integrations/google/{auth-url,callback,status,disconnect}
- **Drive backup** — /api/integrations/google/drive/upload + /backup-doc/{kind}/{id} for invoices/quotations/POs
- **Gmail send** — /api/integrations/google/gmail/send (user's mailbox → ends up in their Sent folder, customer replies go to them)
- **Gmail lead sync** — /api/integrations/google/gmail/sync-leads scans inbox, auto-creates leads, dedupes by message_id
- **Generic IMAP/SMTP** — /api/integrations/email-account (per-user, password hidden in GET), /api/integrations/smtp/send, /api/integrations/imap/sync-leads
- **Settings page tabs**: Company, Google (Drive+Gmail), Email Account (IMAP/SMTP), Twilio, Resend, Indiamart, TradeIndia, 2FA
- **Per-row send buttons** (8 channels): Preview · Download · Gmail · SMTP · Resend · Drive backup · WhatsApp web · Twilio WhatsApp

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
- Admin: `admin@erp.com` / `Admin@123`
