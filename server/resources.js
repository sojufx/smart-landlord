import { columnsFor } from './db.js'
import { audit, hashPassword, requireRoles } from './auth.js'

export const RESOURCES = {
  landlords: { table: 'landlords', label: 'Landlord', search: ['full_legal_name','trading_name','email','company_number'], order: 'full_legal_name', roles: ['admin','owner','staff','accountant','viewer'] },
  properties: { table: 'properties', label: 'Property', search: ['address_line1','town','postcode','local_authority'], order: 'address_line1', roles: ['admin','owner','staff','accountant','viewer'] },
  tenants: { table: 'tenants', label: 'Tenant', search: ['first_name','surname','email','mobile'], order: 'surname', roles: ['admin','owner','staff','accountant','viewer'] },
  contracts: { table: 'contracts', label: 'Occupation contract', search: ['contract_number','additional_terms'], order: 'start_date DESC', roles: ['admin','owner','staff','accountant','viewer'] },
  deposits: { table: 'deposits', label: 'Deposit', search: ['scheme_reference','status'], order: 'date_received DESC NULLS LAST', roles: ['admin','owner','staff','accountant','viewer'] },
  compliance: { table: 'compliance_records', label: 'Compliance record', search: ['title','certificate_number','provider_engineer','category'], order: 'expiry_date ASC NULLS LAST', roles: ['admin','owner','staff','accountant','viewer'] },
  devices: { table: 'safety_devices', label: 'Safety device', search: ['location','alarm_type','associated_appliance'], order: 'location', roles: ['admin','owner','staff','accountant','viewer'] },
  contractors: { table: 'contractors', label: 'Contractor', search: ['name','company','trade','gas_safe_number'], order: 'name', roles: ['admin','owner','staff','accountant','viewer'] },
  repairs: { table: 'repairs', label: 'Repair', search: ['repair_number','problem','category','resolution_notes'], order: 'date_reported DESC', roles: ['admin','owner','staff','accountant','viewer'] },
  inspections: { table: 'inspections', label: 'Inspection', search: ['inspector','general_condition','repairs_required'], order: 'inspection_date DESC', roles: ['admin','owner','staff','accountant','viewer'] },
  inventories: { table: 'inventories', label: 'Inventory', search: ['inspector','comparison_notes'], order: 'inventory_date DESC', roles: ['admin','owner','staff','accountant','viewer'] },
  rent: { table: 'rent_payments', label: 'Rent payment', search: ['payment_reference','notes'], order: 'due_date DESC', roles: ['admin','owner','staff','accountant','viewer'] },
  invoices: { table: 'invoices', label: 'Invoice', search: ['invoice_number','customer_name','invoice_type'], order: 'issue_date DESC', roles: ['admin','owner','staff','accountant','viewer'] },
  expenses: { table: 'expenses', label: 'Expense', search: ['supplier','description','category'], order: 'expense_date DESC', roles: ['admin','owner','staff','accountant','viewer'] },
  documents: { table: 'documents', label: 'Document', search: ['title','original_name','folder','document_type'], order: 'created_at DESC', roles: ['admin','owner','staff','accountant','viewer'] },
  communications: { table: 'communications', label: 'Communication', search: ['subject','body','participants'], order: 'occurred_at DESC', roles: ['admin','owner','staff','accountant','viewer'] },
  notices: { table: 'notices', label: 'Notice', search: ['notice_type','recipient','response'], order: 'date_created DESC', roles: ['admin','owner','staff','accountant','viewer'] },
  tasks: { table: 'tasks', label: 'Task', search: ['title','details','location','assigned_to'], order: 'due_date ASC, due_time ASC NULLS LAST', roles: ['admin','owner','staff','accountant','viewer'] },
  reminders: { table: 'reminders', label: 'Reminder', search: ['title','message'], order: 'due_date ASC', roles: ['admin','owner','staff','accountant','viewer'] },
  audit_logs: { table: 'audit_logs', label: 'Audit event', search: ['actor_name','summary','action'], order: 'occurred_at DESC', readonly: true, roles: ['admin','owner','staff','accountant','viewer'] }
}

function parseJsonColumns(value, columns) {
  return Object.fromEntries(Object.entries(value).map(([key, val]) => {
    const column = columns.find(c => c.column_name === key)
    if (column?.data_type === 'jsonb' && typeof val === 'string') {
      try { return [key, JSON.parse(val)] } catch { return [key, val] }
    }
    if (column?.data_type === 'ARRAY' && typeof val === 'string') return [key, val.split(',').map(Number)]
    return [key, val]
  }))
}

export function registerResourceRoutes(app) {
  app.get('/api/:resource', async (req, res) => {
    const definition = RESOURCES[req.params.resource]
    if (!definition || !allowedRole(definition.roles, req.user)) return res.status(404).json({ error: 'Resource not found' })
    try {
      const columns = columnsFor(definition.table)
      const values = []
      let where = []
      for (const [key, value] of Object.entries(req.query)) {
        if (!columns.some(column => column.column_name === key)) continue
        values.push(value)
        where.push(`${quoteIdent(key)}::text = $${values.length}`)
      }
      if (req.query.q && definition.search.length) {
        values.push(`%${req.query.q}%`)
        const qIndex = values.length
        where.push(`(${definition.search.map(field => `${quoteIdent(field)} ILIKE $${qIndex}`).join(' OR ')})`)
      }
      const limit = Math.min(Number(req.query.limit || 200), 1000)
      const offset = Number(req.query.offset || 0)
      const sql = `SELECT * FROM ${quoteIdent(definition.table)} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ${definition.order} LIMIT ${limit} OFFSET ${offset}`
      const result = await req.pool.query(sql, values)
      res.json(result.rows)
    } catch (error) {
      console.error(error)
      res.status(500).json({ error: error.message })
    }
  })

  app.get('/api/:resource/:id', async (req, res) => {
    const definition = RESOURCES[req.params.resource]
    if (!definition || !allowedRole(definition.roles, req.user)) return res.status(404).json({ error: 'Resource not found' })
    try {
      const result = await req.pool.query(`SELECT * FROM ${quoteIdent(definition.table)} WHERE id=$1`, [req.params.id])
      if (!result.rows[0]) return res.status(404).json({ error: `${definition.label} not found` })
      res.json(result.rows[0])
    } catch (error) { res.status(500).json({ error: error.message }) }
  })

  app.post('/api/:resource', requireRoles('admin','owner','staff','accountant'), async (req, res) => {
    const definition = RESOURCES[req.params.resource]
    if (!definition || definition.readonly) return res.status(404).json({ error: 'Resource not found' })
    try {
      const body = prepareBody(req.params.resource, req.body)
      validateResource(req.params.resource, body)
      const writable = writableColumns(definition.table)
      const keys = Object.keys(body).filter(key => writable.some(column => column.column_name === key))
      if (!keys.length) return res.status(400).json({ error: 'No valid fields supplied' })
      const values = keys.map(key => normalizeValue(body[key]))
      const placeholders = keys.map((_, index) => `$${index + 1}`)
      const result = await req.pool.query(
        `INSERT INTO ${quoteIdent(definition.table)} (${keys.map(quoteIdent).join(',')}) VALUES (${placeholders.join(',')}) RETURNING *`,
        values
      )
      const row = postProcessCreate(req.params.resource, result.rows[0], req)
      await audit(req, req.user.sub, req.user.name, 'create', definition.table, row.id, row)
      res.status(201).json(row)
    } catch (error) {
      console.error(error)
      res.status(400).json({ error: error.message })
    }
  })

  app.patch('/api/:resource/:id', requireRoles('admin','owner','staff','accountant'), async (req, res) => {
    const definition = RESOURCES[req.params.resource]
    if (!definition || definition.readonly) return res.status(404).json({ error: 'Resource not found' })
    try {
      const beforeResult = await req.pool.query(`SELECT * FROM ${quoteIdent(definition.table)} WHERE id=$1`, [req.params.id])
      const before = beforeResult.rows[0]
      if (!before) return res.status(404).json({ error: `${definition.label} not found` })
      const body = prepareBody(req.params.resource, req.body)
      validateResource(req.params.resource, body, before)
      const writable = writableColumns(definition.table)
      const keys = Object.keys(body).filter(key => writable.some(column => column.column_name === key))
      if (!keys.length) return res.status(400).json({ error: 'No valid fields supplied' })
      const assignments = keys.map((key, index) => `${quoteIdent(key)}=$${index + 1}`)
      const values = keys.map(key => normalizeValue(body[key]))
      values.push(req.params.id)
      const result = await req.pool.query(
        `UPDATE ${quoteIdent(definition.table)} SET ${assignments.join(',')} WHERE id=$${values.length} RETURNING *`, values
      )
      const changes = Object.fromEntries(keys.map(key => [key, { from: before[key], to: result.rows[0][key] }]))
      await audit(req, req.user.sub, req.user.name, 'update', definition.table, before.id, changes)
      res.json(result.rows[0])
    } catch (error) {
      console.error(error)
      res.status(400).json({ error: error.message })
    }
  })

  app.delete('/api/:resource/:id', requireRoles('admin','owner'), async (req, res) => {
    const definition = RESOURCES[req.params.resource]
    if (!definition || definition.readonly) return res.status(404).json({ error: 'Resource not found' })
    try {
      const before = await req.pool.query(`SELECT * FROM ${quoteIdent(definition.table)} WHERE id=$1`, [req.params.id])
      if (!before.rows[0]) return res.status(404).json({ error: `${definition.label} not found` })
      await req.pool.query(`DELETE FROM ${quoteIdent(definition.table)} WHERE id=$1`, [req.params.id])
      await audit(req, req.user.sub, req.user.name, 'delete', definition.table, before.rows[0].id, before.rows[0])
      res.json({ ok: true })
    } catch (error) { res.status(400).json({ error: error.message }) }
  })
}

export async function exportCsv(req, res) {
  const definition = RESOURCES[req.params.resource]
  if (!definition) return res.status(404).json({ error: 'Resource not found' })
  const columns = columnsFor(definition.table).filter(column => column.column_name !== 'metadata').map(column => column.column_name)
  const result = await req.pool.query(`SELECT ${columns.map(quoteIdent).join(',')} FROM ${quoteIdent(definition.table)} ORDER BY ${definition.order}`)
  const rows = [columns.join(',')]
  for (const row of result.rows) rows.push(columns.map(column => csvCell(row[column])).join(','))
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="smart-landlord-${req.params.resource}-${new Date().toISOString().slice(0,10)}.csv"`)
  res.send(rows.join('\n'))
}

function allowedRole(roles, user) { return user && roles.includes(user.role) }
function quoteIdent(value) { return `"${String(value).replace(/"/g, '""')}"` }
function csvCell(value) {
  if (value == null) return ''
  const text = value instanceof Date ? value.toISOString() : String(typeof value === 'object' ? JSON.stringify(value) : value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g,'""')}"` : text
}
function writableColumns(table) {
  return columnsFor(table).filter(column => !['id','created_at','updated_at'].includes(column.column_name) && column.is_generated !== 'ALWAYS')
}
function normalizeValue(value) { return value === '' ? null : value }

function validateResource(resource, body, before) {
  if (resource !== 'compliance') return
  const status = body.status ?? before?.status
  if (status === 'not_applicable') return
  const inspectionDate = body.inspection_date ?? before?.inspection_date
  const expiryDate = body.expiry_date ?? before?.expiry_date
  if (!inspectionDate) throw new Error('Inspection / issue date is required unless the record is Not Applicable')
  if (!expiryDate) throw new Error('Expiry / retest date is required unless the record is Not Applicable')
}

function prepareBody(resource, body) {
  const columns = columnsFor(RESOURCES[resource].table)
  let parsed = parseJsonColumns(body, columns)
  if (resource === 'repairs') {
    parsed.repair_number ||= `R-${Date.now().toString().slice(-8)}`
  }
  if (resource === 'invoices') recalculateInvoice(parsed)
  return Object.fromEntries(Object.entries(parsed).map(([key,value])=>{
    const column=columns.find(item=>item.column_name===key)
    return [key,column?.data_type==='jsonb'&&value!=null&&!ArrayBuffer.isView(value)?JSON.stringify(value):value]
  }))
}

function recalculateInvoice(invoice) {
  if (!Array.isArray(invoice.line_items)) return
  invoice.line_items = invoice.line_items.map(line => ({
    type: line.type || 'other',
    description: line.description || '',
    quantity: Number(line.quantity || 1),
    unit_price: Number(line.unit_price || 0),
    discount: Number(line.discount || 0),
    vat_rate: line.vat_rate == null ? null : Number(line.vat_rate),
    ...lineTotal(line)
  }))
  invoice.subtotal = round2(invoice.line_items.reduce((sum,line)=>sum + Number(line.gross_amount || 0), 0))
  invoice.discount = round2(invoice.line_items.reduce((sum,line)=>sum + Number(line.discount || 0), 0))
  invoice.vat_amount = round2(invoice.line_items.reduce((sum,line)=>sum + Number(line.line_vat_amount || 0), 0))
  invoice.vat_rate = round2(invoice.vat_amount / Math.max(invoice.subtotal - invoice.discount, 0.01) * 100)
  invoice.total = round2(invoice.subtotal - invoice.discount + invoice.vat_amount)
}
function lineTotal(line) {
  const gross = Number(line.quantity || 1) * Number(line.unit_price || 0)
  const net = gross - Number(line.discount || 0)
  const rate = line.vat_rate == null || line.vat_rate === '' ? 0 : Number(line.vat_rate)
  return {
    vat_rate: line.vat_rate == null || line.vat_rate === '' ? null : Number(line.vat_rate),
    gross_amount: round2(gross),
    line_total: round2(net),
    line_vat_amount: round2(net * rate / 100)
  }
}
function round2(value) { return Math.round((Number.isFinite(+value) ? +value : 0)*100)/100 }
function postProcessCreate(resource, row, req) {
  return row
}
