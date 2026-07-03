import type { Config, Context } from '@netlify/functions'
import { getStore } from '@netlify/blobs'

// Categorías válidas (deben coincidir con los segmentos de la página)
const CATEGORIES = ['cuadros', 'tazas', 'alfombras', 'varios']

// Verificación de contraseña.
// La contraseña NO se guarda en texto plano: se compara contra un hash SHA-256 con sal.
// El hash se genera con la MISMA fórmula que usa isValidPassword: sha256(`${PASSWORD_SALT}|${password}`).
// Recomendado: definir la variable de entorno GALLERY_ADMIN_PASSWORD para usar tu propia
// contraseña privada; si está definida, tiene prioridad sobre el hash por defecto.
const PASSWORD_SALT = 'kustomizarg::gallery::v1'
// Hash por defecto correspondiente a la contraseña por defecto (ver README/entrega).
const PASSWORD_HASH = '622a385b3a9b4ec69758f3dcc08d5bdfcde11b424864d66af1db85787034e329'

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
  // Se recortan espacios accidentales (p. ej. autocompletado móvil) antes de comparar.
  const candidate = password.trim()
  if (!candidate) return false
  const override = Netlify.env.get('GALLERY_ADMIN_PASSWORD')
  if (override) return candidate === override.trim()
  const hashed = await sha256Hex(`${PASSWORD_SALT}|${candidate}`)
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
