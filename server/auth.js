import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import fs from 'node:fs'

const COOKIE = 'smart_landlord_session_v2'

function jwtSecret() {
  if (process.env.JWT_SECRET_FILE && fs.existsSync(process.env.JWT_SECRET_FILE)) {
    return fs.readFileSync(process.env.JWT_SECRET_FILE, 'utf8').trim()
  }
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET
  if (process.env.NODE_ENV !== 'production') return 'development-only-secret-change-me'
  throw new Error('JWT_SECRET_FILE or JWT_SECRET is required')
}

export async function loginHandler(req, res) {
  const email = String(req.body.email || '').toLowerCase().trim()
  const password = String(req.body.password || '')
  const result = await req.pool.query('SELECT * FROM users WHERE email=$1 AND active=true', [email])
  const user = result.rows[0]
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' })
  }
  await req.pool.query('UPDATE users SET last_login_at=now() WHERE id=$1', [user.id])
  await audit(req, user.id, user.name, 'login', 'users', user.id, {})
  const token = jwt.sign({ sub: user.id, role: user.role, name: user.name }, jwtSecret(), { expiresIn: '12h' })
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure || req.get('x-forwarded-proto') === 'https',
    maxAge: 12 * 60 * 60 * 1000
  }).json({ id: user.id, name: user.name, email: user.email, role: user.role })
}

export function logoutHandler(req, res) {
  res.clearCookie(COOKIE).json({ ok: true })
}

export async function changePasswordHandler(req, res) {
  const currentPassword = String(req.body.current_password || '')
  const newPassword = String(req.body.new_password || '')
  if (newPassword.length < 10) return res.status(400).json({ error: 'New password must be at least 10 characters' })
  const result = await req.pool.query('SELECT password_hash FROM users WHERE id=$1', [req.user.sub])
  const user = result.rows[0]
  if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) return res.status(400).json({ error: 'Current password is incorrect' })
  await req.pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hashPassword(newPassword), req.user.sub])
  await audit(req, req.user.sub, req.user.name, 'change_password', 'users', req.user.sub, {})
  res.clearCookie(COOKIE).json({ ok: true })
}

export function authenticate() {
  return async (req, res, next) => {
    try {
      const token = req.cookies?.[COOKIE]
      if (!token) return res.status(401).json({ error: 'Not signed in' })
      req.user = jwt.verify(token, jwtSecret())
      next()
    } catch {
      res.clearCookie(COOKIE).status(401).json({ error: 'Session expired' })
    }
  }
}

export function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not signed in' })
    if (roles.length && !roles.includes(req.user.role)) return res.status(403).json({ error: 'Insufficient permission' })
    next()
  }
}

export function hashPassword(password) {
  return bcrypt.hashSync(password, 12)
}

export async function audit(req, actorId, actorName, action, table, resourceId, changes = {}) {
  try {
    await req.pool.query(
      `INSERT INTO audit_logs (actor_id, actor_name, action, resource_table, resource_id, ip_address, summary, changes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        actorId,
        actorName,
        action,
        table,
        resourceId,
        req.ip,
        `${action} ${table}`,
        JSON.stringify(changes)
      ]
    )
  } catch (error) {
    console.error('audit failure', error.message)
  }
}
