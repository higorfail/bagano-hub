'use client'

import { Heart, MessageCircle, Send, Bookmark } from 'lucide-react'
import { PreviaDoPost } from '@/components/PreviaDrive'

// O post como ele vai aparecer no Instagram.
//
// Conferir arte e legenda em campos separados esconde os defeitos que só
// existem quando as duas se encontram: a primeira linha cortada no "... mais",
// o emoji que quebra o parágrafo no lugar errado, a chamada que fica embaixo
// da dobra, o @ que vira texto morto porque saiu com espaço.
//
// Nada aqui inventa número. Coração, comentário e envio são desenho, sem
// contagem — métrica falsa numa tela de conferência é pior que métrica
// nenhuma, porque alguém acaba lendo como se fosse real.

/** O @ do cliente, tirado da URL do Instagram que já está no cadastro. */
export function arrobaDoCliente(instagramUrl?: string | null, nome?: string | null): string {
  const m = (instagramUrl || '').match(/instagram\.com\/([A-Za-z0-9._]+)/)
  if (m?.[1]) return m[1]
  // Sem URL, um palpite legível a partir do nome — melhor que "@" vazio.
  return (nome || '').toLowerCase().replace(/[^a-z0-9]+/g, '') || 'cliente'
}

/** Deixa @menções e #hashtags azuis, como o Instagram faz. */
function comDestaques(texto: string) {
  return texto.split(/(@[A-Za-z0-9._]+|#[\wÀ-ÿ]+)/g).map((parte, i) =>
    /^[@#]/.test(parte)
      ? <span key={i} style={{ color: '#00376b' }}>{parte}</span>
      : <span key={i}>{parte}</span>,
  )
}

export default function SimulacaoInstagram({
  driveUrl,
  driveFolderUrl,
  postType,
  legenda,
  titulo,
  clienteNome,
  clienteLogo,
  clienteInstagram,
  clienteCor,
  quando,
}: {
  driveUrl?: string | null
  driveFolderUrl?: string | null
  postType?: string | null
  legenda?: string | null
  titulo?: string | null
  clienteNome?: string | null
  clienteLogo?: string | null
  clienteInstagram?: string | null
  clienteCor?: string | null
  /** A data marcada, se houver. */
  quando?: string | null
}) {
  const arroba = arrobaDoCliente(clienteInstagram, clienteNome)
  const iniciais = (clienteNome || '?').split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase()

  return (
    <div className="bg-white text-[#262626]">
      {/* Cabeçalho: avatar com o anel do Instagram, @ e a data */}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <div
          className="w-8 h-8 rounded-full flex-shrink-0 p-[2px]"
          style={{ background: 'linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)' }}
        >
          <div className="w-full h-full rounded-full overflow-hidden bg-white flex items-center justify-center">
            {clienteLogo
              ? <img src={clienteLogo} alt={clienteNome || ''} className="w-full h-full object-cover" />
              : <span className="text-[10px] font-bold" style={{ color: clienteCor || '#262626' }}>{iniciais}</span>}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-tight truncate">{arroba}</p>
          {quando && <p className="text-[11px] text-[#737373] leading-tight mt-0.5">{quando}</p>}
        </div>
        <span className="text-[#262626] text-lg leading-none tracking-tight select-none">···</span>
      </div>

      {/* A peça */}
      <div className="bg-black">
        <PreviaDoPost
          driveUrl={driveUrl}
          driveFolderUrl={driveFolderUrl}
          postType={postType}
          titulo={titulo}
          contexto="equipe"
        />
      </div>

      {/* Ações — desenho, sem número inventado */}
      <div className="flex items-center gap-4 px-3 pt-2.5 pb-1">
        <Heart size={22} strokeWidth={1.6} />
        <MessageCircle size={22} strokeWidth={1.6} className="-scale-x-100" />
        <Send size={22} strokeWidth={1.6} />
        <Bookmark size={22} strokeWidth={1.6} className="ml-auto" />
      </div>

      {/* Legenda, com o @ na frente como o Instagram monta */}
      <div className="px-3 pb-4">
        {legenda?.trim() ? (
          <p className="text-[13px] leading-[1.45] whitespace-pre-wrap">
            <span className="font-semibold mr-1.5">{arroba}</span>
            {comDestaques(legenda)}
          </p>
        ) : (
          <p className="text-[13px] text-[#8e8e8e] italic">Sem legenda ainda — é assim que vai sair.</p>
        )}
      </div>
    </div>
  )
}
