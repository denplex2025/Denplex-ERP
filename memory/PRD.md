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

### P1 (added in same session)
- Accounting: Expenses ledger + GST input/output report (CGST/SGST/IGST split, net liability)
- HR: Employees roster + daily Attendance (present/absent/half_day/leave)
- Marketing: Multi-channel campaigns log (WhatsApp/Instagram/LinkedIn/Facebook/Email)
- ISO 9001 Document revisions: rev_no tracking + rev history viewer
- SolidWorks file URL/path field on BOM

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
