import 'server-only'
import type pg from 'pg'
import { makePool, inTx, rows, one, maybe, scalar } from '../pg.ts'

declare global {
  var __thunaPool: pg.Pool | undefined
}

export const pool: pg.Pool = globalThis.__thunaPool ?? makePool()
globalThis.__thunaPool = pool

export const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => rows<T>(pool, sql, params)
export const q1 = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => one<T>(pool, sql, params)
export const q0 = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => maybe<T>(pool, sql, params)
export const qv = <T = unknown>(sql: string, params: unknown[] = []) => scalar<T>(pool, sql, params)
export const tx = <T>(fn: (db: pg.PoolClient) => Promise<T>) => inTx(pool, fn)
