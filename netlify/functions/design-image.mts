import type { Config, Context } from '@netlify/functions'
import { getStore } from '@netlify/blobs'

// Sirve públicamente la imagen de un diseño ya renombrado con el número de celular,
// para poder compartir el enlace en el mensaje de WhatsApp a la casilla presupuestos.

export default async (req: Request, _context: Context) => {
  const { pathname } = new URL(req.url)
  const marker = '/api/design/image/'
  const idx = pathname.indexOf(marker)
  if (idx === -1) {
    return new Response('Not found', { status: 404 })
  }
  const key = decodeURIComponent(pathname.slice(idx + marker.length))

  // Sólo se sirven imágenes finalizadas de la casilla presupuestos.
  if (!key || key.split('/')[0] !== 'presupuestos') {
    return new Response('Not found', { status: 404 })
  }

  const store = getStore({ name: 'presupuestos', consistency: 'strong' })
  const result = await store.getWithMetadata(key, { type: 'arrayBuffer' })
  if (!result || !result.data) {
    return new Response('Not found', { status: 404 })
  }

  const contentType = (result.metadata?.contentType as string) || 'application/octet-stream'
  const name = (result.metadata?.name as string) || 'diseno'
  return new Response(result.data, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${name}"`,
      'Cache-Control': 'public, max-age=300',
    },
  })
}

export const config: Config = {
  path: '/api/design/image/*',
  method: 'GET',
}
