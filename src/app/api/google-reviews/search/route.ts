import { withMiddleware } from '@/backend/middleware'
import { NextRequest } from 'next/server'
import { ok, serverError, badRequest } from '@/backend/utils/api-response'

export const GET = withMiddleware(async (req: NextRequest) => {
  const name     = req.nextUrl.searchParams.get('name')?.trim()
  const postcode = req.nextUrl.searchParams.get('postcode')?.trim()

  if (!name)     return badRequest('Business name is required')
  if (!postcode) return badRequest('Postcode is required')

  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) return serverError('GOOGLE_PLACES_API_KEY not configured')

  try {
    const query = encodeURIComponent(`${name} ${postcode}`)
    const url   = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&key=${apiKey}`
    const res   = await fetch(url)
    const json  = await res.json()

    if (json.status === 'REQUEST_DENIED') {
      return serverError(`Google Places API key rejected: ${json.error_message ?? 'check your key is enabled for Places API'}`)
    }

    if (json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
      return serverError(`Google Places error: ${json.status}`)
    }

    const results = (json.results ?? []).slice(0, 6).map((p: {
      place_id: string; name: string; formatted_address: string
      rating?: number; user_ratings_total?: number
    }) => ({
      place_id:     p.place_id,
      name:         p.name,
      address:      p.formatted_address,
      rating:       p.rating            ?? null,
      review_count: p.user_ratings_total ?? 0,
    }))

    return ok(results)
  } catch (err) {
    return serverError('Failed to search Google Places', err)
  }
}, { requiredRole: 'branch_manager' })
