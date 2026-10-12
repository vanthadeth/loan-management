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

/** All contract templates, oldest first. */
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

/** A type with templates always has a default: the oldest one takes over when none is set. */
async function ensureDefault(kind: 'contract' | 'schedule') {
  const { data } = await supabase.from('contract_templates').select('id,is_default').eq('kind', kind).order('id')
  if (data?.length && !data.some((r) => r.is_default)) await supabase.from('contract_templates').update({ is_default: true }).eq('id', data[0].id)
}

/** The template a contract page opens with: the chosen one, else the type's default, else the oldest. */
export const pickTemplate = (list: ContractTemplate[], id?: string | null) =>
  list.find((t) => String(t.id) === id) ?? list.find((t) => t.is_default) ?? list[0]

export function useTemplateActions() {
  const inv = useInvalidate()
  const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message) }
  return {
    /** Saves a template after checking that Google will share the document. */
    async save(t: { id?: number; name: string; url: string; lang: 'km' | 'en'; kind: 'contract' | 'schedule' }) {
      await fetchTemplate(t.url)
      const row = { name: t.name, url: t.url, lang: t.lang, kind: t.kind }
      const { error } = t.id ? await supabase.from('contract_templates').update(row).eq('id', t.id) : await supabase.from('contract_templates').insert(row)
      fail(error)
      await ensureDefault(t.kind)
      await inv('contract-templates', 'contract-html')
    },
    async remove(id: number, kind: 'contract' | 'schedule') {
      fail((await supabase.from('contract_templates').delete().eq('id', id)).error)
      await ensureDefault(kind)
      await inv('contract-templates')
    },
    /** Makes one template the default of its type. */
    async makeDefault(id: number, kind: 'contract' | 'schedule') {
      fail((await supabase.from('contract_templates').update({ is_default: false }).eq('kind', kind).eq('is_default', true)).error)
      fail((await supabase.from('contract_templates').update({ is_default: true }).eq('id', id)).error)
      await inv('contract-templates')
    },
  }
}
