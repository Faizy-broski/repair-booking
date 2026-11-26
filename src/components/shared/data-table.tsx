'use client'
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getPaginationRowModel,
  flexRender, type ColumnDef, type SortingState,
} from '@tanstack/react-table'
import { BrandSpinner } from '@/components/ui/brand-spinner'
import { useState } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, Inbox } from 'lucide-react'
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
  /** Icon shown in the round placeholder when the table is empty */
  emptyIcon?: React.ReactNode
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
  emptyIcon, onRowClick,
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
      <div className="relative overflow-x-auto rounded-2xl border border-outline-variant bg-surface-container-lowest">
        {/* Spinner overlay during re-fetch — keeps existing rows visible, no layout shift */}
        {refetching && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-surface/60 backdrop-blur-[1px]">
            <BrandSpinner size="md" />
          </div>
        )}

        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="bg-primary">
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className="whitespace-nowrap px-4 py-3.5 text-left text-[13px] font-medium text-white"
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
                <td colSpan={columns.length} className="px-4 py-20 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <span className="flex h-16 w-16 items-center justify-center rounded-full border border-outline-variant bg-surface-container-low text-on-surface-variant [&_svg]:h-6 [&_svg]:w-6">
                      {emptyIcon ?? <Inbox />}
                    </span>
                    <p className="text-sm text-on-surface-variant">{emptyMessage}</p>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={`border-t border-outline-variant transition-colors first:border-t-0 hover:bg-surface-container-low ${onRowClick ? 'cursor-pointer' : ''}`}
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
            <span className="text-sm text-on-surface-variant">
              Showing {curTotal === 0 ? 0 : curPageIndex * curPageSize + 1}–{Math.min((curPageIndex + 1) * curPageSize, curTotal)} of {curTotal}
            </span>
            {changePageSize && (
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-on-surface-variant">Rows:</span>
                <select
                  value={curPageSize}
                  onChange={(e) => { if (controlled) onPageChange!(0); changePageSize(Number(e.target.value)) }}
                  className="h-8 rounded-lg border border-outline-variant bg-surface-container-lowest px-2 text-sm text-on-surface focus:border-primary focus:outline-none"
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
                variant="ghost"
                size="sm"
                onClick={() => goToPage(curPageIndex - 1)}
                disabled={curPageIndex === 0}
                className="h-8 gap-1 px-3 text-on-surface-variant hover:text-on-surface disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="font-medium">Previous</span>
              </Button>

              <div className="flex h-8 min-w-[2rem] items-center justify-center rounded-lg bg-primary/10 px-2 text-sm font-semibold text-primary">
                {curPageIndex + 1}
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => goToPage(curPageIndex + 1)}
                disabled={curPageIndex + 1 >= totalPages}
                className="h-8 gap-1 px-3 text-on-surface-variant hover:text-on-surface disabled:opacity-40"
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
