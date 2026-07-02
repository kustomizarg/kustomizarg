import type { Config, Context } from '@netlify/functions'
import { getStore } from '@netlify/blobs'

const CATEGORIES = ['cuadros', 'tazas', 'alfombras', 'varios']

export default async (req: Request, _context: Context) => {
  const { pathname } = new URL(req.url)
  const marker = '/api/gallery/image/'
  const idx = pathname.indexOf(marker)
  if (idx === -1) {
    return new Response('Not found', { status: 404 })
  }
  const key = decodeURIComponent(pathname.slice(idx + marker.length))

  // Sólo servir claves dentro de una categoría conocida
  if (!key || !CATEGORIES.includes(key.split('/')[0])) {
    return new Response('Not found', { status: 404 })
  }

  const store = getStore({ name: 'gallery', consistency: 'strong' })
  const result = await store.getWithMetadata(key, { type: 'arrayBuffer' })
  if (!result || !result.data) {
    return new Response('Not found', { status: 404 })
  }

  const contentType = (result.metadata?.contentType as string) || 'application/octet-stream'
  return new Response(result.data, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=300',
    },
  })
}

export const config: Config = {
  path: '/api/gallery/image/*',
  method: 'GET',
}
