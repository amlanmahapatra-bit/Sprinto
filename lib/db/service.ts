import { neon } from "@neondatabase/serverless";
import { env } from "@/lib/env";

/**
 * Neon (Postgres) data layer. Exposes a small supabase-js-compatible query builder
 * (from/select/insert/update/upsert/delete/eq/neq/in/gte/order/limit/single/maybeSingle/rpc)
 * so the rest of the app is unchanged. SERVER ONLY.
 */
type Row = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Result = { data: any; error: { message: string } | null; count?: number | null };

type Q = { query: (sql: string, vals?: unknown[]) => Promise<{ rows: any[] }> };
let _pool: Q | null = null;
// HTTP (fetch) transport: works from Vercel serverless and anywhere only HTTPS egress is open.
function pool(): Q {
  if (!_pool) {
    if (!env.DATABASE_URL) throw new Error("DATABASE_URL missing");
    const sql = neon(env.DATABASE_URL, { fullResults: true });
    _pool = { query: async (q, v = []) => ({ rows: (await sql.query(q, v as unknown[])).rows }) };
  }
  return _pool;
}

const ident = (s: string) => '"' + s.replace(/"/g, '""') + '"';
const JSONISH = (v: unknown) => v !== null && typeof v === "object" && !(v instanceof Date) && !Buffer.isBuffer(v);
const param = (v: unknown) => (JSONISH(v) && !Array.isArray(v) ? JSON.stringify(v) : v);

class Builder implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private cols = "*";
  private count = false;
  private head = false;
  private where: { sql: string; vals: unknown[] }[] = [];
  private orders: string[] = [];
  private lim: number | null = null;
  private payload: Row[] = [];
  private returning = false;
  private mode: "many" | "single" | "maybe" = "many";
  private conflict = "";
  constructor(private table: string) {}

  select(cols = "*", opts?: { count?: string; head?: boolean }) {
    if (this.op === "select") this.cols = cols;
    else this.returning = true;
    if (opts?.count) this.count = true;
    if (opts?.head) this.head = true;
    return this;
  }
  insert(rows: Row | Row[]) { this.op = "insert"; this.payload = Array.isArray(rows) ? rows : [rows]; return this; }
  update(row: Row) { this.op = "update"; this.payload = [row]; return this; }
  upsert(rows: Row | Row[], o?: { onConflict?: string }) {
    this.op = "upsert"; this.payload = Array.isArray(rows) ? rows : [rows]; this.conflict = o?.onConflict ?? ""; return this;
  }
  delete() { this.op = "delete"; return this; }
  private cmp(col: string, op: string, v: unknown) { this.where.push({ sql: `${ident(col)} ${op} $#`, vals: [param(v)] }); return this; }
  eq(c: string, v: unknown) { return v === null ? this.is(c) : this.cmp(c, "=", v); }
  neq(c: string, v: unknown) { return this.cmp(c, "<>", v); }
  gte(c: string, v: unknown) { return this.cmp(c, ">=", v); }
  lte(c: string, v: unknown) { return this.cmp(c, "<=", v); }
  is(c: string) { this.where.push({ sql: `${ident(c)} IS NULL`, vals: [] }); return this; }
  in(c: string, vs: unknown[]) { this.where.push({ sql: `${ident(c)} = ANY($#)`, vals: [vs] }); return this; }
  order(c: string, o?: { ascending?: boolean }) { this.orders.push(`${ident(c)} ${o?.ascending === false ? "DESC" : "ASC"}`); return this; }
  limit(n: number) { this.lim = n; return this; }
  single() { this.mode = "single"; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }

  private whereSql(vals: unknown[]) {
    if (!this.where.length) return "";
    return " WHERE " + this.where.map((w) => {
      let sql = w.sql;
      for (const v of w.vals) { vals.push(v); sql = sql.replace("$#", `$${vals.length}`); }
      return sql;
    }).join(" AND ");
  }

  private async run(): Promise<Result> {
    const t = ident(this.table);
    const vals: unknown[] = [];
    let sql: string;
    if (this.op === "select") {
      const w = this.whereSql(vals);
      if (this.count && this.head) {
        sql = `SELECT count(*)::int AS c FROM ${t}${w}`;
        const r = await pool().query(sql, vals);
        return { data: null, error: null, count: r.rows[0].c };
      }
      sql = `SELECT ${this.cols} FROM ${t}${w}`;
      if (this.orders.length) sql += " ORDER BY " + this.orders.join(", ");
      if (this.lim != null) sql += ` LIMIT ${Number(this.lim)}`;
    } else if (this.op === "delete") {
      sql = `DELETE FROM ${t}${this.whereSql(vals)}`;
      if (this.returning) sql += " RETURNING *";
    } else if (this.op === "update") {
      const row = this.payload[0];
      const sets = Object.keys(row).map((k) => { vals.push(param(row[k])); return `${ident(k)} = $${vals.length}`; });
      sql = `UPDATE ${t} SET ${sets.join(", ")}${this.whereSql(vals)}`;
      if (this.returning) sql += " RETURNING *";
    } else {
      if (!this.payload.length) return { data: [], error: null };
      const keys = [...new Set(this.payload.flatMap((r) => Object.keys(r)))];
      const tuples = this.payload.map((r) => "(" + keys.map((k) => {
        vals.push(r[k] === undefined ? null : param(r[k]));
        return `$${vals.length}`;
      }).join(", ") + ")");
      sql = `INSERT INTO ${t} (${keys.map(ident).join(", ")}) VALUES ${tuples.join(", ")}`;
      if (this.op === "upsert") {
        const target = this.conflict || (await this.pk());
        const tcols = target.split(",").map((s) => s.trim());
        const upd = keys.filter((k) => !tcols.includes(k));
        sql += ` ON CONFLICT (${tcols.map(ident).join(", ")}) ` +
          (upd.length ? `DO UPDATE SET ${upd.map((k) => `${ident(k)} = EXCLUDED.${ident(k)}`).join(", ")}` : "DO NOTHING");
      }
      if (this.returning) sql += " RETURNING *";
    }
    const r = await pool().query(sql, vals);
    const rows = (this.op === "select" || this.returning) ? r.rows : null;
    if (this.mode === "many") return { data: rows, error: null };
    if (!rows || rows.length === 0) {
      return this.mode === "single" ? { data: null, error: { message: "no rows" } } : { data: null, error: null };
    }
    return { data: rows[0], error: null };
  }
  private async pk(): Promise<string> {
    const r = await pool().query(
      `SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey)
       WHERE i.indrelid=$1::regclass AND i.indisprimary`, [`public.${this.table}`]);
    return r.rows.map((x) => x.attname).join(",");
  }
  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return this.run().catch((e): Result => ({ data: null, error: { message: (e as Error).message } })).then(ok, bad);
  }
}

export interface Db {
  from(table: string): Builder;
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<Result>;
}

const db: Db = {
  from: (t) => new Builder(t),
  rpc: (fn, args) => {
    if (!/^[a-z_]+$/.test(fn)) throw new Error("bad rpc name");
    const keys = Object.keys(args);
    const run = async (): Promise<Result> => {
      try {
        const r = await pool().query(`SELECT * FROM public.${fn}(${keys.map((_, i) => `$${i + 1}`).join(", ")})`, keys.map((k) => args[k]));
        return { data: r.rows, error: null };
      } catch (e) { return { data: null, error: { message: (e as Error).message } }; }
    };
    return { then: (a, b) => run().then(a, b) } as PromiseLike<Result>;
  },
};

export function serviceClient(): Db { return db; }
export function hasServiceDb(): boolean { return Boolean(env.DATABASE_URL); }
export async function rawQuery<T = Row>(sql: string, vals: unknown[] = []): Promise<T[]> {
  return (await pool().query(sql, vals)).rows as T[];
}
