export function registerComplianceRoutes(app) {
  app.get('/api/dashboard', async (req,res) => {
    try {
      const [portfolio, compliance, repairs, rent, invoiceSummary, upcoming, audit] = await Promise.all([
        req.pool.query(`
          SELECT count(*)::int AS total,
                 count(*) FILTER (WHERE status='occupied')::int AS occupied,
                 count(*) FILTER (WHERE status='vacant')::int AS vacant,
                 coalesce((SELECT sum(
                   CASE c.rent_frequency WHEN 'weekly' THEN c.rent_amount * 52 / 12
                     WHEN 'fortnightly' THEN c.rent_amount * 26 / 12
                     WHEN 'monthly' THEN c.rent_amount
                     WHEN 'quarterly' THEN c.rent_amount / 3 END)
                 FROM contracts c WHERE c.status='active'),0)::numeric AS monthly_rent
          FROM properties p
        `),
        req.pool.query(`
          SELECT category,
                 count(*) FILTER (WHERE status='current' AND expiry_date > current_date + interval '30 days')::int AS green,
                 count(*) FILTER (WHERE status='current' AND expiry_date BETWEEN current_date AND current_date + interval '30 days')::int AS amber,
                 count(*) FILTER (WHERE expiry_date < current_date OR status='expired' OR (expiry_date IS NULL AND status <> 'not_applicable'))::int AS red,
                 count(*) FILTER (WHERE status='not_applicable')::int AS not_applicable,
                 count(*)::int AS total
          FROM compliance_records GROUP BY category ORDER BY category
        `),
        req.pool.query(`
          SELECT priority, count(*)::int AS count FROM repairs
          WHERE status NOT IN ('completed','invoiced','closed') GROUP BY priority
        `),
        req.pool.query(`
          SELECT coalesce(sum(greatest(amount_due-amount_received,0)),0)::numeric AS arrears,
                 coalesce(sum(amount_received),0)::numeric AS collected_30d,
                 count(*) FILTER (WHERE amount_due > amount_received AND due_date <= current_date)::int AS arrears_count
          FROM rent_payments WHERE due_date >= current_date - interval '90 days'
        `),
        req.pool.query(`
          SELECT coalesce(sum(greatest(total-amount_paid,0)),0)::numeric AS outstanding,
                 coalesce(sum(amount_paid),0)::numeric AS collected,
                 count(*) FILTER (WHERE total > amount_paid)::int AS unpaid_count
          FROM invoices WHERE invoice_type NOT IN ('purchase','expense')
        `),
        req.pool.query(`
          SELECT * FROM (
            SELECT cr.id::text, 'compliance' AS type, p.address_line1 || ', ' || coalesce(p.town,'') AS context,
                   CASE cr.category
                     WHEN 'gas' THEN 'Gas Safety CP12 expiring soon'
                     WHEN 'eicr' THEN 'EICR electrical certificate expiring soon'
                     WHEN 'epc' THEN 'EPC expiring soon'
                     WHEN 'insurance' THEN 'Property insurance expiring soon'
                     WHEN 'smoke_co_alarm' THEN 'Smoke and CO2 alarm compliance expiring soon'
                     WHEN 'fire_detection_alarm_system' THEN 'Fire detection and alarm system compliance expiring soon'
                     ELSE initcap(replace(cr.category,'_',' ')) || ' expiring soon'
                   END AS title, cr.expiry_date AS due_date
            FROM compliance_records cr JOIN properties p ON p.id=cr.property_id
            WHERE cr.status <> 'not_applicable' AND cr.expiry_date IS NOT NULL
            UNION ALL
            SELECT p.id::text,'insurance',p.address_line1 || ', ' || coalesce(p.town,''),'Insurance renewal',p.insurance_expiry
            FROM properties p WHERE p.insurance_expiry IS NOT NULL
            UNION ALL
            SELECT l.id::text,'rsw_registration',l.full_legal_name,'RSW registration renewal',l.rsw_registration_expiry
            FROM landlords l WHERE l.rsw_registration_expiry IS NOT NULL
            UNION ALL
            SELECT t.id::text,'task',coalesce(p.address_line1 || ', ' || p.town,'General'),t.title,t.due_date
            FROM tasks t LEFT JOIN properties p ON p.id=t.property_id
            WHERE t.status NOT IN ('completed','cancelled') AND t.due_date >= current_date
          ) items WHERE due_date >= current_date ORDER BY due_date LIMIT 8
        `),
        req.pool.query(`SELECT * FROM audit_logs ORDER BY occurred_at DESC LIMIT 10`)
      ])
      const totals = compliance.rows.reduce((acc,row)=>({
        green: acc.green + row.green, amber: acc.amber + row.amber, red: acc.red + row.red, total: acc.total + row.total
      }), {green:0,amber:0,red:0,total:0})
      const recentRepairs = (await req.pool.query(`
        SELECT r.*, p.address_line1, p.town FROM repairs r LEFT JOIN properties p ON p.id=r.property_id
        WHERE r.status NOT IN ('closed') ORDER BY CASE priority WHEN 'emergency' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END, date_reported DESC LIMIT 6
      `)).rows
      const recentRent = (await req.pool.query(`
        SELECT rp.*, c.contract_number, t.first_name, t.surname, p.address_line1, p.town
        FROM rent_payments rp JOIN contracts c ON c.id=rp.contract_id
        LEFT JOIN tenants t ON t.id=c.tenant_id LEFT JOIN properties p ON p.id=c.property_id
        ORDER BY rp.due_date DESC, rp.created_at DESC LIMIT 8
      `)).rows
      const taskSummary = (await req.pool.query(`
        SELECT count(*) FILTER (WHERE status NOT IN ('completed','cancelled'))::int AS open_count,
               count(*) FILTER (WHERE status NOT IN ('completed','cancelled') AND due_date < current_date)::int AS overdue_count
        FROM tasks
      `)).rows[0]
      res.json({ portfolio:portfolio.rows[0], compliance:{byCategory:compliance.rows,totals}, repairs:repairs.rows, recentRepairs, rent:rent.rows[0], recentRent, invoices:invoiceSummary.rows[0], upcoming:upcoming.rows, audit:audit.rows, tasks:taskSummary })
    } catch (error) { console.error(error); res.status(500).json({error:error.message}) }
  })

  app.get('/api/compliance/summary', async (req,res) => {
    try {
      const records = await req.pool.query('SELECT * FROM compliance_records')
      const devices = await req.pool.query('SELECT * FROM safety_devices')
      const properties = await req.pool.query('SELECT * FROM properties ORDER BY address_line1')
      const scores = properties.rows.map(property => propertyScore(property, records.rows.filter(r=>r.property_id===property.id), devices.rows.filter(d=>d.property_id===property.id)))
      res.json({ properties:scores, totals:scores.reduce((acc,p)=>({green:acc.green+p.summary.green,amber:acc.amber+p.summary.amber,red:acc.red+p.summary.red}),{green:0,amber:0,red:0}) })
    } catch (error) { res.status(500).json({error:error.message}) }
  })

  app.post('/api/rent/generate/:month', requireAuth(app), async (req,res) => {
    try {
      if (!/^\d{4}-\d{2}$/.test(req.params.month)) return res.status(400).json({error:'Use YYYY-MM'})
      const contracts = await req.pool.query("SELECT * FROM contracts WHERE status='active'")
      let created = 0
      for (const contract of contracts.rows) {
        const year = Number(req.params.month.slice(0,4)), month = Number(req.params.month.slice(5,7))
        const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
        const dueDate = `${req.params.month}-${String(Math.min(contract.rent_due_day || 1,lastDay)).padStart(2,'0')}`
        const multiplier = contract.rent_frequency === 'weekly' ? 52/12 : contract.rent_frequency === 'fortnightly' ? 26/12 : contract.rent_frequency === 'quarterly' ? 1/3 : 1
        const result = await req.pool.query(`
          INSERT INTO rent_payments(contract_id,due_date,amount_due,period_start,period_end,notes)
          VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id`,
          [contract.id,dueDate,round2(Number(contract.rent_amount)*multiplier),`${req.params.month}-01`,dueDate,`Auto-generated ${req.params.month}`])
        created += result.rowCount
      }
      res.json({created})
    } catch(error) { res.status(400).json({error:error.message}) }
  })

  app.post('/api/reminders/run', requireAuth(app), async (req,res) => {
    try {
      const created = await runReminders(req.pool)
      res.json({created})
    } catch(error) { res.status(500).json({error:error.message}) }
  })

  app.get('/api/statements/landlord/:id', async (req,res) => {
    try {
      const year = Number(req.query.year || new Date().getFullYear())
      const landlordId = req.params.id
      const properties = await req.pool.query('SELECT id,address_line1,town FROM properties WHERE landlord_id=$1',[landlordId])
      const ids = properties.rows.map(p=>p.id)
      const rental = ids.length ? await req.pool.query(`
        SELECT coalesce(sum(rp.amount_received),0)::numeric AS received FROM rent_payments rp JOIN contracts c ON c.id=rp.contract_id
        WHERE c.landlord_id=$1 AND extract(year from rp.payment_date)=${Number(year)||0}`, [landlordId]) : {rows:[{received:0}]}
      const expenses = await req.pool.query(`
        SELECT category, sum(net_amount)::numeric AS net, sum(vat_amount)::numeric AS vat, sum(gross_amount)::numeric AS gross
        FROM expenses WHERE landlord_id=$1 AND extract(year from expense_date)=$2 GROUP BY category ORDER BY category`,[landlordId,year])
      const invoices = await req.pool.query(`
        SELECT invoice_number,customer_name,issue_date,total,amount_paid,payment_date,status FROM invoices WHERE landlord_id=$1 AND extract(year from issue_date)=$2 ORDER BY issue_date`,[landlordId,year])
      const invoiceSummary = await req.pool.query(`
        SELECT invoice_type,count(*)::int AS count,sum(total)::numeric AS billed,sum(amount_paid)::numeric AS paid,
               sum(greatest(total-amount_paid,0))::numeric AS outstanding
        FROM invoices WHERE landlord_id=$1 AND extract(year from issue_date)=$2
        GROUP BY invoice_type ORDER BY invoice_type`,[landlordId,year])
      const totalExpenses = expenses.rows.reduce((sum,row)=>sum+Number(row.gross||0),0)
      res.json({
        year,
        income:Number(rental.rows[0].received||0),
        expenses:expenses.rows,
        totalExpenses,
        profit:Number(rental.rows[0].received||0)-totalExpenses,
        invoices:invoices.rows,
        invoiceSummary:invoiceSummary.rows,
        properties:properties.rows
      })
    } catch(error) { res.status(500).json({error:error.message}) }
  })
}

function requireAuth(app) {
  return (req,res,next)=>app.get('authenticate')(req,res,next)
}

function round2(value){return Math.round((Number(value)||0)*100)/100}

export function deriveStatus(record) {
  if (!record.expiry_date && record.status === 'current') {
    return 'red'
  }
  const expiry = record.expiry_date ? new Date(record.expiry_date) : null
  if (!expiry) return record.status==='not_applicable'?'white':'amber'
  const today = new Date(); today.setHours(0,0,0,0)
  const days = Math.ceil((expiry-today)/86400000)
  if (days < 0 || record.status==='expired') return 'red'
  if (days <= 30) return 'amber'
  return 'green'
}

export function propertyScore(property, records, devices) {
  const categories = [
    ['gas', true],['eicr',true],['epc',true],['insurance',true],
    ['rsw_registration',true],['rsw_licence',false],['smoke_co_alarm',true],
    ['fire_detection_alarm_system',true]
  ]
  const checks = categories.map(([category,required]) => {
    const latest = records.filter(record=>record.category===category)
      .sort((a,b)=>new Date(b.expiry_date||b.updated_at)-new Date(a.expiry_date||a.updated_at))[0]
    if (!latest) return {category,status:required?'red':'white',label:label(category)}
    return {category,label:label(category),status:deriveStatus(latest),record:latest}
  })
  const smoke = devices.filter(d=>d.device_type==='smoke_alarm')
  const carbon = devices.filter(d=>d.device_type==='carbon_monoxide_alarm')
  checks.push({category:'safety_devices',label:'Smoke/CO alarms',status:deviceStatus([...smoke,...carbon]),count:smoke.length+carbon.length})
  const applicable = checks.filter(check=>check.status!=='white')
  const summary = applicable.reduce((acc,check)=>{acc[check.status]=(acc[check.status]||0)+1;return acc},{green:0,amber:0,red:0})
  const score = Math.round(((summary.green + summary.amber*0.5)/(summary.green+summary.amber+summary.red))*100) || (applicable.length?0:100)
  return {...property,checks,summary,score}
}

function deviceStatus(devices) {
  if (!devices.length) return 'white'
  const overdue = devices.some(device => device.replacement_due && new Date(device.replacement_due)<new Date())
  const stale = devices.some(device => !device.last_test_date || Date.now()-new Date(device.last_test_date).getTime()>365.25*86400000)
  if (overdue || stale) return 'red'
  if (devices.some(device => Date.now()-new Date(device.last_test_date).getTime()>300*86400000)) return 'amber'
  return 'green'
}
function label(value) {
  if (value === 'fire_detection_alarm_system') return 'Fire Detection and Alarm System'
  return value.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())
}

export async function runReminders(pool) {
  const sources = [
    {sql:`SELECT id,title,coalesce(next_review_date,expiry_date) due_date FROM compliance_records WHERE status<>'not_applicable'`,table:'compliance_records'},
    {sql:`SELECT id,location || ' alarm test/replacement' title,replacement_due due_date FROM safety_devices WHERE replacement_due IS NOT NULL`,table:'safety_devices'},
    {sql:`SELECT id,address_line1 || ' insurance' title,insurance_expiry due_date FROM properties WHERE insurance_expiry IS NOT NULL`,table:'properties'},
    {sql:`SELECT id,full_legal_name || ' RSW registration' title,rsw_registration_expiry due_date FROM landlords WHERE rsw_registration_expiry IS NOT NULL`,table:'landlords'},
    {sql:`SELECT id,full_legal_name || ' RSW licence' title,rsw_licence_expiry due_date FROM landlords WHERE rsw_licence_expiry IS NOT NULL`,table:'landlords'},
    {sql:`SELECT id,title,due_date FROM tasks WHERE status NOT IN ('completed','cancelled')`,table:'tasks'}
  ]
  let created=0
  for (const source of sources) {
    const rows=(await pool.query(source.sql)).rows
    for(const row of rows){
      if(!row.due_date) continue
      const days=Math.ceil((new Date(row.due_date)-new Date())/86400000)
      for(const threshold of [90,60,30,7]){
        if(days<=threshold && days>threshold-31){
          const key=`${threshold}_day`
          const severity=days<=30?'amber':days<=7?'red':'info'
          const result=await pool.query(`INSERT INTO reminders(source_table,source_id,reminder_key,title,due_date,severity,message)
            VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(source_table,source_id,reminder_key) DO NOTHING`,[
            source.table,row.id,key,row.title,row.due_date,severity,`${row.title} is due in ${days} days`])
          created+=result.rowCount
        }
      }
      if(days<0){
        const result=await pool.query(`INSERT INTO reminders(source_table,source_id,reminder_key,title,due_date,severity,message)
          VALUES($1,$2,$3,$4,$5,'red',$6) ON CONFLICT(source_table,source_id,reminder_key) DO NOTHING`,[
          source.table,row.id,'overdue',row.title,row.due_date,`${row.title} has expired`])
        created+=result.rowCount
      }
    }
  }
  return created
}
