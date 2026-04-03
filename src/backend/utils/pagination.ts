import { PAGINATION_LIMIT } from '@/backend/config/constants'

export function getPagination(searchParams: URLSearchParams) {
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
  const limit = Math.min(100, parseInt(searchParams.get('limit') || String(PAGINATION_LIMIT), 10))
  const from = (page - 1) * limit
  const to = from + limit - 1
  return { page, limit, from, to }
}
