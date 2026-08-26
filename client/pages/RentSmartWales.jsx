import { useEffect,useState } from 'react'
import { api,dateLabel,daysUntil } from '../lib/api.js'
import { Modal,Pill,statusClass } from '../components/ui.jsx'
import { ICONS } from '../lib/icons.js'

const { Pencil } = ICONS

function emptyRswForm(landlord){
  return {
    rsw_registration_number:landlord.rsw_registration_number||'',
    rsw_registration_start:dateInput(landlord.rsw_registration_start),
    rsw_registration_expiry:dateInput(landlord.rsw_registration_expiry),
    rsw_licence_number:landlord.rsw_licence_number||'',
    rsw_licence_type:landlord.rsw_licence_type||'Full Licence',
    rsw_licence_expiry:dateInput(landlord.rsw_licence_expiry),
    training_completed:landlord.training_completed||'',
    cpd_notes:landlord.cpd_notes||''
  }
}

function dateInput(value){
  return value ? String(value).slice(0,10) : ''
}

export default function RentSmartWales({user}){
  const [landlords,setLandlords]=useState([])
  const [properties,setProperties]=useState([])
  const [editing,setEditing]=useState(null)
  const [form,setForm]=useState({})
  const [certificateFiles,setCertificateFiles]=useState({})
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const canEdit=Boolean(user&&user.role!=='viewer')

  async function load(){
    try{
      const [landlordRows,propertyRows]=await Promise.all([api('/landlords'),api('/properties')])
      setLandlords(landlordRows);setProperties(propertyRows)
    }catch(exception){setError(exception.message)}
  }

  useEffect(()=>{load()},[])

  function openEditor(landlord){
    setError('');setForm(emptyRswForm(landlord));setCertificateFiles({});setEditing(landlord)
  }

  async function save(event){
    event.preventDefault();setSaving(true);setError('')
    try{
      await api(`/landlords/${editing.id}`,{method:'PATCH',body:form})
      const uploads=[
        ['registration_certificate','rsw_registration_certificate_url','RSW registration certificate'],
        ['licence_certificate','rsw_licence_certificate_url','RSW licence certificate']
      ]
      for(const [fieldName,urlField,title] of uploads){
        const file=certificateFiles[fieldName]
        if(!(file instanceof File))continue
        const upload=new FormData()
        upload.append('file',file)
        upload.append('title',`${editing.full_legal_name} — ${title}`)
        upload.append('entity_type','landlords')
        upload.append('entity_id',editing.id)
        upload.append('folder',fieldName==='registration_certificate'?'RSW REGISTRATION':'RSW LICENCE')
        upload.append('document_type','rsw_certificate')
        const uploaded=await api('/documents/upload',{method:'POST',body:upload})
        await api(`/landlords/${editing.id}`,{method:'PATCH',body:{[urlField]:uploaded.url}})
      }
      setEditing(null);setMessage('Rent Smart Wales details saved')
      setTimeout(()=>setMessage(''),2500)
      await load()
    }catch(exception){setError(exception.message)}
    finally{setSaving(false)}
  }

  function updateField(name,value){setForm(current=>({...current,[name]:value}))}
  return (
    <>
      <div className="page-header"><div><h1>Rent Smart Wales</h1><p className="page-subtitle">Registration, licence, training and linked-property evidence in one control room.</p></div></div>
      <section className="grid two-col">
        {landlords.map(landlord=>{
          const regDays=daysUntil(landlord.rsw_registration_expiry)
          const licDays=daysUntil(landlord.rsw_licence_expiry)
          const linked=properties.filter(property=>property.landlord_id===landlord.id).length
          return (
            <article key={landlord.id} className="panel">
              <header className="panel-head"><div><h2>{landlord.full_legal_name}</h2><p style={{margin:'3px 0 0',color:'#65727d'}}>{linked} linked properties</p></div>
                <span className="avatar">{initials(landlord.full_legal_name)}</span>
              </header>
              <div className="list-row"><div className="list-main"><div className="list-title">Registration</div><div className="list-sub">{landlord.rsw_registration_number||'Not recorded'}</div></div><Pill status={regDays==null?'neutral':regDays<0?'red':regDays<=90?'amber':'green'}>{regDays==null?'No date':regDays<0?'Expired':`${regDays} days`}</Pill></div>
              <div className="list-row"><div className="list-main"><div className="list-title">Licence</div><div className="list-sub">{landlord.rsw_licence_type||'Type not recorded'} · expires {dateLabel(landlord.rsw_licence_expiry)}</div></div><Pill status={licDays==null?'neutral':licDays<0?'red':licDays<=90?'amber':'green'}>{licDays==null?'No date':licDays<0?'Expired':`${licDays} days`}</Pill></div>
              <div className="list-row"><div className="list-main"><div className="list-title">Training / CPD</div><div className="list-sub">{landlord.training_completed||'Not recorded'}</div></div><span className={`status-dot ${landlord.training_completed?statusClass('green'):statusClass('amber')}`}/></div>
              {(landlord.rsw_registration_certificate_url||landlord.rsw_licence_certificate_url)&&(
                <div className="list-row">
                  <div className="list-main"><div className="list-title">Certificates</div><div className="list-sub">Stored in the document vault</div></div>
                  <div style={{display:'flex',gap:5}}>
                    {landlord.rsw_registration_certificate_url&&<a className="button small" href={landlord.rsw_registration_certificate_url} target="_blank" rel="noreferrer">Registration</a>}
                    {landlord.rsw_licence_certificate_url&&<a className="button small" href={landlord.rsw_licence_certificate_url} target="_blank" rel="noreferrer">Licence</a>}
                  </div>
                </div>
              )}
              <div className="panel-body" style={{display:'flex',gap:9,flexWrap:'wrap'}}>
                {canEdit&&<button type="button" className="button primary" onClick={()=>openEditor(landlord)}><Pencil size={16}/>Edit details</button>}
                <a className="button" href="https://www.rentsmart.gov.wales/en/register/" target="_blank" rel="noreferrer">Check public register</a>
              </div>
            </article>
          )
        })}
        {!landlords.length && <div className="empty-state">Add a landlord to begin.</div>}
      </section>
      {error&&<div className="toast">{error}</div>}
      {message&&<div className="toast">{message}</div>}
      {editing&&(
        <Modal title={`Rent Smart Wales — ${editing.full_legal_name}`} onClose={()=>setEditing(null)} footer={
          <><button type="button" className="button" onClick={()=>setEditing(null)} disabled={saving}>Cancel</button><button type="submit" form="rsw-form" className="button primary" disabled={saving}>{saving?'Saving…':'Save details'}</button></>
        }>
          <form id="rsw-form" className="form-grid" onSubmit={save}>
            <h2 className="form-wide" style={{margin:'0 0 4px'}}>Registration</h2>
            <label className="field"><span className="field-label">Registration number</span><input value={form.rsw_registration_number} onChange={event=>updateField('rsw_registration_number',event.target.value)}/></label>
            <label className="field"><span className="field-label">Registration start</span><input type="date" value={form.rsw_registration_start} onChange={event=>updateField('rsw_registration_start',event.target.value)}/></label>
            <label className="field"><span className="field-label">Registration expiry</span><input type="date" value={form.rsw_registration_expiry} onChange={event=>updateField('rsw_registration_expiry',event.target.value)}/></label>
            <label className="field form-wide"><span className="field-label">Registration certificate — any format</span><input type="file" onChange={event=>setCertificateFiles(current=>({...current,registration_certificate:event.target.files?.[0]||null}))}/><span className="field-hint">{certificateFiles.registration_certificate?.name||'Optional PDF, photo or scanned document'}</span></label>
            <h2 className="form-wide" style={{margin:'12px 0 4px'}}>Licence</h2>
            <label className="field"><span className="field-label">Licence number</span><input value={form.rsw_licence_number} onChange={event=>updateField('rsw_licence_number',event.target.value)}/></label>
            <label className="field"><span className="field-label">Licence type</span><select value={form.rsw_licence_type} onChange={event=>updateField('rsw_licence_type',event.target.value)}><option>Full Licence</option><option>Single Landlord</option><option>Joint Landlord</option><option>Agent-led</option></select></label>
            <label className="field"><span className="field-label">Licence expiry</span><input type="date" value={form.rsw_licence_expiry} onChange={event=>updateField('rsw_licence_expiry',event.target.value)}/></label>
            <label className="field form-wide"><span className="field-label">Licence certificate — any format</span><input type="file" onChange={event=>setCertificateFiles(current=>({...current,licence_certificate:event.target.files?.[0]||null}))}/><span className="field-hint">{certificateFiles.licence_certificate?.name||'Optional PDF, photo or scanned document'}</span></label>
            <h2 className="form-wide" style={{margin:'12px 0 4px'}}>Training</h2>
            <label className="field"><span className="field-label">Training completed</span><input value={form.training_completed} onChange={event=>updateField('training_completed',event.target.value)} placeholder="For example: RSW training completed 2026"/></label>
            <label className="field"><span className="field-label">CPD notes</span><input value={form.cpd_notes} onChange={event=>updateField('cpd_notes',event.target.value)}/></label>
          </form>
        </Modal>
      )}
    </>
  )
}
function initials(value){return value.split(/\s+/).map(part=>part[0]).slice(0,2).join('').toUpperCase()}
