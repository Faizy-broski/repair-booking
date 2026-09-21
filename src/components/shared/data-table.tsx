'use client'
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getPaginationRowModel,
  flexRender, type ColumnDef, type SortingState,
} from '@tanstack/react-table'
import { BrandSpinner } from '@/components/ui/brand-spinner'
import { useState } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

interface DataTableProps<T> {
  data: T[]
  columns: ColumnDef<T, unknown>[]
  isLoading?: boolean
  totalCount?: number
  pageIndex?: number
  pageSize?: number
  onPageChange?: (page: number) => void
  onPageSizeChange?: (size: number) => void
  emptyMessage?: string
  onRowClick?: (row: T) => void
}

/**
 * Two paging modes:
 *  - Server-side: pass `onPageChange` (+ `totalCount`, `pageIndex`, `pageSize`); `data` is the current page.
 *  - Client-side: omit `onPageChange`; `data` is the full list and the table pages it
 *    itself (default 20 rows, with a pager and rows-per-page selector).
 */
export function DataTable<T>({
  data, columns, isLoading, totalCount, pageIndex = 0, pageSize = 20, onPageChange, onPageSizeChange, emptyMessage = 'No records found.',
  onRowClick,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const controlled = !!onPageChange

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageIndex: 0, pageSize } },
    manualPagination: controlled,
    pageCount: controlled && totalCount ? Math.ceil(totalCount / pageSize) : undefined,
  })

  // Unify controlled (server) and uncontrolled (client) paging for the footer.
  const clientPagination = table.getState().pagination
  const curPageIndex = controlled ? pageIndex : clientPagination.pageIndex
  const curPageSize = controlled ? pageSize : clientPagination.pageSize
  const curTotal = controlled ? (totalCount ?? 0) : data.length
  const goToPage = (p: number) => (controlled ? onPageChange!(p) : table.setPageIndex(p))
  const changePageSize = controlled
    ? onPageSizeChange
    : (s: number) => table.setPagination({ pageIndex: 0, pageSize: s })
  const totalPages = Math.max(1, Math.ceil(curTotal / curPageSize))
  // Client mode: skip the footer for short lists where paging is pointless.
  const showFooter = controlled || data.length > PAGE_SIZE_OPTIONS[0]
  const rows = table.getRowModel().rows
  // True only on the very first load when there is no cached data yet
  const initialLoading = isLoading && rows.length === 0
  // Re-fetch (page / filter change) — previous rows are still present via placeholderData
  const refetching = isLoading && rows.length > 0

  return (
    <div className="w-full">
      <div className="relative overflow-x-auto rounded-xl border border-outline-variant/50 shadow-sm">
        {/* Spinner overlay during re-fetch — keeps existing rows visible, no layout shift */}
        {refetching && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-surface/60 backdrop-blur-[1px]">
            <BrandSpinner size="md" />
          </div>
        )}

        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-outline-variant/40 bg-primary">
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-3 text-left text-[13px] font-bold uppercase tracking-wider text-white"
                    style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        onClick={header.column.getToggleSortingHandler()}
                        className="flex items-center gap-1 hover:text-white"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === 'asc' ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : header.column.getIsSorted() === 'desc' ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronsUpDown className="h-3 w-3 opacity-50" />
                        )}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {initialLoading ? (
              // First load — centered spinner row, no skeleton flicker
              <tr>
                <td colSpan={columns.length} className="px-4 py-16 text-center">
                  <div className="flex items-center justify-center">
                    <BrandSpinner size="lg" />
                  </div>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-outline">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={`border-t border-outline-variant transition-colors hover:bg-surface-container-high ${onRowClick ? 'cursor-pointer' : ''} ${
                    i % 2 === 0 ? 'bg-surface' : 'bg-surface-container-low'
                  }`}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-4 text-on-surface align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {showFooter && (
        <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-4 px-1">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-outline">
              Showing <span className="text-on-surface">{curTotal === 0 ? 0 : curPageIndex * curPageSize + 1}</span>–
              <span className="text-on-surface">{Math.min((curPageIndex + 1) * curPageSize, curTotal)}</span> of
              <span className="text-on-surface"> {curTotal}</span>
            </span>
            {changePageSize && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-outline">Rows:</span>
                <select
                  value={curPageSize}
                  onChange={(e) => { if (controlled) onPageChange!(0); changePageSize(Number(e.target.value)) }}
                  className="h-7 rounded-md border border-outline bg-surface px-2 text-xs text-on-surface-variant focus:border-primary focus:outline-none"
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {curTotal > curPageSize && (
            <div className="flex items-center gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={() => goToPage(curPageIndex - 1)}
                disabled={curPageIndex === 0}
                className="h-9 px-4 flex items-center gap-2 bg-primary hover:bg-primary/90 text-white shadow-sm transition-all disabled:bg-surface-container-high disabled:text-outline disabled:opacity-100"
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="font-medium">Previous</span>
              </Button>

              <div className="flex items-center justify-center min-w-[2.5rem] h-9 rounded-lg border border-outline-variant bg-surface-container-lowest text-sm font-bold text-primary shadow-sm">
                {curPageIndex + 1}
              </div>

              <Button
                variant="default"
                size="sm"
                onClick={() => goToPage(curPageIndex + 1)}
                disabled={curPageIndex + 1 >= totalPages}
                className="h-9 px-4 flex items-center gap-2 bg-primary hover:bg-primary/90 text-white shadow-sm transition-all disabled:bg-surface-container-high disabled:text-outline disabled:opacity-100"
              >
                <span className="font-medium">Next</span>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
