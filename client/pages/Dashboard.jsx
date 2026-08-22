import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api,money,moneyExact,dateLabel,daysUntil } from '../lib/api.js'
import { ICONS } from '../lib/icons.js'
import { statusClass } from '../components/ui.jsx'

const { AlertTriangle, CalendarClock } = ICONS

export default function Dashboard({user}){
  const [data,setData]=useState(null)
  const [error,setError]=useState('')
  useEffect(()=>{api('/dashboard').then(setData).catch(exception=>setError(exception.message))},[])
  if(error)return <div className="panel panel-body">{error}</div>
  if(!data)return <div className="loading">Loading portfolio...</div>
  const p=data.portfolio
  const repairCounts=Object.fromEntries(data.repairs.map(row=>[row.priority,row.count]))
  const compliance=data.compliance.totals
  return (
    <>
      <div className="page-header">
        <div><p style={{margin:'0 0 5px',color:'#65727d',fontWeight:650}}>Portfolio</p>
          <h1>Good day, {user.name.split(' ')[0]}</h1>
          <p className="page-subtitle">Live position across properties, rent, maintenance and Welsh compliance duties.</p>
        </div>
        <button className="button" type="button" onClick={()=>api('/reminders/run',{method:'POST'}).then(()=>window.location.reload())}><CalendarClock size={16}/>Run reminders</button>
      </div>
      <section className="grid kpi-grid">
        <Metric label="Properties" value={p.total} detail={`${p.occupied} occupied · ${p.vacant} vacant`} />
        <Metric label="Monthly rent" value={money(p.monthly_rent)} detail={`£${Number(data.rent.collected_30d).toLocaleString()} received (90 days)`} />
        <Metric label="Arrears" value={money(data.rent.arrears)} detail={`${data.rent.arrears_count} overdue payments`} tone={Number(data.rent.arrears)>0?'red':'green'} />
        <Metric label="Compliance" value={`${compliance.green + compliance.amber + compliance.red}`} detail={`${compliance.green} compliant · ${compliance.amber} expiring · ${compliance.red} expired`} tone={compliance.red?'red':compliance.amber?'amber':'green'} />
        <Metric label="Emergency repairs" value={repairCounts.emergency||0} detail={`${repairCounts.high||0} high priority`} tone={(repairCounts.emergency||0)>0?'red':'green'} />
        <Metric label="Open maintenance" value={Object.values(repairCounts).reduce((a,b)=>a+b,0)} detail="Tickets awaiting completion or closure" />
        <Metric label="Open tasks" value={data.tasks?.open_count ?? 0} detail={`${data.tasks?.overdue_count ?? 0} overdue`} tone={(data.tasks?.overdue_count||0)>0?'red':'green'} />
        <Metric label="Invoices owed" value={money(data.invoices?.outstanding ?? 0)} detail={`${data.invoices?.unpaid_count ?? 0} unpaid`} tone={(data.invoices?.unpaid_count||0)>0?'amber':'green'} />
      </section>
      <section className="grid dashboard-grid section">
        <div className="panel">
          <header className="panel-head"><h2>Upcoming</h2><Link to="/tasks">View all</Link></header>
          <div>{data.upcoming.map(item=>{
            const days=daysUntil(item.due_date); const status=days<0?'red':days<=30?'amber':'green'
            return (
              <article key={`${item.type}-${item.id}`} className="list-row">
                <span className={`status-dot ${statusClass(status)}`} />
                <div className="list-main"><div className="list-title">{item.title}</div><div className="list-sub">{item.context}</div></div>
                <div className="due-date">{dateLabel(item.due_date)}<br/>{Math.abs(days)} {days<0?'days overdue':'days'}</div>
              </article>
            )
          })}{!data.upcoming.length && <div className="empty-state">No upcoming deadlines</div>}</div>
        </div>
        <div className="panel">
          <header className="panel-head"><h2>Maintenance</h2><Link to="/repairs">View all repairs</Link></header>
          <div className="panel-body flush table-wrap">
            <table className="data-table"><thead><tr><th>ID</th><th>Property</th><th>Issue</th><th>Priority</th><th>Reported</th></tr></thead><tbody>
              {data.recentRepairs.map(repair=>(<tr key={repair.id}><td>#{repair.repair_number?.slice(-4)||'New'}</td><td>{repair.address_line1}<br/><small style={{color:'#65727d'}}>{repair.town}</small></td><td className="cell-truncate">{repair.problem}</td><td><Pillish value={repair.priority}/></td><td>{dateLabel(repair.date_reported)}</td></tr>))}
              {!data.recentRepairs.length && <tr><td colSpan="5"><div className="empty-state">No open repairs</div></td></tr>}
            </tbody></table>
          </div>
        </div>
        <aside className="panel audit-panel">
          <header className="panel-head"><h2>Audit trail</h2><Link to="/audit_logs">Full trail</Link></header>
          <div className="panel-body"><div className="timeline">{data.audit.map(item=>(<div key={item.id} className="timeline-item"><div className="timeline-time">{new Date(item.occurred_at).toLocaleString('en-GB')}</div><strong>{item.summary}</strong><div style={{color:'#65727d',fontSize:13}}>{item.actor_name}</div></div>))}</div></div>
        </aside>
      </section>
      <section className="section">
        <div className="panel">
          <header className="panel-head"><h2>Recent rent</h2><Link to="/rent">View all rent</Link></header>
          <div className="panel-body flush table-wrap">
            <table className="data-table"><thead><tr><th>Tenant</th><th>Property</th><th>Due date</th><th>Amount</th><th>Paid date</th><th>Status</th><th>Method</th></tr></thead><tbody>
              {data.recentRent.map(payment=>(<tr key={payment.id}><td>{payment.first_name} {payment.surname}</td><td>{payment.address_line1}</td><td>{dateLabel(payment.due_date)}</td><td>{moneyExact(payment.amount_due)}</td><td>{dateLabel(payment.payment_date)}</td><td><Pillish value={payment.status}/></td><td>{payment.payment_method||'—'}</td></tr>))}
              {!data.recentRent.length && <tr><td colSpan="7"><div className="empty-state">No rent records</div></td></tr>}
            </tbody></table>
          </div>
        </div>
      </section>
    </>
  )
}

function Metric({label,value,detail,tone}){
  return <article className="metric"><div className="metric-label">{label}</div><div className="metric-value" style={tone?{color:tone==='red'?'#b91c1c':tone==='amber'?'#b45309':'#17694a'}:undefined}>{value}</div><p className="metric-detail">{detail}</p></article>
}
function Pillish({value}){
  const color=value==='paid'||value==='closed'||value==='low'?'green':['part_paid','normal','scheduled'].includes(value)?'amber':'red'
  return <PillishInner value={value} color={color}/>
}
function PillishInner({value,color}){return <span className={`pill ${color}`}>{String(value||'—').replace(/_/g,' ')}</span>}
