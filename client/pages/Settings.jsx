import { useEffect,useState } from 'react'
import { api } from '../lib/api.js'

export default function Settings({user}){
  const [users,setUsers]=useState([])
  const [error,setError]=useState('')
  const [form,setForm]=useState({name:'',email:'',password:'',role:'staff'})
  const [passwordForm,setPasswordForm]=useState({current_password:'',new_password:'',confirm_password:''})
  const [passwordMessage,setPasswordMessage]=useState('')
  useEffect(()=>{if(user.role==='admin')api('/users').then(setUsers).catch(exception=>setError(exception.message))},[user])
  async function submit(event){
    event.preventDefault()
    try{await api('/users',{method:'POST',body:form});setForm({name:'',email:'',password:'',role:'staff'});setUsers(await api('/users'))}catch(exception){setError(exception.message)}
  }
  async function changePassword(event){
    event.preventDefault(); setError(''); setPasswordMessage('')
    if(passwordForm.new_password!==passwordForm.confirm_password){setError('New passwords do not match');return}
    try{
      await api('/auth/change-password',{method:'POST',body:passwordForm})
      window.location.reload()
    }catch(exception){setError(exception.message)}
  }
  return (
    <>
      <div className="page-header"><div><h1>Settings & governance</h1><p className="page-subtitle">User access, deployment and privacy controls.</p></div></div>
      <section className="grid two-col">
        <article className="panel"><header className="panel-head"><h2>Users</h2></header>
          <div className="panel-body flush table-wrap"><table className="data-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead><tbody>{users.map(row=><tr key={row.id}><td>{row.name}</td><td>{row.email}</td><td>{row.role}</td><td>{row.active?'Active':'Disabled'}</td></tr>)}</tbody></table></div>
        </article>
        <article className="panel"><header className="panel-head"><h2>Add user</h2></header>
          <form className="panel-body form-grid" onSubmit={submit}>
            {error&&<p className="error-text form-wide">{error}</p>}
            <label className="field"><span className="field-label">Name *</span><input required value={form.name} onChange={event=>setForm({...form,name:event.target.value})}/></label>
            <label className="field"><span className="field-label">Email *</span><input type="email" required value={form.email} onChange={event=>setForm({...form,email:event.target.value})}/></label>
            <label className="field"><span className="field-label">Password *</span><input type="password" minLength={10} required value={form.password} onChange={event=>setForm({...form,password:event.target.value})}/></label>
            <label className="field"><span className="field-label">Role</span><select value={form.role} onChange={event=>setForm({...form,role:event.target.value})}><option>admin</option><option>owner</option><option>staff</option><option>accountant</option><option>viewer</option></select></label>
            <button className="button primary form-wide">Create user</button>
          </form>
        </article>
      </section>
      <section className="section grid two-col">
        <article className="panel"><header className="panel-head"><h2>Change my password</h2></header>
          {passwordMessage&&<div className="panel-body" style={{color:'#17694a'}}>{passwordMessage}</div>}
          <form className="panel-body form-grid" onSubmit={changePassword}>
            {error&&<p className="error-text form-wide">{error}</p>}
            <label className="field"><span className="field-label">Current password *</span><input type="password" required value={passwordForm.current_password} onChange={event=>setPasswordForm({...passwordForm,current_password:event.target.value})}/></label>
            <label className="field"><span className="field-label">New password *</span><input type="password" minLength={10} required value={passwordForm.new_password} onChange={event=>setPasswordForm({...passwordForm,new_password:event.target.value})}/></label>
            <label className="field"><span className="field-label">Confirm new password *</span><input type="password" minLength={10} required value={passwordForm.confirm_password} onChange={event=>setPasswordForm({...passwordForm,confirm_password:event.target.value})}/></label>
            <button className="button primary form-wide">Update password and sign out</button>
          </form>
        </article>
        <article className="panel"><header className="panel-head"><h2>Privacy basics</h2></header>
          <div className="panel-body">
            <p>Create individual accounts instead of sharing one login. Every create, edit, delete, upload and payment change is written to the audit trail.</p>
          </div>
        </article>
      </section>
      <section className="section"><div className="panel"><header className="panel-head"><h2>Deployment</h2></header><div className="panel-body">
        <p><strong>PWA:</strong> installable on phone/laptop home screens. The same domain serves the full responsive site.</p>
        <p><strong>Data:</strong> PostgreSQL persistent volume; uploads stored outside the container at /data/uploads.</p>
        <p><strong>Audit:</strong> create/update/delete/login/upload events are retained with actor, IP and timestamp.</p>
      </div></div></section>
    </>
  )
}
