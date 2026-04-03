/**
 * Typed zodResolver wrapper.
 * Zod v4 z.coerce.* fields have `unknown` input types which causes a resolver
 * type mismatch with @hookform/resolvers v5. This wrapper casts to the correct
 * output type so useForm<FormData> resolves cleanly.
 */
import { zodResolver as _zodResolver } from '@hookform/resolvers/zod'
import type { Resolver, FieldValues } from 'react-hook-form'
import type { ZodType } from 'zod'

export function zodResolver<TOutput extends FieldValues>(
  schema: ZodType<TOutput, any, any>
): Resolver<TOutput> {
  return _zodResolver(schema) as Resolver<TOutput>
}
