import type { Half, Size, Squad, Task, TaskInput } from '../types'
import { SIZES } from '../constants'
import { deriveHalf } from './taskCode'

// Required columns; every column outside NON_ASSET_HEADERS is treated as an asset type.
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

// Non-asset columns: core + optional extras (Note) that also aren't asset types.
const NON_ASSET_HEADERS = [...CORE_HEADERS, 'Note']

function esc(value: string | number): string {
  const s = String(value ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Build a CSV string from tasks (with one column per asset type), then download it. */
export function exportTasksCsv(tasks: Task[], assetTypes: string[], filenameSuffix = 'all'): void {
  const headers = [
    'Code',
    'Task name',
    'Squad',
    'Campaign',
    'Types',
    'People',
    'Total assets',
    ...assetTypes,
    'Start date',
    'End date',
    'Half',
    'Size',
    'Note',
  ]

  const rows = tasks.map((t) => [
    t.code,
    t.name,
    t.squad,
    t.campaign,
    t.types.join('; '),
    t.people.join('; '),
    t.assetTotal,
    ...assetTypes.map((name) => t.assetBreakdown[name] ?? 0),
    t.startDate ?? '',
    t.endDate ?? '',
    t.half,
    t.size,
    t.note ?? '',
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
 * Parse a CSV that this app produced back into TaskInput rows. Any column that
 * isn't a core column is treated as an asset type, so files with different asset
 * types still import. assetTotal is recomputed from the asset-type columns.
 * Throws with a readable message if the core columns are missing.
 */
export function parseTasksCsv(text: string): TaskInput[] {
  const rows = parseCsvRows(text).filter((r) => r.some((c) => c.trim() !== ''))
  if (rows.length === 0) throw new Error('The file is empty.')

  const header = rows[0].map((h) => h.trim())
  const missing = CORE_HEADERS.filter((h) => !header.includes(h))
  if (missing.length) {
    throw new Error(
      `This isn't a Workload Report export — missing column${missing.length > 1 ? 's' : ''}: ${missing
        .slice(0, 3)
        .join(', ')}${missing.length > 3 ? '…' : ''}.`,
    )
  }

  const assetCols = header.filter((h) => !NON_ASSET_HEADERS.includes(h))
  const col = (name: string) => header.indexOf(name)
  const num = (s: string) => Math.max(0, Number(s) || 0)

  return rows.slice(1).map((row) => {
    const get = (name: string) => (row[col(name)] ?? '').trim()

    const assetBreakdown: Record<string, number> = {}
    for (const name of assetCols) assetBreakdown[name] = num(get(name))
    const assetTotal = assetCols.reduce((sum, name) => sum + assetBreakdown[name], 0)

    const startDate = get('Start date') || null
    const halfRaw = get('Half')
    const half: Half = halfRaw === 'H1' || halfRaw === 'H2' ? halfRaw : deriveHalf(startDate)
    const sizeRaw = get('Size')
    const size: Size = (SIZES as string[]).includes(sizeRaw) ? (sizeRaw as Size) : 'M'
    // Squads are user-editable, so accept any value (default blank → the "Others" fallback).
    const squad: Squad = get('Squad').trim() || 'Others'

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
      note: get('Note'),
    }
  })
}
