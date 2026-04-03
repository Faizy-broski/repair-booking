import { NextResponse } from 'next/server'

export interface ApiMeta {
  page: number
  limit: number
  total: number
}

export interface ApiResponse<T = unknown> {
  data: T | null
  error: { code: string; message: string } | null
  meta?: ApiMeta
}

export function ok<T>(data: T, meta?: ApiMeta): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ data, error: null, meta }, { status: 200 })
}

export function created<T>(data: T): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ data, error: null }, { status: 201 })
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 })
}

export function badRequest(message: string, code = 'BAD_REQUEST'): NextResponse {
  return NextResponse.json({ data: null, error: { code, message } }, { status: 400 })
}

export function unauthorized(message = 'Unauthorized'): NextResponse {
  return NextResponse.json({ data: null, error: { code: 'UNAUTHORIZED', message } }, { status: 401 })
}

export function forbidden(message = 'Forbidden'): NextResponse {
  return NextResponse.json({ data: null, error: { code: 'FORBIDDEN', message } }, { status: 403 })
}

export function notFound(message = 'Not found'): NextResponse {
  return NextResponse.json({ data: null, error: { code: 'NOT_FOUND', message } }, { status: 404 })
}

export function tooManyRequests(message = 'Too many requests'): NextResponse {
  return NextResponse.json({ data: null, error: { code: 'RATE_LIMITED', message } }, { status: 429 })
}

export function conflict(message: string): NextResponse {
  return NextResponse.json({ data: null, error: { code: 'CONFLICT', message } }, { status: 409 })
}

export function serverError(message = 'Internal server error', error?: unknown): NextResponse {
  if (process.env.NODE_ENV === 'development' && error) {
    console.error('[API Error]', error)
  }
  return NextResponse.json({ data: null, error: { code: 'SERVER_ERROR', message } }, { status: 500 })
}
