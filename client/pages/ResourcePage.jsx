import { useCallback,useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api,money,moneyExact,dateLabel } from '../lib/api.js'
import { RESOURCE_FIELDS,TABLE_COLUMNS } from '../lib/model.js'
import { ICONS,NAV } from '../lib/icons.js'
import { Modal } from '../components/ui.jsx'

const { Plus,Pencil,Trash2,Download,Printer,Upload,ExternalLink,Check } = ICONS
const NO_FIELDS = []
const INVOICE_LINE_TYPES=['management_fee','tenant_charge','contractor','maintenance','repair_recharge','rent_statement','arrears_statement','deposit_statement','other']
const EVIDENCE_RESOURCES={
  repairs:{entityType:'repairs',folder:'REPAIRS'},
  inspections:{entityType:'inspections',folder:'INSPECTIONS'},
  inventories:{entityType:'inventories',folder:'INVENTORIES'}
}

export default function ResourcePage({resource:resourceProp}){
  const params=useParams()
  const resource=resourceProp||params.resource
  const nav=NAV.find(item=>item.to===`/${resource}`)
  const title=nav?.label||resource.replace(/_/g,' ')
  const subtitle=SUBTITLES[resource]
  const fields=RESOURCE_FIELDS[resource]||NO_FIELDS
  const columns=TABLE_COLUMNS[resource]||['id']
  const [rows,setRows]=useState([])
  const [query,setQuery]=useState('')
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const [editing,setEditing]=useState(null)
  const [form,setForm]=useState({})
  const [options,setOptions]=useState({})
  const [saving,setSaving]=useState(false)
  const [rowBusyId,setRowBusyId]=useState('')
  const readOnly=resource==='reminders'||resource==='audit_logs'

  const load=useCallback(async()=>{
    setLoading(true); setError('')
    try{
      const data=await api(`/${resource}${query?`?q=${encodeURIComponent(query)}`:''}`)
      setRows(data)
      if(EVIDENCE_RESOURCES[resource]){
        const documents=await api('/documents?limit=1000')
        const grouped=documents.reduce((acc,doc)=>{
          if(doc.entity_id){(acc[doc.entity_id] ||= []).push(doc)}
          return acc
      },{})
        setOptions(current=>({...current,__documents:grouped}))
      }
      const sources=[...new Set(fields.filter(field=>field.type==='relationship').map(field=>field.options.source))]
      if(sources.length){
        const loaded=await Promise.all(sources.map(source=>api(`/${source}?limit=1000`)))
        setOptions(current=>({...current,...Object.fromEntries(sources.map((source,index)=>[source,loaded[index]]))}))
      }
    }catch(exception){setError(exception.message)}finally{setLoading(false)}
  },[resource,query,fields])

  useEffect(()=>{load()},[load])

  function openCreate(){setForm(defaultForm(fields));setEditing('new')}
  function openEdit(row){setForm(normalizeForm(row,fields));setEditing(row.id)}
  async function submit(event){
    event.preventDefault()
    setSaving(true)
    try{
      const body=prepareBody(form,fields)
      const evidenceFile=body.evidence_file
      delete body.evidence_file
      const evidenceFiles=Array.isArray(body.evidence_files)?body.evidence_files:[]
      delete body.evidence_files
      let recordId=editing
      if(editing==='new'){
        const created=await api(`/${resource}`,{method:'POST',body})
        recordId=created.id
        setEditing(recordId)
      } else if(Object.keys(body).length){
        await api(`/${resource}/${editing}`,{method:'PATCH',body})
      }
      if(evidenceFile instanceof File && resource==='compliance'){
        const evidence=new FormData()
        evidence.append('file',evidenceFile)
        evidence.append('title',form.title || `${label(form.category)} evidence`)
        evidence.append('entity_type','compliance_records')
        evidence.append('entity_id',recordId)
        evidence.append('folder',String(form.category||'compliance').replace(/_/g,' ').toUpperCase())
        evidence.append('document_type',form.category||'compliance')
        evidence.append('issue_date',form.inspection_date||'')
        evidence.append('expiry_date',form.expiry_date||'')
        const uploaded=await api('/documents/upload',{method:'POST',body:evidence})
        await api(`/${resource}/${recordId}`,{method:'PATCH',body:{document_url:uploaded.url}})
      }
      if(EVIDENCE_RESOURCES[resource]&&evidenceFiles.length){
        let firstUploadedUrl=''
        for(const file of evidenceFiles){
          const evidence=new FormData()
          evidence.append('file',file)
          evidence.append('title',`${title} — ${file.name}`)
          evidence.append('entity_type',EVIDENCE_RESOURCES[resource].entityType)
          evidence.append('entity_id',recordId)
          evidence.append('folder',EVIDENCE_RESOURCES[resource].folder)
          evidence.append('document_type',form.category||resource)
          evidence.append('issue_date',form.inspection_date||form.inventory_date||(form.date_reported?String(form.date_reported).slice(0,10):''))
          evidence.append('notes',form.details||form.problem||form.comparison_notes||'')
          const uploaded=await api('/documents/upload',{method:'POST',body:evidence})
          if(!firstUploadedUrl)firstUploadedUrl=uploaded.url
          setForm(current=>({...current,evidence_files:(current.evidence_files||[]).slice(1)}))
        }
        if((resource==='inspections'&&!form.report_url)||(resource==='inventories'&&!form.signed_document_url)){
          await api(`/${resource}/${recordId}`,{method:'PATCH',body:resource==='inspections'?{report_url:firstUploadedUrl}:{signed_document_url:firstUploadedUrl}})
        }
      }
      setEditing(null); setMessage('Saved'); setTimeout(()=>setMessage(''),2500); await load()
    }catch(exception){setError(exception.message)}
    finally{setSaving(false)}
  }
  async function remove(row){
    if(!window.confirm('Delete this record? This action is audited.'))return
    try{await api(`/${resource}/${row.id}`,{method:'DELETE'});await load()}catch(exception){setError(exception.message)}
  }

  async function togglePaid(row){
    const endpoint=resource==='invoices'?'payment':'receipt'
    setRowBusyId(row.id)
    try{
      await api(`/${resource}/${row.id}/${endpoint}`,{method:'POST',body:{paid:row.status!=='paid'}})
      setMessage(row.status==='paid'?'Marked unpaid':'Marked paid')
      setTimeout(()=>setMessage(''),2500)
      await load()
    }catch(exception){setError(exception.message)}
    finally{setRowBusyId('')}
  }

  return (
    <>
      <div className="page-header"><div><h1 className="page-title-lg" style={{textTransform:'capitalize'}}>{title}</h1>{subtitle&&<p className="page-subtitle">{subtitle}</p>}</div></div>
      <div className="toolbar">
        <input className="search-input" placeholder={`Search ${title.toLowerCase()}`} value={query} onChange={event=>setQuery(event.target.value)} />
        <a className="button" href={`/api/export/${resource}`}><Download size={16}/>CSV</a>
        {!readOnly && resource!=='documents' && <button className="button primary" onClick={openCreate}><Plus size={16}/>New</button>}
      </div>
      {resource==='documents' && <DocumentUploader onUploaded={load}/>}
      {error&&<div className="panel panel-body" style={{borderColor:'#fecaca',background:'#fff5f5',marginBottom:14}}>{error}</div>}
      {message&&<div className="toast">{message}</div>}
      <section className="panel">
        {loading?<div className="loading">Loading…</div>:!rows.length?<div className="empty-state">No records yet</div>:
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th style={{width:36}}></th>{columns.map(column=><th key={column}>{label(column)}</th>)}{!readOnly&&<th className="no-print" style={{width:100}}>Actions</th>}</tr></thead>
              <tbody>
                {rows.map(row=>(
                  <tr key={row.id}>
                    <td><span className={dotClass(row)} /></td>
                    {columns.map(column=><td key={column}><CellValue row={row} column={column} options={options}/></td>)}
                    {!readOnly && <td className="no-print">
                      <div style={{display:'flex',gap:5}}>
                        {(resource==='invoices'||resource==='rent')&&(
                          <button type="button" className={`button small ${row.status==='paid'?'':'primary'}`} disabled={rowBusyId===row.id} onClick={()=>togglePaid(row)} title={row.status==='paid'?'Mark unpaid':'Mark paid'} aria-label={row.status==='paid'?'Mark unpaid':'Mark paid'}><Check size={14}/></button>
                        )}
                        <button className="button small icon-only" aria-label="Edit" onClick={()=>openEdit(row)}><Pencil size={14}/></button>
                        {resource==='invoices'&&<button className="button small icon-only" aria-label="Print" onClick={()=>window.print()}><Printer size={14}/></button>}
                        {resource==='documents'&&<a className="button small icon-only" href={`/api/documents/${row.id}/file`} target="_blank" rel="noreferrer" aria-label="Open document"><ExternalLink size={14}/></a>}
                        <button className="button small danger icon-only" aria-label="Delete" onClick={()=>remove(row)}><Trash2 size={14}/></button>
                      </div>
                    </td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        }
      </section>
      {editing && (
        <Modal title={`${editing==='new'?'New':'Edit'} ${title.replace(/s$/,'')}`} onClose={()=>setEditing(null)} footer={
          <><button type="button" className="button" onClick={()=>setEditing(null)} disabled={saving}>Cancel</button><button type="submit" form="resource-form" className="button primary" disabled={saving}>{saving?'Saving...':editing==='new'?'Create':'Save changes'}</button></>
        }>
          {fields.length?
            <form id="resource-form" onSubmit={submit} className="form-grid">
              {fields.map(field=><FormField key={field.name} field={field} value={form[field.name]} form={form} options={options} onChange={value=>setForm(current=>({...current,[field.name]:value}))}/>)}
            </form>:
            <p>This module uses the underlying database record. Use CSV export for reporting.</p>
          }
        </Modal>
      )}
    </>
  )
}

function DocumentUploader({onUploaded}){
  const [busy,setBusy]=useState(false)
  const [metadata,setMetadata]=useState({title:'',folder:'',document_type:'',expiry_date:''})
  async function submit(event){
    event.preventDefault(); setBusy(true)
    try{
      const data=new FormData()
      data.append('file',event.target.file.files[0])
      Object.entries(metadata).forEach(([key,value])=>data.append(key,value))
      await api('/documents/upload',{method:'POST',body:data})
      setMetadata({title:'',folder:'',document_type:'',expiry_date:''})
      event.target.reset(); onUploaded()
    }finally{setBusy(false)}
  }
  return (
    <form className="panel panel-body upload-box section" onSubmit={submit}>
      <h2>Add evidence</h2>
      <div className="form-grid" style={{marginTop:12}}>
        <label className="field form-wide"><span className="field-label">File — any type</span><input name="file" type="file" required/></label>
        <label className="field"><span className="field-label">Title</span><input value={metadata.title} onChange={event=>setMetadata({...metadata,title:event.target.value})}/></label>
        <label className="field"><span className="field-label">Folder</span><input value={metadata.folder} onChange={event=>setMetadata({...metadata,folder:event.target.value})} placeholder="EPC / Gas / Contract"/></label>
        <label className="field"><span className="field-label">Document type</span><input value={metadata.document_type} onChange={event=>setMetadata({...metadata,document_type:event.target.value})}/></label>
        <label className="field"><span className="field-label">Expiry</span><input type="date" value={metadata.expiry_date} onChange={event=>setMetadata({...metadata,expiry_date:event.target.value})}/></label>
      </div>
      <button className="button primary" disabled={busy} style={{marginTop:12}}><Upload size={16}/>{busy?'Uploading…':'Upload document'}</button>
    </form>
  )
}

function defaultForm(fields){
  return Object.fromEntries(fields.map(field=>[field.name,
    field.type==='boolean'?false:
    field.type==='file'?null:
    field.type==='files'?[]:
    field.type==='invoice_lines'?[emptyInvoiceLine()]:
    field.type==='json'?'':
    field.type==='select'?field.options?.[0]||'':''
  ]))
}
function normalizeForm(row,fields){
  return Object.fromEntries(fields.map(field=>{
    let value=row[field.name]
    if(field.type==='file')return [field.name,null]
    if(field.type==='files')return [field.name,[]]
    if(field.type==='datetime-local'&&value)value=new Date(value).toISOString().slice(0,16)
    if(field.type==='invoice_lines')return [field.name,Array.isArray(value)?value:[]]
    if(field.type==='json')value=value==null?'':JSON.stringify(value,null,2)
    if(value==null)value=''
    return [field.name,value]
  }))
}
function prepareBody(form,fields){
  return Object.fromEntries(Object.entries(form).map(([name,value])=>{
    const field=fields.find(item=>item.name===name)
    if(field?.type==='files')return[name,Array.isArray(value)?value.filter(file=>file instanceof File):[]]
    if(field?.type==='invoice_lines')return[name,Array.isArray(value)?value:[]]
    if(field?.type==='json'&&typeof value==='string'){try{return[name,value.trim()?JSON.parse(value):[]]}catch{return[name,value]}}
    if(name==='reminder_days'&&typeof value==='string')return[name,value.split(',').map(Number).filter(Boolean)]
    return [name,value]
  }))
}
function FormField({field,value,form,options,onChange}){
  const wide=['textarea','json'].includes(field.type)||String(field.label).length>35
  if(field.type==='files')return (
    <div className="field form-wide">
      <span className="field-label">{field.label}{field.required?' *':''}</span>
      <input type="file" multiple onChange={event=>onChange(Array.from(event.target.files||[]))}/>
      <span className="field-hint">
        {Array.isArray(value)&&value.length?value.map(file=>file.name).join(', '):'Select one or more PDFs, photos, DOCX, spreadsheets or other files'}
      </span>
    </div>
  )
  if(field.type==='invoice_lines')return (
    <div className="field form-wide">
      <span className="field-label">{field.label}</span>
      <InvoiceLineItemsEditor value={Array.isArray(value)?value:[]} onChange={onChange}/>
    </div>
  )
  return (
    <label className={`field ${wide?'form-wide':''}`}>
      <span className="field-label">{field.label}{field.required?' *':''}</span>
      {field.type==='select'
        ?<select value={value||''} onChange={event=>onChange(event.target.value)}><option value="">Choose…</option>{field.options.map(option=><option key={option} value={option}>{label(option)}</option>)}</select>
        :field.type==='textarea'?<textarea value={value||''} onChange={event=>onChange(event.target.value)}/>
        :field.type==='json'?<textarea value={value||''} onChange={event=>onChange(event.target.value)} spellCheck="false"/>
        :field.type==='boolean'?<span className="checkbox"><input type="checkbox" checked={!!value} onChange={event=>onChange(event.target.checked)}/>{field.label}</span>
        :field.type==='file'?<><input type="file" onChange={event=>onChange(event.target.files?.[0]||null)}/><span className="field-hint">{value instanceof File?value.name:'PDF, photo, CSV or any evidence file'}</span></>
        :field.type==='relationship'?<select value={value||''} onChange={event=>onChange(event.target.value)}><option value="">Choose…</option>{(options[field.options.source]||[]).map(row=><option key={row.id} value={row.id}>{row[field.options.label]}{row[field.options.secondary]?` · ${row[field.options.secondary]}`:''}</option>)}</select>
        :<input type={field.type||'text'} value={value||''} required={field.required} onChange={event=>onChange(event.target.value)}/>}
    </label>
  )
}

function InvoiceLineItemsEditor({value,onChange}){
  const rows=value.length?value:[emptyInvoiceLine()]
  function update(index,next){
    onChange(rows.map((row,rowIndex)=>rowIndex===index?next:row))
  }
  function addLine(){onChange([...rows,emptyInvoiceLine()])}
  function removeLine(index){onChange(rows.filter((_,rowIndex)=>rowIndex!==index))}
  const summary=rows.reduce((acc,line)=>{
    const net=num(line.quantity)*num(line.unit_price)-num(line.discount)
    const vat=net*num(line.vat_rate)/100
    return {net:acc.net+net,vat:acc.vat+vat}
  },{net:0,vat:0})
  return (
    <div className="invoice-lines">
      {rows.map((line,index)=>(
        <article key={index} className="invoice-line">
          <div className="invoice-line-head">
            <label className="field"><span className="field-label">Charge type</span>
              <select value={line.type||'other'} onChange={event=>update(index,{...line,type:event.target.value})}>
                {INVOICE_LINE_TYPES.map(option=><option key={option} value={option}>{label(option)}</option>)}
              </select>
            </label>
            {rows.length>1 && <button type="button" className="button danger small" onClick={()=>removeLine(index)}>Remove</button>}
          </div>
          <div className="invoice-line-grid">
            <label className="field form-wide"><span className="field-label">Description</span><input value={line.description||''} onChange={event=>update(index,{...line,description:event.target.value})}/></label>
            <label className="field"><span className="field-label">Quantity</span><input type="number" step="0.01" value={line.quantity ?? ''} onChange={event=>update(index,{...line,quantity:event.target.value})}/></label>
            <label className="field"><span className="field-label">Unit price</span><input type="number" step="0.01" value={line.unit_price ?? ''} onChange={event=>update(index,{...line,unit_price:event.target.value})}/></label>
            <label className="field"><span className="field-label">Discount</span><input type="number" step="0.01" value={line.discount ?? ''} onChange={event=>update(index,{...line,discount:event.target.value})}/></label>
            <label className="field"><span className="field-label">VAT %</span><input type="number" min="0" step="0.01" value={line.vat_rate ?? ''} onChange={event=>update(index,{...line,vat_rate:event.target.value})}/></label>
          </div>
          <p className="invoice-line-total">{moneyExact(net(line))} net · {moneyExact(lineVat(line))} VAT</p>
        </article>
      ))}
      <div className="invoice-summary">
        <button type="button" className="button" onClick={addLine}>Add another charge type</button>
        <strong>{moneyExact(summary.net)} net · {moneyExact(summary.vat)} VAT · {moneyExact(summary.net+summary.vat)} total</strong>
      </div>
    </div>
  )
}

function emptyInvoiceLine(){
  return {type:'management_fee',description:'',quantity:1,unit_price:'',discount:'',vat_rate:''}
}
function num(value){const parsed=Number(value);return Number.isFinite(parsed)?parsed:0}
function net(line){return num(line.quantity)*num(line.unit_price)-num(line.discount)}
function lineVat(line){return net(line)*num(line.vat_rate)/100}
function CellValue({row,column,options}){
  const value=row[column]
  const field=Object.values(RESOURCE_FIELDS).flat().find(item=>item.name===column)
  if(column==='document_count'){
    const documents=options.__documents?.[row.id]||[]
    if(!documents.length)return '—'
    return <a href={`/api/documents/${documents[0].id}/file`} target="_blank" rel="noreferrer">{documents.length} {documents.length===1?'file':'files'}</a>
  }
  if(field?.type==='relationship'){
    const option=(options[field.options.source]||[]).find(item=>item.id===value)
    return option?`${option[field.options.label]}${option[field.options.secondary]?` ${option[field.options.secondary]}`:''}`:'—'
  }
  if(['status','priority','referencing_status','severity','inventory_type','direction'].includes(column))return <StatusText value={value}/>
  if(typeof value==='boolean')return value?'Yes':'No'
  if(['amount_due','amount_received','amount','total','net_amount','vat_amount','gross_amount','rent_amount','quote_amount','invoice_amount','purchase_price','annual_income','returned_amount'].includes(column))return moneyExact(value)
  if(['date_reported','appointment_at','occurred_at'].includes(column))return new Date(value).toLocaleString('en-GB')
  if(String(column).includes('_date')||['due_date','last_test_date'].includes(column))return dateLabel(value)
  if(['url','document_url','certificate_url','report_url','receipt_url','id_document_url','invoice_url','signed_document_url','photo_url','floor_plan_url','attachment_url','certificates_url'].includes(column))return value?<a href={value} target="_blank" rel="noreferrer">Open</a>:'—'
  if(value==null||value==='')return '—'
  return <span className="cell-truncate" title={String(value)}>{Array.isArray(value)?JSON.stringify(value):String(value)}</span>
}
function StatusText({value}){
  const color=['paid','closed','low','passed','info','completed','active','occupied','protected','current','served'].includes(value)?'green'
    :['part_paid','normal','scheduled','amber','quoted','in_progress','waiting','notice','high','open'].includes(value)?'amber'
    :value==='cancelled'?'neutral':'red'
  return <span className={`pill ${color}`}>{String(value||'—').replace(/_/g,' ')}</span>
}
function dotClass(row){
  if(row.severity)return `status-dot ${row.severity==='red'?'status-red':row.severity==='amber'?'status-amber':'status-white'}`
  if(row.status==='completed')return'status-dot status-green'
  if(row.status==='cancelled')return'status-dot status-white'
  if(row.due_date){
    const days=Math.ceil((new Date(row.due_date)-new Date())/86400000)
    if(days<0)return'status-dot status-red'
    if(days<=7)return'status-dot status-amber'
    return'status-dot status-green'
  }
  if(row.expiry_date){const days=Math.ceil((new Date(row.expiry_date)-new Date())/86400000);if(days<0)return'status-dot status-red';if(days<=30)return'status-dot status-amber';return'status-dot status-green'}
  if(row.status==='expired'||row.priority==='emergency'||row.status==='arrears')return'status-dot status-red'
  if(row.priority==='urgent')return'status-dot status-red'
  if(['active','occupied','protected','passed','completed'].includes(row.status))return'status-dot status-green'
  return'status-dot status-white'
}
function label(value){return String(value).replace(/_/g,' ').replace(/\b\w/g,char=>char.toUpperCase())}

const SUBTITLES={
  landlords:'Legal owners, Rent Smart Wales registration, licences and financial contacts.',
  properties:'The master record for each Welsh rental property.',
  tenants:'Contract-holders, referencing, guarantors and right-to-occupy evidence.',
  contracts:'Welsh occupation contracts and written-statement tracking.',
  deposits:'Authorised scheme protection and prescribed information evidence.',
  compliance:'Certificates, inspections and automatic red / amber / green status.',
  devices:'Smoke and carbon monoxide alarm test history.',
  contractors:'Trades, insurance and qualification expiry monitoring.',
  repairs:'Maintenance workflow from first report to invoiced closure.',
  inspections:'Routine visits, condition notes and follow-up actions.',
  inventories:'Check-in, check-out and dispute evidence.',
  rent:'Due dates, receipts, allocation and arrears.',
  invoices:'Management fees, rechargeable works, statements and supplier invoices.',
  expenses:'Property costs, VAT and accountant-ready exports.',
  documents:'Versioned evidence vault with expiry tracking.',
  communications:'A dated trail of calls, emails, letters and outcomes.',
  notices:'Contract notices, proof of service and deadlines.',
  tasks:'Property visits, planned changes, follow-ups and one-off jobs.',
  reminders:'Automatic compliance and renewal alerts.',
  audit_logs:'Immutable activity trail for governance and disputes.'
}
