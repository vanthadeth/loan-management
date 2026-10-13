# Komjei

Loan management PWA for a family business: borrowers, loan contracts (service fee, flat interest, a late fee
as a % of the unpaid installment per late period, supervisor and collector), payments, funds, reports, and
contracts filled from Google Doc templates (Khmer or English). React + Vite + TypeScript, Supabase backend.

- Loan flow: drafted → requested → approved or denied; an approval can be reset, a request or denial returned to draft
- Supervisors and collectors only see the loans assigned to them
- `docs/finance-rules.md` the finance rules (principal protection, stored schedule, payments, late fee, refinance, audit)
- `src/` app (design system CSS in `src/styles.css`, loan maths in `src/lib/calc.ts`, contract filling in
  `src/lib/contract.ts`, both with tests)
- `supabase/migrations/` schema and row level security; `supabase/functions/admin-users/` user management;
  `supabase/functions/contract-template/` reads a shared Google Doc as HTML
- Users sign in with a username (stored as `<username>@loans.local`); admins create users and share a temporary password

```
npm install
npm run dev      # needs VITE_SUPABASE_URL / VITE_SUPABASE_KEY (see .env.example)
npm test         # loan maths and contract filling
npm run build
```
