'use client'

import { useEffect, useState, useRef } from 'react'
import { withBase } from '@/lib/base'
import { extractDriveIds } from '@/lib/driveLinks'

// A prévia do conteúdo entregue no Drive — carrossel, reel, foto, pasta.
//
// Isto morava DENTRO da página de aprovação, e por isso a equipe via uma coisa
// e o cliente via outra: o hub tinha um segundo desenho de prévia
// (DriveThumbnail) num arquivo separado. Dois desenhos do mesmo quadro é como
// nasce bug que existe de um lado e não do outro — foi exatamente o corte da
// arte, consertado no caminho de arquivo único e vivo por semanas no de pasta.
//
// Agora é um lugar só. Quem consertar aqui conserta pros dois.

// Streaming direto da API do Drive (sem passar pelo nosso servidor) numa <video>
// nativa em vez do iframe /preview: o iframe do Drive depende de cookie de sessão,
// que o Safari/iOS bloqueia (ITP) e deixa o player todo preto — a API com key não
// depende de cookie e funciona com playsInline no iOS.
function driveStreamUrl(id: string) {
  // Pelo nosso servidor, não direto pro googleapis: a chave é restrita por
  // referrer, e o Safari/iOS corta esse cabeçalho (medido: 403 sem, 200 com).
  // Ver src/app/api/drive-video/route.ts.
  return `/api/drive-video?id=${id}`
}

// <video> do Drive com DUAS tentativas antes de desistir: 1) streaming nativo
// (rápido, funciona na maioria dos casos) → 2) iframe /preview do Drive (o player
// embutido padrão) → só então uma mensagem clara. O iframe não avisa se o vídeo
// travar dentro dele (só se a própria página falhar ao carregar), por isso a
// partir da 2ª tentativa mostramos um botão fixo "Abrir conteúdo no Drive" —
// sempre no mesmo lugar embaixo do player, nunca sobreposto ao vídeo.
// 'capa' é o estágio ZERO, e só existe quando a pasta do reel tem uma capa
// desenhada. A capa é o que vai pro grid do Instagram — é ela que se aprova —,
// e até agora ela aparecia EMPILHADA em cima do player: duas imagens seguidas,
// a capa e o primeiro quadro do vídeo, uma embaixo da outra.
//
// Atrás do player do Drive era o pedido, e atrás do player do Drive não dá:
// iframe é outro documento, não aceita `poster` e não deixa nada aparecer por
// baixo. Na frente até clicar dá no mesmo, com um clique a mais — e de brinde o
// iframe do Drive só carrega quando alguém quer ver o vídeo.
//
// No player NATIVO (o do cliente, iOS) não tem clique a mais: ali a capa é
// `poster` de verdade.
type DriveVideoStage = 'capa' | 'video' | 'iframe' | 'failed'

function DriveVideoMedia({ id, stage, setStage, style, onLoadedMetadata, capaId }: { id: string; stage: DriveVideoStage; setStage: (s: DriveVideoStage) => void; style: React.CSSProperties; onLoadedMetadata?: (e: React.SyntheticEvent<HTMLVideoElement>) => void; capaId?: string }) {
  const capa = capaId ? withBase(`/api/drive-thumb?id=${capaId}&sz=w800`) : undefined
  if (stage === 'capa') return (
    <button onClick={() => setStage('iframe')} aria-label="Tocar vídeo"
      style={{ ...style, padding: 0, border: 'none', cursor: 'pointer', display: 'block', background: '#000' }}>
      <img src={capa} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
      {/* O triângulo do Instagram: círculo translúcido, sem moldura. */}
      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        <span style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 22, paddingLeft: 4 }}>▶</span>
      </span>
    </button>
  )
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
  return <video src={driveStreamUrl(id)} controls playsInline poster={capa} onError={() => setStage('iframe')} onLoadedMetadata={onLoadedMetadata} style={style} />
}

// A faixa embaixo da mídia — contador, bolinhas, link do Drive.
//
// Ela vive em dois lugares com regras opostas. No HUB acompanha o tema: uma
// faixa `#f5f5f3` fixa vira um bloco branco no modo escuro, que foi
// exatamente o que apareceu na simulação do Instagram. Na PÁGINA DE APROVAÇÃO
// não: aquela página é clara de propósito, o cliente recebe um cartão branco,
// e ali os valores fixos são a escolha certa.
//
// Por isso `noHub` em vez de trocar tudo por token: os dois casos são reais.
function coresDaFaixa(noHub: boolean) {
  return noHub
    ? { fundo: 'var(--color-bg-subtle)', borda: 'var(--color-border)', texto: 'var(--color-text-secondary)',
        pontoAtivo: 'var(--color-text-primary)', pontoInativo: 'var(--color-border-strong)' }
    : { fundo: '#f5f5f3', borda: '#ebebeb', texto: '#374151',
        pontoAtivo: '#374151', pontoInativo: '#d1d5db' }
}

/**
 * A faixa do Drive, a MESMA em toda prévia.
 *
 * Havia quatro geometrias diferentes pro mesmo pedaço de interface: carrossel
 * com `7px 12px` e fonte 11.5, reel com `10px 0` e fonte 13 em negrito, capa de
 * pasta com `12px 0`, galeria com `9px 0`. Cada prévia tinha nascido em um
 * momento e ninguém tinha voltado pra igualar — então trocar o tipo do post
 * mudava a altura do cartão e o peso do texto, sem que nada disso significasse
 * coisa alguma.
 *
 * A medida que ficou é a do carrossel, que era a menor: a faixa é informação de
 * apoio, não deve competir com a peça.
 *
 * Quando há mais de um slide, as bolinhas vão à esquerda e o link à direita.
 * Sem slides — foto solta, reel, capa de pasta —, o link fica centralizado,
 * sozinho, na mesma altura.
 */
export function FaixaDoDrive({ href, texto, noHub = false, children }: {
  href: string
  texto: string
  noHub?: boolean
  /** As bolinhas do carrossel. Sem elas, o link centraliza. */
  children?: React.ReactNode
}) {
  const cores = coresDaFaixa(noHub)
  const temPontos = !!children
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      justifyContent: temPontos ? 'space-between' : 'center',
      padding: '7px 12px', background: cores.fundo, borderTop: `1px solid ${cores.borda}`,
    }}>
      {temPontos && <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>{children}</div>}
      <a href={href} target="_blank" rel="noopener noreferrer"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: cores.texto, textDecoration: 'none', whiteSpace: 'nowrap' }}>
        {texto}
      </a>
    </div>
  )
}

export function DriveVideo({ id, folderUrl, ratio = '177.78%', comecarNoIframe = false, semRodape = false, noHub = false, capaId }: { id: string; folderUrl?: string; ratio?: string; comecarNoIframe?: boolean; semRodape?: boolean; noHub?: boolean; capaId?: string }) {
  // Começar pelo iframe do Drive é o padrão da EQUIPE, no computador: o player
  // do Google funciona ali e não custa nada pra gente. O nosso streaming existe
  // pro CLIENTE, no celular — no iOS o iframe fica preto porque o Safari bloqueia
  // o cookie de sessão do Drive. Sem essa escolha, todo vídeo que alguém do time
  // abre atravessa a nossa função: foi o que estourou em 05/09, com 136 MB por
  // arquivo e 74 falhas em 5 minutos.
  // Com capa, a capa vem primeiro no caminho do iframe. No caminho nativo ela
  // é `poster` e não muda o estágio.
  const [stage, setStage] = useState<DriveVideoStage>(comecarNoIframe ? (capaId ? 'capa' : 'iframe') : 'video')
  const driveLink = folderUrl || `https://drive.google.com/file/d/${id}/view`
  return (
    <div>
      <div style={{ background: '#000', lineHeight: 0, position: 'relative', paddingTop: ratio, maxHeight: '80vh', overflow: 'hidden' }}>
        <DriveVideoMedia id={id} stage={stage} setStage={setStage} capaId={capaId}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />
      </div>
      {/* Dentro da simulação, quem mostra o link do Drive é o cartão inteiro,
          uma vez só, embaixo. Aqui ele apareceria entre o vídeo e o coração —
          e post de verdade não tem isso. */}
      {!semRodape && <FaixaDoDrive href={driveLink} texto="🎬 Abrir conteúdo no Drive" noHub={noHub} />}
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

export function CarouselPreview({ folderId, folderUrl, ratio = '100%', semRodape = false, noHub = false }: { folderId: string; folderUrl: string; ratio?: string; semRodape?: boolean; noHub?: boolean }) {
  const cores = coresDaFaixa(noHub)
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
    fetch(withBase(`/api/drive-folder?folderId=${folderId}`))
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
          <img loading="lazy" decoding="async"
            key={current.id}
            src={`/api/drive-thumb?id=${current.id}&sz=w800`}
            alt={`Slide ${slide + 1}`}
            onLoad={e => onMediaSize(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
            draggable={false}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
          />
        )}
      </div>
      {/* Setas de passar slide.

          Sumiram sem querer quando as duas faixas viraram uma — o recorte
          levou junto. No computador a bolinha é alvo de 6px e não tem
          arrastar: sem seta, passar de slide virava mira. */}
      {items.length > 1 && (
        <>
          <button onClick={prev} aria-label="Slide anterior"
            style={{ position: 'absolute', left: 8, top: 'calc(50% - 16px)', width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>‹</button>
          <button onClick={next} aria-label="Próximo slide"
            style={{ position: 'absolute', right: 8, top: 'calc(50% - 16px)', width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>›</button>
        </>
      )}

      {/* Contador e link do Drive na MESMA linha.
          
          Eram duas faixas empilhadas: uma só com "8 / 9" no meio, outra só com
          "Abrir pasta no Drive". Duas alturas pra duas informações pequenas, e
          o carrossel empurrado pra cima. Agora dividem uma faixa fina — as
          bolinhas (ou o número) à esquerda, o link à direita. */}
      {!semRodape && (
        <FaixaDoDrive href={folderUrl} texto="📂 Abrir pasta no Drive" noHub={noHub}>
          {items.length > 1 && (items.length <= 8 ? items.map((_, i) => (
            <button key={i} onClick={() => setSlide(i)} aria-label={`Ir para ${i + 1} de ${items.length}`}
              style={{ width: i === slide ? 16 : 6, height: 6, borderRadius: 3, border: 'none', padding: 0,
                background: i === slide ? cores.pontoAtivo : cores.pontoInativo, cursor: 'pointer', transition: 'width 0.2s, background 0.2s' }} />
          )) : (
            <span style={{ fontSize: 11, fontWeight: 700, color: cores.texto }}>{slide + 1} / {items.length}</span>
          ))}
        </FaixaDoDrive>
      )}
    </div>
  )
}

// Galeria arrastável pra quando drive_url tem vários links de arquivo solto
// (não uma pasta) — mesma UI de slide+bolinhas do CarouselPreview, mas sem
// depender de listar uma pasta (não sabemos o mimetype de cada um, então
// trata tudo como imagem, que é o caso real que motivou isso).
export function MultiFilePreview({ ids, fallbackUrl, ratio = '100%', noHub = false }: { ids: string[]; fallbackUrl?: string | null; ratio?: string; noHub?: boolean }) {
  const [slide, setSlide] = useState(0)
  const { ratio: frameRatio, onMediaSize } = useMediaRatio(ratio)
  const prev = () => setSlide(s => (s - 1 + ids.length) % ids.length)
  const next = () => setSlide(s => (s + 1) % ids.length)
  const swipeHandlers = useSwipe(prev, next)
  const swipe = ids.length > 1 ? swipeHandlers : {}
  return (
    <div style={{ position: 'relative', background: '#1c1a18', userSelect: 'none' }}>
      <div {...swipe} style={{ position: 'relative', paddingTop: frameRatio, overflow: 'hidden', cursor: ids.length > 1 ? 'grab' : 'default', touchAction: 'pan-y' }}>
        <img loading="lazy" decoding="async" key={ids[slide]} src={`/api/drive-thumb?id=${ids[slide]}&sz=w800`} alt={`Slide ${slide + 1}`}
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
        <FaixaDoDrive href={fallbackUrl.split(/\s+/)[0]} noHub={noHub}
          texto={`🔗 ${slide + 1}/${ids.length} · Abrir no Drive`} />
      )}
    </div>
  )
}

type DriveFileInfo = { id: string; name: string; mimeType: string }
export function useFolderFiles(folderId: string) {
  const [files, setFiles] = useState<DriveFileInfo[]>([])
  const [ready, setReady] = useState(false)
  useEffect(() => {
    // Sem pasta não há o que pedir. Sem esta linha, quem chama pra "saber se
    // tem pasta" dispara uma consulta vazia por card aberto.
    if (!folderId) { setFiles([]); setReady(true); return }
    fetch(withBase(`/api/drive-folder?folderId=${folderId}`))
      .then(r => r.json())
      .then(d => { setFiles(d.files || []); setReady(true) })
      .catch(() => setReady(true))
  }, [folderId])
  return { files, ready }
}
function pickCover(images: DriveFileInfo[]) {
  return images.find(f => /^capa\./i.test(f.name)) ?? images[0]
}
export const SPINNER = <div style={{ width: 24, height: 24, border: '3px solid #e5e7eb', borderTopColor: '#374151', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />

// Altura natural da imagem, nunca recortada.
//
// Aqui havia `maxHeight: 220` com `objectFit: cover`: a arte era esticada pra
// largura do card e depois CORTADA em 220px. Um post 4:5 aparecia pela metade —
// e o cliente clicava "Aprovar" numa peça que não viu inteira. Foi assim que o
// "Drink em Dobro" do Number Seven chegou com a mão cortada fora.
//
// O mesmo defeito já tinha sido corrigido no caminho de arquivo único do Drive
// (o `thumbUrl` mais abaixo), e este — o caminho de PASTA — ficou pra trás. Os
// dois agora mostram a peça inteira, na proporção em que foi feita.
//
// A altura só é fixa enquanto carrega, pro card não pular de tamanho quando a
// imagem chega.
const ALTURA_CARREGANDO = 220

export function FolderThumb({ folderId }: { folderId: string }) {
  const { files, ready } = useFolderFiles(folderId)
  if (!ready) return <div style={{ height: ALTURA_CARREGANDO, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f3' }}>{SPINNER}</div>
  const img = pickCover(files.filter(f => f.mimeType.startsWith('image/')))
  if (!img) return null
  return (
    <div style={{ background: '#f5f5f3', lineHeight: 0 }}>
      <img loading="lazy" decoding="async" src={`/api/drive-thumb?id=${img.id}&sz=w800`} alt=""
        style={{ width: '100%', display: 'block' }}
        onError={e => { (e.target as HTMLImageElement).closest('div')!.style.display = 'none' }} />
    </div>
  )
}

/**
 * Vídeo cujo arquivo já se conhece, mas cuja capa está na pasta ao lado.
 *
 * Existe só pra buscar a listagem da pasta: `PreviaDoPost` não pode chamar um
 * hook dentro de um `if`.
 */
function VideoComCapaDaPasta({ videoId, folderId, folderUrl, comecarNoIframe, semRodape, noHub }: {
  videoId: string; folderId: string; folderUrl: string
  comecarNoIframe: boolean; semRodape: boolean; noHub: boolean
}) {
  const { files, ready } = useFolderFiles(folderId)
  // Sem esperar a pasta o player abriria sem capa e ela apareceria depois,
  // trocando a imagem embaixo do dedo de quem já ia clicar.
  if (!ready) return <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1c1a18' }}>{SPINNER}</div>
  const capa = pickCover(files.filter(f => f.mimeType.startsWith('image/')))
  return <DriveVideo id={videoId} folderUrl={folderUrl} comecarNoIframe={comecarNoIframe} semRodape={semRodape} noHub={noHub} capaId={capa?.id} />
}

export function ReelFolderPreview({ folderId, folderUrl, comecarNoIframe = false, semRodape = false, noHub = false }: { folderId: string; folderUrl: string; comecarNoIframe?: boolean; semRodape?: boolean; noHub?: boolean }) {
  const { files, ready } = useFolderFiles(folderId)
  if (!ready) return <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1c1a18' }}>{SPINNER}</div>
  const videos = files.filter(f => f.mimeType.startsWith('video/'))
  const video  = videos[0]
  // A capa da pasta agora entra COMO capa do player, não empilhada em cima
  // dele. Antes ela ficava de fora justamente pra não virar uma segunda imagem
  // acima do vídeo — o problema era o empilhamento, não a capa.
  const capa = pickCover(files.filter(f => f.mimeType.startsWith('image/')))
  return video ? (
    <DriveVideo id={video.id} folderUrl={folderUrl} comecarNoIframe={comecarNoIframe} semRodape={semRodape} noHub={noHub} capaId={capa?.id} />
  ) : (
    semRodape ? null : (
      <FaixaDoDrive href={folderUrl} texto="🎬 Abrir reel no Drive" noHub={noHub} />
    )
  )
}

/**
 * A prévia certa pro conteúdo que foi entregue.
 *
 * Escolher entre carrossel, reel, pasta, galeria e foto solta é uma cadeia de
 * seis casos — e era essa cadeia, copiada, que fazia a equipe ver um quadro e
 * o cliente ver outro. Aqui ela existe uma vez.
 *
 * Devolve `null` quando não há conteúdo entregue: o card fica como estava, sem
 * moldura vazia esperando arte que ninguém subiu ainda.
 */
export function PreviaDoPost({
  driveUrl,
  driveFolderUrl,
  postType,
  titulo,
  contexto = 'cliente',
  semRodape = false,
}: {
  driveUrl?: string | null
  driveFolderUrl?: string | null
  postType?: string | null
  titulo?: string | null
  /** 'equipe' abre o vídeo no player do Drive; 'cliente' usa o nosso (iOS). */
  contexto?: 'equipe' | 'cliente'
  /** Esconde o link "Abrir no Drive" de dentro da mídia (usado na simulação). */
  semRodape?: boolean
}) {
  const ids = extractDriveIds(driveUrl || '')
  const primeiro = ids[0]
  const pasta = driveFolderUrl?.match(/\/folders\/([-\w]{25,})/)?.[1]
  const ehVideo = postType === 'reels'
  const ehCarrossel = postType === 'carrossel' || postType === 'carrossel_stories'
  const varios = ids.length > 1 && !ehVideo && !pasta
  const foto = primeiro && !ehVideo && !(ehCarrossel && pasta) && !varios
    ? `/api/drive-thumb?id=${primeiro}&sz=w800`
    : null
  const video = primeiro && ehVideo ? primeiro : null

  // No hub a faixa segue o tema; na página do cliente ela é clara de propósito.
  const noHub = contexto === 'equipe'
  if (video) {
    // Vídeo solto COM pasta ao lado: a pasta costuma guardar a capa desenhada.
    // Ela ia empilhada acima do player — a capa inteira, e logo abaixo o
    // primeiro quadro do vídeo. Agora vira a capa do próprio player.
    if (pasta) return <VideoComCapaDaPasta videoId={video} folderId={pasta} folderUrl={driveFolderUrl || driveUrl || ''} comecarNoIframe={noHub} semRodape={semRodape} noHub={noHub} />
    return <DriveVideo id={video} folderUrl={driveFolderUrl || driveUrl || ''} comecarNoIframe={noHub} semRodape={semRodape} noHub={noHub} />
  }
  if (ehVideo && pasta) return <ReelFolderPreview folderId={pasta} folderUrl={driveFolderUrl || ''} comecarNoIframe={noHub} semRodape={semRodape} noHub={noHub} />
  if (ehCarrossel && pasta) return <CarouselPreview folderId={pasta} folderUrl={driveFolderUrl || ''} semRodape={semRodape} noHub={noHub} />
  if (pasta) return (
    // A capa de pasta também ganha a faixa. Antes ela não tinha nenhuma, e o
    // link ia parar FORA do cartão, embaixo da legenda — num lugar onde nada
    // mais mora, e com outro tamanho. Agora é a mesma faixa dos outros, só sem
    // bolinha e com o link no centro.
    <div>
      <FolderThumb folderId={pasta} />
      {!semRodape && <FaixaDoDrive href={driveFolderUrl || ''} texto="📂 Abrir pasta no Drive" noHub={noHub} />}
    </div>
  )
  if (varios) return <MultiFilePreview ids={ids} fallbackUrl={driveUrl} noHub={noHub} />
  if (foto) {
    return (
      <div>
        {/* Altura natural da imagem. Altura fixa com `cover` cortava a arte
            pela metade — e o cliente aprovava o que não viu inteiro. */}
        <div style={{ background: '#f5f5f3', lineHeight: 0 }}>
          <img src={foto} alt={titulo || ''} style={{ width: '100%', height: 'auto', display: 'block' }}
            onError={e => { (e.target as HTMLImageElement).closest('div')!.style.display = 'none' }} />
        </div>
        {!semRodape && (
          <FaixaDoDrive noHub={noHub} texto="🖼️ Abrir no Drive"
            href={(driveFolderUrl || driveUrl || '').split(/\s+/)[0] || `https://drive.google.com/file/d/${primeiro}/view`} />
        )}
      </div>
    )
  }
  return null
}

/**
 * Essa prévia já traz o link do Drive numa faixa própria?
 *
 * Agora TODAS trazem, e por isso esta função só responde "tem conteúdo?". Ela
 * ficou pra quem chama não precisar saber disso — e porque a resposta "não"
 * ainda existe: prévia que não conseguiu montar nada não tem faixa nenhuma.
 *
 * Antes foto solta e capa de pasta respondiam `false`, e quem chamava desenhava
 * um botão POR FORA do cartão, embaixo da legenda, com outro tamanho e em outro
 * lugar. Trocar o tipo do post mudava onde o link aparecia — era a maior das
 * inconsistências entre as prévias.
 */
export function previaTemRodape(driveUrl?: string | null, driveFolderUrl?: string | null) {
  // Uma linha só: se a prévia consegue desenhar alguma coisa, ela tem faixa.
  // Era uma cadeia de seis casos que precisava ser mantida em par com a cadeia
  // de `PreviaDoPost` — duas listas iguais em arquivos diferentes é como nasce
  // divergência, e foi por aqui que foto solta e capa de pasta ficaram de fora.
  return temConteudoEntregue(driveUrl, driveFolderUrl)
}

/** Tem conteúdo entregue? É o que decide se o card estica. */
export function temConteudoEntregue(driveUrl?: string | null, driveFolderUrl?: string | null) {
  return !!(driveFolderUrl?.trim() || extractDriveIds(driveUrl || '').length)
}

/**
 * `PreviaDoPost` conseguiria montar alguma coisa?
 *
 * Serve pra decidir o que mostrar no lugar dela: um link seco pro Drive quando
 * há URL mas nada renderizável. Existe pra essa pergunta não virar uma terceira
 * cópia da cadeia de casos espalhada por aí.
 */
export function previaDisponivel(
  driveUrl?: string | null,
  driveFolderUrl?: string | null,
  postType?: string | null,
) {
  const ids = extractDriveIds(driveUrl || '')
  const pasta = driveFolderUrl?.match(/\/folders\/([-\w]{25,})/)?.[1]
  return !!(pasta || ids.length)
}
