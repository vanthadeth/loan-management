# Komjei finance rules

The source of truth for every rule that moves or reports money. Written from microfinance practice (CGAP and Smart
Campaign client-protection principles, standard MFI accounting) and the owner's decisions. Each rule has an id
(`R-PAY-3`) so code, tests and migrations can cite it. Section 12 lists where today's app does not follow a rule yet.

Words used: **posted** = recorded as a transaction and kept forever. **Estimate** = calculated, not yet posted.

## 1. Principles

- **R-PRIN-1** The principal only goes down through a posted transaction (a payment, a prepayment, a refinance payoff) or an
  explicit write-off. Recalculating, editing, approving or showing a screen never reduces it.
- **R-PRIN-2** Money facts are append-only. A posted transaction is never edited or deleted. A mistake is corrected by a
  reversal that points to the original (with who, when and why).
- **R-PRIN-3** What is still to be collected, the remaining interest, the expected gain and the accrued late fee are
  **estimates** and are labelled that way. Only posted transactions are **actual** ("Collected").
- **R-PRIN-4** One currency per loan. Totals never mix KHR and USD. Rounding: KHR to 100, USD to cents. The last installment
  takes the rounding remainder so the principal always adds up to the loan amount.
- **R-PRIN-5** The server is the authority. Rules are enforced by database functions and triggers; the app only shows and
  asks. A rule that exists only in the app is not a rule.

## 2. Transactions

The only things that move money. Each has: id, loan, date, amount, currency, bank account or cash, created by/at, receipt
number, photo, note, and `reverses_id` when it is a reversal.

| Type | Meaning |
|---|---|
| `disbursement` | the release; the service fee is deducted upfront, on new cash only |
| `payment` | cash or bank money for installments |
| `late_fee_collection` | late fee actually collected |
| `late_fee_waiver` | late fee forgiven (reason required) |
| `prepayment` | early payoff: unpaid principal + prepayment fee |
| `prepayment_fee_waiver` | prepayment fee forgiven (reason, admin approval) |
| `refinance_payoff` | non-cash payoff of an old loan by a new one |
| `reversal` | cancels an earlier transaction (void) |
| `write_off` / `recovery` | giving up a loan / money received after a write-off |

## 3. Loan lifecycle and terms

- **R-LOAN-1** drafted, requested, approved or denied. Terms are frozen from submission (enforced today by `private.loans_guard`).
- **R-LOAN-2** Four eyes: whoever created or requested a loan cannot approve it.
- **R-LOAN-3** Approval freezes a **terms snapshot**: amount, fee, rate and basis, frequency, mode, late-fee %, grace days,
  prepayment fee %, release date, schedule version. It never changes. New terms mean a new loan (refinance or restructure).
- **R-LOAN-4** Disbursement is a transaction. The schedule runs from the actual release date. The service fee is a % of the new
  cash only, never of a balance carried over from a refinanced loan.

## 4. Stored schedule

- **R-SCHED-1** At approval the schedule is calculated once and stored: `loan_installments(loan, no, due date, principal,
  interest, total, status, paid_principal, paid_interest, paid_on, locked_by_loan, schedule_version)`. Status is one of
  `open`, `partial`, `paid`, `locked`, `cancelled`. `src/lib/calc.ts` stays for the new-loan preview and as a test oracle:
  a test asserts that the stored schedule equals the recomputed one.
- **R-SCHED-2** Installment status changes only inside the payment functions, as a result of an allocation. The app never
  writes it.
- **R-SCHED-3** An installment is `paid` when paid_principal + paid_interest equals its total, `partial` when only part is.
- **R-SCHED-4** Late fee is never part of an installment. It is a separate charge (section 6).

## 5. Payments

- **R-PAY-1** Recording a payment is one atomic database function: lock the loan, validate, allocate, write the transaction,
  the allocation rows, the installment updates and a snapshot, all in one transaction. An idempotency key stops double submits.
- **R-PAY-2** Allocation order: the oldest open installment first; inside an installment, interest first, then principal.
  Late fee is **not** taken from a payment; it is settled separately (R-LATE-3).
- **R-PAY-3** **Overpayment is blocked.** A payment cannot exceed what is outstanding on the open installments. The excess is
  handed back to the borrower and not recorded.
- **R-PAY-4** The payment date is not in the future and not before the release date. Backdating beyond N days (setting,
  default 7) needs an admin.
- **R-PAY-5** **Early payoff** is the principal of the not-yet-due installments **plus a prepayment fee**. Future interest is
  not charged. The fee is an agreed rate stored in the terms snapshot (% of the principal prepaid).
  - It is only valid when **nothing is overdue or due and no late fee is outstanding**: installments due on or before the
    payoff date are paid first, and the late fee is collected or forgiven first.
  - The fee can be waived in full or in part with a reason. A waiver needs **admin approval** (staff request, admin approves)
    and is posted as `prepayment_fee_waiver`.
  - The quote is shown with its as-of date and posted as one atomic transaction that closes every open installment.
  - Refinancing is a different path (R-REFI); it may carry overdue amounts and late fee into the new loan.
- **R-PAY-6** Every payment has a receipt number, who recorded it, the collector and an optional photo. Cash held by a
  collector is a candidate for a later remittance reconciliation.

## 6. Late fee (penalty)

- **R-LATE-1** The rate is the % of the **unpaid principal** at the start of each late period. Simple, never compounded, never
  charged on interest or on other fees.
- **R-LATE-2** Settings: grace days before the first period counts (default 0) and a cap (% of the loan amount), as client
  protection norms and many regulators cap penalties.
- **R-LATE-3** The accrued fee is an estimate. It is settled on its own: the collector takes an amount from 0 to the fee due
  and the rest is forgiven (reason required). The settlement posts the charge and splits it into collected and forgiven.
- **R-LATE-4** Voiding a late fee settlement brings the charge back as due.

## 7. Refinance

- **R-REFI-1** The carried amount is a **frozen payoff quote** taken when the new loan is drafted. Approval is blocked if the old
  loan's balance has changed since (stale check).
- **R-REFI-2** On approval, in one transaction: post `refinance_payoff` on the old loan (non-cash: what is due, the principal
  not yet due, and the late fee due), mark every remaining unpaid installment `locked` with `locked_by_loan`, set the old loan
  to `refinanced`, and post the interest not yet due as a waiver so the books explain the difference.
- **R-REFI-3** A `locked` installment accepts no allocation, no payment and no late fee. The database rejects it, not only
  the screen.
- **R-REFI-4** A refinancing loan's approval cannot be reset. To undo, void the new loan, allowed only when it has no payments;
  that reverses the payoff and unlocks the installments, all audited.
- **R-REFI-5** One open refinance per old loan. Refinancing never reduces principal without the payoff transaction.

## 8. Corrections

- **R-FIX-1** Voiding a payment posts a reversal linked to the original, reverses its allocations, recomputes the installments
  and writes a new snapshot. The original stays visible, struck through. Admin permission and a reason are required.
- **R-FIX-2** No hard deletes on money tables. Only a draft with no transactions may be deleted.
- **R-FIX-3** A write-off is admin-only with a reason. Money received afterwards is a `recovery`, never a normal payment.

## 9. Snapshots and audit

- **R-SNAP-1** Every posted event writes an immutable `loan_snapshots` row in the same transaction: sequence, event type and
  id, as-of date, principal outstanding, interest outstanding, late fee due, total collected, installments paid, schedule
  version, actor.
- **R-SNAP-2** Snapshots are append-only (update and delete are blocked). The payment history can show "balance before, after".
- **R-SNAP-3** Optional daily close: a portfolio snapshot (outstanding principal, PAR) to audit month ends.
- **R-SNAP-4** A reconciliation check (button and nightly) compares: allocations against payments minus late fee collected,
  installment paid amounts against allocations, and the last snapshot against a recomputed balance. Drift shows in Insight.

## 10. Delinquency and reporting

- **R-RISK-1** Days past due counts from the oldest unpaid due date. Buckets: current, 1-7, 8-30, 31-60, 61-90, 90+.
- **R-RISK-2** Portfolio at risk: PAR1 and PAR30 are the outstanding principal of loans more than 1 / 30 days past due,
  divided by total outstanding principal. Shown on the dashboard and in reports.
- **R-RISK-3** Optional provisioning rate per bucket (setting) for an expected-loss figure.
- **R-RISK-4** Client protection: show the **effective interest rate (APR)** next to the flat rate on the new-loan screen and
  on the contract, plus the total cost, in plain language.

## 11. Controls summary

Maker-checker on approval (R-LOAN-2); admin for backdating (R-PAY-4), voids (R-FIX-1), write-offs (R-FIX-3) and prepayment fee
waivers (R-PAY-5); a reason on every waiver, void and write-off; permissions stay in the role editor.

## 12. Where the app is not there yet

- The schedule is stored at approval (`loan_installments`, migration `20261028000000`, roadmap step 1) and payments are linked
  to its installments (`payment_allocations`, `private.reallocate_loan`, migration `20261029000000`, step 2): paid and
  partial are set by the database. Step 3 (migration `20261030000000`) added immutable `loan_snapshots` on every event and
  blocks overpayment (R-PAY-3) in the database. The app still shows the recomputed schedule from `src/lib/calc.ts`, and the
  allocation itself is a replay of the payments that count.
- Paid and overdue are derived on every load, so they follow the code and terms of the day. No snapshots exist.
- Refinance posts a payoff payment (`apply_refinance`, migration `20261025000000`) and flips the old loan to `refinanced`, but
  individual installments are not locked.
- Backdating limit (R-PAY-4) and four-eyes approval (R-LOAN-2, a setting, off by default) are enforced since step 4
  (migration `20261031000000`). Overpayment is blocked since step 3.
- Early payoff (R-PAY-5) exists since step 6 (migration `20261033000000`, `EarlyPayoff` sheet, `earlyPayoffQuote`): the
  database checks principal, fee, dropped interest and that nothing is due. "Approved by admin" is the permission
  `payments.waive_fee` (an admin records the waiver), not a request queue. The outstanding late fee is checked by the app
  only, because the late fee is not calculated in the database yet.
- Late fee is settled separately (`settleLateFee`). Grace days and the cap (R-LATE-2) are in the loan terms since step 5
  (migration `20261032000000`, `scheduleStatus`); a forgiven fee is still a number on the settlement row, not a charge.
- Voiding a payment (`private.payments_void_guard`) sets flags on the row; it is not a reversal transaction. `loans` still
  has a delete policy.
- No PAR or aging buckets, no reconciliation check, no APR.

## 13. Roadmap

1. Stored schedule, allocations, snapshots and the functions `record_payment`, `settle_late_fee`, `void_payment`, with a
   backfill of existing loans and the stored-equals-recomputed test.
2. Refinance locking and undo.
3. Guardrails: overpayment block, backdating, maker-checker, grace days and cap, prepayment and its fee waiver approval,
   no hard deletes.
4. PAR and aging, reconciliation check, APR, write-off.
