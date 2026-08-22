import { useEffect,useState } from 'react'
import { Link } from 'react-router-dom'
import { api,moneyExact,dateLabel } from '../lib/api.js'

const EXPORTS=[['properties','Property inventory'],['compliance','Certificate register'],['repairs','Maintenance history'],['rent','Rent ledger'],['invoices','Invoice register'],['expenses','Expense register'],['documents','Document index'],['audit_logs','Full audit log']]

export default function Reports({mode='reports'}){
  const [landlords,setLandlords]=useState([])
  const [selected,setSelected]=useState('')
  const [year,setYear]=useState(new Date().getFullYear())
  const [statement,setStatement]=useState(null)
  useEffect(()=>{api('/landlords').then(data=>{setLandlords(data);if(data[0])setSelected(data[0].id)})},[])
  useEffect(()=>{if(selected)api(`/statements/landlord/${selected}?year=${year}`).then(setStatement)},[selected,year])
  if(mode==='accounting')return (
    <>
      <div className="page-header"><div><h1>Accounting</h1><p className="page-subtitle">Landlord-level income, expense and profitability reporting. Tax treatment remains a decision for your accountant.</p></div></div>
      <div className="toolbar"><select value={selected} onChange={event=>setSelected(event.target.value)} className="search-input">{landlords.map(landlord=><option key={landlord.id} value={landlord.id}>{landlord.full_legal_name}</option>)}</select><input type="number" className="search-input" style={{maxWidth:130}} value={year} onChange={event=>setYear(Number(event.target.value))}/><a className="button" href={`/api/export/expenses`}>CSV</a><a className="button" href={`/api/export/invoices`}>Invoices</a></div>
      {statement&&(
        <section className="grid kpi-grid">
          <article className="metric"><div className="metric-label">Income received</div><div className="metric-value">{moneyExact(statement.income)}</div></article>
          <article className="metric"><div className="metric-label">Recorded costs</div><div className="metric-value">{moneyExact(statement.totalExpenses)}</div></article>
          <article className="metric"><div className="metric-label">Surplus before tax</div><div className="metric-value" style={{color:statement.profit>=0?'#17694a':'#b91c1c'}}>{moneyExact(statement.profit)}</div></article>
          <article className="metric"><div className="metric-label">Invoices billed</div><div className="metric-value">{moneyExact(statement.invoiceSummary.reduce((sum,row)=>sum+Number(row.billed||0),0))}</div></article>
          <article className="metric"><div className="metric-label">Invoice payments</div><div className="metric-value" style={{color:'#17694a'}}>{moneyExact(statement.invoiceSummary.reduce((sum,row)=>sum+Number(row.paid||0),0))}</div></article>
          <article className="metric"><div className="metric-label">Invoices outstanding</div><div className="metric-value" style={{color:statement.invoiceSummary.reduce((sum,row)=>sum+Number(row.outstanding||0),0)>0?'#b45309':'#17694a'}}>{moneyExact(statement.invoiceSummary.reduce((sum,row)=>sum+Number(row.outstanding||0),0))}</div></article>
          <section className="panel section" style={{gridColumn:'1/-1'}}>
            <header className="panel-head"><h2>Expenses by category</h2></header><div className="table-wrap"><table className="data-table"><thead><tr><th>Category</th><th>Net</th><th>VAT</th><th>Gross</th></tr></thead><tbody>{statement.expenses.map(row=><tr key={row.category}><td>{row.category}</td><td>{moneyExact(row.net)}</td><td>{moneyExact(row.vat)}</td><td>{moneyExact(row.gross)}</td></tr>)}</tbody></table></div>
          </section>
          <section className="panel section" style={{gridColumn:'1/-1'}}>
            <header className="panel-head"><h2>Invoices by type</h2></header><div className="table-wrap"><table className="data-table"><thead><tr><th>Type</th><th>Count</th><th>Billed</th><th>Paid</th><th>Outstanding</th></tr></thead><tbody>{statement.invoiceSummary.map(row=><tr key={row.invoice_type}><td>{row.invoice_type.replace(/_/g,' ')}</td><td>{row.count}</td><td>{moneyExact(row.billed)}</td><td>{moneyExact(row.paid)}</td><td>{moneyExact(row.outstanding)}</td></tr>)}</tbody></table></div>
          </section>
        </section>
      )}
    </>
  )
  return (
    <>
      <div className="page-header"><div><h1>Reports & exports</h1><p className="page-subtitle">Accountant-friendly registers and portfolio reports.</p></div><Link to="/accounting" className="button primary">Accounting view</Link></div>
      <section className="grid three-col">
        {EXPORTS.map(([resource,label])=>(<article key={resource} className="metric"><div className="metric-label">{label}</div><a className="button" style={{marginTop:12}} href={`/api/export/${resource}`}>Download CSV</a></article>))}
      </section>
    </>
  )
}
