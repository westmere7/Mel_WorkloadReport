import { getSupabase, isSupabaseConfigured } from './supabaseClient'

export interface MondayWorkloadStatus {
  configured: boolean
  entered?: boolean
  columnTitle?: string
  targetLabel?: string
  currentLabel?: string
}

export function isMondayWorkloadEnabled(): boolean {
  return isSupabaseConfigured() && import.meta.env.VITE_MONDAY_WORKLOAD === '1'
}

export async function requestMondayWorkload(
  taskId: string,
  updatedAt: string,
  action: 'status' | 'confirm',
): Promise<MondayWorkloadStatus> {
  if (!isMondayWorkloadEnabled()) return { configured: false }
  const { data, error } = await getSupabase().functions.invoke<MondayWorkloadStatus & { error?: string }>(
    'monday-workload', { body: { taskId, updatedAt, action } },
  )
  if (error) {
    // FunctionsHttpError carries the function's readable rejection in its response.
    let message = 'Couldn’t reach monday.com. Try again.'
    try {
      const body = await error.context?.json()
      if (typeof body?.error === 'string') message = body.error
    } catch { /* use the transport fallback */ }
    throw new Error(message)
  }
  if (data?.error) throw new Error(data.error)
  if (!data || typeof data.configured !== 'boolean') throw new Error('Couldn’t verify the monday.com status. Try again.')
  if (action === 'confirm' && data.configured && data.entered !== true) {
    throw new Error('monday.com hasn’t confirmed the update. Check the status and try again.')
  }
  return data
}
