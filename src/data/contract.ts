import { useQuery } from '@tanstack/react-query'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { useSettings } from './core'

async function fetchTemplate(url: string) {
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

/** The Google Doc template as HTML, or null when no template is set up yet. */
export function useContractTemplate() {
  const { data: settings } = useSettings()
  const url = settings?.contract_template_url ?? ''
  const q = useQuery({
    queryKey: ['contract-template', url],
    enabled: !!url,
    staleTime: 60_000,
    retry: false,
    queryFn: () => fetchTemplate(url),
  })
  return { url, ready: !!settings, template: q.data ?? null, loading: !!url && q.isLoading, error: q.error ? (q.error as Error).message : null, refetch: q.refetch }
}

/** Checks that a link is a readable Google Doc before it is saved as the template. */
export const checkTemplate = fetchTemplate
