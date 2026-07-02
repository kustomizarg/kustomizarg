import type { Config, Context } from '@netlify/functions'
import { getStore } from '@netlify/blobs'

// Categorías válidas (deben coincidir con los segmentos de la página)
const CATEGORIES = ['cuadros', 'tazas', 'alfombras', 'varios']

// Verificación de contraseña.
// La contraseña NO se guarda en texto plano: se compara contra un hash SHA-256 con sal.
// Se puede sobreescribir con la variable de entorno GALLERY_ADMIN_PASSWORD si se define.
const PASSWORD_SALT = 'kustomizarg::gallery::v1'
const PASSWORD_HASH = 'f3fcc2402a3c3b1b4ec32e5d5939488b6ff70a67c52bacf4f9461ee4f33ad802'

const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5 MB por archivo
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function isValidPassword(password: string | null): Promise<boolean> {
  if (!password) return false
  const override = Netlify.env.get('GALLERY_ADMIN_PASSWORD')
  if (override) return password === override
  const hashed = await sha256Hex(`${PASSWORD_SALT}|${password}`)
  return hashed === PASSWORD_HASH
}

export default async (req: Request, _context: Context) => {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return Response.json({ error: 'Formato inválido' }, { status: 400 })
  }

  const password = form.get('password')
  if (!(await isValidPassword(typeof password === 'string' ? password : null))) {
    return Response.json({ error: 'Contraseña incorrecta' }, { status: 401 })
  }

  // Acción "verify": sólo comprobar la contraseña (para desbloquear el panel).
  if (form.get('action') === 'verify') {
    return Response.json({ ok: true })
  }

  const category = form.get('category')
  if (typeof category !== 'string' || !CATEGORIES.includes(category)) {
    return Response.json({ error: 'Categoría inválida' }, { status: 400 })
  }

  const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)
  if (files.length === 0) {
    return Response.json({ error: 'No se recibió ningún archivo' }, { status: 400 })
  }

  const store = getStore({ name: 'gallery', consistency: 'strong' })
  const saved: string[] = []

  for (const file of files) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return Response.json({ error: `Tipo no permitido: ${file.name}` }, { status: 400 })
    }
    if (file.size > MAX_FILE_BYTES) {
      return Response.json({ error: `El archivo ${file.name} supera los 5 MB` }, { status: 400 })
    }

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    const key = `${category}/${id}`
    const buffer = await file.arrayBuffer()
    await store.set(key, buffer, {
      metadata: {
        contentType: file.type,
        name: file.name,
        category,
        uploadedAt: new Date().toISOString(),
      },
    })
    saved.push(key)
  }

  return Response.json({ ok: true, saved })
}

export const config: Config = {
  path: '/api/gallery/upload',
  method: 'POST',
}
