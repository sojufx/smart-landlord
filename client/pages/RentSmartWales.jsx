import { useEffect,useState } from 'react'
import { api,dateLabel,daysUntil } from '../lib/api.js'
import { Pill,statusClass } from '../components/ui.jsx'

export default function RentSmartWales(){
  const [landlords,setLandlords]=useState([])
  const [properties,setProperties]=useState([])
  useEffect(()=>{Promise.all([api('/landlords'),api('/properties')]).then(([landlordRows,propertyRows])=>{setLandlords(landlordRows);setProperties(propertyRows)})},[])
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
              <header className="panel-head"><div><h2>{landlord.full_legal_name}</h2><p style={{margin:'3px 0 0',color:'#65727d'}}>{linked} linked properties</p></div><span className="avatar">{initials(landlord.full_legal_name)}</span></header>
              <div className="list-row"><div className="list-main"><div className="list-title">Registration</div><div className="list-sub">{landlord.rsw_registration_number||'Not recorded'}</div></div><Pill status={regDays==null?'neutral':regDays<0?'red':regDays<=90?'amber':'green'}>{regDays==null?'No date':regDays<0?'Expired':`${regDays} days`}</Pill></div>
              <div className="list-row"><div className="list-main"><div className="list-title">Licence</div><div className="list-sub">{landlord.rsw_licence_type||'Type not recorded'} · expires {dateLabel(landlord.rsw_licence_expiry)}</div></div><Pill status={licDays==null?'neutral':licDays<0?'red':licDays<=90?'amber':'green'}>{licDays==null?'No date':licDays<0?'Expired':`${licDays} days`}</Pill></div>
              <div className="list-row"><div className="list-main"><div className="list-title">Training / CPD</div><div className="list-sub">{landlord.training_completed||'Not recorded'}</div></div><span className={`status-dot ${landlord.training_completed?statusClass('green'):statusClass('amber')}`}/></div>
              <div className="panel-body"><a className="button" href="https://www.rentsmart.gov.wales/en/register/" target="_blank" rel="noreferrer">Check public register</a></div>
            </article>
          )
        })}
        {!landlords.length && <div className="empty-state">Add a landlord to begin.</div>}
      </section>
    </>
  )
}
function initials(value){return value.split(/\s+/).map(part=>part[0]).slice(0,2).join('').toUpperCase()}
