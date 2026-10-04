import 'server-only'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { DomainError } from '../pg.ts'

export class AuthError extends Error {
  constructor(message = 'Please sign in again') {
    super(message)
    this.name = 'AuthError'
  }
}

export const ok = (data: unknown = { ok: true }, init?: ResponseInit) => NextResponse.json(data, init)
export const fail = (error: string, status = 400) => NextResponse.json({ error }, { status })

/** Wraps a route handler so business-rule errors become clean JSON and nothing leaks a stack trace. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args)
    } catch (err) {
      if (err instanceof AuthError) return fail(err.message, 401)
      if (err instanceof DomainError) return fail(err.message, 400)
      if (err instanceof ZodError) return fail(err.issues[0]?.message ?? 'Invalid input', 400)
      console.error('[api]', err)
      return fail('Something went wrong. Please try again.', 500)
    }
  }
}

export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? req.headers.get('x-real-ip') ?? 'local'
}
