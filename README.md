# Komjei

Loan management PWA for a family business: borrowers, loan contracts (service fee, flat interest, a late fee
as a % of the unpaid installment per late period, supervisor and collector), payments, funds, reports, and
contracts filled from Google Doc templates (Khmer or English). React + Vite + TypeScript, Supabase backend.

- Loan flow: drafted → requested → approved or denied; an approval can be reset, a request or denial returned to draft
- Supervisors and collectors only see the loans assigned to them
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

## Mobile app (`mobile/`)

The same app for Android and iPhone, built with Expo (React Native, expo-router). It talks to the same Supabase
backend and reuses the web code in `src/` (loan maths, formatting, Supabase queries, auth, contract filling):
`mobile/metro.config.js` bundles `src/` and swaps its few browser-only modules (`lib/supabase`, `lib/device`,
`ui/Toast`) for the native ones in `mobile/src/lib` and `mobile/src/ui`. Contracts are filled by the web code inside
a WebView (`mobile/scripts/contract-kit.ts`) and saved as PDF or Word through the share sheet.

```
cd mobile
npm install            # also builds the contract kit
npx expo start         # scan the QR code with Expo Go, or press a / i for an emulator
npm run typecheck
npx eas-cli build --profile preview --platform android   # installable APK
```

Optional `mobile/.env` (see `mobile/.env.example`): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_KEY`, and
`EXPO_PUBLIC_APP_URL`, the link sent to new users with their login.
