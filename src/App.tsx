import { Route, Routes, Navigate } from 'react-router-dom'
import { useAuth } from './app/auth'
import { Layout } from './app/Layout'
import { Blocked, NewPassword, SignIn } from './app/SignIn'
import { Dashboard } from './pages/Dashboard'
import { Cashflow } from './pages/Cashflow'
import { RecordPayment } from './pages/RecordPayment'
import { Loans } from './pages/Loans'
import { LoanQueue } from './pages/LoanQueue'
import { LoanHistory } from './pages/LoanHistory'
import { LoanVoided } from './pages/LoanVoided'
import { NewLoan } from './pages/NewLoan'
import { LoanDetail } from './pages/LoanDetail'
import { Contract } from './pages/Contract'
import { Reports } from './pages/Reports'
import { ReportPage } from './pages/ReportPage'
import { More } from './pages/More'
import { Borrowers } from './pages/Borrowers'
import { BorrowerDetail } from './pages/BorrowerDetail'
import { Profile } from './pages/Profile'
import { Messages } from './pages/Messages'
import { Team } from './pages/Team'
import { UserDetail } from './pages/UserDetail'
import { LoginInfo } from './pages/LoginInfo'
import { Settings } from './pages/Settings'
import { Banks } from './pages/Banks'

export function App() {
  const { loading, session, me } = useAuth()
  if (loading) return <div className="auth"><p className="muted">Loading…</p></div>
  if (!session) return <SignIn />
  if (!me || me.status !== 'active') return <Blocked />
  if (me.must_change_password) return <NewPassword />
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="cashflow" element={<Cashflow />} />
        <Route path="cashflow/pay" element={<RecordPayment />} />
        <Route path="loans" element={<Loans />} />
        <Route path="loans/new" element={<NewLoan />} />
        <Route path="loans/queue/:kind" element={<LoanQueue />} />
        <Route path="loans/history" element={<LoanHistory />} />
        <Route path="loans/voided" element={<LoanVoided />} />
        <Route path="loans/:id" element={<LoanDetail />} />
        <Route path="loans/:id/contract" element={<Contract />} />
        <Route path="reports" element={<Reports />} />
        <Route path="reports/:name" element={<ReportPage />} />
        <Route path="more" element={<More />} />
        <Route path="borrowers" element={<Borrowers />} />
        <Route path="borrowers/:id" element={<BorrowerDetail />} />
        <Route path="profile" element={<Profile />} />
        <Route path="messages" element={<Messages />} />
        <Route path="users" element={<Team />} />
        <Route path="users/:id" element={<UserDetail />} />
        <Route path="users/:id/login" element={<LoginInfo />} />
        <Route path="settings" element={<Settings />} />
        <Route path="banks" element={<Banks />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
