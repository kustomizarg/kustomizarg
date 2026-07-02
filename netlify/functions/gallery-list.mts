import type { Config, Context } from '@netlify/functions'
import { getStore } from '@netlify/blobs'

const CATEGORIES = ['cuadros', 'tazas', 'alfombras', 'varios']

export default async (req: Request, _context: Context) => {
  const store = getStore({ name: 'gallery', consistency: 'strong' })
  const requested = new URL(req.url).searchParams.get('category')

  const prefixes =
    requested && CATEGORIES.includes(requested) ? [`${requested}/`] : CATEGORIES.map((c) => `${c}/`)

  const images: Array<{
    key: string
    url: string
    name: string
    category: string
    uploadedAt: string
  }> = []

  for (const prefix of prefixes) {
    const { blobs } = await store.list({ prefix })
    for (const blob of blobs) {
      const meta = await store.getMetadata(blob.key)
      const m = (meta?.metadata ?? {}) as Record<string, string>
      images.push({
        key: blob.key,
        url: `/api/gallery/image/${blob.key}`,
        name: m.name ?? blob.key.split('/').pop() ?? blob.key,
        category: m.category ?? blob.key.split('/')[0],
        uploadedAt: m.uploadedAt ?? '',
      })
    }
  }

  // Más recientes primero
  images.sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1))

  return Response.json({ images })
}

export const config: Config = {
  path: '/api/gallery/list',
  method: 'GET',
}
