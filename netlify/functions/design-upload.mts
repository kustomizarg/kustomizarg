import type { Config, Context } from '@netlify/functions'
import { getStore } from '@netlify/blobs'

// Carga inicial del diseño enviado desde el modal "Subí tu Diseño".
// El archivo se guarda con una clave temporal ("pending/…") a la espera de que
// el usuario ingrese su número de celular. Recién en ese momento (design-finalize)
// se renombra la imagen con el número y queda disponible para la casilla presupuestos.

const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']

export default async (req: Request, _context: Context) => {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return Response.json({ error: 'Formato inválido' }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: 'No se recibió ninguna imagen' }, { status: 400 })
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return Response.json({ error: 'El archivo debe ser una imagen (JPG, PNG, WEBP o GIF)' }, { status: 400 })
  }
  if (file.size > MAX_FILE_BYTES) {
    return Response.json({ error: 'La imagen supera los 10 MB' }, { status: 400 })
  }

  const store = getStore({ name: 'presupuestos', consistency: 'strong' })
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const key = `pending/${id}`
  const buffer = await file.arrayBuffer()
  await store.set(key, buffer, {
    metadata: {
      contentType: file.type,
      originalName: file.name,
      uploadedAt: new Date().toISOString(),
    },
  })

  return Response.json({ ok: true, id })
}

export const config: Config = {
  path: '/api/design/upload',
  method: 'POST',
}
