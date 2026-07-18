import * as XLSX from 'xlsx'

export function exportExcel<T extends Record<string, unknown>>(rows: T[], filename: string, sheetName = 'Sheet1') {
  const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{}])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)

  if (rows.length > 0) {
    const keys = Object.keys(rows[0])
    ws['!cols'] = keys.map((key) => ({
      wch: Math.max(key.length, ...rows.map((r) => String(r[key] ?? '').length)) + 2,
    }))
  }
  ws['!freeze'] = { xSplit: 0, ySplit: 1 }

  const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
