import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../app/auth'
import { must } from './core'

export interface MessageRow {
  id: number; kind: string; loan_id: number | null; actor: string | null; created_at: string
  read: boolean; borrower: string
}

/** Latest team activity (loan requested / verified / approved, payments) with unread state. */
export function useMessages() {
  const { me } = useAuth()
  return useQuery({
    queryKey: ['messages'],
    enabled: !!me,
    refetchInterval: 60_000,
    queryFn: async () => {
      const [m, r] = await Promise.all([
        supabase.from('messages').select('id,kind,loan_id,actor,created_at,loan:loans(voided_at,borrower:borrowers(name))').order('created_at', { ascending: false }).limit(60),
        supabase.from('message_reads').select('message_id'),
      ])
      const read = new Set((must(r) as { message_id: number }[]).map((x) => x.message_id))
      return (must(m) as unknown as { id: number; kind: string; loan_id: number | null; actor: string | null; created_at: string; loan: { voided_at: string | null; borrower: { name: string } | null } | null }[]).filter((x) => !x.loan?.voided_at).map<MessageRow>((x) => ({
        id: x.id, kind: x.kind, loan_id: x.loan_id, actor: x.actor, created_at: x.created_at,
        read: read.has(x.id), borrower: x.loan?.borrower?.name ?? '',
      }))
    },
  })
}

export async function markRead(ids: number[]) {
  if (!ids.length) return
  await supabase.from('message_reads').upsert(ids.map((message_id) => ({ message_id })), { onConflict: 'message_id,user_id', ignoreDuplicates: true })
}

export const messageText = (m: MessageRow, code: string) => {
  const who = m.borrower ? ` (${m.borrower})` : ''
  switch (m.kind) {
    case 'requested': return `New loan request ${code}${who}.`
    case 'verified': return `Verified ${code}${who}. Needs approval before release.`
    case 'approved': return `Approved ${code}${who}. Set the release date when the borrower is ready.`
    case 'refinanced': return `${code}${who} was paid off by a new loan (refinanced).`
    case 'rejected': return `Denied ${code}${who}.`
    case 'payment': return `Payment recorded on ${code}${who}.`
    default: return `${m.kind} ${code}`
  }
}
