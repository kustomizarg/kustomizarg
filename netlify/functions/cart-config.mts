import type { Config, Context } from '@netlify/functions'
import { getStore } from '@netlify/blobs'

// Categorías válidas (deben coincidir con la página)
const CATEGORIES = ['cuadros', 'tazas', 'alfombras', 'varios']

// Subcategorías válidas por categoría (slugs; deben coincidir con la página).
// Cada par categoría/subcategoría es un "producto" del carrito, con su nombre
// y su precio editables desde el Panel de Carga.
const SUBCATEGORIES: Record<string, string[]> = {
  cuadros: ['anime', 'futbol', 'musica', 'youtubers', 'infantiles'],
  tazas: ['ceramica', 'plasticas', 'termicas'],
  alfombras: ['pads-gamers', 'salida-de-cama', 'decorativas'],
  varios: ['llaveros', 'stickers', 'parches', 'imanes'],
}

// Verificación de contraseña (misma fórmula que gallery-upload):
// sha256(`${PASSWORD_SALT}|${password}`). Se puede sobreescribir con la
// variable de entorno GALLERY_ADMIN_PASSWORD.
const PASSWORD_SALT = 'kustomizarg::gallery::v1'
const PASSWORD_HASH = '622a385b3a9b4ec69758f3dcc08d5bdfcde11b424864d66af1db85787034e329'

const MAX_NAME_LEN = 80
const MAX_PRICE = 100_000_000

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function isValidPassword(password: string | null): Promise<boolean> {
  if (!password) return false
  const candidate = password.trim()
  if (!candidate) return false
  const override = Netlify.env.get('GALLERY_ADMIN_PASSWORD')
  if (override) return candidate === override.trim()
  const hashed = await sha256Hex(`${PASSWORD_SALT}|${candidate}`)
  return hashed === PASSWORD_HASH
}

// Sólo se aceptan claves de productos conocidos: "categoria:subcategoria".
function isValidProductKey(key: string): boolean {
  const [cat, sub] = key.split(':')
  return CATEGORIES.includes(cat) && (SUBCATEGORIES[cat] || []).includes(sub)
}

const STORE_NAME = 'cart-config'
const CONFIG_KEY = 'config'

export default async (req: Request, _context: Context) => {
  const store = getStore({ name: STORE_NAME, consistency: 'strong' })

  // Lectura pública: la tienda necesita los nombres y precios para mostrarlos.
  if (req.method === 'GET') {
    const config = (await store.get(CONFIG_KEY, { type: 'json' })) || {}
    return Response.json({ config })
  }

  // Guardado protegido con contraseña.
  let body: any
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Formato inválido' }, { status: 400 })
  }

  if (!(await isValidPassword(typeof body?.password === 'string' ? body.password : null))) {
    return Response.json({ error: 'Contraseña incorrecta' }, { status: 401 })
  }

  const incoming = body?.config
  if (typeof incoming !== 'object' || incoming === null || Array.isArray(incoming)) {
    return Response.json({ error: 'Configuración inválida' }, { status: 400 })
  }

  // Se saneia cada entrada: sólo claves conocidas, nombre acotado y precio entero >= 0.
  const clean: Record<string, { name?: string; price?: number }> = {}
  for (const [key, value] of Object.entries(incoming)) {
    if (!isValidProductKey(key) || typeof value !== 'object' || value === null) continue
    const entry: { name?: string; price?: number } = {}
    const name = (value as any).name
    if (typeof name === 'string' && name.trim()) {
      entry.name = name.trim().slice(0, MAX_NAME_LEN)
    }
    const price = Number((value as any).price)
    if (Number.isFinite(price) && price >= 0) {
      entry.price = Math.min(Math.round(price), MAX_PRICE)
    }
    if (entry.name !== undefined || entry.price !== undefined) clean[key] = entry
  }

  await store.setJSON(CONFIG_KEY, clean)
  return Response.json({ ok: true, config: clean })
}

export const config: Config = {
  path: '/api/cart/config',
  method: ['GET', 'POST'],
}
