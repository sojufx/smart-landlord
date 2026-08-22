import { useEffect,useState } from 'react'
import { Link } from 'react-router-dom'
import { api,dateLabel,daysUntil } from '../lib/api.js'
import { statusClass } from '../components/ui.jsx'

export default function Compliance(){
  const [data,setData]=useState(null)
  useEffect(()=>{api('/compliance/summary').then(setData).catch(console.error)},[])
  if(!data)return <div className="loading">Calculating compliance…</div>
  return (
    <>
      <div className="page-header"><div><h1>Compliance engine</h1><p className="page-subtitle">Every property receives an automatic score from certificates, alarms, deposit protection and statutory registrations.</p></div><Link to="/compliance/records" className="button">Manage records</Link></div>
      <section className="grid kpi-grid">
        <article className="metric"><div className="metric-label">Fully compliant items</div><div className="metric-value" style={{color:'#17694a'}}>{data.totals.green}</div></article>
        <article className="metric"><div className="metric-label">Action needed soon</div><div className="metric-value" style={{color:'#b45309'}}>{data.totals.amber}</div></article>
        <article className="metric"><div className="metric-label">Critical / expired</div><div className="metric-value" style={{color:'#b91c1c'}}>{data.totals.red}</div></article>
      </section>
      <section className="grid three-col section">
        {data.properties.map(property=>(
          <article key={property.id} className="panel">
            <header className="panel-head"><div><h2>{property.address_line1}</h2><p style={{margin:'3px 0 0',color:'#65727d',fontSize:13}}>{property.town} · {property.postcode}</p></div>
              <div className="score-ring" style={{'--value':property.score,'--ring-color':property.score>=90?'#15803d':property.score>=70?'#d97706':'#dc2626'}}><span className="score-inner">{property.score}%</span></div>
            </header>
            <div className="panel-body check-list">
              {property.checks.map(check=>(<div key={check.category} className="check-item"><strong>{check.label}</strong><span style={{display:'flex',alignItems:'center',gap:8}}><small>{check.record?.expiry_date?dateLabel(check.record.expiry_date):''}</small><span className={`status-dot ${statusClass(check.status)}`}/></span></div>))}
            </div>
          </article>
        ))}
      </section>
    </>
  )
}
