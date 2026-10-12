# Komjei

Loan management PWA for a family business: borrowers, loan contracts (service fee, flat interest,
per-contract late fee, supervisors), payments, funds, reports. React + Vite + TypeScript, Supabase backend.

- `src/` app (design system CSS in `src/styles.css`, loan maths in `src/lib/calc.ts` with tests)
- `supabase/migrations/` schema and row level security; `supabase/functions/admin-users/` user management
- Users sign in with a username (stored as `<username>@loans.local`); admins create users and share a temporary password

```
npm install
npm run dev      # needs VITE_SUPABASE_URL / VITE_SUPABASE_KEY (see .env.example)
npm test         # loan maths
npm run build
```
