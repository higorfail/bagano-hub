// Service worker do Bagano Hub — só cuida de push notification (sem cache
// offline por enquanto, esse app depende de dados sempre atualizados do Supabase).

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', event => {
  if (!event.data) return
  let payload
  try { payload = event.data.json() } catch { payload = { title: 'Bagano Hub', body: event.data.text() } }

  const { title = 'Bagano Hub', body = '', url = '/dashboard', tag } = payload

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag,
      data: { url },
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data?.url || '/dashboard'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) return client.focus()
      }
      for (const client of clientList) {
        if ('focus' in client && 'navigate' in client) { client.focus(); return client.navigate(url) }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})
