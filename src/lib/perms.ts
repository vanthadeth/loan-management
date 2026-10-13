export const PGROUPS: [string, [string, string][]][] = [
  ['Borrowers', [['borrowers.view', 'View borrowers'], ['borrowers.edit', 'Add and edit borrowers'], ['borrowers.ban', 'Ban, reactivate and set trust level'], ['borrowers.delete', 'Delete borrowers']]],
  ['Loans', [['loans.view', 'View loans'], ['loans.create', 'Draft and request loans'], ['loans.approve', 'Approve or reject loans'], ['loans.void', 'Void loans and hide them']]],
  ['Payments', [['payments.view', 'View payments'], ['payments.record', 'Record payments'], ['payments.void', 'Void received payments'], ['payments.backdate', 'Record payments dated before the backdating limit'], ['payments.waive_fee', 'Waive the early payoff fee']]],
  ['Funds', [['funds.view', 'View funds'], ['funds.add', 'Add fund']]],
  ['Reports', [['reports.view', 'View and export reports']]],
  ['Administration', [['banks.manage', 'Manage bank accounts'], ['users.manage', 'Manage users and roles'], ['settings.edit', 'Edit system settings']]],
]
export const ALL_PERMS = PGROUPS.flatMap((g) => g[1].map((p) => p[0]))

/** A permission is unavailable until the permission it builds on is allowed. */
export const PDEP: Record<string, string> = {
  'borrowers.edit': 'borrowers.view', 'borrowers.ban': 'borrowers.view', 'borrowers.delete': 'borrowers.view',
  'loans.create': 'loans.view', 'loans.approve': 'loans.view', 'loans.void': 'loans.view',
  'payments.record': 'payments.view', 'payments.void': 'payments.view', 'payments.backdate': 'payments.view', 'payments.waive_fee': 'payments.view', 'funds.add': 'funds.view',
}
