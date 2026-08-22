import { useState } from 'react'
import { api } from '../lib/api.js'
import { ICONS } from '../lib/icons.js'

export default function Login({onSignedIn}){
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  async function submit(event){
    event.preventDefault(); setBusy(true); setError('')
    try{
      const user=await api('/auth/login',{method:'POST',body:{email,password}})
      onSignedIn(user)
    }catch(exception){
      setError(exception.message==='unauthorized'?'Invalid email or password':exception.message)
    }finally{setBusy(false)}
  }
  return (
    <div className="login-shell">
      <main className="login-panel">
        <form className="login-card" onSubmit={submit}>
          <div style={{display:'flex',alignItems:'center',gap:11,marginBottom:26}}>
            <div className="brand-mark"><ICONS.Home size={21}/></div>
            <div><h1 style={{fontSize:24}}>Smart Landlord</h1><p style={{margin:0,color:'#65727d'}}>Wales Edition</p></div>
          </div>
          <h2>Sign in</h2>
          <p style={{color:'#65727d'}}>Secure access to your portfolio and compliance evidence.</p>
          {error && <p className="error-text">{error}</p>}
          <label className="field"><span className="field-label">Email</span>
            <input type="email" value={email} onChange={event=>setEmail(event.target.value)} autoComplete="username" required />
          </label>
          <label className="field" style={{marginTop:12}}><span className="field-label">Password</span>
            <input type="password" value={password} onChange={event=>setPassword(event.target.value)} autoComplete="current-password" required />
          </label>
          <button className="button primary" style={{width:'100%',marginTop:18,height:42}} disabled={busy}>{busy?'Signing in...':'Sign in'}</button>
          <p style={{color:'#65727d',fontSize:12}}>Demo sign-in after deployment: admin@example.com / ChangeMe!2026</p>
        </form>
      </main>
      <aside className="login-hero">
        <div className="hero-grid"></div>
        <h1>Run your Welsh rental portfolio with evidence at the centre.</h1>
        <p>Rent Smart Wales status, occupation contracts, deposits, certificates, inspections, repairs and accounting — connected in one secure system.</p>
      </aside>
    </div>
  )
}
