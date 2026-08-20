'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { logActivity } from '@/lib/activity'
import { ensureWatchingFromAssigned } from '@/lib/watch'
import { extractDriveIds } from '@/lib/driveLinks'
import { queueApprovalDigest } from '@/lib/approvalDigest'
import { CheckCircle, MessageSquare, RotateCcw, AlertTriangle } from 'lucide-react'
import IPhoneFeed, { FeedPost } from '@/components/IPhoneFeed'

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

const TYPE_LABELS: Record<string, string> = {
  reels: 'Reels', carrossel: 'Carrossel', post: 'Post',
  story: 'Story', carrossel_stories: 'Carrossel/Stories', post_story: 'Post/Story',
}
const TYPE_EMOJIS: Record<string, string> = {
  reels: '🎬', carrossel: '📸', post: '🖼️', story: '⭕', carrossel_stories: '🔁', post_story: '📷',
}

// Streaming direto da API do Drive (sem passar pelo nosso servidor) numa <video>
// nativa em vez do iframe /preview: o iframe do Drive depende de cookie de sessão,
// que o Safari/iOS bloqueia (ITP) e deixa o player todo preto — a API com key não
// depende de cookie e funciona com playsInline no iOS.
function driveStreamUrl(id: string) {
  return `https://www.googleapis.com/drive/v3/files/${id}?alt=media&key=${process.env.NEXT_PUBLIC_GOOGLE_API_KEY}`
}

// <video> do Drive com DUAS tentativas antes de desistir: 1) streaming nativo
// (rápido, funciona na maioria dos casos) → 2) iframe /preview do Drive (o player
// embutido padrão) → só então uma mensagem clara. O iframe não avisa se o vídeo
// travar dentro dele (só se a própria página falhar ao carregar), por isso a
// partir da 2ª tentativa mostramos um botão fixo "Abrir conteúdo no Drive" —
// sempre no mesmo lugar embaixo do player, nunca sobreposto ao vídeo.
type DriveVideoStage = 'video' | 'iframe' | 'failed'

function DriveVideoMedia({ id, stage, setStage, style, onLoadedMetadata }: { id: string; stage: DriveVideoStage; setStage: (s: DriveVideoStage) => void; style: React.CSSProperties; onLoadedMetadata?: (e: React.SyntheticEvent<HTMLVideoElement>) => void }) {
  if (stage === 'failed') return (
    <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 20 }}>
      <span style={{ fontSize: 13, color: '#d1d5db', maxWidth: 240 }}>Não conseguimos carregar o vídeo aqui.</span>
    </div>
  )
  if (stage === 'iframe') return (
    <iframe src={`https://drive.google.com/file/d/${id}/preview`} allow="autoplay"
      style={{ ...style, border: 'none' }}
      onError={() => setStage('failed')} />
  )
  return <video src={driveStreamUrl(id)} controls playsInline onError={() => setStage('iframe')} onLoadedMetadata={onLoadedMetadata} style={style} />
}

function DriveVideo({ id, folderUrl, ratio = '177.78%' }: { id: string; folderUrl?: string; ratio?: string }) {
  const [stage, setStage] = useState<DriveVideoStage>('video')
  const driveLink = folderUrl || `https://drive.google.com/file/d/${id}/view`
  return (
    <div>
      <div style={{ background: '#000', lineHeight: 0, position: 'relative', paddingTop: ratio, maxHeight: '80vh', overflow: 'hidden' }}>
        <DriveVideoMedia id={id} stage={stage} setStage={setStage}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />
      </div>
      <a href={driveLink} target="_blank" rel="noopener noreferrer"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 0', background: '#f5f5f3', borderTop: '1px solid #ebebeb', fontSize: 13, fontWeight: 700, color: '#374151', textDecoration: 'none' }}>
        🎬 Abrir conteúdo no Drive
      </a>
    </div>
  )
}

// Vídeo dentro do carrossel: usa só o media (sem o botão "abrir no Drive" embaixo)
// porque o carrossel já tem seu próprio rodapé fixo "Abrir pasta no Drive".
function CarouselVideoSlide({ id, style, onLoadedMetadata }: { id: string; style: React.CSSProperties; onLoadedMetadata?: (e: React.SyntheticEvent<HTMLVideoElement>) => void }) {
  const [stage, setStage] = useState<DriveVideoStage>('video')
  return <DriveVideoMedia id={id} stage={stage} setStage={setStage} style={style} onLoadedMetadata={onLoadedMetadata} />
}

// O quadro do preview assume a proporção REAL da mídia, em vez de uma altura
// fixa. Com altura fixa só havia duas saídas ruins: sobrar fundo nas laterais
// (a "borda preta") ou cortar a imagem. Medindo a mídia, o quadro fica exato —
// nada sobra, nada corta. Num carrossel a primeira mídia define o quadro (na
// prática todas têm a mesma escala); se alguma vier diferente, ela ainda
// aparece inteira (objectFit contain), só com um resto de fundo — nunca
// cortada.
function useMediaRatio(fallback: string) {
  const [ratio, setRatio] = useState<string | null>(null)
  function onMediaSize(w: number, h: number) {
    if (w > 0 && h > 0) setRatio(prev => prev ?? `${(h / w) * 100}%`)
  }
  return { ratio: ratio ?? fallback, onMediaSize }
}

// Arrastar/deslizar pra trocar de slide — no celular é o gesto que todo mundo
// tenta primeiro (ninguém procura as setinhas), e no desktop funciona
// arrastando com o mouse. Touch e mouse tratados separadamente de propósito:
// usar pointer events pros dois dispara duas vezes em alguns navegadores.
function useSwipe(onPrev: () => void, onNext: () => void) {
  const startX = useRef<number | null>(null)
  const THRESHOLD = 40 // px — abaixo disso é toque/clique, não arrasto

  function start(x: number) { startX.current = x }
  function end(x: number) {
    const from = startX.current
    startX.current = null
    if (from === null) return
    const dx = x - from
    if (Math.abs(dx) < THRESHOLD) return
    if (dx > 0) onPrev(); else onNext()
  }

  return {
    onTouchStart: (e: React.TouchEvent) => start(e.touches[0].clientX),
    onTouchEnd:   (e: React.TouchEvent) => end(e.changedTouches[0].clientX),
    onPointerDown: (e: React.PointerEvent) => { if (e.pointerType === 'mouse') start(e.clientX) },
    onPointerUp:   (e: React.PointerEvent) => { if (e.pointerType === 'mouse') end(e.clientX) },
  }
}

function CarouselPreview({ folderId, folderUrl, ratio = '100%' }: { folderId: string; folderUrl: string; ratio?: string }) {
  const [items, setItems] = useState<{ id: string; name: string; isVideo: boolean }[]>([])
  const [slide, setSlide]   = useState(0)
  const [ready, setReady]   = useState(false)
  const { ratio: frameRatio, onMediaSize } = useMediaRatio(ratio)
  // Hooks sempre no topo, antes de qualquer return condicional (regra do React).
  const swipeHandlers = useSwipe(
    () => setSlide(s => (s - 1 + items.length) % items.length),
    () => setSlide(s => (s + 1) % items.length),
  )

  useEffect(() => {
    fetch(`/api/drive-folder?folderId=${folderId}`)
      .then(r => r.json())
      .then(d => {
        const files: { id: string; name: string; mimeType: string }[] = d.files || []
        // Imagens e vídeos juntos, ordenados pelo nome — carrossel misto (fotos + vídeo)
        // mostra o vídeo no lugar certo em vez de descartar ele da visualização.
        const imgs = files.filter(f => f.mimeType.startsWith('image/')).map(f => ({ id: f.id, name: f.name, isVideo: false }))
        const vids = files.filter(f => f.mimeType.startsWith('video/')).map(f => ({ id: f.id, name: f.name, isVideo: true }))
        setItems([...imgs, ...vids].sort((a, b) => a.name.localeCompare(b.name)))
        setReady(true)
      })
      .catch(() => setReady(true))
  }, [folderId])

  if (!ready) return (
    <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f3' }}>
      <div style={{ width: 24, height: 24, border: '3px solid #e5e7eb', borderTopColor: '#374151', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )

  if (items.length === 0) return (
    <a href={folderUrl} target="_blank" rel="noopener noreferrer"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 0', background: '#f5f5f3', fontSize: 13, fontWeight: 600, color: '#374151', textDecoration: 'none' }}>
      📂 Abrir pasta no Drive
    </a>
  )

  const prev = () => setSlide(s => (s - 1 + items.length) % items.length)
  const next = () => setSlide(s => (s + 1) % items.length)
  const current = items[slide]
  const swipe = items.length > 1 ? swipeHandlers : {}

  return (
    <div style={{ position: 'relative', background: '#1c1a18', userSelect: 'none' }}>
      <div {...swipe} style={{ position: 'relative', paddingTop: frameRatio, overflow: 'hidden', cursor: items.length > 1 ? 'grab' : 'default', touchAction: 'pan-y' }}>
        {current.isVideo ? (
          <CarouselVideoSlide key={current.id} id={current.id}
            onLoadedMetadata={(e: React.SyntheticEvent<HTMLVideoElement>) => onMediaSize(e.currentTarget.videoWidth, e.currentTarget.videoHeight)}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />
        ) : (
          <img
            key={current.id}
            src={`/api/drive-thumb?id=${current.id}&sz=w800`}
            alt={`Slide ${slide + 1}`}
            onLoad={e => onMediaSize(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
            draggable={false}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
          />
        )}
      </div>
      {items.length > 1 && (
        <>
          <button onClick={prev} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>‹</button>
          <button onClick={next} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>›</button>
          <div style={{ position: 'absolute', bottom: 10, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 5 }}>
            {items.map((_, i) => (
              <div key={i} onClick={() => setSlide(i)} style={{ width: i === slide ? 16 : 6, height: 6, borderRadius: 3, background: i === slide ? '#fff' : 'rgba(255,255,255,0.45)', cursor: 'pointer', transition: 'width 0.2s, background 0.2s' }} />
            ))}
          </div>
        </>
      )}
      <a href={folderUrl} target="_blank" rel="noopener noreferrer"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '9px 0', background: '#f5f5f3', borderTop: '1px solid #ebebeb', fontSize: 12, fontWeight: 600, color: '#374151', textDecoration: 'none' }}>
        📂 {slide + 1}/{items.length} · Abrir pasta no Drive
      </a>
    </div>
  )
}

// Galeria arrastável pra quando drive_url tem vários links de arquivo solto
// (não uma pasta) — mesma UI de slide+bolinhas do CarouselPreview, mas sem
// depender de listar uma pasta (não sabemos o mimetype de cada um, então
// trata tudo como imagem, que é o caso real que motivou isso).
function MultiFilePreview({ ids, fallbackUrl, ratio = '100%' }: { ids: string[]; fallbackUrl?: string | null; ratio?: string }) {
  const [slide, setSlide] = useState(0)
  const { ratio: frameRatio, onMediaSize } = useMediaRatio(ratio)
  const prev = () => setSlide(s => (s - 1 + ids.length) % ids.length)
  const next = () => setSlide(s => (s + 1) % ids.length)
  const swipeHandlers = useSwipe(prev, next)
  const swipe = ids.length > 1 ? swipeHandlers : {}
  return (
    <div style={{ position: 'relative', background: '#1c1a18', userSelect: 'none' }}>
      <div {...swipe} style={{ position: 'relative', paddingTop: frameRatio, overflow: 'hidden', cursor: ids.length > 1 ? 'grab' : 'default', touchAction: 'pan-y' }}>
        <img key={ids[slide]} src={`/api/drive-thumb?id=${ids[slide]}&sz=w800`} alt={`Slide ${slide + 1}`}
          onLoad={e => onMediaSize(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
          draggable={false}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
      </div>
      {ids.length > 1 && (
        <>
          <button onClick={prev} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>‹</button>
          <button onClick={next} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>›</button>
          <div style={{ position: 'absolute', bottom: 10, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 5 }}>
            {ids.map((_, i) => (
              <div key={i} onClick={() => setSlide(i)} style={{ width: i === slide ? 16 : 6, height: 6, borderRadius: 3, background: i === slide ? '#fff' : 'rgba(255,255,255,0.45)', cursor: 'pointer', transition: 'width 0.2s, background 0.2s' }} />
            ))}
          </div>
        </>
      )}
      {fallbackUrl && (
        <a href={fallbackUrl.split(/\s+/)[0]} target="_blank" rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '9px 0', background: '#f5f5f3', borderTop: '1px solid #ebebeb', fontSize: 12, fontWeight: 600, color: '#374151', textDecoration: 'none' }}>
          🔗 {slide + 1}/{ids.length} · Abrir no Drive
        </a>
      )}
    </div>
  )
}

type DriveFileInfo = { id: string; name: string; mimeType: string }
function useFolderFiles(folderId: string) {
  const [files, setFiles] = useState<DriveFileInfo[]>([])
  const [ready, setReady] = useState(false)
  useEffect(() => {
    fetch(`/api/drive-folder?folderId=${folderId}`)
      .then(r => r.json())
      .then(d => { setFiles(d.files || []); setReady(true) })
      .catch(() => setReady(true))
  }, [folderId])
  return { files, ready }
}
function pickCover(images: DriveFileInfo[]) {
  return images.find(f => /^capa\./i.test(f.name)) ?? images[0]
}
const SPINNER = <div style={{ width: 24, height: 24, border: '3px solid #e5e7eb', borderTopColor: '#374151', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />

function FolderThumb({ folderId, maxHeight = 220 }: { folderId: string; maxHeight?: number }) {
  const { files, ready } = useFolderFiles(folderId)
  if (!ready) return <div style={{ height: maxHeight, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f3' }}>{SPINNER}</div>
  const img = pickCover(files.filter(f => f.mimeType.startsWith('image/')))
  if (!img) return null
  return (
    <div style={{ background: '#f5f5f3', lineHeight: 0, maxHeight, overflow: 'hidden' }}>
      <img src={`/api/drive-thumb?id=${img.id}&sz=w800`} alt=""
        style={{ width: '100%', objectFit: 'cover', display: 'block', maxHeight }}
        onError={e => { (e.target as HTMLImageElement).closest('div')!.style.display = 'none' }} />
    </div>
  )
}

function ReelFolderPreview({ folderId, folderUrl }: { folderId: string; folderUrl: string }) {
  const { files, ready } = useFolderFiles(folderId)
  if (!ready) return <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1c1a18' }}>{SPINNER}</div>
  const videos = files.filter(f => f.mimeType.startsWith('video/'))
  const video  = videos[0]
  // Mostra só o vídeo — a capa da pasta não entra aqui pra não sobrepor o player.
  return video ? (
    <DriveVideo id={video.id} folderUrl={folderUrl} />
  ) : (
    <a href={folderUrl} target="_blank" rel="noopener noreferrer"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 0', background: '#f5f5f3', borderTop: '1px solid #ebebeb', fontSize: 13, fontWeight: 600, color: '#374151', textDecoration: 'none' }}>
      🎬 Abrir reel no Drive
    </a>
  )
}

function SheetReelFolderVideo({ folderId, folderUrl }: { folderId: string; folderUrl: string }) {
  const { files, ready } = useFolderFiles(folderId)
  if (!ready) return <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1c1a18' }}>{SPINNER}</div>
  const video = files.find(f => f.mimeType.startsWith('video/'))
  if (!video) return (
    <a href={folderUrl} target="_blank" rel="noopener noreferrer"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '18px 0', background: '#1c1a18', fontSize: 14, fontWeight: 600, color: '#fff', textDecoration: 'none' }}>
      🎬 Assistir reel no Drive
    </a>
  )
  return <DriveVideo id={video.id} folderUrl={folderUrl} />
}

function initials(name: string) {
  return (name || '?').split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()
}
function hostOf(url: string) { try { return new URL(url).hostname.replace('www.', '') } catch { return url } }
function mapType(t: string): FeedPost['type'] {
  if (t === 'reels') return 'reel'
  if (t === 'carrossel' || t === 'carrossel_stories') return 'carousel'
  if (t === 'story') return 'story'
  return 'photo'
}
function mapStatus(s: Post): FeedPost['status'] {
  // Agendado/publicado é sempre "decidido" pro feed, mesmo que approval_status
  // nunca tenha sido setado (post movido direto pelo time, sem passar pela
  // aprovação do cliente) — sem isso aparecia com botão de aprovar um post
  // que já foi ao ar.
  if (s.status === 'agendado' || s.status === 'publicado') return 'approved'
  if (s.approval_status === 'aprovado') return 'approved'
  if (s.approval_status === 'não aprovado') return 'changes_requested'
  return 'pending'
}

type ScheduleUpload = { id: string; filename: string; file_url: string; file_size?: number | null; mime_type?: string | null }
type ScheduleAttachment = { id: string; url: string; title?: string | null }

interface Post {
  id: string; title: string; post_type: string; status: string
  drive_url?: string; drive_folder_url?: string; copy?: string; legenda?: string; briefing?: string; scheduled_date?: string; reference_images?: string[] | null
  reference_notes?: string | null
  post_number?: number; approval_comment?: string; approval_status?: string
  funil?: string; campaign_type?: string
}

export default function ApprovalPage({ token }: { token: string }) {
  const supabase  = createClient()

  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [tokenData,    setTokenData]    = useState<any>(null)
  const [client,       setClient]       = useState<any>(null)
  const [posts,        setPosts]        = useState<Post[]>([])
  const [uploadsByPost,     setUploadsByPost]     = useState<Record<string, ScheduleUpload[]>>({})
  const [attachmentsByPost, setAttachmentsByPost] = useState<Record<string, ScheduleAttachment[]>>({})
  const [extras,       setExtras]       = useState<any[]>([])
  const [submitting,       setSubmitting]       = useState<string | null>(null)
  const [extraSubmitting,  setExtraSubmitting]  = useState<string | null>(null)
  const [toast,        setToast]        = useState<{ msg: string; ok: boolean } | null>(null)
  const [commenting,   setCommenting]   = useState<Set<string>>(new Set())
  // Histórico começa fechado: o que a Central precisa mostrar primeiro é o que
  // depende do cliente. Fechado também evita carregar as miniaturas do Drive
  // de dezenas de posts antigos antes de alguém pedir por elas.
  const [verHistorico, setVerHistorico] = useState(false)
  const [comments,     setComments]     = useState<Record<string, string>>({})
  const [extraComments,    setExtraComments]    = useState<Record<string, string>>({})
  const [extraCommenting,  setExtraCommenting]  = useState<Set<string>>(new Set())
  const [approvingAll, setApprovingAll] = useState(false)
  const [tab,          setTab]          = useState<'feed' | 'calendario' | 'posts'>('feed')

  // Feed-tab: selected post for bottom sheet
  const [sheetPost,    setSheetPost]    = useState<Post | null>(null)
  const [sheetComment, setSheetComment] = useState('')

  // Tab Calendário — navegável (não travado no mês do cronograma). Um post
  // criado dentro do cronograma de julho pode ter data marcada em agosto (ex:
  // sobrou pro mês seguinte); sem navegação, esse post nunca aparecia em
  // lugar nenhum pro cliente. `null` = ainda não inicializado.
  const [calMonth, setCalMonth] = useState<number | null>(null)
  const [calYear,  setCalYear]  = useState<number | null>(null)

  // Escolhe o mês inicial do calendário: o do cronograma, a não ser que ele
  // não tenha nenhum post com data marcada e algum mês seguinte tenha — nesse
  // caso já abre direto no mês certo, em vez de mostrar uma grade vazia.
  useEffect(() => {
    // Espera o carregamento terminar de verdade — `posts` começa vazio e só é
    // preenchido depois de `tokenData`/`client` (awaits em sequência dentro de
    // load()), então decidir com base em "posts.length === 0" aqui rodava
    // ANTES dos posts chegarem, travando o mês errado permanentemente (o
    // efeito só roda uma vez, guardado por `calMonth !== null`).
    if (loading || !tokenData || calMonth !== null) return
    const baseMonth = tokenData.month || new Date().getMonth() + 1
    const baseYear  = tokenData.year  || new Date().getFullYear()
    const baseKey = `${baseYear}-${baseMonth}`
    const hasBase = posts.some(p => p.scheduled_date && `${p.scheduled_date.slice(0, 4)}-${Number(p.scheduled_date.slice(5, 7))}` === baseKey)
    if (hasBase || posts.length === 0) { setCalMonth(baseMonth); setCalYear(baseYear); return }
    const datedPosts = posts.filter(p => p.scheduled_date).map(p => p.scheduled_date as string).sort()
    const next = datedPosts.find(d => d >= `${baseYear}-${String(baseMonth).padStart(2, '0')}-01`)
    if (next) { setCalMonth(Number(next.slice(5, 7))); setCalYear(Number(next.slice(0, 4))) }
    else { setCalMonth(baseMonth); setCalYear(baseYear) }
  }, [loading, tokenData, posts, calMonth])

  function shiftCalMonth(delta: number) {
    setCalMonth(m => {
      if (m === null) return m
      let nm = m + delta, ny = calYear || new Date().getFullYear()
      if (nm > 12) { nm = 1; ny += 1 } else if (nm < 1) { nm = 12; ny -= 1 }
      setCalYear(ny)
      return nm
    })
  }

  useEffect(() => {
    if (!client || !tokenData) return
    const label = tokenData.type === 'cronograma' ? 'Aprovação do Cronograma' : tokenData.type === 'geral' ? 'Central de Aprovação' : 'Aprovação Final'
    document.title = `${label} · ${client.name}`
  }, [client, tokenData])

  // Página pública: força tema claro (não segue o dark mode do dispositivo do cliente)
  useEffect(() => {
    const html = document.documentElement
    const prev = html.getAttribute('data-theme')
    html.setAttribute('data-theme', 'light')
    return () => { if (prev) html.setAttribute('data-theme', prev); else html.removeAttribute('data-theme') }
  }, [])

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok }); setTimeout(() => setToast(null), 3500)
  }

  // Anexos/arquivos/referências do post final também precisam aparecer pro
  // cliente aqui, não só no card interno do Cronograma — sem isso, o time
  // pode ter deixado o print/documento/link de referência anexado e o
  // cliente nunca vê nada disso na hora de aprovar.
  async function loadAttachments(scheduleIds: string[]) {
    if (scheduleIds.length === 0) { setUploadsByPost({}); setAttachmentsByPost({}); return }
    const [{ data: ups, error: upsErr }, { data: atts, error: attsErr }] = await Promise.all([
      supabase.from('schedule_uploads').select('*').in('schedule_id', scheduleIds),
      supabase.from('schedule_attachments').select('*').in('schedule_id', scheduleIds),
    ])
    // O cliente entra sem login, ou seja, como `anon`. Se faltar permissão de
    // leitura nessas duas tabelas, ele aprova sem ver as referências que o time
    // anexou — e nada na tela diz isso. Pelo menos não passa calado no console.
    if (upsErr || attsErr) console.error('[aprovar] anexos não carregaram:', upsErr || attsErr)
    const um: Record<string, ScheduleUpload[]> = {}
    ;(ups || []).forEach((u: any) => { (um[u.schedule_id] ||= []).push(u) })
    const am: Record<string, ScheduleAttachment[]> = {}
    ;(atts || []).forEach((a: any) => { (am[a.schedule_id] ||= []).push(a) })
    setUploadsByPost(um)
    setAttachmentsByPost(am)
  }

  async function load() {
    setLoading(true)
    const { data: tk } = await supabase
      .from('approval_tokens').select('*').eq('token', token).eq('active', true).single()
    if (!tk) { setError('Link inválido ou expirado.'); setLoading(false); return }
    setTokenData(tk)
    const { data: cl } = await supabase
      .from('clients').select('id, name, color_hex, logo_url, instagram_url').eq('id', tk.client_id).single()
    if (!cl) { setError('Cliente não encontrado.'); setLoading(false); return }
    setClient(cl)
    // Só o que o time enviou explicitamente pra aprovação — mesma lógica do
    // cronograma (que filtra por status aguardando_aprovacao)
    const extrasQuery = supabase.from('extras')
      .select('id, title, type, description, ai_summary, briefing, copy, legenda, reference_images, drive_url, due_date, needs_client_approval, client_approval_status, client_approval_comment')
      .eq('client_id', tk.client_id)
      .eq('client_approval_status', 'aguardando')
      .order('created_at', { ascending: true })

    if (tk.type === 'extras') {
      const { data: ex } = await extrasQuery
      setPosts([])
      setExtras(ex || [])
      setLoading(false)
      return
    }

    if (tk.type === 'geral') {
      // Visão unificada do cliente, sem recorte de mês — diferente do
      // crono/final, que são de um mês específico.
      //
      // O post NÃO sai da lista depois de decidido: aprovado, com ajuste
      // pedido, agendado ou já publicado, ele continua aí. Antes sumia no
      // instante em que o cliente aprovava, e o efeito era o cliente clicar,
      // ver o item desaparecer e não ter como conferir o que acabou de
      // aprovar — nem rever depois o que já foi ao ar. Mesma regra que o feed
      // final já seguia; só esta visão estava de fora.
      //
      // Ordena por ano/mês antes do número porque o post_number recomeça a
      // cada mês: sem isso, o histórico de meses diferentes vinha embaralhado.
      const geralSchedulesQuery = supabase.from('schedules')
        .select('id, title, post_type, status, drive_url, drive_folder_url, copy, legenda, briefing, scheduled_date, post_number, approval_comment, approval_status, funil, campaign_type, reference_images, reference_notes')
        .eq('client_id', tk.client_id)
        .in('status', ['aguardando_aprovacao_crono', 'aguardando_aprovacao', 'aprovado', 'ajuste', 'agendado', 'publicado'])
        .order('year', { ascending: true })
        .order('month', { ascending: true })
        .order('post_number', { ascending: true })
      const [{ data: sc }, { data: ex }] = await Promise.all([geralSchedulesQuery, extrasQuery])
      setPosts(sc || [])
      setExtras(ex || [])
      await loadAttachments((sc || []).map((p: any) => p.id))
      setLoading(false)
      return
    }

    const baseQuery = supabase.from('schedules')
      .select('id, title, post_type, status, drive_url, drive_folder_url, copy, legenda, briefing, scheduled_date, post_number, approval_comment, approval_status, funil, campaign_type, reference_images, reference_notes')
      .eq('client_id', tk.client_id)
      .eq('month', tk.month)
      .eq('year',  tk.year)
      .order('post_number', { ascending: true })
    // No feed final, o post continua no grid pra sempre depois de entrar em
    // aprovação — aprovado, com ajuste pedido, agendado ou já publicado — pra
    // o cliente conseguir ver como o feed dele vai ficar de verdade, não só o
    // que ainda está pendente. Só sai visualmente com o indicador de status
    // (ver mapStatus), nunca some da lista. Isso é específico do cronograma
    // (schedules) — Extras não entra nessa lógica, continua só "aguardando".
    // O cronograma (aprovação de estratégia, tk.type === 'cronograma') já
    // muda de tela ao decidir, então continua só mostrando o pendente mesmo.
    const schedulesQuery = tk.type === 'cronograma'
      ? baseQuery.eq('status', 'aguardando_aprovacao_crono')
      : baseQuery.in('status', ['aguardando_aprovacao', 'aprovado', 'ajuste', 'agendado', 'publicado'])

    const [{ data: sc }, { data: ex }] = await Promise.all([schedulesQuery, extrasQuery])
    setPosts(sc || [])
    setExtras(ex || [])
    await loadAttachments((sc || []).map((p: any) => p.id))
    setLoading(false)
  }

  useEffect(() => { load() }, [token])

  // ── Derived feed posts (keep in sync with posts state) ─────────────────────
  const feedPosts: FeedPost[] = posts.map(p => ({
    id: p.id, title: p.title, type: mapType(p.post_type), status: mapStatus(p),
    drive_url: (p as any).drive_url, drive_folder_url: (p as any).drive_folder_url,
    copy: p.copy, legenda: p.legenda, scheduled_date: p.scheduled_date, post_number: (p as any).post_number,
  }))

  // ── Actions ────────────────────────────────────────────────────────────────
  // CRÍTICO: nenhuma dessas ações pode seguir em frente (otimista + log de
  // atividade) se o UPDATE no banco falhar — já aconteceu de o cliente ver
  // "Aprovado" na tela dele, e até o log registrar "Cliente aprovou o post",
  // enquanto o post continuava esquecido em "Aguardando aprovação" pro time
  // internamente, porque o `.update()` nunca teve `error` checado. Cada ação
  // agora confere `error` e mostra um aviso claro pro cliente tentar de novo
  // em vez de fingir sucesso.
  async function approve(postId: string) {
    setSubmitting(postId)
    const { error } = await supabase.from('schedules').update({ approval_status: 'aprovado', approval_comment: null, status: 'aprovado' }).eq('id', postId)
    if (error) { showToast('Não deu pra aprovar agora — tenta de novo em instantes.', false); setSubmitting(null); return }
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, approval_status: 'aprovado', status: 'aprovado', approval_comment: undefined } : p))
    await ensureWatchingFromAssigned('schedules', postId)
    await queueApprovalDigest(tokenData?.client_id, 'approved')
    await logActivity({ tableName: 'schedules', recordId: postId, clientId: tokenData?.client_id, action: 'client_approved', actorName: client?.name || 'Cliente', description: `Cliente aprovou o post`, skipPush: true })
    setCommenting(s => { const n = new Set(s); n.delete(postId); return n })
    setSheetPost(null); setSheetComment('')
    showToast('Post aprovado! ✓')
    setSubmitting(null)
  }

  /**
   * Descobre se o pedido é de arte, de legenda ou de tema, e grava no post — é
   * isso que faz o ajuste cair no "Para você" da pessoa certa lá no hub.
   *
   * Awaited de propósito. Solto, ele morre junto com a aba se o cliente fechar
   * logo depois de enviar (foi assim que a gente já perdeu registro de
   * histórico). E falha silenciosa é aceitável aqui: sem alvo, o hub roteia
   * pelo tipo do post.
   */
  async function classificarAjuste(postId: string, comment: string) {
    try {
      const post = posts.find(p => p.id === postId)
      const r = await fetch('/api/ai-ajuste-alvo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ comment, postType: post?.post_type, title: post?.title }),
      })
      const { alvo } = await r.json()
      if (alvo) await supabase.from('schedules').update({ ajuste_alvo: alvo }).eq('id', postId)
    } catch { /* sem classificação, o roteamento cai no tipo do post */ }
  }

  async function requestChanges(postId: string, comment: string) {
    const c = comment.trim(); if (!c) return
    setSubmitting(postId)
    const { error } = await supabase.from('schedules').update({ approval_status: 'não aprovado', approval_comment: c, status: 'ajuste' }).eq('id', postId)
    if (error) { showToast('Não deu pra enviar o ajuste — tenta de novo em instantes.', false); setSubmitting(null); return }
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, approval_status: 'não aprovado', approval_comment: c, status: 'ajuste' } : p))
    await classificarAjuste(postId, c)
    await ensureWatchingFromAssigned('schedules', postId)
    await queueApprovalDigest(tokenData?.client_id, 'rejected')
    await logActivity({ tableName: 'schedules', recordId: postId, clientId: tokenData?.client_id, action: 'client_rejected', actorName: client?.name || 'Cliente', description: `Cliente solicitou ajuste: "${c}"`, skipPush: true })
    setCommenting(s => { const n = new Set(s); n.delete(postId); return n })
    setComments(cc => { const n = { ...cc }; delete n[postId]; return n })
    setSheetPost(null); setSheetComment('')
    showToast('Alteração enviada!', false)
    setSubmitting(null)
  }

  async function undo(postId: string) {
    setSubmitting(postId)
    const { error } = await supabase.from('schedules').update({ approval_status: null, approval_comment: null, status: 'aguardando_aprovacao' }).eq('id', postId)
    if (error) { showToast('Não deu pra desfazer agora — tenta de novo em instantes.', false); setSubmitting(null); return }
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, approval_status: undefined, approval_comment: undefined, status: 'aguardando_aprovacao' } : p))
    setSubmitting(null)
  }

  async function approveAll() {
    const pending = posts.filter(p => p.approval_status !== 'aprovado' && p.approval_status !== 'não aprovado')
    if (!pending.length) return
    setApprovingAll(true)
    const results = await Promise.all(
      pending.map(p => supabase.from('schedules').update({ approval_status: 'aprovado', approval_comment: null, status: 'aprovado' }).eq('id', p.id))
    )
    const okIds = new Set(pending.filter((_, i) => !results[i].error).map(p => p.id))
    const failedCount = pending.length - okIds.size
    await Promise.all([
      ...pending.filter(p => okIds.has(p.id)).map(p => ensureWatchingFromAssigned('schedules', p.id)),
      ...pending.filter(p => okIds.has(p.id)).map(p => logActivity({ tableName: 'schedules', recordId: p.id, clientId: tokenData?.client_id, action: 'client_approved', actorName: client?.name || 'Cliente', description: `Cliente aprovou o post`, skipPush: true })),
    ])
    await queueApprovalDigest(tokenData?.client_id, 'approved', okIds.size)
    setPosts(prev => prev.map(p => okIds.has(p.id) ? { ...p, approval_status: 'aprovado', status: 'aprovado', approval_comment: undefined } : p))
    if (failedCount > 0) showToast(`${okIds.size} aprovados, ${failedCount} falharam — tenta de novo neles.`, false)
    else showToast(`${okIds.size} posts aprovados! 🎉`)
    setApprovingAll(false)
  }

  // ── Cronograma approval actions ────────────────────────────────────────────
  async function approveCrono(postId: string) {
    setSubmitting(postId)
    const { error } = await supabase.from('schedules').update({ status: 'producao', approval_status: 'aprovado', approval_comment: null }).eq('id', postId)
    if (error) { showToast('Não deu pra aprovar agora — tenta de novo em instantes.', false); setSubmitting(null); return }
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, status: 'producao', approval_status: 'aprovado' } : p))
    await ensureWatchingFromAssigned('schedules', postId)
    await queueApprovalDigest(tokenData?.client_id, 'approved')
    await logActivity({ tableName: 'schedules', recordId: postId, clientId: tokenData?.client_id, action: 'crono_approved', actorName: client?.name || 'Cliente', description: 'Cliente aprovou a estratégia do post', skipPush: true })
    showToast('Post aprovado! ✓')
    setSubmitting(null)
  }

  async function rejectCrono(postId: string, comment: string) {
    const c = comment.trim(); if (!c) return
    setSubmitting(postId)
    const { error } = await supabase.from('schedules').update({ status: 'estrategia', approval_status: 'não aprovado', approval_comment: c }).eq('id', postId)
    if (error) { showToast('Não deu pra enviar o ajuste — tenta de novo em instantes.', false); setSubmitting(null); return }
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, status: 'estrategia', approval_status: 'não aprovado', approval_comment: c } : p))
    await ensureWatchingFromAssigned('schedules', postId)
    await queueApprovalDigest(tokenData?.client_id, 'rejected')
    await logActivity({ tableName: 'schedules', recordId: postId, clientId: tokenData?.client_id, action: 'crono_rejected', actorName: client?.name || 'Cliente', description: `Cliente pediu ajuste na estratégia: "${c}"`, skipPush: true })
    setCommenting(s => { const n = new Set(s); n.delete(postId); return n })
    setComments(cc => { const n = { ...cc }; delete n[postId]; return n })
    showToast('Solicitação enviada!', false)
    setSubmitting(null)
  }

  async function approveAllCrono() {
    const pending = posts.filter(p => p.status === 'aguardando_aprovacao_crono')
    if (!pending.length) return
    setApprovingAll(true)
    const results = await Promise.all(
      pending.map(p => supabase.from('schedules').update({ status: 'producao', approval_status: 'aprovado', approval_comment: null }).eq('id', p.id))
    )
    const okIds = new Set(pending.filter((_, i) => !results[i].error).map(p => p.id))
    const failedCount = pending.length - okIds.size
    await Promise.all([
      ...pending.filter(p => okIds.has(p.id)).map(p => ensureWatchingFromAssigned('schedules', p.id)),
      ...pending.filter(p => okIds.has(p.id)).map(p => logActivity({ tableName: 'schedules', recordId: p.id, clientId: tokenData?.client_id, action: 'crono_approved', actorName: client?.name || 'Cliente', description: 'Cliente aprovou a estratégia do post', skipPush: true })),
    ])
    await queueApprovalDigest(tokenData?.client_id, 'approved', okIds.size)
    setPosts(prev => prev.map(p => okIds.has(p.id) ? { ...p, status: 'producao', approval_status: 'aprovado' } : p))
    if (failedCount > 0) showToast(`${okIds.size} aprovados, ${failedCount} falharam — tenta de novo neles.`, false)
    else showToast(`${okIds.size} posts aprovados! 🎉`)
    setApprovingAll(false)
  }

  // status (Kanban interno) e client_approval_status agora andam sempre
  // juntos — igual o Cronograma já fazia. Sem isso, o card ficava "aprovado"
  // pro cliente mas continuava parado na coluna "Em aprovação" do Kanban,
  // e ninguém do time percebia que já podia arquivar/publicar.
  async function approveExtra(extraId: string) {
    setExtraSubmitting(extraId)
    const { error } = await supabase.from('extras').update({ client_approval_status: 'aprovado', client_approval_comment: null, status: 'done', completed_at: new Date().toISOString() }).eq('id', extraId)
    if (error) { showToast('Não deu pra aprovar agora — tenta de novo em instantes.', false); setExtraSubmitting(null); return }
    setExtras(prev => prev.map(e => e.id === extraId ? { ...e, client_approval_status: 'aprovado', client_approval_comment: null, status: 'done' } : e))
    await ensureWatchingFromAssigned('extras', extraId)
    await queueApprovalDigest(tokenData?.client_id, 'approved')
    await logActivity({ tableName: 'extras', recordId: extraId, clientId: tokenData?.client_id, action: 'client_approved', actorName: client?.name || 'Cliente', description: 'Cliente aprovou o extra', skipPush: true })
    showToast('Extra aprovado! ✓')
    setExtraSubmitting(null)
  }

  async function undoExtra(extraId: string) {
    setExtraSubmitting(extraId)
    const { error } = await supabase.from('extras').update({ client_approval_status: 'aguardando', client_approval_comment: null, status: 'aguardando_aprovacao', completed_at: null }).eq('id', extraId)
    if (error) { showToast('Não deu pra desfazer agora — tenta de novo em instantes.', false); setExtraSubmitting(null); return }
    setExtras(prev => prev.map(e => e.id === extraId ? { ...e, client_approval_status: 'aguardando', client_approval_comment: null, status: 'aguardando_aprovacao' } : e))
    setExtraSubmitting(null)
  }

  async function rejectExtra(extraId: string, comment: string) {
    const c = comment.trim(); if (!c) return
    setExtraSubmitting(extraId)
    const { error } = await supabase.from('extras').update({ client_approval_status: 'recusado', client_approval_comment: c, status: 'backlog' }).eq('id', extraId)
    if (error) { showToast('Não deu pra enviar o ajuste — tenta de novo em instantes.', false); setExtraSubmitting(null); return }
    setExtras(prev => prev.map(e => e.id === extraId ? { ...e, client_approval_status: 'recusado', client_approval_comment: c, status: 'backlog' } : e))
    await ensureWatchingFromAssigned('extras', extraId)
    await queueApprovalDigest(tokenData?.client_id, 'rejected')
    await logActivity({ tableName: 'extras', recordId: extraId, clientId: tokenData?.client_id, action: 'client_rejected', actorName: client?.name || 'Cliente', description: `Cliente pediu ajuste: "${c}"`, skipPush: true })
    setExtraCommenting(s => { const n = new Set(s); n.delete(extraId); return n })
    setExtraComments(cc => { const n = { ...cc }; delete n[extraId]; return n })
    showToast('Pedido de ajuste enviado!', false)
    setExtraSubmitting(null)
  }

  function renderExtraCard(extra: any) {
    const isCommenting = extraCommenting.has(extra.id)
    const comment = extraComments[extra.id] || ''
    const isLoading = extraSubmitting === extra.id
    const TYPE_EXTRA: Record<string, string> = { story: '📸 Story', carrossel_stories: '🎠 Carrossel/Stories', post_story: '🎠 Post/Story', reels: '🎬 Reels', post: '🖼️ Post' }

    const isApproved = extra.client_approval_status === 'aprovado'
    const isChanges  = extra.client_approval_status === 'recusado'
    // Time aplicou o ajuste e reenviou, mas o cliente ainda não olhou de novo
    // — sem isso, o extra volta a parecer um pendente qualquer.
    const isAdjustedPending = !isApproved && !isChanges && extra.client_approval_status === 'aguardando' && !!extra.client_approval_comment
    const cardBorder = isApproved ? '#86efac' : isChanges ? '#fcd34d' : isAdjustedPending ? '#fcd34d' : '#ebebeb'
    const statusBg   = isApproved ? '#f0fdf4' : isChanges ? '#fffbeb' : isAdjustedPending ? '#fffbeb' : '#fafafa'
    const statusClr  = isApproved ? '#16a34a'  : isChanges ? '#b45309' : isAdjustedPending ? '#b45309' : '#9ca3af'
    const statusTxt  = isApproved ? '✓ Aprovado' : isChanges ? '⚠ Pediu ajuste' : isAdjustedPending ? '🟡 Ajustado — revisar' : '● Pendente'

    // Mesma lógica de mídia do post final: pasta (reel/carrossel/capa) ou arquivo único (vídeo/imagem)
    const isFolder    = /\/folders\//.test(extra.drive_url || '')
    const folderId    = isFolder ? extra.drive_url.match(/\/folders\/([-\w]{25,})/)?.[1] : null
    const driveId     = !isFolder ? extra.drive_url?.match(/[-\w]{25,}/)?.[0] : null
    const isVideoType = extra.type === 'reels'
    const isCarrossel = extra.type === 'carrossel_stories'
    const thumbUrl    = driveId && !isVideoType ? `/api/drive-thumb?id=${driveId}&sz=w800` : null
    const embedVideoId = driveId && isVideoType ? driveId : null

    return (
      <div key={extra.id} style={{ background: '#fff', borderRadius: 22, border: `1.5px solid ${cardBorder}`, overflow: 'hidden', boxShadow: isApproved ? '0 2px 12px rgba(34,197,94,0.08)' : '0 1px 4px rgba(0,0,0,0.06)' }}>

        {/* Status bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: statusBg, borderBottom: `1px solid ${cardBorder}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#555', background: '#f0f0ee', padding: '2px 9px', borderRadius: 100 }}>{TYPE_EXTRA[extra.type] || extra.type}</span>
            {extra.due_date && (
              <span style={{ fontSize: 11, color: '#9ca3af' }}>
                {new Date(extra.due_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
              </span>
            )}
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: statusClr }}>{statusTxt}</span>
        </div>

        {/* Drive media — pasta SEMPRE vira carrossel navegável (quadro 4:5, mídia
            inteira sem corte, estilo Instagram): resolve pasta mista com post 4:5
            + story 9:16, cada um aparece por completo. Arquivo único: vídeo no
            player 9:16, imagem no mesmo quadro 4:5 sem corte. */}
        {folderId ? (
          <CarouselPreview folderId={folderId} folderUrl={extra.drive_url || ''} ratio="125%" />
        ) : embedVideoId ? (
          <DriveVideo id={embedVideoId} folderUrl={extra.drive_url} />
        ) : thumbUrl ? (
          // Sem altura fixa: a imagem ocupa a largura e a altura sai da
          // proporção real dela — não sobra fundo nem corta nada.
          <div style={{ background: '#1c1a18', lineHeight: 0 }}>
            <img src={thumbUrl} alt={extra.title}
              style={{ width: '100%', height: 'auto', display: 'block' }}
              onError={e => { const wrap = (e.target as HTMLImageElement).parentElement; if (wrap) wrap.style.display = 'none' }} />
          </div>
        ) : null}

        <div style={{ padding: '16px 18px' }}>
          <h3 style={{ fontSize: 17, fontWeight: 800, color: '#111', margin: '0 0 8px', letterSpacing: '-0.02em', lineHeight: 1.3 }}>{extra.title}</h3>
          {/* `description` é um campo ANTIGO, substituído por briefing/copy/
              legenda e hoje invisível no card do Hub — mas continuava sendo
              exibido aqui pro cliente. Resultado real: um recado interno
              ("Pessoal vou escrever agora só pra não esquecer…") ficou
              visível pro cliente do Satō, e ninguém do time conseguia ver
              nem apagar isso pela interface. Só ai_summary (gerado da copy)
              fica; briefing/copy/legenda já aparecem logo abaixo. */}
          {extra.ai_summary && (
            <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 14px', lineHeight: 1.6 }}>{extra.ai_summary}</p>
          )}

          {extra.briefing && (
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#b0b0b0', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Briefing</p>
              <div style={{ background: '#fafaf8', borderRadius: 14, padding: '12px 14px', border: '1px solid #f0f0ec' }}>
                <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>{extra.briefing}</p>
              </div>
            </div>
          )}

          {extra.legenda && (
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#b0b0b0', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Legenda</p>
              <div style={{ background: '#f8f6ff', borderRadius: 14, padding: '12px 14px', border: '1px solid #e8e0f9' }}>
                <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>{extra.legenda}</p>
              </div>
            </div>
          )}

          {extra.copy && (
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#b0b0b0', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Rascunho de copy</p>
              <div style={{ background: '#f8f6ff', borderRadius: 14, padding: '12px 14px', border: '1px solid #e8e0f9' }}>
                <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>{extra.copy}</p>
              </div>
            </div>
          )}

          {Array.isArray(extra.reference_images) && extra.reference_images.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#b0b0b0', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Referências</p>
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
                {extra.reference_images.map((url: string, i: number) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0 }}>
                    <img src={url} alt={`Referência ${i + 1}`} style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 12, border: '1px solid #ebebeb' }} />
                  </a>
                ))}
              </div>
            </div>
          )}

          {extra.drive_url && (
            <div style={{ marginBottom: 14 }}>
              <a href={extra.drive_url} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: cc, textDecoration: 'none' }}>
                🔗 Abrir no Drive
              </a>
            </div>
          )}

          {(isChanges || isAdjustedPending) && extra.client_approval_comment && (
            <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 14, padding: '11px 14px', marginBottom: 14 }}>
              <p style={{ fontSize: 10, color: '#92400e', fontWeight: 800, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{isChanges ? 'Sua solicitação' : 'Você pediu — já ajustado, dá uma olhada'}</p>
              <p style={{ fontSize: 13, color: '#78350f', margin: 0, fontStyle: 'italic', lineHeight: 1.5 }}>"{extra.client_approval_comment}"</p>
            </div>
          )}
          {/* Histórico: já foi aprovado, mas passou por um ajuste antes — nota
              discreta (não é mais um alerta) só pra manter o contexto visível. */}
          {isApproved && extra.client_approval_comment && (
            <div style={{ background: '#f5f5f3', border: '1px solid #e5e5e0', borderRadius: 14, padding: '11px 14px', marginBottom: 14 }}>
              <p style={{ fontSize: 10, color: '#8a8a85', fontWeight: 800, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>✓ Ajuste aplicado</p>
              <p style={{ fontSize: 13, color: '#6b6b66', margin: 0, fontStyle: 'italic', lineHeight: 1.5 }}>"{extra.client_approval_comment}"</p>
            </div>
          )}

          {isCommenting && (
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 8px', fontWeight: 600 }}>O que precisa mudar?</p>
              <textarea autoFocus value={comment}
                onChange={e => setExtraComments(c => ({ ...c, [extra.id]: e.target.value }))}
                placeholder="Ex: Trocar a imagem, ajustar o texto..."
                rows={3}
                style={{ width: '100%', background: '#fff', border: `2px solid ${cc}`, borderRadius: 14, padding: '13px 16px', fontSize: 15, color: '#111', resize: 'none', outline: 'none', boxSizing: 'border-box', lineHeight: 1.5, fontFamily: 'inherit' }}
              />
            </div>
          )}
          {isApproved ? (
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 0', borderRadius: 16, background: '#f0fdf4', border: '1.5px solid #86efac', fontSize: 15, fontWeight: 700, color: '#16a34a' }}>
                <CheckCircle size={17} strokeWidth={2.5} /> Aprovado
              </div>
              <button onClick={() => undoExtra(extra.id)} disabled={!!isLoading}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '14px 16px', borderRadius: 16, background: '#fff', border: '1.5px solid #e5e7eb', fontSize: 13, fontWeight: 600, color: '#9ca3af', cursor: 'pointer', flexShrink: 0 }}>
                <RotateCcw size={13} /> Desfazer
              </button>
            </div>
          ) : isCommenting ? (
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setExtraCommenting(s => { const n = new Set(s); n.delete(extra.id); return n }); setExtraComments(c => { const n = { ...c }; delete n[extra.id]; return n }) }}
                style={{ padding: '14px 18px', borderRadius: 16, background: '#f3f4f6', border: 'none', fontSize: 14, fontWeight: 600, color: '#6b7280', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={() => rejectExtra(extra.id, comment)} disabled={!comment.trim() || !!isLoading}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 0', borderRadius: 16, background: '#fef3c7', border: '1.5px solid #fde68a', fontSize: 14, fontWeight: 700, color: '#92400e', cursor: comment.trim() ? 'pointer' : 'default', opacity: !comment.trim() || isLoading ? 0.5 : 1 }}>
                <MessageSquare size={15} /> Enviar pedido
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setExtraCommenting(s => { const n = new Set(s); n.add(extra.id); return n })}
                style={{ padding: '14px 18px', borderRadius: 16, background: '#f3f4f6', border: '1.5px solid #ebebeb', fontSize: 14, fontWeight: 600, color: '#374151', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                ✏️ Pedir ajuste
              </button>
              <button onClick={() => approveExtra(extra.id)} disabled={!!isLoading}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 0', borderRadius: 16, background: cc, border: 'none', fontSize: 15, fontWeight: 800, color: '#fff', cursor: 'pointer', opacity: isLoading ? 0.7 : 1, boxShadow: `0 6px 24px ${cc}44`, letterSpacing: '-0.02em' }}>
                {isLoading ? '…' : <><CheckCircle size={17} strokeWidth={2.5} /> Aprovar</>}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Story callbacks for IPhoneFeed
  async function handleStoryApprove(fp: FeedPost) {
    await approve(fp.id)
  }
  async function handleStoryReject(fp: FeedPost, c: string) {
    await requestChanges(fp.id, c)
  }

  // Posts já agendados/publicados só têm lugar no feed visual (grid) e no
  // calendário — na revisão em lista (scroll, tab "posts") não faz sentido
  // pedir pra aprovar/ajustar algo que já foi ao ar, então nem entram nessa
  // lista nem nas contagens de progresso.
  const reviewPosts = posts.filter(p => p.status !== 'agendado' && p.status !== 'publicado')
  // Ordem em 3 níveis, em vez de misturados na ordem de produção (post_number):
  // 1) quem ainda precisa de uma decisão do cliente (pendente, ajuste, ou
  //    ajuste já resolvido aguardando o cliente olhar de novo);
  // 2) já aprovados que passaram por um ajuste (mostram a nota histórica
  //    "✓ Ajuste aplicado" — ainda vale a pena revisar por cima);
  // 3) aprovados sem nenhum histórico de ajuste, por último.
  // Sort estável: dentro de cada grupo mantém a ordem original.
  const reviewRank = (p: Post) => p.approval_status !== 'aprovado' ? 0 : p.approval_comment ? 1 : 2
  const reviewPostsOrdered = [...reviewPosts].sort((a, b) => reviewRank(a) - reviewRank(b))

  // Stats
  const totalPosts    = reviewPosts.length
  const approvedCount = reviewPosts.filter(p => p.approval_status === 'aprovado').length
  const changesCount  = reviewPosts.filter(p => p.approval_status === 'não aprovado').length
  const pendingCount  = reviewPosts.filter(p => !p.approval_status || !['aprovado','não aprovado'].includes(p.approval_status)).length
  const pct           = totalPosts > 0 ? (approvedCount / totalPosts) * 100 : 0
  const allDone       = totalPosts > 0 && approvedCount === totalPosts

  // ── Loading / error ────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f8f6' }}>
      <div style={{ width: 32, height: 32, border: '3px solid #e5e7eb', borderTopColor: '#374151', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
  if (error) return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: '#f8f8f6', padding: 24 }}>
      <AlertTriangle size={36} color="#ef4444" />
      <p style={{ fontSize: 16, fontWeight: 700, color: '#111', textAlign: 'center', margin: 0 }}>{error}</p>
      <p style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', margin: 0 }}>Solicite um novo link de aprovação.</p>
    </div>
  )

  const cc = client?.color_hex || '#111111'

  // Cronograma card — hoisted pro escopo do componente (não só dentro do
  // branch 'cronograma') pra ser reaproveitado também na visão unificada 'geral'.
  function renderCronoCard(post: Post) {
    // Post movido direto pra agendado/publicado pelo time nunca teve
    // approval_status preenchido — sem incluir esses dois aqui, ele aparecia
    // pro cliente com botão de "Aprovar" um conteúdo que já foi ao ar.
    const isApproved = post.approval_status === 'aprovado' || post.status === 'agendado' || post.status === 'publicado'
    const isChanged  = post.approval_status === 'não aprovado'
    const isComm     = commenting.has(post.id)
    const comment    = comments[post.id] || ''
    const isLoading  = submitting === post.id

    return (
      <div key={post.id} style={{ background: '#fff', borderRadius: 22, border: `1.5px solid ${isApproved ? '#86efac' : isChanged ? '#fcd34d' : '#ebebeb'}`, overflow: 'hidden', boxShadow: isApproved ? '0 2px 12px rgba(34,197,94,0.08)' : '0 1px 4px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: isApproved ? '#f0fdf4' : isChanged ? '#fffbeb' : '#fafafa', borderBottom: `1px solid ${isApproved ? '#86efac' : isChanged ? '#fcd34d' : '#ebebeb'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#c4c4c0', letterSpacing: '0.05em' }}>#{String(post.post_number || 1).padStart(2, '0')}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#555', background: '#f0f0ee', padding: '2px 9px', borderRadius: 100 }}>{TYPE_EMOJIS[post.post_type]} {TYPE_LABELS[post.post_type]}</span>
            {post.scheduled_date && <span style={{ fontSize: 11, color: '#9ca3af' }}>{new Date(post.scheduled_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span>}
            {post.funil && <span style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', background: '#f3f4f6', padding: '1px 7px', borderRadius: 100 }}>{post.funil.split(' ')[0]}</span>}
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: isApproved ? '#16a34a' : isChanged ? '#b45309' : '#9ca3af' }}>
            {isApproved ? '✓ Aprovado' : isChanged ? '⚠ Revisar' : '● Pendente'}
          </span>
        </div>

        <div style={{ padding: '16px 18px' }}>
          <h3 style={{ fontSize: 17, fontWeight: 800, color: '#111', margin: '0 0 12px', lineHeight: 1.3, letterSpacing: '-0.02em' }}>{post.title}</h3>

          {post.briefing && (
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#b0b0b0', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Estratégia / Briefing</p>
              <div style={{ background: '#fafaf8', borderRadius: 14, padding: '12px 14px', border: '1px solid #f0f0ec' }}>
                <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>{post.briefing}</p>
              </div>
            </div>
          )}

          {post.legenda && (
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#b0b0b0', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Legenda</p>
              <div style={{ background: '#f8f6ff', borderRadius: 14, padding: '12px 14px', border: '1px solid #e8e0f9' }}>
                <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>{post.legenda}</p>
              </div>
            </div>
          )}

          {post.copy && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#b0b0b0', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Rascunho de copy</p>
              <div style={{ background: '#f8f6ff', borderRadius: 14, padding: '12px 14px', border: '1px solid #e8e0f9' }}>
                <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>{post.copy}</p>
              </div>
            </div>
          )}

          {post.reference_images && post.reference_images.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#b0b0b0', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Referências</p>
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
                {post.reference_images.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0 }}>
                    <img src={url} alt={`Referência ${i + 1}`} style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 12, border: '1px solid #ebebeb' }} />
                  </a>
                ))}
              </div>
            </div>
          )}

          {(post.drive_url || post.drive_folder_url) && (
            <div style={{ marginBottom: 16 }}>
              <a href={post.drive_url || post.drive_folder_url} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: cc, textDecoration: 'none' }}>
                🔗 Abrir referência no Drive
              </a>
            </div>
          )}

          {renderRefsAndAttachments(post)}

          {isChanged && post.approval_comment && (
            <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 14, padding: '11px 14px', marginBottom: 14 }}>
              <p style={{ fontSize: 10, color: '#92400e', fontWeight: 800, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sua solicitação</p>
              <p style={{ fontSize: 13, color: '#78350f', margin: 0, fontStyle: 'italic', lineHeight: 1.5 }}>"{post.approval_comment}"</p>
            </div>
          )}

          {isComm && (
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 8px', fontWeight: 600 }}>O que precisa mudar?</p>
              <textarea autoFocus value={comment}
                onChange={e => setComments(c => ({ ...c, [post.id]: e.target.value }))}
                placeholder="Ex: Mudar o foco para o produto B, ajustar a data..."
                rows={3}
                style={{ width: '100%', background: '#fff', border: `2px solid ${cc}`, borderRadius: 14, padding: '13px 16px', fontSize: 15, color: '#111', resize: 'none', outline: 'none', boxSizing: 'border-box', lineHeight: 1.5, fontFamily: 'inherit' }}
              />
            </div>
          )}

          {isApproved ? (
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 0', borderRadius: 16, background: '#f0fdf4', border: '1.5px solid #86efac', fontSize: 15, fontWeight: 700, color: '#16a34a' }}>
                <CheckCircle size={17} strokeWidth={2.5} /> Aprovado
              </div>
              <button onClick={() => { supabase.from('schedules').update({ status: 'aguardando_aprovacao_crono', approval_status: null }).eq('id', post.id); setPosts(prev => prev.map(p => p.id === post.id ? { ...p, status: 'aguardando_aprovacao_crono', approval_status: undefined } : p)) }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '14px 16px', borderRadius: 16, background: '#fff', border: '1.5px solid #e5e7eb', fontSize: 13, fontWeight: 600, color: '#9ca3af', cursor: 'pointer', flexShrink: 0 }}>
                <RotateCcw size={13} /> Desfazer
              </button>
            </div>
          ) : isComm ? (
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setCommenting(s => { const n = new Set(s); n.delete(post.id); return n }); setComments(c => { const n = { ...c }; delete n[post.id]; return n }) }}
                style={{ padding: '14px 18px', borderRadius: 16, background: '#f3f4f6', border: 'none', fontSize: 14, fontWeight: 600, color: '#6b7280', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={() => rejectCrono(post.id, comment)} disabled={!comment.trim() || !!isLoading}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 0', borderRadius: 16, background: '#fef3c7', border: '1.5px solid #fde68a', fontSize: 14, fontWeight: 700, color: '#92400e', cursor: comment.trim() ? 'pointer' : 'default', opacity: !comment.trim() || isLoading ? 0.5 : 1 }}>
                <MessageSquare size={15} /> Enviar pedido
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setCommenting(s => { const n = new Set(s); n.add(post.id); return n })}
                style={{ padding: '14px 18px', borderRadius: 16, background: '#f3f4f6', border: '1.5px solid #ebebeb', fontSize: 14, fontWeight: 600, color: '#374151', cursor: 'pointer', whiteSpace: 'nowrap' }}>✏️ Pedir ajuste</button>
              <button onClick={() => approveCrono(post.id)} disabled={!!isLoading}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 0', borderRadius: 16, background: cc, border: 'none', fontSize: 15, fontWeight: 800, color: '#fff', cursor: 'pointer', opacity: isLoading ? 0.7 : 1, boxShadow: `0 6px 24px ${cc}44`, letterSpacing: '-0.02em' }}>
                {isLoading ? '…' : <><CheckCircle size={17} strokeWidth={2.5} /> Aprovar</>}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Referências (notas) + anexos/arquivos do post — precisam aparecer pro
  // cliente aqui também, não só no card interno do time.
  function linkifyText(text: string) {
    const parts = text.split(/(https?:\/\/\S+)/g)
    return parts.map((part, i) =>
      /^https?:\/\//.test(part)
        ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: cc, textDecoration: 'underline', fontWeight: 600 }}>{part}</a>
        : <span key={i}>{part}</span>
    )
  }

  function AttachmentTile({ href, title, children }: { href: string; title: string; children: React.ReactNode }) {
    const [hover, setHover] = useState(false)
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" title={title}
        onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: 64, textDecoration: 'none' }}>
        <div style={{
          width: 56, height: 56, borderRadius: 10, overflow: 'hidden', background: '#f5f5f3',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: `1.5px solid ${hover ? cc : '#ebebeb'}`,
          boxShadow: hover ? '0 3px 10px rgba(0,0,0,0.12)' : 'none',
          transform: hover ? 'translateY(-1px)' : 'none',
          transition: 'all 0.15s',
        }}>
          {children}
        </div>
        <span style={{ fontSize: 10, color: hover ? cc : '#9ca3af', textAlign: 'center', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any, fontWeight: hover ? 700 : 500, width: '100%', wordBreak: 'break-all' }}>
          {title}
        </span>
      </a>
    )
  }

  function renderRefsAndAttachments(post: Post) {
    const uploads = uploadsByPost[post.id] || []
    const attachments = attachmentsByPost[post.id] || []
    if (!post.reference_notes && uploads.length === 0 && attachments.length === 0) return null
    return (
      <div style={{ marginBottom: 14 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#b0b0b0', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Referências & anexos</p>
        {post.reference_notes && (
          <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 8px', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{linkifyText(post.reference_notes)}</p>
        )}
        {(uploads.length > 0 || attachments.length > 0) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {uploads.map(u => (
              <AttachmentTile key={u.id} href={u.file_url} title={u.filename}>
                {u.mime_type?.startsWith('image/')
                  ? <img src={u.file_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontSize: 20 }}>📄</span>}
              </AttachmentTile>
            ))}
            {attachments.map(a => (
              <AttachmentTile key={a.id} href={a.url} title={a.title || hostOf(a.url)}>
                <img src={`https://www.google.com/s2/favicons?domain=${hostOf(a.url)}&sz=32`} alt="" style={{ width: 22, height: 22 }} />
              </AttachmentTile>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Card de post final — hoisted igual o crono, reaproveitado na visão 'geral'.
  function renderFinalCard(post: Post, idx: number) {
    const isApproved = post.approval_status === 'aprovado'
    const isChanges  = post.approval_status === 'não aprovado'
    // Time aplicou o ajuste pedido e reenviou pra revisão, mas o cliente ainda
    // não bateu o olho de novo — sem esse destaque, o post volta a aparecer
    // como "pendente" igual a qualquer post novo, e o cliente pode nem notar
    // que é justamente aquele que ele pediu pra mudar.
    const isAdjustedPending = !isApproved && !isChanges && post.status === 'aguardando_aprovacao' && !!post.approval_comment
    const isComm     = commenting.has(post.id)
    const comment    = comments[post.id] || ''
    const isLoading  = submitting === post.id
    const displayCopy = post.legenda || post.copy || ''

    const isCarrossel = post.post_type === 'carrossel' || post.post_type === 'carrossel_stories'
    // Não confia só no post_type pra decidir o que mostrar — lê o que foi
    // REALMENTE entregue. Se drive_url tem vários links de arquivo soltos
    // (não uma pasta), mostra todos numa galeria, mesmo que o post esteja
    // marcado como "Post" ou "Reels" — evita repetir o bug de um carrossel
    // entregue como 4 links virar só 1 foto exibida.
    const driveIds    = extractDriveIds(post.drive_url)
    const driveId     = driveIds[0]
    const folderId    = post.drive_folder_url?.match(/\/folders\/([-\w]{25,})/)?.[1]
    const isVideoPost = post.post_type === 'reels'
    const isMultiFile = driveIds.length > 1 && !isVideoPost && !folderId
    const thumbUrl    = driveId && !isVideoPost && !(isCarrossel && folderId) && !isMultiFile ? `/api/drive-thumb?id=${driveId}&sz=w800` : null
    const embedVideoId = driveId && isVideoPost ? driveId : null

    // "Aprovado" e "já está no ar" são coisas diferentes pro cliente, e antes
    // os dois apareciam como "✓ Aprovado" — ele não tinha como saber o que já
    // saiu. Agendado mostra a data: é a pergunta que ele faria em seguida
    // ("quando sai?"), respondida sem precisar perguntar.
    const isPublicado = post.status === 'publicado'
    const isAgendado  = post.status === 'agendado'
    const quando = post.scheduled_date
      ? new Date(post.scheduled_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
      : null

    const cardBorder = isPublicado ? '#6ee7b7' : isAgendado ? '#99f6e4' : isApproved ? '#86efac' : isChanges ? '#fcd34d' : isAdjustedPending ? '#fcd34d' : '#ebebeb'
    const statusBg   = isPublicado ? '#ecfdf5' : isAgendado ? '#f0fdfa' : isApproved ? '#f0fdf4' : isChanges ? '#fffbeb' : isAdjustedPending ? '#fffbeb' : '#fafafa'
    const statusClr  = isPublicado ? '#047857' : isAgendado ? '#0d9488' : isApproved ? '#16a34a'  : isChanges ? '#b45309' : isAdjustedPending ? '#b45309' : '#9ca3af'
    const statusTxt  = isPublicado ? '🚀 Publicado'
      : isAgendado ? (quando ? `📅 Agendado · ${quando}` : '📅 Agendado')
      : isApproved ? '✓ Aprovado' : isChanges ? '⚠ Pediu ajuste' : isAdjustedPending ? '🟡 Ajustado — revisar' : '● Pendente'

    return (
      <div key={post.id} style={{ background: '#fff', borderRadius: 22, border: `1.5px solid ${cardBorder}`, overflow: 'hidden', boxShadow: isApproved ? '0 2px 12px rgba(34,197,94,0.08)' : '0 1px 4px rgba(0,0,0,0.06)', transition: 'border-color 0.35s' }}>

        {/* Status bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: statusBg, borderBottom: `1px solid ${cardBorder}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#c4c4c0', letterSpacing: '0.05em' }}>#{String(post.post_number || idx + 1).padStart(2, '0')}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#555', background: '#f0f0ee', padding: '2px 9px', borderRadius: 100 }}>
              {TYPE_EMOJIS[post.post_type]} {TYPE_LABELS[post.post_type] || post.post_type}
            </span>
            {post.scheduled_date && (
              <span style={{ fontSize: 11, color: '#9ca3af' }}>
                {new Date(post.scheduled_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
              </span>
            )}
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: statusClr }}>{statusTxt}</span>
        </div>

        {/* Drive media */}
        {embedVideoId ? (
          <div>
            {folderId && <FolderThumb folderId={folderId} />}
            <DriveVideo id={embedVideoId} folderUrl={post.drive_folder_url || post.drive_url} />
          </div>
        ) : isVideoPost && folderId ? (
          <ReelFolderPreview folderId={folderId} folderUrl={post.drive_folder_url || ''} />
        ) : isCarrossel && folderId ? (
          <CarouselPreview folderId={folderId} folderUrl={post.drive_folder_url || ''} />
        ) : folderId ? (
          <FolderThumb folderId={folderId} />
        ) : isMultiFile ? (
          <MultiFilePreview ids={driveIds} fallbackUrl={post.drive_url} />
        ) : thumbUrl ? (
          // Altura natural da imagem — antes tinha maxHeight+cover, que
          // cortava a arte pela metade pro cliente aprovar.
          <div style={{ background: '#f5f5f3', lineHeight: 0 }}>
            <img src={thumbUrl} alt={post.title} style={{ width: '100%', height: 'auto', display: 'block' }}
              onError={e => { (e.target as HTMLImageElement).closest('div')!.style.display = 'none' }} />
          </div>
        ) : null}

        {/* Fallback: se há link do Drive mas nenhuma pré-visualização acima
            deu certo (formato inesperado, thumbnail falhou, etc.), garante
            que o cliente sempre tem como abrir o conteúdo — sem isso, o card
            fica só com legenda e botão de aprovar, sem nada pra revisar. */}
        {(post.drive_url || post.drive_folder_url) && !embedVideoId && !folderId && !thumbUrl && !isMultiFile && (
          <div style={{ padding: '12px 18px 0' }}>
            <a href={post.drive_folder_url || post.drive_url || ''} target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: cc, textDecoration: 'none' }}>
              🔗 Abrir no Drive
            </a>
          </div>
        )}

        {/* Content */}
        <div style={{ padding: '16px 18px' }}>
          {/* Sem título aqui, e sem referências/anexos logo abaixo. Na
              aprovação FINAL o cliente julga a peça pronta: a arte, a legenda
              que vai no ar e a data. Título é nome interno do card, e
              referência/anexo é material de trabalho do time — mostrar isso
              convida o cliente a opinar sobre o processo em vez do resultado.
              Na aprovação de CRONOGRAMA os dois continuam, porque ali o que
              está em jogo é justamente a pauta. */}

          {/* Legenda (texto final do Instagram; se ainda não tiver, cai no rascunho de copy) */}
          {displayCopy && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#b0b0b0', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                {post.legenda ? 'Legenda' : 'Rascunho de copy'}
              </p>
              <div style={{ background: '#fafaf8', borderRadius: 14, padding: '12px 14px', border: '1px solid #f0f0ec' }}>
                <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>
                  {displayCopy}
                </p>
              </div>
            </div>
          )}

          {/* Previous change */}
          {(isChanges || isAdjustedPending) && post.approval_comment && (
            <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 14, padding: '11px 14px', marginBottom: 14 }}>
              <p style={{ fontSize: 10, color: '#92400e', fontWeight: 800, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{isChanges ? 'Sua solicitação' : 'Você pediu — já ajustado, dá uma olhada'}</p>
              <p style={{ fontSize: 13, color: '#78350f', margin: 0, fontStyle: 'italic', lineHeight: 1.5 }}>"{post.approval_comment}"</p>
            </div>
          )}
          {/* Histórico: já foi aprovado, mas passou por um ajuste antes — nota
              discreta (não é mais um alerta) só pra manter o contexto visível. */}
          {isApproved && post.approval_comment && (
            <div style={{ background: '#f5f5f3', border: '1px solid #e5e5e0', borderRadius: 14, padding: '11px 14px', marginBottom: 14 }}>
              <p style={{ fontSize: 10, color: '#8a8a85', fontWeight: 800, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>✓ Ajuste aplicado</p>
              <p style={{ fontSize: 13, color: '#6b6b66', margin: 0, fontStyle: 'italic', lineHeight: 1.5 }}>"{post.approval_comment}"</p>
            </div>
          )}

          {/* Comment input */}
          {isComm && (
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 8px', fontWeight: 600 }}>O que precisa mudar?</p>
              <textarea autoFocus value={comment}
                onChange={e => setComments(c => ({ ...c, [post.id]: e.target.value }))}
                placeholder="Ex: Trocar a imagem, ajustar o texto na linha 2..."
                rows={3}
                style={{ width: '100%', background: '#fff', border: `2px solid ${cc}`, borderRadius: 14, padding: '13px 16px', fontSize: 15, color: '#111', resize: 'none', outline: 'none', boxSizing: 'border-box', lineHeight: 1.5, fontFamily: 'inherit' }}
              />
            </div>
          )}

          {/* Actions */}
          {isApproved ? (
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 0', borderRadius: 16, background: '#f0fdf4', border: '1.5px solid #86efac', fontSize: 15, fontWeight: 700, color: '#16a34a' }}>
                <CheckCircle size={17} strokeWidth={2.5} /> Aprovado
              </div>
              <button onClick={() => undo(post.id)} disabled={!!isLoading}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '14px 16px', borderRadius: 16, background: '#fff', border: '1.5px solid #e5e7eb', fontSize: 13, fontWeight: 600, color: '#9ca3af', cursor: 'pointer', flexShrink: 0 }}>
                <RotateCcw size={13} /> Desfazer
              </button>
            </div>
          ) : isComm ? (
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setCommenting(s => { const n = new Set(s); n.delete(post.id); return n }); setComments(c => { const n = { ...c }; delete n[post.id]; return n }) }}
                style={{ padding: '14px 18px', borderRadius: 16, background: '#f3f4f6', border: 'none', fontSize: 14, fontWeight: 600, color: '#6b7280', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={() => requestChanges(post.id, comment)} disabled={!comment.trim() || !!isLoading}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 0', borderRadius: 16, background: '#fef3c7', border: '1.5px solid #fde68a', fontSize: 14, fontWeight: 700, color: '#92400e', cursor: comment.trim() ? 'pointer' : 'default', opacity: !comment.trim() || isLoading ? 0.5 : 1 }}>
                <MessageSquare size={15} /> Enviar ajuste
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setCommenting(s => { const n = new Set(s); n.add(post.id); return n })}
                style={{ padding: '14px 18px', borderRadius: 16, background: '#f3f4f6', border: '1.5px solid #ebebeb', fontSize: 14, fontWeight: 600, color: '#374151', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                ✏️ Pedir ajuste
              </button>
              <button onClick={() => approve(post.id)} disabled={!!isLoading}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 0', borderRadius: 16, background: cc, border: 'none', fontSize: 15, fontWeight: 800, color: '#fff', cursor: 'pointer', opacity: isLoading ? 0.7 : 1, boxShadow: `0 6px 24px ${cc}44`, letterSpacing: '-0.02em', transition: 'opacity 0.15s' }}>
                {isLoading ? '…' : <><CheckCircle size={17} strokeWidth={2.5} /> Aprovar</>}
              </button>
            </div>
          )}
        </div>
      </div>
    )  }

  // ── Visão unificada (geral) — tudo pendente do cliente numa página só ───────
  if (tokenData?.type === 'geral') {
    const cronoList = posts.filter(p => p.status === 'aguardando_aprovacao_crono')
    const finalList = posts.filter(p => p.status === 'aguardando_aprovacao')
    // Tudo que o cliente já decidiu, ou que o time já levou adiante. Continua
    // na página em vez de sumir no clique — mais recente primeiro, que é o que
    // ele vai querer rever.
    const decididos = posts
      .filter(p => ['aprovado', 'ajuste', 'agendado', 'publicado'].includes(p.status || ''))
      .reverse()
    const totalPendingGeral = cronoList.length + finalList.length + extras.length
    const allDoneGeral = totalPendingGeral === 0

    return (
      <div style={{ minHeight: '100dvh', background: '#f8f8f6', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', paddingBottom: 32 }}>
        {toast && (
          <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, background: toast.ok ? '#111' : '#d97706', color: '#fff', fontSize: 14, fontWeight: 600, padding: '11px 22px', borderRadius: 100, boxShadow: '0 8px 40px rgba(0,0,0,0.22)', display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
            {toast.ok ? <CheckCircle size={15} /> : <MessageSquare size={15} />}
            {toast.msg}
          </div>
        )}
        <header style={{ background: '#fff', borderBottom: '1px solid #ebebeb', position: 'sticky', top: 0, zIndex: 30 }}>
          <div style={{ maxWidth: 600, margin: '0 auto', padding: '14px 16px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {client?.logo_url
                ? <img src={client.logo_url} alt={client.name} style={{ width: 44, height: 44, borderRadius: 14, objectFit: 'contain', flexShrink: 0, border: '1px solid #f0f0f0' }} />
                : <div style={{ width: 44, height: 44, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 15, fontWeight: 800, background: cc, flexShrink: 0 }}>{initials(client?.name || '')}</div>
              }
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 16, fontWeight: 800, color: '#111', margin: 0, letterSpacing: '-0.02em', lineHeight: 1.2 }}>{client?.name}</p>
                <p style={{ fontSize: 12, color: '#9ca3af', margin: '2px 0 0' }}>Central de aprovação</p>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p style={{ margin: 0, lineHeight: 1 }}>
                  <span style={{ fontSize: 22, fontWeight: 900, color: allDoneGeral ? '#16a34a' : '#111', letterSpacing: '-0.04em' }}>{totalPendingGeral}</span>
                </p>
                <p style={{ fontSize: 10, color: '#b0b0b0', margin: '3px 0 0', letterSpacing: '0.02em' }}>PENDENTES</p>
              </div>
            </div>
          </div>
        </header>

        <main style={{ maxWidth: 560, margin: '0 auto', padding: '20px 16px 0' }}>
          {allDoneGeral ? (
            <div style={{ textAlign: 'center', padding: '32px 20px 28px', background: '#fff', borderRadius: 24, border: '1.5px solid #86efac', boxShadow: '0 2px 16px rgba(34,197,94,0.1)' }}>
              <div style={{ fontSize: 56, marginBottom: 14, lineHeight: 1 }}>🎉</div>
              <h2 style={{ fontSize: 22, fontWeight: 900, color: '#111', margin: '0 0 10px', letterSpacing: '-0.03em' }}>Tudo em dia!</h2>
              <p style={{ fontSize: 14, color: '#6b7280', margin: 0, lineHeight: 1.65 }}>Não há nada aguardando sua aprovação no momento.</p>
            </div>
          ) : (
            <>
              {cronoList.length > 0 && (
                <div style={{ marginBottom: 28 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.06em', textTransform: 'uppercase', margin: '0 0 12px' }}>📋 Estratégia / Cronograma · {cronoList.length}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{cronoList.map(p => renderCronoCard(p))}</div>
                </div>
              )}
              {finalList.length > 0 && (
                <div style={{ marginBottom: 28 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.06em', textTransform: 'uppercase', margin: '0 0 12px' }}>✅ Posts finais · {finalList.length}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{finalList.map((p, i) => renderFinalCard(p, i))}</div>
                </div>
              )}
              {extras.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.06em', textTransform: 'uppercase', margin: '0 0 12px' }}>🧩 Extras · {extras.length}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{extras.map(renderExtraCard)}</div>
                </div>
              )}
            </>
          )}

          {/* Fora do bloco acima de propósito: o histórico aparece mesmo quando
              não há nada pendente — é justamente aí que o cliente vai querer
              rever o que aprovou. */}
          {decididos.length > 0 && (
            <div style={{ marginTop: 24, borderTop: '1px solid #ebebeb', paddingTop: 20 }}>
              <button
                onClick={() => setVerHistorico(v => !v)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                <span style={{ display: 'inline-block', transform: verHistorico ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▸</span>
                📁 Já aprovados e publicados · {decididos.length}
              </button>
              {verHistorico && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
                  {decididos.map((p, i) => renderFinalCard(p, i))}
                </div>
              )}
            </div>
          )}

          <p style={{ textAlign: 'center', fontSize: 11, color: '#d1d5db', marginTop: 28 }}>Powered by Bagano Hub</p>
        </main>
        <style>{`* { -webkit-tap-highlight-color: transparent; box-sizing: border-box; } @keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  // ── Extras-only approval render ─────────────────────────────────────────────
  if (tokenData?.type === 'extras') {
    const extrasApproved = extras.filter(e => e.client_approval_status === 'aprovado').length
    const extrasPending  = extras.filter(e => e.client_approval_status === 'aguardando').length
    const allExtrasDone  = extras.length > 0 && extrasPending === 0
    const pctExtras      = extras.length > 0 ? (extrasApproved / extras.length) * 100 : 0
    return (
      <div style={{ minHeight: '100dvh', background: '#f8f8f6', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', paddingBottom: 32 }}>
        {toast && (
          <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, background: toast.ok ? '#111' : '#d97706', color: '#fff', fontSize: 14, fontWeight: 600, padding: '11px 22px', borderRadius: 100, boxShadow: '0 8px 40px rgba(0,0,0,0.22)', display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
            {toast.ok ? <CheckCircle size={15} /> : <MessageSquare size={15} />}
            {toast.msg}
          </div>
        )}
        <header style={{ background: '#fff', borderBottom: '1px solid #ebebeb', position: 'sticky', top: 0, zIndex: 30 }}>
          <div style={{ maxWidth: 600, margin: '0 auto', padding: '14px 16px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              {client?.logo_url
                ? <img src={client.logo_url} alt={client.name} style={{ width: 44, height: 44, borderRadius: 14, objectFit: 'contain', flexShrink: 0, border: '1px solid #f0f0f0' }} />
                : <div style={{ width: 44, height: 44, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 15, fontWeight: 800, background: cc, flexShrink: 0 }}>{initials(client?.name || '')}</div>
              }
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 16, fontWeight: 800, color: '#111', margin: 0, letterSpacing: '-0.02em', lineHeight: 1.2 }}>{client?.name}</p>
                <p style={{ fontSize: 12, color: '#9ca3af', margin: '2px 0 0' }}>Aprovação de conteúdos extras</p>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p style={{ margin: 0, lineHeight: 1 }}>
                  <span style={{ fontSize: 22, fontWeight: 900, color: allExtrasDone ? '#16a34a' : '#111', letterSpacing: '-0.04em' }}>{extrasApproved}</span>
                  <span style={{ fontSize: 13, color: '#d1d5db', fontWeight: 500 }}>/{extras.length}</span>
                </p>
                <p style={{ fontSize: 10, color: '#b0b0b0', margin: '3px 0 0', letterSpacing: '0.02em' }}>APROVADOS</p>
              </div>
            </div>
            <div style={{ height: 4, background: '#f3f3f1', borderRadius: 2, overflow: 'hidden', marginBottom: 10 }}>
              <div style={{ height: '100%', borderRadius: 2, background: allExtrasDone ? '#22c55e' : cc, width: `${pctExtras}%`, transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)' }} />
            </div>
            <p style={{ fontSize: 13, color: '#6b7280', margin: 0, lineHeight: 1.5 }}>
              Revise cada conteúdo e toque em <strong style={{ color: '#111' }}>Aprovar</strong>. Se precisar de mudança, toque em <strong style={{ color: '#111' }}>Pedir ajuste</strong>.
            </p>
          </div>
        </header>
        <main style={{ maxWidth: 560, margin: '0 auto', padding: '20px 16px 0' }}>
          {extras.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', background: '#fff', borderRadius: 24, border: '1px solid #ebebeb' }}>
              <p style={{ fontSize: 32, marginBottom: 12, lineHeight: 1 }}>🎉</p>
              <p style={{ fontSize: 16, fontWeight: 700, color: '#111', margin: '0 0 8px' }}>Nada pendente</p>
              <p style={{ fontSize: 14, color: '#9ca3af', margin: 0 }}>Nenhum conteúdo extra aguardando sua aprovação.</p>
            </div>
          ) : allExtrasDone ? (
            <div style={{ textAlign: 'center', padding: '32px 20px 28px', background: '#fff', borderRadius: 24, border: '1.5px solid #86efac', boxShadow: '0 2px 16px rgba(34,197,94,0.1)', marginBottom: 20 }}>
              <div style={{ fontSize: 56, marginBottom: 14, lineHeight: 1 }}>🎉</div>
              <h2 style={{ fontSize: 22, fontWeight: 900, color: '#111', margin: '0 0 10px', letterSpacing: '-0.03em' }}>Tudo aprovado!</h2>
              <p style={{ fontSize: 14, color: '#6b7280', margin: 0, lineHeight: 1.65 }}>Obrigado! Nossa equipe já vai dar sequência.</p>
            </div>
          ) : null}
          {extras.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{extras.map(renderExtraCard)}</div>
          )}
          <p style={{ textAlign: 'center', fontSize: 11, color: '#d1d5db', marginTop: 28 }}>Powered by Bagano Hub</p>
        </main>
        <style>{`* { -webkit-tap-highlight-color: transparent; box-sizing: border-box; } @keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  // ── Cronograma approval render ─────────────────────────────────────────────
  if (tokenData?.type === 'cronograma') {
    const cronoPending  = posts.filter(p => p.status === 'aguardando_aprovacao_crono').length
    const cronoApproved = posts.filter(p => p.approval_status === 'aprovado').length
    const allCronoDone  = posts.length > 0 && cronoPending === 0
    const pctCrono      = posts.length > 0 ? (cronoApproved / posts.length) * 100 : 0

    const campaigns  = [...new Set(posts.map(p => p.campaign_type).filter(Boolean))] as string[]
    const byCampaign = campaigns.map(ct => ({ name: ct, posts: posts.filter(p => p.campaign_type === ct) }))
    const noCampaign = posts.filter(p => !p.campaign_type)

    return (
      <div style={{ minHeight: '100dvh', background: '#f8f8f6', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', paddingBottom: cronoPending > 0 && !allCronoDone ? 90 : 32 }}>
        {toast && (
          <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, background: toast.ok ? '#111' : '#d97706', color: '#fff', fontSize: 14, fontWeight: 600, padding: '11px 22px', borderRadius: 100, boxShadow: '0 8px 40px rgba(0,0,0,0.22)', display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
            {toast.ok ? <CheckCircle size={15} /> : <MessageSquare size={15} />}
            {toast.msg}
          </div>
        )}

        <header style={{ background: '#fff', borderBottom: '1px solid #ebebeb', position: 'sticky', top: 0, zIndex: 30 }}>
          <div style={{ maxWidth: 600, margin: '0 auto', padding: '14px 16px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              {client?.logo_url
                ? <img src={client.logo_url} alt={client.name} style={{ width: 44, height: 44, borderRadius: 14, objectFit: 'contain', flexShrink: 0, border: '1px solid #f0f0f0' }} />
                : <div style={{ width: 44, height: 44, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 15, fontWeight: 800, background: cc, flexShrink: 0 }}>{initials(client?.name || '')}</div>
              }
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 16, fontWeight: 800, color: '#111', margin: 0, letterSpacing: '-0.02em', lineHeight: 1.2 }}>{client?.name}</p>
                <p style={{ fontSize: 12, color: '#9ca3af', margin: '2px 0 0' }}>Aprovação do Cronograma · {MONTHS[(tokenData?.month ?? 1) - 1]} {tokenData?.year}</p>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p style={{ margin: 0, lineHeight: 1 }}>
                  <span style={{ fontSize: 22, fontWeight: 900, color: allCronoDone ? '#16a34a' : '#111', letterSpacing: '-0.04em' }}>{cronoApproved}</span>
                  <span style={{ fontSize: 13, color: '#d1d5db', fontWeight: 500 }}>/{posts.length}</span>
                </p>
                <p style={{ fontSize: 10, color: '#b0b0b0', margin: '3px 0 0', letterSpacing: '0.02em' }}>APROVADOS</p>
              </div>
            </div>
            <div style={{ height: 4, background: '#f3f3f1', borderRadius: 2, overflow: 'hidden', marginBottom: 10 }}>
              <div style={{ height: '100%', borderRadius: 2, background: allCronoDone ? '#22c55e' : cc, width: `${pctCrono}%`, transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)' }} />
            </div>
            <p style={{ fontSize: 13, color: '#6b7280', margin: 0, lineHeight: 1.5 }}>
              Revise a <strong style={{ color: '#111' }}>estratégia de cada post</strong>. Após sua aprovação, nossa equipe cria as artes e vídeos.
            </p>
          </div>
        </header>

        <main style={{ maxWidth: 560, margin: '0 auto', padding: '20px 16px 0' }}>
          {posts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', background: '#fff', borderRadius: 24, border: '1px solid #ebebeb' }}>
              <p style={{ fontSize: 32, marginBottom: 12, lineHeight: 1 }}>📋</p>
              <p style={{ fontSize: 16, fontWeight: 700, color: '#111', margin: '0 0 8px' }}>Nenhum post para revisar</p>
              <p style={{ fontSize: 14, color: '#9ca3af', margin: 0 }}>Todos os posts já foram processados.</p>
            </div>
          ) : allCronoDone ? (
            <div style={{ textAlign: 'center', padding: '32px 20px 28px', background: '#fff', borderRadius: 24, border: '1.5px solid #86efac', boxShadow: '0 2px 16px rgba(34,197,94,0.1)' }}>
              <div style={{ fontSize: 56, marginBottom: 14, lineHeight: 1 }}>🎉</div>
              <h2 style={{ fontSize: 22, fontWeight: 900, color: '#111', margin: '0 0 10px', letterSpacing: '-0.03em' }}>Cronograma aprovado!</h2>
              <p style={{ fontSize: 14, color: '#6b7280', margin: 0, lineHeight: 1.65 }}>
                Obrigado! Nossa equipe já vai para a produção das artes e vídeos.
              </p>
            </div>
          ) : (
            <>
              <div style={{ background: '#fff', borderRadius: 18, padding: '14px 18px', marginBottom: 20, border: '1px solid #ebebeb', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: cc + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 20 }}>📋</div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#111', margin: '0 0 4px', letterSpacing: '-0.01em' }}>Aprove a estratégia</p>
                  <p style={{ fontSize: 13, color: '#6b7280', margin: 0, lineHeight: 1.55 }}>
                    Ainda não há artes — você está aprovando a <strong style={{ color: '#111' }}>ideia e direcionamento</strong> de cada post. Se precisar de ajuste, toque em <strong style={{ color: '#111' }}>Pedir ajuste</strong>.
                  </p>
                </div>
              </div>

              {byCampaign.map(({ name, posts: cposts }) => (
                <div key={name} style={{ marginBottom: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <div style={{ flex: 1, height: 1, background: '#ebebeb' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: cc + '15', border: `1px solid ${cc}33`, borderRadius: 100, padding: '4px 12px' }}>
                      <span style={{ fontSize: 12 }}>📣</span>
                      <p style={{ fontSize: 12, fontWeight: 700, color: cc, margin: 0 }}>Mini campanha: {name}</p>
                      <span style={{ fontSize: 11, color: cc + 'aa', fontWeight: 600 }}>{cposts.length} posts</span>
                    </div>
                    <div style={{ flex: 1, height: 1, background: '#ebebeb' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{cposts.map(p => renderCronoCard(p))}</div>
                </div>
              ))}

              {noCampaign.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{noCampaign.map(p => renderCronoCard(p))}</div>
              )}
            </>
          )}
          <p style={{ textAlign: 'center', fontSize: 11, color: '#d1d5db', marginTop: 28 }}>Powered by Bagano Hub</p>
        </main>

        {cronoPending > 0 && !allCronoDone && (
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '10px 16px 20px', background: 'rgba(248,248,246,0.95)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderTop: '1px solid #ebebeb', zIndex: 20 }}>
            <div style={{ maxWidth: 560, margin: '0 auto' }}>
              <button onClick={approveAllCrono} disabled={approvingAll}
                style={{ width: '100%', padding: '17px 0', borderRadius: 18, background: cc, border: 'none', fontSize: 15, fontWeight: 800, color: '#fff', cursor: 'pointer', opacity: approvingAll ? 0.7 : 1, boxShadow: `0 8px 36px ${cc}55`, letterSpacing: '-0.02em' }}>
                {approvingAll ? 'Aprovando…' : `Aprovar todos os ${cronoPending} posts pendentes`}
              </button>
            </div>
          </div>
        )}
        <style>{`* { -webkit-tap-highlight-color: transparent; box-sizing: border-box; } @keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  // ── Final approval render ──────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100dvh', background: '#f8f8f6', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', paddingBottom: 32 }}>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, background: toast.ok ? '#111' : '#d97706', color: '#fff', fontSize: 14, fontWeight: 600, padding: '11px 22px', borderRadius: 100, boxShadow: '0 8px 40px rgba(0,0,0,0.22)', display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>
          {toast.ok ? <CheckCircle size={15} /> : <MessageSquare size={15} />}
          {toast.msg}
        </div>
      )}

      {/* ── HEADER ──────────────────────────────────────────────────── */}
      <header style={{ background: '#fff', borderBottom: '1px solid #ebebeb', position: 'sticky', top: 0, zIndex: 30 }}>
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '14px 16px 0' }}>

          {/* Logo + name + counter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            {client?.logo_url
              ? <img src={client.logo_url} alt={client.name} style={{ width: 44, height: 44, borderRadius: 14, objectFit: 'contain', flexShrink: 0, border: '1px solid #f0f0f0' }} />
              : <div style={{ width: 44, height: 44, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 15, fontWeight: 800, background: cc, flexShrink: 0 }}>{initials(client?.name || '')}</div>
            }
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 16, fontWeight: 800, color: '#111', margin: 0, letterSpacing: '-0.02em', lineHeight: 1.2 }}>{client?.name}</p>
              <p style={{ fontSize: 12, color: '#9ca3af', margin: '2px 0 0' }}>Aprovação Final · {MONTHS[(tokenData?.month ?? 1) - 1]} {tokenData?.year}</p>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <p style={{ margin: 0, lineHeight: 1 }}>
                <span style={{ fontSize: 22, fontWeight: 900, color: allDone ? '#16a34a' : '#111', letterSpacing: '-0.04em' }}>{approvedCount}</span>
                <span style={{ fontSize: 13, color: '#d1d5db', fontWeight: 500 }}>/{totalPosts}</span>
              </p>
              <p style={{ fontSize: 10, color: '#b0b0b0', margin: '3px 0 0', letterSpacing: '0.02em' }}>APROVADOS</p>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ height: 4, background: '#f3f3f1', borderRadius: 2, overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ height: '100%', borderRadius: 2, background: allDone ? '#22c55e' : cc, width: `${pct}%`, transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)' }} />
          </div>

          {/* Status pills */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto' }}>
            {pendingCount > 0 && <span style={{ fontSize: 11, fontWeight: 700, background: '#f3f4f6', color: '#6b7280', padding: '4px 10px', borderRadius: 100, whiteSpace: 'nowrap' }}>{pendingCount} pendente{pendingCount !== 1 ? 's' : ''}</span>}
            {changesCount > 0 && <span style={{ fontSize: 11, fontWeight: 700, background: '#fef3c7', color: '#b45309', padding: '4px 10px', borderRadius: 100, whiteSpace: 'nowrap' }}>⚠ {changesCount} ajuste{changesCount !== 1 ? 'ões' : ''}</span>}
            {approvedCount > 0 && <span style={{ fontSize: 11, fontWeight: 700, background: '#f0fdf4', color: '#16a34a', padding: '4px 10px', borderRadius: 100, whiteSpace: 'nowrap' }}>✓ {approvedCount} aprovado{approvedCount !== 1 ? 's' : ''}</span>}
          </div>

          {/* Tab switcher */}
          <div style={{ display: 'flex', gap: 2, background: '#f3f3f1', borderRadius: 14, padding: 3, marginBottom: 0 }}>
            {([
              { key: 'feed',       label: '📱 Feed'        },
              { key: 'calendario', label: '📅 Calendário'  },
              { key: 'posts',      label: '✅ Aprovar'     },
            ] as const).map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{
                  flex: 1, padding: '9px 0', borderRadius: 11, border: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: tab === t.key ? 700 : 500,
                  background: tab === t.key ? '#fff' : 'transparent',
                  color: tab === t.key ? '#111' : '#9ca3af',
                  boxShadow: tab === t.key ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.2s', letterSpacing: '-0.01em',
                }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── FEED TAB ────────────────────────────────────────────────── */}
      {tab === 'feed' && (
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 16px' }}>

          {/* Tip: posts tab is easier */}
          <button onClick={() => setTab('posts')}
            style={{ width: '100%', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 16, background: '#fff', border: '1.5px solid #e5e7eb', cursor: 'pointer', textAlign: 'left' }}>
            <span style={{ fontSize: 22, flexShrink: 0 }}>✅</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#111', margin: 0, letterSpacing: '-0.01em' }}>Prefere aprovar mais rápido?</p>
              <p style={{ fontSize: 12, color: '#9ca3af', margin: '2px 0 0' }}>Use a aba <strong style={{ color: '#374151' }}>Aprovar posts</strong> — você vê o texto e aprova um por um, sem precisar navegar pelo feed.</p>
            </div>
            <span style={{ fontSize: 18, color: '#9ca3af', flexShrink: 0 }}>›</span>
          </button>

          {/* Stories tip if any */}
          {posts.some(p => p.post_type === 'story' && p.approval_status !== 'aprovado') && (
            <div style={{ background: 'linear-gradient(135deg,#dc2743,#cc2366,#bc1888)', borderRadius: 18, padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 6px 24px rgba(220,39,67,0.25)' }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 22 }}>⭕</div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 800, color: '#fff', margin: '0 0 3px', letterSpacing: '-0.01em' }}>Stories aguardando aprovação</p>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', margin: 0 }}>Toque nos círculos coloridos no topo do feed para aprovar cada story.</p>
              </div>
            </div>
          )}

          {/* iPhone Feed */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <IPhoneFeed
              posts={feedPosts}
              clientName={client?.name}
              clientColor={cc}
              clientInitials={initials(client?.name || '')}
              // A logo do cliente já vinha do banco aqui e não era repassada,
              // então o feed do APROVA caía na sigla — ou, pior, ia buscar o
              // avatar no unavatar.io pelo @ do Instagram: serviço de terceiro,
              // na tela que o cliente abre, pra mostrar uma imagem que a gente
              // já tem. As telas internas (Feed Visual e aba do cliente) sempre
              // passaram; só esta ficou de fora.
              logoUrl={client?.logo_url}
              instagramUrl={client?.instagram_url}
              readonly={true}
              approvalMode={true}
              nativeVideo={true}
              onStoryApprove={handleStoryApprove}
              onStoryReject={handleStoryReject}
              onPostClick={fp => {
                const raw = posts.find(p => p.id === fp.id)
                if (raw) { setSheetPost(raw); setSheetComment(raw.approval_comment || '') }
              }}
            />
          </div>

          {/* CTA to posts tab */}
          <div style={{ textAlign: 'center', marginTop: 28 }}>
            <button onClick={() => setTab('posts')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 28px', borderRadius: 18, background: cc, border: 'none', fontSize: 15, fontWeight: 700, color: '#fff', cursor: 'pointer', boxShadow: `0 6px 28px ${cc}44`, letterSpacing: '-0.01em' }}>
              Revisar e aprovar posts →
            </button>
            {pendingCount > 0 && <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 10 }}>{pendingCount} post{pendingCount !== 1 ? 's' : ''} pendente{pendingCount !== 1 ? 's' : ''} de aprovação</p>}
          </div>
        </div>
      )}

      {/* ── POSTS TAB ───────────────────────────────────────────────── */}
      {tab === 'posts' && (
        <main style={{ maxWidth: 560, margin: '0 auto', padding: '20px 16px 0' }}>

          {/* All done */}
          {allDone ? (
            <div>
              <div style={{ textAlign: 'center', padding: '32px 20px 28px', background: '#fff', borderRadius: 24, border: '1.5px solid #86efac', marginBottom: 16, boxShadow: '0 2px 16px rgba(34,197,94,0.1)' }}>
                <div style={{ fontSize: 56, marginBottom: 14, lineHeight: 1 }}>🎉</div>
                <h2 style={{ fontSize: 22, fontWeight: 900, color: '#111', margin: '0 0 10px', letterSpacing: '-0.03em' }}>Tudo aprovado!</h2>
                <p style={{ fontSize: 14, color: '#6b7280', margin: 0, lineHeight: 1.65 }}>
                  Obrigado! Todos os {totalPosts} posts foram aprovados.<br />
                  Entraremos em contato em breve com os próximos passos.
                </p>
              </div>
              {/* Os cards inteiros continuam aqui depois de aprovado — antes
                  esta tela trocava tudo por uma lista de nomes com um check, e
                  o cliente perdia a arte, a legenda e o texto no instante em
                  que terminava de aprovar. Não tinha como conferir o que
                  acabou de aprovar, nem voltar depois pra rever.
                  renderFinalCard já desenha o estado aprovado (borda verde,
                  "✓ Aprovado") e não mostra botão de ação. */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {reviewPostsOrdered.map((post, idx) => renderFinalCard(post, idx))}
              </div>
            </div>
          ) : (
            <>
              {/* Instruction */}
              <div style={{ background: '#fff', borderRadius: 18, padding: '14px 18px', marginBottom: 16, border: '1px solid #ebebeb', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: cc + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 20 }}>👋</div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#111', margin: '0 0 4px', letterSpacing: '-0.01em' }}>Revise e aprove cada post</p>
                  <p style={{ fontSize: 13, color: '#6b7280', margin: 0, lineHeight: 1.55 }}>
                    Leia o texto e toque em <strong style={{ color: '#111' }}>Aprovar</strong>. Se precisar de ajuste, toque em <strong style={{ color: '#111' }}>Pedir ajuste</strong> e descreva o que mudar.
                  </p>
                </div>
              </div>

              {/* Post cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {reviewPostsOrdered.map((post, idx) => renderFinalCard(post, idx))}
              </div>

              {/* Extras pendentes de aprovação */}
              {extras.length > 0 && (
                <div style={{ marginTop: 28 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <div style={{ flex: 1, height: 1, background: '#ebebeb' }} />
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.06em', textTransform: 'uppercase', margin: 0, whiteSpace: 'nowrap' }}>
                      📋 {extras.length} extra{extras.length !== 1 ? 's' : ''} para aprovar
                    </p>
                    <div style={{ flex: 1, height: 1, background: '#ebebeb' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {extras.map(extra => renderExtraCard(extra))}
                  </div>
                </div>
              )}

              <p style={{ textAlign: 'center', fontSize: 11, color: '#d1d5db', marginTop: 28 }}>Powered by Bagano Hub</p>
            </>
          )}
        </main>
      )}


      {/* ── CALENDÁRIO TAB ────────────────────────────────────────────── */}
      {tab === 'calendario' && (() => {
        const DAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
        const calYearFinal  = calYear  ?? (tokenData?.year  || new Date().getFullYear())
        const calMonthFinal = calMonth ?? (tokenData?.month || new Date().getMonth() + 1)
        const mm = String(calMonthFinal).padStart(2, '0')

        const postsByDate: Record<string, Post[]> = {}
        posts.forEach(p => {
          if (p.scheduled_date) {
            if (!postsByDate[p.scheduled_date]) postsByDate[p.scheduled_date] = []
            postsByDate[p.scheduled_date].push(p)
          }
        })
        const postsWithoutDate = posts.filter(p => !p.scheduled_date)

        const firstDay    = new Date(calYearFinal, calMonthFinal - 1, 1).getDay()
        const daysInMonth = new Date(calYearFinal, calMonthFinal, 0).getDate()
        const cells: (number | null)[] = [
          ...Array(firstDay).fill(null),
          ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
        ]

        const today = new Date()
        const postsThisMonth = posts.filter(p => p.scheduled_date && Number(p.scheduled_date.slice(0, 4)) === calYearFinal && Number(p.scheduled_date.slice(5, 7)) === calMonthFinal)

        return (
          <div style={{ maxWidth: 600, margin: '0 auto', padding: '20px 16px' }}>

            {/* Month header — navegável, não travado no mês do cronograma */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 14 }}>
              <button onClick={() => shiftCalMonth(-1)} aria-label="Mês anterior"
                style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #ebebeb', background: '#fff', color: '#6b7280', fontSize: 14, cursor: 'pointer', flexShrink: 0 }}>‹</button>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 18, fontWeight: 800, color: '#111', margin: 0, letterSpacing: '-0.02em' }}>
                  {MONTHS[calMonthFinal - 1]} {calYearFinal}
                </p>
                <p style={{ fontSize: 12, color: '#9ca3af', margin: '3px 0 0' }}>
                  {postsThisMonth.length} post{postsThisMonth.length !== 1 ? 's' : ''} agendado{postsThisMonth.length !== 1 ? 's' : ''} no mês
                </p>
              </div>
              <button onClick={() => shiftCalMonth(1)} aria-label="Próximo mês"
                style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #ebebeb', background: '#fff', color: '#6b7280', fontSize: 14, cursor: 'pointer', flexShrink: 0 }}>›</button>
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginBottom: 14 }}>
              {[['#22c55e','Aprovado'],['#f59e0b','Revisar'],['#d1d5db','Pendente']].map(([color, label]) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
                  <span style={{ fontSize: 11, color: '#6b7280' }}>{label}</span>
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #ebebeb', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 20 }}>
              {/* Day headers */}
              {/* minmax(0, 1fr) e não 1fr: com 1fr a coluna nunca encolhe
                  abaixo do conteúdo, e o título do post (nowrap) empurrava a
                  grade pra além da largura da tela — as últimas colunas
                  ficavam cortadas, sobretudo no celular. */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', borderBottom: '1px solid #f0f0f0', background: '#fafaf8' }}>
                {DAYS_SHORT.map(d => (
                  <div key={d} style={{ textAlign: 'center', padding: '8px 0', fontSize: 10, fontWeight: 800, color: '#b0b0b0', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{d}</div>
                ))}
              </div>

              {/* Day cells */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
                {cells.map((day, i) => {
                  if (!day) return (
                    <div key={i} style={{ minHeight: 64, borderRight: i % 7 !== 6 ? '1px solid #f5f5f5' : 'none', borderBottom: '1px solid #f5f5f5', background: '#fafaf8' }} />
                  )
                  const dateStr  = `${calYearFinal}-${mm}-${String(day).padStart(2, '0')}`
                  const dayPosts = postsByDate[dateStr] || []
                  const hasPosts = dayPosts.length > 0
                  const isToday  = today.getFullYear() === calYearFinal && today.getMonth() + 1 === calMonthFinal && today.getDate() === day

                  return (
                    <div key={i} style={{ minWidth: 0, minHeight: 64, padding: '5px 4px', borderRight: i % 7 !== 6 ? '1px solid #f0f0f0' : 'none', borderBottom: '1px solid #f0f0f0', background: hasPosts ? '#fefefe' : '#fff' }}>
                      <div style={{ fontSize: 11, fontWeight: isToday ? 800 : hasPosts ? 600 : 400, color: isToday ? '#fff' : hasPosts ? '#374151' : '#c4c4c0', width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isToday ? cc : 'transparent', marginBottom: 3 }}>
                        {day}
                      </div>
                      {dayPosts.slice(0, 2).map(p => {
                        const isLive     = p.status === 'agendado' || p.status === 'publicado'
                        const isApproved = isLive || p.approval_status === 'aprovado'
                        const isChanges  = !isLive && p.approval_status === 'não aprovado'
                        const dotColor   = p.status === 'publicado' ? '#22c55e' : p.status === 'agendado' ? '#2563eb' : isApproved ? '#22c55e' : isChanges ? '#f59e0b' : '#d1d5db'
                        return (
                          <button key={p.id}
                            onClick={() => { setSheetPost(p); setSheetComment(p.approval_comment || '') }}
                            style={{ display: 'block', width: '100%', minWidth: 0, marginBottom: 2, background: isApproved ? '#f0fdf4' : isChanges ? '#fffbeb' : '#f3f4f6', border: `1px solid ${isApproved ? '#86efac' : isChanges ? '#fde68a' : '#e5e7eb'}`, borderRadius: 4, padding: '2px 4px', cursor: 'pointer', textAlign: 'left' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
                              <div style={{ width: 5, height: 5, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                              {/* minWidth:0 aqui também: sem isso o texto com
                                  nowrap define a largura mínima do flex item e
                                  o "…" nunca entra em ação. */}
                              <span style={{ fontSize: 9, fontWeight: 600, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.4, minWidth: 0, flex: 1 }}>
                                {TYPE_EMOJIS[p.post_type]} {p.title}
                              </span>
                            </div>
                          </button>
                        )
                      })}
                      {dayPosts.length > 2 && (
                        <p style={{ fontSize: 9, color: '#9ca3af', margin: '1px 0 0', paddingLeft: 3 }}>+{dayPosts.length - 2}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Posts sem data */}
            {postsWithoutDate.length > 0 && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.06em', textTransform: 'uppercase', margin: '0 0 10px', textAlign: 'center' }}>
                  Sem data definida · {postsWithoutDate.length} post{postsWithoutDate.length !== 1 ? 's' : ''}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {postsWithoutDate.map(p => {
                    const isLive     = p.status === 'agendado' || p.status === 'publicado'
                    const isApproved = isLive || p.approval_status === 'aprovado'
                    const isChanges  = !isLive && p.approval_status === 'não aprovado'
                    return (
                      <button key={p.id}
                        onClick={() => { setSheetPost(p); setSheetComment(p.approval_comment || '') }}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, background: '#fff', borderRadius: 14, border: `1.5px solid ${isApproved ? '#86efac' : isChanges ? '#fde68a' : '#ebebeb'}`, padding: '12px 14px', cursor: 'pointer', textAlign: 'left', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                        <span style={{ fontSize: 20, flexShrink: 0 }}>{TYPE_EMOJIS[p.post_type] || '📄'}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: '#111', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</p>
                          <p style={{ fontSize: 11, color: '#9ca3af', margin: '1px 0 0' }}>{TYPE_LABELS[p.post_type]}</p>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: isApproved ? '#16a34a' : isChanges ? '#b45309' : '#9ca3af', flexShrink: 0 }}>
                          {isApproved ? '✓ Aprovado' : isChanges ? '⚠ Revisar' : '● Pendente'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <p style={{ textAlign: 'center', fontSize: 11, color: '#d1d5db', marginTop: 28 }}>Powered by Bagano Hub</p>
          </div>
        )
      })()}

      {/* ── FEED TAB: post approval bottom sheet ────────────────────── */}
      {(tab === 'feed' || tab === 'calendario') && sheetPost && (() => {
        // Agendado/publicado é definitivo — já saiu da etapa de aprovação de
        // verdade, então nem oferece aprovar/pedir ajuste/desfazer aqui, só
        // mostra o status. Isso é o que faz esses posts poderem continuar
        // visíveis no feed/calendário sem parecer que ainda dependem do cliente.
        const isLive           = sheetPost.status === 'agendado' || sheetPost.status === 'publicado'
        const isApproved      = !isLive && sheetPost.approval_status === 'aprovado'
        const isChanges       = !isLive && sheetPost.approval_status === 'não aprovado'
        const isAdjustedPending = !isLive && !isApproved && !isChanges && sheetPost.status === 'aguardando_aprovacao' && !!sheetPost.approval_comment
        const isLoading       = submitting === sheetPost.id
        const isSheetReel     = sheetPost.post_type === 'reels'
        const isSheetCarrossel = sheetPost.post_type === 'carrossel' || sheetPost.post_type === 'carrossel_stories'
        const sheetFolder     = sheetPost.drive_folder_url?.match(/\/folders\/([-\w]{25,})/)?.[1]
        // Mesma lógica adaptativa do card final: lê o que foi entregue de
        // verdade em drive_url, não confia só no post_type.
        const sheetDriveIds   = extractDriveIds(sheetPost.drive_url)
        const driveId         = sheetDriveIds[0]
        const sheetIsMultiFile = sheetDriveIds.length > 1 && !isSheetReel && !sheetFolder
        const thumbUrl        = driveId && !sheetIsMultiFile ? `/api/drive-thumb?id=${driveId}&sz=w600` : null
        const closeSheet      = () => { setSheetPost(null); setSheetComment('') }

        return (
          <div onClick={e => { if (e.target === e.currentTarget) closeSheet() }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            <div style={{ background: '#fff', borderRadius: '24px 24px 0 0', width: '100%', maxWidth: 480, maxHeight: '92dvh', display: 'flex', flexDirection: 'column' }}>

              {/* Fixed header — always visible */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 12px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#555', background: '#f0f0ee', padding: '3px 10px', borderRadius: 100, flexShrink: 0 }}>
                    {TYPE_EMOJIS[sheetPost.post_type]} {TYPE_LABELS[sheetPost.post_type] || sheetPost.post_type}
                  </span>
                  {isLive && sheetPost.status === 'publicado' && <span style={{ fontSize: 12, fontWeight: 700, color: '#16a34a', flexShrink: 0 }}>✓ Publicado</span>}
                  {isLive && sheetPost.status === 'agendado'  && <span style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', flexShrink: 0 }}>📅 Agendado</span>}
                  {isApproved && <span style={{ fontSize: 12, fontWeight: 700, color: '#16a34a', flexShrink: 0 }}>✓ Aprovado</span>}
                  {isChanges  && <span style={{ fontSize: 12, fontWeight: 700, color: '#b45309', flexShrink: 0 }}>⚠ Alteração pedida</span>}
                  {isAdjustedPending && <span style={{ fontSize: 12, fontWeight: 700, color: '#b45309', flexShrink: 0 }}>🟡 Ajustado — revisar</span>}
                </div>
                <button onClick={closeSheet}
                  style={{ width: 36, height: 36, borderRadius: '50%', background: '#f3f4f6', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, color: '#374151', fontSize: 20, fontWeight: 400 }}>×</button>
              </div>

              {/* Scrollable body */}
              <div style={{ overflowY: 'auto', flex: 1 }}>

                {/* Media */}
                {isSheetCarrossel && sheetFolder ? (
                  <CarouselPreview folderId={sheetFolder} folderUrl={sheetPost.drive_folder_url || ''} />
                ) : isSheetReel && sheetFolder ? (
                  /* Reel from folder: only video, cover is for the feed only */
                  <SheetReelFolderVideo folderId={sheetFolder} folderUrl={sheetPost.drive_folder_url || ''} />
                ) : isSheetReel && driveId ? (
                  <DriveVideo id={driveId} folderUrl={sheetPost.drive_folder_url || sheetPost.drive_url} />
                ) : sheetFolder ? (
                  <FolderThumb folderId={sheetFolder} maxHeight={300} />
                ) : sheetIsMultiFile ? (
                  <MultiFilePreview ids={sheetDriveIds} fallbackUrl={sheetPost.drive_url} />
                ) : thumbUrl ? (
                  <div style={{ background: '#f5f5f3', lineHeight: 0 }}>
                    <img src={thumbUrl} alt={sheetPost.title} style={{ width: '100%', height: 'auto', display: 'block' }}
                      onError={e => { (e.target as HTMLImageElement).closest('div')!.style.display = 'none' }} />
                  </div>
                ) : null}

                {(sheetPost.drive_url || sheetPost.drive_folder_url) && !sheetFolder && !thumbUrl && !sheetIsMultiFile && !(isSheetReel && driveId) && (
                  <div style={{ padding: '12px 20px 0' }}>
                    <a href={sheetPost.drive_folder_url || sheetPost.drive_url || ''} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: cc, textDecoration: 'none' }}>
                      🔗 Abrir no Drive
                    </a>
                  </div>
                )}

                <div style={{ padding: '16px 20px 20px' }}>
                  {/* Mesma regra do card da aprovação final: sem título e sem
                      referências/anexos. Esta folha abre a partir do feed do
                      iPhone, que é a tela do conteúdo final. */}

                  {/* Legenda (texto final do Instagram; se ainda não tiver, cai no rascunho de copy) */}
                  {(sheetPost.legenda || sheetPost.copy) && (
                    <div style={{ background: '#fafaf8', borderRadius: 14, padding: '12px 14px', marginBottom: 14, border: '1px solid #f0f0ec' }}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: '#b0b0b0', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                        {sheetPost.legenda ? 'Legenda' : 'Rascunho de copy'}
                      </p>
                      <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>{sheetPost.legenda || sheetPost.copy}</p>
                    </div>
                  )}

                  {/* Previous change */}
                  {(isChanges || isAdjustedPending) && sheetPost.approval_comment && (
                    <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 14, padding: '11px 14px', marginBottom: 14 }}>
                      <p style={{ fontSize: 10, color: '#92400e', fontWeight: 800, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{isChanges ? 'Sua solicitação anterior' : 'Você pediu — já ajustado, dá uma olhada'}</p>
                      <p style={{ fontSize: 13, color: '#78350f', margin: 0, fontStyle: 'italic' }}>"{sheetPost.approval_comment}"</p>
                    </div>
                  )}
                  {/* Histórico: já foi aprovado, mas passou por um ajuste antes */}
                  {isApproved && sheetPost.approval_comment && (
                    <div style={{ background: '#f5f5f3', border: '1px solid #e5e5e0', borderRadius: 14, padding: '11px 14px', marginBottom: 14 }}>
                      <p style={{ fontSize: 10, color: '#8a8a85', fontWeight: 800, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>✓ Ajuste aplicado</p>
                      <p style={{ fontSize: 13, color: '#6b6b66', margin: 0, fontStyle: 'italic' }}>"{sheetPost.approval_comment}"</p>
                    </div>
                  )}


                  {/* Comment */}
                  {!isApproved && !isLive && (
                    <div style={{ marginBottom: 14 }}>
                      <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 8px', fontWeight: 600 }}>Pedir ajuste (opcional)</p>
                      <textarea value={sheetComment} onChange={e => setSheetComment(e.target.value)}
                        placeholder="Descreva o que precisa mudar..."
                        rows={3}
                        style={{ width: '100%', background: '#f9fafb', border: `2px solid ${sheetComment ? cc : '#e5e7eb'}`, borderRadius: 14, padding: '13px 16px', fontSize: 14, color: '#111', resize: 'none', outline: 'none', boxSizing: 'border-box', lineHeight: 1.5, fontFamily: 'inherit', transition: 'border-color 0.2s' }}
                        onFocus={e => { e.target.style.borderColor = cc }}
                        onBlur={e => { e.target.style.borderColor = sheetComment ? cc : '#e5e7eb' }}
                      />
                    </div>
                  )}

                  {/* Actions */}
                  {isLive ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 0', borderRadius: 16, background: sheetPost.status === 'publicado' ? '#f0fdf4' : '#eff6ff', border: `1.5px solid ${sheetPost.status === 'publicado' ? '#86efac' : '#bfdbfe'}`, fontSize: 15, fontWeight: 700, color: sheetPost.status === 'publicado' ? '#16a34a' : '#2563eb' }}>
                      {sheetPost.status === 'publicado' ? <><CheckCircle size={17} strokeWidth={2.5} /> Já publicado</> : <>📅 Agendado para publicar</>}
                    </div>
                  ) : isApproved ? (
                    <div style={{ display: 'flex', gap: 10 }}>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 0', borderRadius: 16, background: '#f0fdf4', border: '1.5px solid #86efac', fontSize: 15, fontWeight: 700, color: '#16a34a' }}>
                        <CheckCircle size={17} strokeWidth={2.5} /> Aprovado
                      </div>
                      <button onClick={() => undo(sheetPost.id)} disabled={!!isLoading}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '14px 16px', borderRadius: 16, background: '#fff', border: '1.5px solid #e5e7eb', fontSize: 13, fontWeight: 600, color: '#9ca3af', cursor: 'pointer' }}>
                        <RotateCcw size={13} /> Desfazer
                      </button>
                    </div>
                  ) : sheetComment.trim() ? (
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={() => setSheetComment('')}
                        style={{ padding: '14px 18px', borderRadius: 16, background: '#f3f4f6', border: 'none', fontSize: 14, fontWeight: 600, color: '#6b7280', cursor: 'pointer' }}>
                        Cancelar
                      </button>
                      <button onClick={() => requestChanges(sheetPost.id, sheetComment)} disabled={!!isLoading}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 0', borderRadius: 16, background: '#fef3c7', border: '1.5px solid #fde68a', fontSize: 14, fontWeight: 700, color: '#92400e', cursor: 'pointer', opacity: isLoading ? 0.5 : 1 }}>
                        <MessageSquare size={15} /> Enviar ajuste
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => approve(sheetPost.id)} disabled={!!isLoading}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '16px 0', borderRadius: 16, background: cc, border: 'none', fontSize: 15, fontWeight: 800, color: '#fff', cursor: 'pointer', opacity: isLoading ? 0.7 : 1, boxShadow: `0 6px 24px ${cc}44`, letterSpacing: '-0.02em' }}>
                      {isLoading ? '…' : <><CheckCircle size={17} strokeWidth={2.5} /> Aprovar este post</>}
                    </button>
                  )}

                  {/* Nudge to posts tab */}
                  <button onClick={() => { closeSheet(); setTab('posts') }}
                    style={{ width: '100%', marginTop: 12, padding: '12px 0', borderRadius: 14, background: 'transparent', border: '1.5px solid #e5e7eb', fontSize: 13, fontWeight: 600, color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    ✅ Ver todos os posts para aprovar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      <style>{`
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}
