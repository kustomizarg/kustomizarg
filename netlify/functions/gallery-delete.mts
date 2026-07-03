import type { Config, Context } from '@netlify/functions'
import { getStore } from '@netlify/blobs'

const CATEGORIES = ['cuadros', 'tazas', 'alfombras', 'varios']
const PASSWORD_SALT = 'kustomizarg::gallery::v1'
// Hash por defecto correspondiente a la contraseña por defecto (debe coincidir con gallery-upload.mts).
// Se puede sobreescribir con la variable de entorno GALLERY_ADMIN_PASSWORD.
const PASSWORD_HASH = '622a385b3a9b4ec69758f3dcc08d5bdfcde11b424864d66af1db85787034e329'

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function isValidPassword(password: unknown): Promise<boolean> {
  if (typeof password !== 'string' || !password) return false
  const candidate = password.trim()
  if (!candidate) return false
  const override = Netlify.env.get('GALLERY_ADMIN_PASSWORD')
  if (override) return candidate === override.trim()
  return (await sha256Hex(`${PASSWORD_SALT}|${candidate}`)) === PASSWORD_HASH
}

export default async (req: Request, _context: Context) => {
  let body: { password?: string; key?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Formato inválido' }, { status: 400 })
  }

  if (!(await isValidPassword(body.password))) {
    return Response.json({ error: 'Contraseña incorrecta' }, { status: 401 })
  }

  const key = body.key
  if (typeof key !== 'string' || !CATEGORIES.includes(key.split('/')[0])) {
    return Response.json({ error: 'Clave inválida' }, { status: 400 })
  }

  const store = getStore({ name: 'gallery', consistency: 'strong' })
  await store.delete(key)

  return Response.json({ ok: true })
}

export const config: Config = {
  path: '/api/gallery/delete',
  method: 'POST',
}
