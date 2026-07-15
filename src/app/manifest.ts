import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Bagano Hub',
    short_name: 'Bagano Hub',
    description: 'Hub interno da Bagano — cronograma, materiais, extras e aprovação de conteúdo.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#faf9f7',
    theme_color: '#7c0006',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
