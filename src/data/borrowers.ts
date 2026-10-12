import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { must, uploadFile, useInvalidate } from './core'
import type { Borrower, BorrowerDocument, Tier } from '../lib/types'

/** The name to show: Khmer when the app is in Khmer and a Khmer name exists. */
export const bname = (b: Pick<Borrower, 'name' | 'name_km'> | undefined, lang: string) =>
  b ? (lang === 'km' && b.name_km ? b.name_km : b.name) : '—'

export function useBorrowerDocs(borrowerId: number) {
  return useQuery({
    queryKey: ['borrower-docs', borrowerId],
    enabled: Number.isFinite(borrowerId),
    queryFn: async () =>
      must(await supabase.from('borrower_documents').select('*').eq('borrower_id', borrowerId).order('created_at', { ascending: false })) as BorrowerDocument[],
  })
}

export type BorrowerFields = Pick<Borrower,
  'name' | 'name_km' | 'gender' | 'dob' | 'id_no' | 'address' | 'lat' | 'lng' | 'phone' | 'facebook' | 'telegram' | 'note'>

export function useBorrowerActions() {
  const invalidate = useInvalidate()

  const update = async (id: number, patch: Partial<Borrower>) => {
    const { data, error } = await supabase.from('borrowers').update(patch).eq('id', id).select('id')
    if (error) throw new Error(error.message)
    if (!data?.length) throw new Error('You are not allowed to change this borrower.')
    await invalidate('book')
  }

  return {
    async create(fields: BorrowerFields, photo: File | null) {
      const photo_path = photo ? await uploadFile('borrowers', photo) : null
      const { data, error } = await supabase.from('borrowers').insert({ ...fields, photo_path }).select('id').single()
      if (error) throw new Error(error.message)
      await invalidate('book')
      return data.id as number
    },
    async save(id: number, fields: BorrowerFields, photo: File | null) {
      await update(id, photo ? { ...fields, photo_path: await uploadFile('borrowers', photo) } : fields)
    },
    setTier: (id: number, tier: Tier) => update(id, { tier }),
    setStatus: (id: number, status: Borrower['status']) => update(id, { status }),
    async addDocument(borrowerId: number, title: string, note: string, file: File | null) {
      const file_path = file ? await uploadFile('borrowers', file) : null
      const { error } = await supabase.from('borrower_documents').insert({ borrower_id: borrowerId, title, note, file_path })
      if (error) throw new Error(error.message)
      await invalidate('borrower-docs')
    },
  }
}
