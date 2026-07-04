import type { Config, Context } from '@netlify/functions'
import { getStore } from '@netlify/blobs'

// Segundo paso del envío de un diseño: el usuario ya subió la imagen (design-upload)
// y ahora ingresa su número de celular. Acá se valida el número (11 dígitos),
// se RENOMBRA la imagen con ese número y se deja lista en la casilla presupuestos.
// Devuelve la URL pública para adjuntarla en el mensaje de WhatsApp.

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
}

export default async (req: Request, _context: Context) => {
  let body: { id?: unknown; phone?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Formato inválido' }, { status: 400 })
  }

  const id = typeof body.id === 'string' ? body.id : ''
  // Sólo se conservan los dígitos: el número debe tener exactamente 11.
  const phone = (typeof body.phone === 'string' ? body.phone : '').replace(/\D/g, '')
  if (!id) {
    return Response.json({ error: 'Falta la referencia de la imagen' }, { status: 400 })
  }
  if (phone.length !== 11) {
    return Response.json({ error: 'El número debe tener 11 dígitos' }, { status: 400 })
  }

  const store = getStore({ name: 'presupuestos', consistency: 'strong' })
  const source = await store.getWithMetadata(`pending/${id}`, { type: 'arrayBuffer' })
  if (!source || !source.data) {
    return Response.json({ error: 'No se encontró la imagen. Volvé a subirla.' }, { status: 404 })
  }

  const contentType = (source.metadata?.contentType as string) || 'application/octet-stream'
  const ext = EXT_BY_TYPE[contentType] || 'jpg'
  const filename = `${phone}.${ext}`
  // La clave incluye un sufijo corto para no pisar envíos previos del mismo número.
  const key = `presupuestos/${phone}-${id.split('-').pop()}.${ext}`

  await store.set(key, source.data, {
    metadata: {
      contentType,
      name: filename,
      phone,
      originalName: (source.metadata?.originalName as string) || '',
      createdAt: new Date().toISOString(),
    },
  })
  // Se elimina la copia temporal ya renombrada.
  await store.delete(`pending/${id}`)

  const { origin } = new URL(req.url)
  const url = `${origin}/api/design/image/${encodeURIComponent(key)}`
  return Response.json({ ok: true, url, filename })
}

export const config: Config = {
  path: '/api/design/finalize',
  method: 'POST',
}
