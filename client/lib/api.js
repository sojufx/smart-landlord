export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    headers: options.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    ...options,
    body: options.body instanceof FormData ? options.body : options.body ? JSON.stringify(options.body) : undefined
  })
  if (response.status === 401) throw new Error('unauthorized')
  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try { const data = await response.json(); message = data.error || message } catch {}
    throw new Error(message)
  }
  return response.json()
}

export function money(value) {
  return new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:0}).format(Number(value||0))
}

export function moneyExact(value) {
  return new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(Number(value||0))
}

export function dateLabel(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})
}

export function daysUntil(value) {
  if (!value) return null
  const today=new Date(); today.setHours(0,0,0,0)
  return Math.ceil((new Date(value)-today)/86400000)
}

export function dateInputValue(value) {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return String(value).slice(0,10)
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleDateString('en-CA')
}
