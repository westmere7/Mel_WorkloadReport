import type { Task } from '../types'
import { ASSET_FIELDS } from '../constants'

function esc(value: string | number): string {
  const s = String(value ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Build a CSV string from tasks, then trigger a browser download. */
export function exportTasksCsv(tasks: Task[]): void {
  const headers = [
    'Code',
    'Task name',
    'Squad',
    'Campaign',
    'Types',
    'People',
    'Total assets',
    ...ASSET_FIELDS.map((f) => f.label),
    'Start date',
    'End date',
    'Half',
    'Size',
  ]

  const rows = tasks.map((t) => [
    t.code,
    t.name,
    t.squad,
    t.campaign,
    t.types.join('; '),
    t.people.join('; '),
    t.assetTotal,
    ...ASSET_FIELDS.map((f) => t.assetBreakdown[f.key] ?? 0),
    t.startDate ?? '',
    t.endDate ?? '',
    t.half,
    t.size,
  ])

  const csv = [headers, ...rows].map((r) => r.map(esc).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `rmit-workload-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
