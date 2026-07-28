'use client'

// Assinatura de push notification (Web Push) — registra o service worker,
// pede permissão e guarda a assinatura em push_subscriptions, vinculada ao membro.

import { createClient } from './supabase'

export function pushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function pushPermission(): NotificationPermission | 'unsupported' {
  if (!pushSupported()) return 'unsupported'
  return Notification.permission
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

// Toda a cadeia (permissão → registrar SW → subscribe → salvar no banco) pode
// falhar em qualquer passo, especialmente no Safari (que tem exigências
// próprias, tipo precisar ter instalado o site na tela de início). Sem o
// try/catch em volta de tudo, um erro em qualquer passo (principalmente
// pushManager.subscribe(), que não tinha proteção nenhuma) virava uma
// promise rejeitada sem tratamento — o botão "Ativar notificações" ficava
// girando pra sempre, sem nunca avisar a pessoa que falhou nem por quê.
export async function subscribeToPush(memberId: string): Promise<{ ok: boolean; error?: string }> {
  if (!pushSupported()) return { ok: false, error: 'Notificações push não são suportadas neste navegador.' }

  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return { ok: false, error: 'Permissão negada pelo navegador.' }

    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!vapidKey) return { ok: false, error: 'Chave VAPID não configurada no servidor.' }

    const registration = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready

    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })
    }

    const json = subscription.toJSON()
    const supabase = createClient()
    const { error } = await supabase.from('push_subscriptions').upsert({
      member_id: memberId,
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      user_agent: navigator.userAgent,
    }, { onConflict: 'endpoint' })

    if (error) return { ok: false, error: `Erro ao salvar inscrição: ${error.message}` }
    return { ok: true }
  } catch (err: any) {
    console.error('subscribeToPush falhou:', err)
    const msg = err?.name === 'NotAllowedError'
      ? 'Permissão de notificação bloqueada neste navegador/dispositivo.'
      : err?.message || 'Erro desconhecido ao ativar notificações.'
    return { ok: false, error: msg }
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!pushSupported()) return
  const registration = await navigator.serviceWorker.getRegistration('/sw.js')
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return
  const endpoint = subscription.endpoint
  await subscription.unsubscribe()
  const supabase = createClient()
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
}

export async function isSubscribedToPush(): Promise<boolean> {
  if (!pushSupported()) return false
  const registration = await navigator.serviceWorker.getRegistration('/sw.js')
  const subscription = await registration?.pushManager.getSubscription()
  return !!subscription
}
