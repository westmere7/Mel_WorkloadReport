import type { Half, Size, Squad, Task, TaskInput } from '../types'
import { ASSET_FIELDS, SIZES, SQUADS } from '../constants'
import { deriveHalf } from './taskCode'

const CORE_HEADERS = [
  'Code',
  'Task name',
  'Squad',
  'Campaign',
  'Types',
  'People',
  'Total assets',
  'Start date',
  'End date',
  'Half',
  'Size',
]

function esc(value: string | number): string {
  const s = String(value ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Build a CSV string from tasks, then trigger a browser download. */
export function exportTasksCsv(tasks: Task[], filenameSuffix = 'all'): void {
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
  a.download = `gcmc-workload-${filenameSuffix}-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Split a CSV string into rows of fields, honouring quotes, escaped quotes and newlines. */
function parseCsvRows(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1) // strip BOM
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (c !== '\r') {
      field += c
    }
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

const splitList = (s: string): string[] =>
  s
    ? s
        .split(';')
        .map((v) => v.trim())
        .filter(Boolean)
    : []

/**
 * Parse a CSV that this app produced back into TaskInput rows. Throws with a
 * readable message if the file isn't a compatible Workload Report export.
 * assetTotal is recomputed from the per-type breakdown to stay consistent.
 */
export function parseTasksCsv(text: string): TaskInput[] {
  const rows = parseCsvRows(text).filter((r) => r.some((c) => c.trim() !== ''))
  if (rows.length === 0) throw new Error('The file is empty.')

  const header = rows[0].map((h) => h.trim())
  const required = [...CORE_HEADERS, ...ASSET_FIELDS.map((f) => f.label)]
  const missing = required.filter((h) => !header.includes(h))
  if (missing.length) {
    throw new Error(
      `This isn't a Workload Report export — missing column${missing.length > 1 ? 's' : ''}: ${missing
        .slice(0, 3)
        .join(', ')}${missing.length > 3 ? '…' : ''}.`,
    )
  }

  const col = (name: string) => header.indexOf(name)
  const num = (s: string) => Math.max(0, Number(s) || 0)

  return rows.slice(1).map((row) => {
    const get = (name: string) => (row[col(name)] ?? '').trim()

    const assetBreakdown = { image: 0, video: 0, publication: 0, html5: 0, gif: 0 }
    for (const f of ASSET_FIELDS) assetBreakdown[f.key] = num(get(f.label))
    const assetTotal = ASSET_FIELDS.reduce((sum, f) => sum + assetBreakdown[f.key], 0)

    const startDate = get('Start date') || null
    const halfRaw = get('Half')
    const half: Half = halfRaw === 'H1' || halfRaw === 'H2' ? halfRaw : deriveHalf(startDate)
    const sizeRaw = get('Size')
    const size: Size = (SIZES as string[]).includes(sizeRaw) ? (sizeRaw as Size) : 'M'
    const squadRaw = get('Squad')
    const squad: Squad = (SQUADS as string[]).includes(squadRaw) ? (squadRaw as Squad) : 'Others'

    return {
      squad,
      campaign: get('Campaign'),
      code: get('Code'),
      name: get('Task name'),
      types: splitList(get('Types')),
      people: splitList(get('People')),
      assetTotal,
      assetBreakdown,
      startDate,
      endDate: get('End date') || null,
      half,
      size,
    }
  })
}
