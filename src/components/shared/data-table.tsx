'use client'
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getPaginationRowModel,
  flexRender, type ColumnDef, type SortingState,
} from '@tanstack/react-table'
import { useState } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface DataTableProps<T> {
  data: T[]
  columns: ColumnDef<T, unknown>[]
  isLoading?: boolean
  totalCount?: number
  pageIndex?: number
  pageSize?: number
  onPageChange?: (page: number) => void
  emptyMessage?: string
}

export function DataTable<T>({
  data, columns, isLoading, totalCount, pageIndex = 0, pageSize = 20, onPageChange, emptyMessage = 'No records found.',
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([])

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: !!onPageChange,
    pageCount: totalCount ? Math.ceil(totalCount / pageSize) : undefined,
  })

  const totalPages = totalCount ? Math.ceil(totalCount / pageSize) : 1

  return (
    <div className="w-full">
      <div className="overflow-x-auto rounded-xl border border-outline-variant/50 shadow-sm">
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
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className={`border-t border-outline-variant/30 ${i % 2 === 0 ? 'bg-white' : 'bg-surface-container-low'}`}>
                  {columns.map((_, j) => (
                    <td key={j} className="px-4 py-4">
                      <div className="h-4 w-full animate-pulse rounded bg-surface-container" />
                    </td>
                  ))}
                </tr>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-outline">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row, i) => (
                <tr
                  key={row.id}
                  className={`border-t border-outline-variant/30 transition-colors hover:bg-primary-container/20 ${
                    i % 2 === 0 ? 'bg-white' : 'bg-surface-container-low/60'
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
      {(totalCount ?? 0) > pageSize && (
        <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-4 px-1">
          <div className="text-sm font-medium text-outline">
            Showing <span className="text-on-surface">{pageIndex * pageSize + 1}</span>–
            <span className="text-on-surface">{Math.min((pageIndex + 1) * pageSize, totalCount ?? 0)}</span> of 
            <span className="text-on-surface"> {totalCount}</span>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={() => onPageChange?.(pageIndex - 1)}
              disabled={pageIndex === 0}
              className="h-9 px-4 flex items-center gap-2 bg-primary hover:bg-primary/90 text-white shadow-sm transition-all disabled:bg-gray-200 disabled:text-gray-400 disabled:opacity-100"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="font-medium">Previous</span>
            </Button>
            
            <div className="flex items-center justify-center min-w-[2.5rem] h-9 rounded-lg border border-outline-variant bg-surface-container-lowest text-sm font-bold text-primary shadow-sm">
              {pageIndex + 1}
            </div>
            
            <Button
              variant="default"
              size="sm"
              onClick={() => onPageChange?.(pageIndex + 1)}
              disabled={pageIndex + 1 >= totalPages}
              className="h-9 px-4 flex items-center gap-2 bg-primary hover:bg-primary/90 text-white shadow-sm transition-all disabled:bg-gray-200 disabled:text-gray-400 disabled:opacity-100"
            >
              <span className="font-medium">Next</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
