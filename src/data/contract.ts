import { useQuery } from '@tanstack/react-query'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { must, useInvalidate } from './core'
import type { ContractTemplate } from '../lib/types'

export async function fetchTemplate(url: string) {
  const { data, error } = await supabase.functions.invoke<{ title: string; html: string }>('contract-template', { body: { url } })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => null)
      throw new Error(body?.error ?? 'Could not read the contract template')
    }
    throw new Error(error.message)
  }
  return data!
}

/** All contract templates, oldest first (the first is the default). */
export function useContractTemplates() {
  return useQuery({
    queryKey: ['contract-templates'],
    queryFn: async () => must(await supabase.from('contract_templates').select('*').order('id')) as ContractTemplate[],
  })
}

/** One template's Google Doc as HTML. */
export function useTemplateHtml(url: string | undefined) {
  const q = useQuery({
    queryKey: ['contract-html', url],
    enabled: !!url,
    staleTime: 60_000,
    retry: false,
    queryFn: () => fetchTemplate(url!),
  })
  return { html: q.data?.html ?? null, loading: !!url && q.isLoading, error: q.error ? (q.error as Error).message : null, refetch: q.refetch }
}

export function useTemplateActions() {
  const inv = useInvalidate()
  const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message) }
  return {
    /** Saves a template after checking that Google will share the document. */
    async save(t: { id?: number; name: string; url: string; lang: 'km' | 'en' }) {
      await fetchTemplate(t.url)
      const row = { name: t.name, url: t.url, lang: t.lang }
      const { error } = t.id ? await supabase.from('contract_templates').update(row).eq('id', t.id) : await supabase.from('contract_templates').insert(row)
      fail(error)
      await inv('contract-templates', 'contract-html')
    },
    async remove(id: number) {
      fail((await supabase.from('contract_templates').delete().eq('id', id)).error)
      await inv('contract-templates')
    },
  }
}
