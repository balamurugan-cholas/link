declare module 'better-sqlite3' {
  interface RunResult {
    changes: number
    lastInsertRowid: number | bigint
  }

  interface Statement<TRow = any> {
    run(...params: any[]): RunResult
    get(...params: any[]): TRow | undefined
    all(...params: any[]): TRow[]
  }

  export default class Database {
    constructor(filename: string, options?: Record<string, unknown>)
    pragma(source: string): unknown
    exec(sql: string): this
    prepare<TRow = any>(sql: string): Statement<TRow>
    transaction<T extends (...args: any[]) => any>(fn: T): T
  }
}
