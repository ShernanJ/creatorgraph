/* eslint-disable @typescript-eslint/no-explicit-any */
import { Pool } from "pg";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
});

export async function q<T = any>(text: string, params: any[] = []) {
  const res = await pool.query(text, params);
  return res.rows as T[];
}
