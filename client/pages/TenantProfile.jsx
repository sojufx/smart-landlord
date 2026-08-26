import { useCallback,useEffect,useState } from 'react'
import { Link,useParams } from 'react-router-dom'
import { api,moneyExact,dateLabel } from '../lib/api.js'
import { ICONS } from '../lib/icons.js'

const { ArrowLeft,Pencil,Upload,ExternalLink,Trash2 } = ICONS

const EDIT_FIELDS=[
  ['title','Title'],['first_name','First name'],['middle_name','Middle name'],['surname','Surname'],
  ['date_of_birth','Date of birth','date'],['current_address','Current address','textarea'],
  ['previous_address','Previous address','textarea'],['mobile','Mobile'],['email','Email','email'],
  ['emergency_contact_name','Emergency contact'],['emergency_contact_relationship','Relationship'],
  ['emergency_contact_phone','Emergency phone'],['guarantor_name','Guarantor'],
  ['guarantor_address','Guarantor address','textarea'],['guarantor_phone','Guarantor phone'],
  ['guarantor_email','Guarantor email','email'],['notes','Notes','textarea']
]

export default function TenantProfile(){
  const {id}=useParams()
  const [tenant,setTenant]=useState(null)
  const [contracts,setContracts]=useState([])
  const [payments,setPayments]=useState([])
  const [documents,setDocuments]=useState([])
  const [properties,setProperties]=useState([])
  const [communications,setCommunications]=useState([])
  const [editing,setEditing]=useState(false)
  const [form,setForm]=useState({})
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const [uploadType,setUploadType]=useState('passport')
  const [saving,setSaving]=useState(false)

  const load=useCallback(async()=>{
    try{
      const [tenantData,contractData,paymentData,documentData,propertyData,communicationData]=await Promise.all([
        api(`/tenants/${id}`),api(`/contracts?tenant_id=${id}&limit=1000`),
        api('/rent?limit=1000'),api('/documents?limit=1000'),
        api('/properties?limit=1000'),api(`/communications?tenant_id=${id}&limit=100`)
      ])
      setTenant(tenantData);setContracts(contractData);setProperties(propertyData)
      setDocuments(documentData.filter(document=>document.entity_type==='tenants'&&document.entity_id===id))
      setCommunications(communicationData)
      const ids=new Set(contractData.map(contract=>contract.id))
      setPayments(paymentData.filter(payment=>ids.has(payment.contract_id)).sort((left,right)=>new Date(right.due_date)-new Date(left.due_date)))
      setForm(normalize(tenantData))
    }catch(exception){setError(exception.message)}
  },[id])

  useEffect(()=>{load()},[load])

  async function save(event){
    event.preventDefault();setSaving(true);setError('')
    try{
      const updated=await api(`/tenants/${id}`,{method:'PATCH',body:form})
      setTenant(updated);setEditing(false);setMessage('Profile updated')
      setTimeout(()=>setMessage(''),2500)
    }catch(exception){setError(exception.message)}
    finally{setSaving(false)}
  }

  async function upload(event){
    event.preventDefault();setError('')
    try{
      const data=new FormData()
      data.append('file',event.target.file.files[0])
      data.append('title',`${fullName(tenant)} — ${label(uploadType)}`)
      data.append('entity_type','tenants');data.append('entity_id',id)
      data.append('folder','TENANT VAULT');data.append('document_type',uploadType)
      await api('/documents/upload',{method:'POST',body:data})
      event.target.reset();await load();setMessage('Document added')
      setTimeout(()=>setMessage(''),2500)
    }catch(exception){setError(exception.message)}
  }

  async function removeDocument(document){
    if(!window.confirm('Delete this document?'))return
    try{await api(`/documents/${document.id}`,{method:'DELETE'});await load()}catch(exception){setError(exception.message)}
  }

  if(error&&!tenant)return <div className="panel panel-body">{error}</div>
  if(!tenant)return <div className="loading">Loading tenant profile…</div>

  const activeContracts=contracts.filter(contract=>contract.status==='active')
  const balance=payments.reduce((sum,payment)=>sum+Math.max(Number(payment.amount_due||0)-Number(payment.amount_received||0),0),0)

  return (
    <>
      <div className="page-header">
        <div>
          <Link to="/tenants" className="button small" style={{marginBottom:12}}><ArrowLeft size={14}/>All tenants</Link>
          <h1>{fullName(tenant)}</h1>
          <p className="page-subtitle">{tenant.email||'No email'} · {tenant.mobile||'No mobile'} · {activeContracts.length} active contracts</p>
        </div>
        <button className="button primary" onClick={()=>setEditing(current=>!current)}><Pencil size={16}/>{editing?'Close editor':'Edit profile'}</button>
      </div>
      {error&&<div className="panel panel-body" style={{borderColor:'#fecaca',background:'#fff5f5',marginBottom:14}}>{error}</div>}
      {message&&<div className="toast">{message}</div>}

      <section className="grid kpi-grid">
        <Metric label="Open balance" value={moneyExact(balance)} tone={balance>0?'red':'green'}/>
        <Metric label="Active contracts" value={activeContracts.length}/>
        <Metric label="Vault documents" value={documents.length}/>
      </section>

      {editing&&(
        <section className="panel section">
          <header className="panel-head"><h2>Inline editor</h2></header>
          <form className="panel-body form-grid" onSubmit={save}>
            {EDIT_FIELDS.map(([name,fieldLabel,type])=>(
              <label key={name} className={`field ${['textarea'].includes(type)?'form-wide':''}`}>
                <span className="field-label">{fieldLabel}</span>
                {type==='textarea'?<textarea value={form[name]||''} onChange={event=>setForm({...form,[name]:event.target.value})}/>
                  :<input type={type||'text'} value={form[name]||''} onChange={event=>setForm({...form,[name]:event.target.value})}/>}
              </label>
            ))}
            <button className="button primary form-wide" disabled={saving}>{saving?'Saving…':'Save changes'}</button>
          </form>
        </section>
      )}

      <section className="grid two-col section">
        <article className="panel"><header className="panel-head"><h2>Contracts & property</h2></header>
          {!contracts.length&&<div className="empty-state">No contracts linked</div>}
          {contracts.map(contract=>{
            const property=properties.find(item=>item.id===contract.property_id)
            return (
              <div key={contract.id} className="list-row">
                <div className="list-main">
                  <div className="list-title">{contract.contract_number||'Unnumbered contract'}</div>
                  <div className="list-sub">{property?formatAddress(property):'Property not set'} · {dateLabel(contract.start_date)} · {contract.status}</div>
                </div>
                <strong>{moneyExact(contract.rent_amount)}/{contract.rent_frequency}</strong>
              </div>
            )
          })}
        </article>
        <article className="panel"><header className="panel-head"><h2>Tenant document vault</h2></header>
          <form className="panel-body upload-box" onSubmit={upload}>
            <div className="form-grid">
              <label className="field"><span className="field-label">Secure file — any format</span><input type="file" required/></label>
              <label className="field"><span className="field-label">Category</span>
                <select value={uploadType} onChange={event=>setUploadType(event.target.value)}>
                  {['passport','driving_licence','bank_statement','utility_bill','reference','right_to_occupy','other'].map(option=><option key={option} value={option}>{label(option)}</option>)}
                </select>
              </label>
            </div>
            <button className="button primary" style={{marginTop:12}}><Upload size={16}/>Add to vault</button>
          </form>
          {!documents.length&&<div className="empty-state">No vault documents</div>}
          {documents.map(document=>(
            <div key={document.id} className="list-row">
              <div className="list-main"><div className="list-title">{document.title}</div><div className="list-sub">{label(document.document_type)} · {dateLabel(document.created_at)}</div></div>
              <a className="button small icon-only" href={`/api/documents/${document.id}/file`} target="_blank" rel="noreferrer" aria-label="Open document"><ExternalLink size={14}/></a>
              <button type="button" className="button small danger icon-only" onClick={()=>removeDocument(document)} aria-label="Delete document"><Trash2 size={14}/></button>
            </div>
          ))}
        </article>
      </section>

      <section className="panel section">
        <header className="panel-head"><h2>Payment history</h2></header>
        {!payments.length?<div className="empty-state">No payments recorded</div>:<div className="table-wrap"><table className="data-table">
          <thead><tr><th>Contract</th><th>Due</th><th>Due amount</th><th>Received</th><th>Paid date</th><th>Status</th></tr></thead>
          <tbody>{payments.map(payment=>(<tr key={payment.id}><td>{contracts.find(contract=>contract.id===payment.contract_id)?.contract_number||'—'}</td><td>{dateLabel(payment.due_date)}</td><td>{moneyExact(payment.amount_due)}</td><td>{moneyExact(payment.amount_received)}</td><td>{dateLabel(payment.payment_date)}</td><td>{label(payment.status)}</td></tr>))}</tbody>
        </table></div>}
      </section>

      <section className="panel section">
        <header className="panel-head"><h2>Communication trail</h2></header>
        {!communications.length?<div className="empty-state">No communications recorded</div>:<div className="timeline panel-body">{communications.map(item=>(<div key={item.id} className="timeline-item"><div className="timeline-time">{new Date(item.occurred_at).toLocaleString('en-GB')}</div><strong>{item.subject||label(item.channel)}</strong>{item.body&&<div style={{color:'#65727d'}}>{item.body}</div>}</div>))}</div>}
      </section>
    </>
  )
}

function Metric({label,value,tone}){
  return <article className="metric"><div className="metric-label">{label}</div><div className="metric-value" style={tone?{color:tone==='red'?'#b91c1c':'#17694a'}:undefined}>{value}</div></article>
}
function normalize(tenant){
  return Object.fromEntries(Object.entries(tenant).filter(([,value])=>typeof value!=='object'))
}
function fullName(tenant){return [tenant.first_name,tenant.surname].filter(Boolean).join(' ')}
function formatAddress(property){
  return [property.address_line1,property.address_line2,property.town,property.county,property.postcode].filter(Boolean).join(', ')
}
function label(value){return String(value||'').replace(/_/g,' ').replace(/\b\w/g,char=>char.toUpperCase())}
