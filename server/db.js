import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'

const { Pool } = pg

function secret(value, fileValue) {
  if (fileValue && fs.existsSync(fileValue)) return fs.readFileSync(fileValue, 'utf8').trim()
  return value
}

function connectionConfig() {
  const url = process.env.DATABASE_URL || 'postgres://landlord@127.0.0.1:5432/smart_landlord'
  const parsed = new URL(url)
  const password = secret(parsed.password ? decodeURIComponent(parsed.password) : '', process.env.DB_PASSWORD_FILE)
  if (password) parsed.password = password
  return {
    connectionString: parsed.toString(),
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
    max: Number(process.env.DB_POOL_SIZE || 10)
  }
}

export const pool = new Pool(connectionConfig())

let tableColumns

export async function migrate() {
  const schemaPath = path.resolve(import.meta.dirname, '../migrations/schema.sql')
  await pool.query(fs.readFileSync(schemaPath, 'utf8'))
  await refreshTableColumns()
}

export async function refreshTableColumns() {
  const result = await pool.query(`
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `)
  tableColumns = result.rows.reduce((acc, row) => {
    acc[row.table_name] ||= []
    acc[row.table_name].push(row)
    return acc
  }, {})
}

export function columnsFor(table) {
  return tableColumns?.[table] || []
}
