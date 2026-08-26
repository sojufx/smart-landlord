import { useEffect,useState } from 'react'
import { Routes,Route,NavLink,Link,useLocation,useNavigate } from 'react-router-dom'
import { api } from './lib/api.js'
import { NAV,ICONS } from './lib/icons.js'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import ResourcePage from './pages/ResourcePage.jsx'
import Compliance from './pages/Compliance.jsx'
import RentSmartWales from './pages/RentSmartWales.jsx'
import Reports from './pages/Reports.jsx'
import Settings from './pages/Settings.jsx'
import TenantProfile from './pages/TenantProfile.jsx'

export default function App(){
  const [user,setUser]=useState(null)
  const [loading,setLoading]=useState(true)
  const [sidebarOpen,setSidebarOpen]=useState(false)
  const [notifications,setNotifications]=useState([])
  const [installEvent,setInstallEvent]=useState(null)
  const location=useLocation()

  useEffect(()=>{
    api('/me').then(setUser).catch(()=>setUser(null)).finally(()=>setLoading(false))
    const handler=event=>{event.preventDefault();setInstallEvent(event)}
    window.addEventListener('beforeinstallprompt',handler)
    return ()=>window.removeEventListener('beforeinstallprompt',handler)
  },[])

  useEffect(()=>{ if(!user)return; api('/reminders?acknowledged=false&limit=100').then(setNotifications).catch(()=>{}) },[user])

  async function logout(){ await api('/auth/logout',{method:'POST'}); setUser(null) }
  if(loading)return <div className="loading">Starting Smart Landlord…</div>
  if(!user)return <Login onSignedIn={setUser} />

  const initials=user.name.split(/\s+/).map(part=>part[0]).slice(0,2).join('').toUpperCase()
  const pageTitle=NAV.find(item=>item.to===location.pathname)?.label || 'Smart Landlord'
  return (
    <div className="app">
      <aside className={`sidebar ${sidebarOpen?'open':''}`}>
        <div className="brand"><div className="brand-mark"><HomeIcon/></div><div><h1 className="brand-name">Smart Landlord</h1><p className="brand-sub">Wales Edition</p></div></div>
        <nav className="nav">{NAV.map(item=>{
          const Icon=ICONS[item.icon]
          return <NavLink key={item.to} to={item.to} end={item.to==='/'} className={({isActive})=>`nav-link ${isActive?'active':''}`} onClick={()=>setSidebarOpen(false)}><Icon size={17}/>{item.label}</NavLink>
        })}</nav>
        <div className="sidebar-footer"><button className="collapse-button" onClick={logout}><LogOutIcon/>Sign out</button></div>
      </aside>
      {sidebarOpen && <button className="mobile-overlay" aria-label="Close menu" onClick={()=>setSidebarOpen(false)} />}
      <div className="main">
        <header className="topbar">
          <button className="menu-button" onClick={()=>setSidebarOpen(true)} aria-label="Open menu"><MenuIcon/></button>
          <h2 className="page-title">{pageTitle}</h2>
          <GlobalSearch/>
          <div className="topbar-actions">
            {installEvent && <button className="button small" onClick={async()=>{await installEvent.prompt();setInstallEvent(null)}}>Install</button>}
            <Link to="/reminders" className="icon-button open" aria-label={`${notifications.length} reminders`}><BellIcon/>{notifications.length?<span className="badge-count">{Math.min(notifications.length,99)}</span>:null}</Link>
            <div className="user-chip"><span className="avatar">{initials}</span><div className="user-meta"><div className="user-name">{user.name}</div><div className="user-role">{user.role}</div></div></div>
            <button className="icon-button open" onClick={logout} aria-label="Sign out"><LogOutIcon/></button>
          </div>
        </header>
        <main className="content">
          <Routes>
            <Route path="/" element={<Dashboard user={user}/>}/>
            <Route path="/compliance" element={<Compliance/>}/>
            <Route path="/compliance/records" element={<ResourcePage resource="compliance"/>}/>
            <Route path="/rent-smart-wales" element={<RentSmartWales/>}/>
            <Route path="/accounting" element={<Reports mode="accounting"/>}/>
            <Route path="/reports" element={<Reports/>}/>
            <Route path="/settings" element={<Settings user={user}/>}/>
            <Route path="/tenants/:id" element={<TenantProfile/>}/>
            <Route path="/:resource" element={<ResourcePage/>}/>
          </Routes>
        </main>
      </div>
    </div>
  )
}

function HomeIcon(){const Icon=ICONS.Home;return <Icon size={21}/>}
function MenuIcon(){const Icon=ICONS.Menu;return <Icon size={19}/>}
function BellIcon(){const Icon=ICONS.BellRing;return <Icon size={18}/>}
function LogOutIcon(){const Icon=ICONS.LogOut;return <Icon size={16}/>}

function GlobalSearch(){
  const [query,setQuery]=useState('')
  const [results,setResults]=useState([])
  const [open,setOpen]=useState(false)
  const [loading,setLoading]=useState(false)
  const navigate=useNavigate()

  useEffect(()=>{
    if(query.trim().length<2){setResults([]);setOpen(false);return}
    const timer=setTimeout(async()=>{
      setLoading(true)
      try{
        const data=await api(`/search/global?q=${encodeURIComponent(query.trim())}`)
        setResults(data.results||[])
        setOpen(true)
      }catch{setResults([])}
      finally{setLoading(false)}
    },250)
    return()=>clearTimeout(timer)
  },[query])

  function openResult(result){
    setOpen(false);setQuery('')
    if(result.resource==='tenants')return navigate(`/tenants/${result.id}`)
    navigate(`/${result.resource}?q=${encodeURIComponent(result.title)}`)
  }

  return (
    <div className="global-search">
      <input
        className="search-input"
        placeholder="Search all modules"
        value={query}
        onChange={event=>setQuery(event.target.value)}
        onFocus={()=>{if(results.length)setOpen(true)}}
        onBlur={()=>setTimeout(()=>setOpen(false),150)}
      />
      {open&&(
        <div className="global-results">
          {loading&&<div className="global-result muted">Searching…</div>}
          {!loading&&!results.length&&query.trim().length>=2&&<div className="global-result muted">No matches</div>}
          {results.map(result=>(
            <button key={`${result.resource}-${result.id}`} type="button" className="global-result" onMouseDown={()=>openResult(result)}>
              <span className="global-result-label">{result.label}</span>
              <strong>{result.title}</strong>
              {result.subtitle&&<small>{result.subtitle}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
