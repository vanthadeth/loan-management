import type { Currency, PayMode, RateBasis } from './calc'

export type UserStatus = 'active' | 'suspended' | 'discharged'
export type LoanStatus = 'drafted' | 'requested' | 'approved' | 'rejected'
export type Tier = 'normal' | 'silver' | 'gold'

export interface Role { id: string; name: string; description: string; locked: boolean; scoped: boolean }
export interface RolePermission { role_id: string; permission: string }

export interface Profile {
  id: string; username: string; full_name: string; name_latin: string; display_name: string; gender: 'F' | 'M' | null
  dob: string | null; address: string; photo_path: string | null; role_id: string; status: UserStatus
  must_change_password: boolean; last_seen: string | null; created_at: string
}

export interface Borrower {
  id: number; name: string; name_km: string; gender: 'F' | 'M' | null; dob: string | null; id_no: string
  address: string; lat: number | null; lng: number | null; phone: string; facebook: string; telegram: string
  tier: Tier; status: 'active' | 'banned'; note: string; photo_path: string | null; created_at: string
}
export interface BorrowerDocument { id: number; borrower_id: number; title: string; note: string; file_path: string | null; created_at: string }
export interface BankAccount { id: number; bank: string; account_name: string; account_no: string }

export interface Loan {
  id: number; borrower_id: number; supervisor_id: string | null; currency: Currency; amount: number; fee_pct: number
  late_fee_pct: number; rate_pct: number; rate_basis: RateBasis; frequency: 'daily' | 'weekly' | 'monthly' | 'custom'
  interval_days: number; occurrences: number; mode: PayMode; release_date: string; status: LoanStatus
  pay_method: 'cash' | 'bank' | 'other'; bank_account_id: number | null; pay_remarks: string
  requested_by: string | null; verified_by: string | null; approved_by: string | null
  verified_at: string | null; approved_at: string | null; created_at: string
  voided_at: string | null; voided_by: string | null; void_reason: string
}
export interface LoanCollateral { id: number; loan_id: number; description: string }
export interface LoanAttachment { id: number; loan_id: number; collateral_id: number | null; file_path: string; file_name: string }

export interface Payment {
  id: number; loan_id: number; bank_account_id: number | null; amount: number; late_fee: number
  paid_on: string; photo_path: string | null; note: string; created_by: string | null; created_at: string
}
export interface FundTransaction { id: number; kind: 'add' | 'withdraw'; currency: Currency; amount: number; txn_date: string; note: string; created_at: string }
export interface AppSettings { id: 1; service_fee_pct: number; late_fee_pct: number; khr_per_usd: number }
export interface Message { id: number; kind: string; loan_id: number | null; actor: string | null; created_at: string }

export interface ContractTemplate { id: number; name: string; url: string; lang: 'km' | 'en'; kind: 'contract' | 'schedule'; is_default: boolean; created_at: string }
