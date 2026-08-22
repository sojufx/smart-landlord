import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import multer from 'multer'
import crypto from 'node:crypto'
import { pool, migrate } from './db.js'
import { loginHandler, logoutHandler, changePasswordHandler, authenticate, requireRoles, hashPassword, audit } from './auth.js'
import { registerResourceRoutes, RESOURCES, exportCsv } from './resources.js'
import { registerComplianceRoutes, runReminders } from './compliance.js'
import { seedIfEmpty } from './seed.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
app.disable('x-powered-by')
app.set('trust proxy', 1)
app.set('authenticate', authenticate())

const uploadDir = process.env.UPLOAD_DIR || path.resolve(__dirname, '../data/uploads')
fs.mkdirSync(uploadDir, { recursive: true })
const maxUploadMb = Number(process.env.MAX_UPLOAD_MB || 200)
const today = () => new Date().toLocaleDateString('en-CA')

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'same-origin' }
}))
app.use(express.json({ limit: '2mb' }))
app.use(cookieParser())

app.use((req,res,next)=>{
  req.pool=pool
  res.setHeader('X-Content-Type-Options','nosniff')
  next()
})

app.use('/api/login', rateLimit({ windowMs:15*60*1000, limit:10, standardHeaders:true, legacyHeaders:false }))
app.post('/api/auth/login', loginHandler)
app.post('/api/login', loginHandler)
app.post('/api/auth/logout', logoutHandler)
app.post('/api/auth/change-password', changePasswordHandler)
app.get('/api/health', async (req,res)=> {
  try { await req.pool.query('select 1'); res.json({ok:true}) } catch(error){ res.status(500).json({ok:false,error:error.message}) }
})

app.use('/api', async (req,res,next)=> {
  if (['/auth/login','/login','/health'].includes(req.path)) return next()
  return authenticate()(req,res,next)
})

app.get('/api/me',(req,res)=>res.json(req.user))

app.route('/api/users')
  .get(requireRoles('admin'),async(req,res)=>{
    const result=await req.pool.query('SELECT id,email,name,role,phone,active,last_login_at,created_at FROM users ORDER BY name')
    res.json(result.rows)
  })
  .post(requireRoles('admin'),async(req,res)=>{
    try{
      const {email,name,password,role,phone}=req.body
      const result=await req.pool.query(
        `INSERT INTO users(email,name,password_hash,role,phone) VALUES($1,$2,$3,$4,$5) RETURNING id,email,name,role,phone,active`,
        [String(email).toLowerCase(),name,hashPassword(password),role||'staff',phone])
      await audit(req,req.user.sub,req.user.name,'create','users',result.rows[0].id,{email,name,role})
      res.status(201).json(result.rows[0])
    }catch(error){res.status(400).json({error:error.message})}
  })

const storage=multer.diskStorage({
  destination:(req,file,cb)=>cb(null,uploadDir),
  filename:(req,file,cb)=>cb(null,`${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname)}`)
})
const upload=multer({storage,limits:{fileSize:maxUploadMb*1024*1024}})
app.post('/api/documents/upload',upload.single('file'),async(req,res)=>{
  try{
    if(!req.file) return res.status(400).json({error:'No file uploaded'})
    const body=req.body
    const result=await req.pool.query(
      `INSERT INTO documents(title,entity_type,entity_id,folder,document_type,issue_date,expiry_date,version,notes,file_name,original_name,mime_type,file_size,uploaded_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [body.title || req.file.originalname,body.entity_type||null,body.entity_id||null,body.folder||null,body.document_type||null,
       body.issue_date||null,body.expiry_date||null,body.version||null,body.notes||null,req.file.filename,req.file.originalname,
       req.file.mimetype,req.file.size,req.user.sub])
    await audit(req,req.user.sub,req.user.name,'upload','documents',result.rows[0].id,{title:result.rows[0].title,size:req.file.size})
    res.status(201).json({...result.rows[0],url:`/api/documents/${result.rows[0].id}/file`})
  }catch(error){console.error(error);res.status(500).json({error:error.message})}
})
app.get('/api/documents/:id/file',async(req,res)=>{
  const row=await req.pool.query('SELECT file_name,original_name,mime_type FROM documents WHERE id=$1',[req.params.id])
  if(!row.rows[0]) return res.status(404).json({error:'Not found'})
  const mimeType=row.rows[0].mime_type || 'application/octet-stream'
  const safeInline =
    (mimeType.startsWith('image/') && mimeType !== 'image/svg+xml') ||
    mimeType.startsWith('audio/') ||
    mimeType.startsWith('video/') ||
    ['application/pdf','text/plain','text/csv','application/json'].includes(mimeType)
  res.setHeader('Content-Disposition',`${safeInline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(row.rows[0].original_name)}"`)
  res.type(safeInline ? mimeType : 'application/octet-stream')
  res.sendFile(path.join(uploadDir,row.rows[0].file_name))
})

app.post('/api/invoices/:id/payment',requireRoles('admin','owner','staff','accountant'),async(req,res)=>{
  const client=await req.pool.connect()
  try{
    await client.query('BEGIN')
    const current=await client.query('SELECT * FROM invoices WHERE id=$1 FOR UPDATE',[req.params.id])
    if(!current.rows[0]) throw Object.assign(new Error('Invoice not found'),{statusCode:404})
    const invoice=current.rows[0]
    const paid=req.body.paid===undefined ? invoice.status!=='paid' : Boolean(req.body.paid)
    const updated=await client.query(
      `UPDATE invoices SET amount_paid=$1,payment_date=$2,payment_method=$3,payment_reference=$4 WHERE id=$5 RETURNING *`,
      [paid?invoice.total:0,paid?today():null,paid?(req.body.payment_method||invoice.payment_method):null,paid?(req.body.payment_reference||invoice.payment_reference):null,invoice.id]
    )
    await client.query('COMMIT')
    await audit(req,req.user.sub,req.user.name,paid?'mark_paid':'mark_unpaid','invoices',invoice.id,{amount_paid:updated.rows[0].amount_paid})
    res.json(updated.rows[0])
  }catch(error){
    await client.query('ROLLBACK').catch(()=>{})
    res.status(error.statusCode||400).json({error:error.message})
  }finally{client.release()}
})

app.post('/api/rent/:id/receipt',requireRoles('admin','owner','staff','accountant'),async(req,res)=>{
  const client=await req.pool.connect()
  try{
    await client.query('BEGIN')
    const current=await client.query('SELECT * FROM rent_payments WHERE id=$1 FOR UPDATE',[req.params.id])
    if(!current.rows[0]) throw Object.assign(new Error('Rent record not found'),{statusCode:404})
    const payment=current.rows[0]
    const paid=req.body.paid===undefined ? payment.status!=='paid' : Boolean(req.body.paid)
    const updated=await client.query(
      `UPDATE rent_payments SET amount_received=$1,payment_date=$2,payment_method=$3,payment_reference=$4 WHERE id=$5 RETURNING *`,
      [paid?payment.amount_due:0,paid?today():null,paid?(req.body.payment_method||payment.payment_method):null,paid?(req.body.payment_reference||payment.payment_reference):null,payment.id]
    )
    await client.query('COMMIT')
    await audit(req,req.user.sub,req.user.name,paid?'mark_received':'mark_unreceived','rent_payments',payment.id,{amount_received:updated.rows[0].amount_received})
    res.json(updated.rows[0])
  }catch(error){
    await client.query('ROLLBACK').catch(()=>{})
    res.status(error.statusCode||400).json({error:error.message})
  }finally{client.release()}
})

registerComplianceRoutes(app)
app.get('/api/export/:resource',exportCsv)
registerResourceRoutes(app)

app.use('/uploads',express.static(uploadDir,{maxAge:'7d'}))
const publicDir=path.join(__dirname,'../dist')
app.use(express.static(publicDir,{maxAge:'1h',setHeaders:(res,pathName)=>{
  if(pathName.endsWith('sw.js')) res.setHeader('Cache-Control','no-cache')
}}))

app.use(async(error,req,res,next)=>{
  console.error(error)
  if(res.headersSent)return next(error)
  res.status(500).json({error:error.message||'Server error'})
})
app.use((req,res)=>{
  if(req.path.startsWith('/api/')) return res.status(404).json({error:'API endpoint not found'})
  res.sendFile(path.join(publicDir,'index.html'))
})

async function start(){
  await migrate()
  await seedIfEmpty(pool)
  const port=Number(process.env.PORT||8080)
  app.listen(port,'0.0.0.0',()=>console.log(`Smart Landlord running on port ${port}`))
  const runScheduled=async()=>{
    try{const created=await runReminders(pool); if(created)console.log(`Created ${created} compliance reminders`)}catch(error){console.error(error)}
  }
  await runScheduled()
  setInterval(runScheduled,60*60*1000).unref()
}

start().catch(error=>{console.error(error);process.exit(1)})
