'use client'

import { useState, useEffect, useRef } from 'react'
import { TextoEditavel, Etiquetas, CardsEditaveis, CoresEditaveis, ParesEditaveis, LinksEditaveis, Salvo } from '@/components/manual/CamposEditaveis'
import { createClient } from '@/lib/supabase'
import { withBase } from '@/lib/base'
import { copyTextAsync } from '@/lib/clipboard'
import {
  MapPin, Phone, AtSign, Globe, Truck, BookOpen,
  ChevronDown, ChevronRight, Sparkles, X, ExternalLink, FileUp, Plus, Copy, Check,
} from 'lucide-react'

type Pillar       = { name: string; description: string }
type Color        = { name: string; hex: string }
type Font         = { role: string; family: string }
type MenuItem     = { name: string; price: string; description: string }
type MenuCategory = { category: string; items: MenuItem[] }
type Promotion    = { title: string; description: string }
type CalEvent     = { date: string; title: string; description: string }
// `age` é texto, não número: o rascunho da IA às vezes devolve 28, às vezes
// "25–40", e o campo do manual precisa aceitar os dois. A leitura converte.
type Persona      = { name: string; age: string; profile: string; behaviors: string }
type ContentSeries = { name: string; description: string; frequency: string }

type ManualData = {
  souschef_slug: string
  tagline: string
  concept: string
  history: string
  pillars: Pillar[]
  colors: Color[]
  fonts: Font[]
  address: string
  phone: string
  hours: Record<string, string>
  instagram: string
  website: string
  delivery_links: string[]
  menu: MenuCategory[]
  differentials: string[]
  promotions: Promotion[]
  events: CalEvent[]
  tone_of_voice: {
    personality?: string
    use_words?: string[]
    avoid_words?: string[]
    taglines?: string[]
  } | null
  personas: Persona[]
  editorial_pillars: Pillar[]
  content_series: ContentSeries[]
  production_notes: string
  // Os três abaixo são NOSSOS, não da marca: o que a equipe anota, guarda e
  // cola. Ficam fora do que a IA escreve de propósito — "Regerar com IA"
  // sobrescreve o manual inteiro com o JSON do modelo, e o modelo não devolve
  // estas chaves, então o que vocês digitaram sobrevive à regeração.
  notes: string
  links: { label: string; url: string }[]
  /** Bloco fixo que vai no fim das legendas. Lido pelo botão do card. */
  hashtags: string
}

const TABS = [
  // A ordem é a de uso, não a de importância da marca: quem abre o manual
  // durante o cronograma quer hashtag, link e anotação. Visual e Cardápio
  // ficam pro fim porque se consultam uma vez por mês, não vinte por dia.
  { key: 'mesa',         label: 'Dia a dia' },
  { key: 'overview',     label: 'Visão Geral' },
  { key: 'voice',        label: 'Tom de Voz' },
  { key: 'content',      label: 'Conteúdo' },
  { key: 'operational',  label: 'Operacional' },
  { key: 'menu',         label: 'Cardápio' },
  { key: 'visual',       label: 'Visual' },
]

// O manual é uma tela de ESCREVER, e estava desenhada como uma de ler: coluna
// estreita, título de seção em 10px cinza-claro, tudo empilhado numa fileira
// só que descia três telas. Dava pra consultar; não dava vontade de preencher
// — e o manual vazio é o que a gente tinha em quase todo cliente.
//
// O título agora tem o peso de um título, a seção pode dizer em uma linha o
// que espera de quem escreve, e os blocos se distribuem em duas colunas
// quando a tela permite (ver `Grade`). Mesmo conteúdo, metade da rolagem.
function SectionBlock({ title, dica, children, largura = 'meia' }: {
  title: string
  /** Uma linha dizendo pra que serve o campo. Em branco, não aparece. */
  dica?: string
  children: React.ReactNode
  /** 'cheia' atravessa as duas colunas — pra bloco longo ou lista larga. */
  largura?: 'meia' | 'cheia'
}) {
  return (
    <section className={`flex flex-col gap-2.5 ${largura === 'cheia' ? 'md:col-span-2' : ''}`}>
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-bold text-[var(--color-text-primary)] tracking-tight">{title}</h3>
        {dica && <p className="text-xs text-[var(--color-text-muted)] leading-snug">{dica}</p>}
      </div>
      {children}
    </section>
  )
}

type Secao = {
  chave: string
  titulo: string
  dica?: string
  /** 'cheia' atravessa as duas colunas — pra bloco longo ou lista larga. */
  largura?: 'meia' | 'cheia'
  vazio: boolean
  render: () => React.ReactNode
}

/**
 * As seções em duas colunas a partir do tablet; uma só no celular.
 *
 * E o que está vazio não ocupa espaço. Antes, cada aba mostrava todos os
 * campos existissem eles ou não, e um manual pela metade virava uma parede de
 * "Clique para escrever…" — a informação que ESTAVA lá se perdia no meio da
 * que não estava. Agora o vazio se recolhe num botão no pé, que diz quais são
 * e abre o que você escolher.
 *
 * Note que isto é o oposto da decisão anterior deste arquivo, que mostrava
 * todo campo vazio justamente pra combater os 19 manuais sem cores. O motivo
 * de mudar: aquilo resolvia o preencher e estragava o consultar, e consultar é
 * o que acontece vinte vezes por dia enquanto se monta cronograma. O convite
 * pra preencher continua existindo — só deixou de gritar o tempo todo.
 */
function Grade({ secoes }: { secoes: Secao[] }) {
  const [reveladas, setReveladas] = useState<Set<string>>(new Set())

  const visiveis = secoes.filter(s => !s.vazio || reveladas.has(s.chave))
  const ocultas  = secoes.filter(s => s.vazio && !reveladas.has(s.chave))

  return (
    <div className="flex flex-col gap-6">
      {visiveis.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-7 items-start">
          {visiveis.map(s => (
            <SectionBlock key={s.chave} title={s.titulo} dica={s.dica} largura={s.largura}>
              {s.render()}
            </SectionBlock>
          ))}
        </div>
      )}

      {ocultas.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-xs text-[var(--color-text-faint)] mr-0.5">Adicionar:</span>
          {ocultas.map(s => (
            <button key={s.chave} onClick={() => setReveladas(r => new Set(r).add(s.chave))}
              title={s.dica}
              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] border border-dashed border-[var(--color-border)] hover:border-[var(--color-border-strong)] rounded-lg px-2.5 py-1 transition-colors">
              <Plus size={11} /> {s.titulo}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Card({ children, className = '', style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-5 ${className}`} style={style}>
      {children}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="text-xs text-[var(--color-text-faint)] italic py-2">{text}</p>
}

// ── TABS ──────────────────────────────────────────────────────────────────────

type Salvar = (p: Record<string, any>) => Promise<void>

// As abas do manual, todas editáveis.
//
// Antes, só Tom de Voz era. As outras cinco desenhavam o que existia e, quando
// não existia nada, mostravam "não disponível ainda" — um beco sem saída: a
// única forma de preencher era gerar um rascunho com IA e corrigir o JSON cru
// num textarea.
//
// Os números diziam isso alto. Nos 19 manuais: conceito e tom de voz em 19,
// mas CORES em 2 e FONTES em 4 — os dois únicos blocos que nunca tiveram como
// editar pela tela. Não é coincidência; é a tela.
//
// Por isso sumiram os `hasContent` que devolviam <Empty>. Campo vazio agora é
// campo vazio clicável, não uma frase dizendo que não tem.

/**
 * A mesa de trabalho de quem monta cronograma.
 *
 * As outras seis abas DESCREVEM o cliente; esta é o que a gente usa enquanto
 * trabalha nele. Nasceu da observação de que a estrategista abre o manual não
 * pra ler a história da marca, mas pra três coisas: pegar a hashtag, abrir um
 * link e lembrar de algo que não cabia em campo nenhum.
 *
 * Por isso ela é a PRIMEIRA aba, e por isso hashtag vem antes de link, que vem
 * antes de anotação: é a ordem de quantas vezes por dia cada uma é usada.
 */
function MesaTab({ data, salvar }: { data: ManualData; salvar: Salvar }) {
  const tov = data.tone_of_voice || {}
  const [copiado, setCopiado] = useState(false)

  async function copiarHashtags() {
    const txt = (data.hashtags || '').trim()
    if (!txt) return
    const ok = await copyTextAsync(async () => txt)
    if (!ok) return
    setCopiado(true)
    setTimeout(() => setCopiado(false), 1600)
  }

  return <Grade secoes={[
    {
      chave: 'hashtags', titulo: 'Hashtags do fim da legenda', vazio: false, largura: 'cheia',
      dica: 'O bloco fixo que fecha as legendas deste cliente. O botão “hashtags” no card do post cola exatamente isto.',
      render: () => (
        <Card>
          <TextoEditavel valor={data.hashtags} linhas={3}
            placeholder="#pizzaria #curitiba #comidaitaliana…"
            aoSalvar={v => salvar({ hashtags: v })} />
          {(data.hashtags || '').trim() && (
            <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-[var(--color-border)]">
              <span className="text-[11px] text-[var(--color-text-faint)]">
                {(data.hashtags || '').trim().split(/\s+/).filter(t => t.startsWith('#')).length} hashtags
              </span>
              <button onClick={copiarHashtags}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-primary)] transition-colors">
                {copiado ? <><Check size={12} /> Copiado</> : <><Copy size={12} /> Copiar</>}
              </button>
            </div>
          )}
        </Card>
      ),
    },
    {
      chave: 'links', titulo: 'Links', vazio: false, largura: 'cheia',
      dica: 'Drive das fotos, Canva, planilha de preços, pasta de referências — o que você abre toda semana.',
      render: () => <LinksEditaveis links={data.links} aoSalvar={v => salvar({ links: v })} />,
    },
    {
      chave: 'notes', titulo: 'Anotações', vazio: false, largura: 'cheia',
      dica: 'O que não cabe em campo nenhum: o combinado da reunião, a senha do Wi-Fi, o nome do primo que atende.',
      render: () => <Card><TextoEditavel valor={data.notes} linhas={8}
        placeholder="Escreva aqui o que você sempre tem que perguntar de novo…"
        aoSalvar={v => salvar({ notes: v })} /></Card>,
    },
    {
      chave: 'avoid_words', titulo: 'Palavras pra evitar', vazio: !(tov.avoid_words?.length),
      dica: 'O que o cliente já pediu pra tirar. Repetido do Tom de Voz porque é o que mais volta como ajuste.',
      render: () => <Card><Etiquetas itens={tov.avoid_words} cor="ruim" placeholder="+ palavra"
        aoSalvar={v => salvar({ tone_of_voice: { ...tov, avoid_words: v } })} /></Card>,
    },
    {
      chave: 'differentials', titulo: 'Diferenciais', vazio: !(data.differentials?.length),
      dica: 'Os argumentos que sempre rendem legenda.',
      render: () => <Card><Etiquetas itens={data.differentials} placeholder="+ diferencial"
        aoSalvar={v => salvar({ differentials: v })} /></Card>,
    },
  ]} />
}

function OverviewTab({ data, salvar }: { data: ManualData; salvar: Salvar }) {
  return <Grade secoes={[
    {
      chave: 'tagline', titulo: 'Tagline', vazio: !data.tagline?.trim(),
      dica: 'A frase que resume a marca numa linha.',
      render: () => <Card><TextoEditavel valor={data.tagline} linhas={2}
        placeholder="Ex.: Sabor de casa, há 40 anos" aoSalvar={v => salvar({ tagline: v })} /></Card>,
    },
    {
      chave: 'concept', titulo: 'Conceito', vazio: !data.concept?.trim(),
      dica: 'O que a marca é, pra quem nunca ouviu falar dela.',
      render: () => <Card><TextoEditavel valor={data.concept} linhas={4}
        placeholder="O que a marca é, em poucas linhas…" aoSalvar={v => salvar({ concept: v })} /></Card>,
    },
    {
      chave: 'differentials', titulo: 'Diferenciais', vazio: !(data.differentials?.length),
      dica: 'O que essa marca tem e a concorrência não. Vira argumento de legenda.',
      render: () => <Card><Etiquetas itens={data.differentials} placeholder="+ diferencial"
        aoSalvar={v => salvar({ differentials: v })} /></Card>,
    },
    {
      chave: 'pillars', titulo: 'Pilares da marca', vazio: !(data.pillars?.length),
      dica: 'Os valores que sustentam tudo que a marca diz.',
      render: () => <CardsEditaveis<Pillar> itens={data.pillars}
        campos={[{ chave: 'name', rotulo: 'Pilar', linhas: 1 }, { chave: 'description', rotulo: 'O que significa', linhas: 2 }]}
        rotuloNovo="Adicionar pilar" aoSalvar={v => salvar({ pillars: v })} />,
    },
    {
      chave: 'history', titulo: 'História', vazio: !data.history?.trim(), largura: 'cheia',
      dica: 'De onde veio, quem começou, o que mudou. Rende post de aniversário e de bastidor.',
      render: () => <Card><TextoEditavel valor={data.history} linhas={5}
        placeholder="De onde veio, quem começou, o que mudou…" aoSalvar={v => salvar({ history: v })} /></Card>,
    },
  ]} />
}

function VisualTab({ data, salvar }: { data: ManualData; salvar: Salvar }) {
  const tov = data.tone_of_voice || {}
  return <Grade secoes={[
    {
      chave: 'colors', titulo: 'Paleta de cores', vazio: !(data.colors?.length),
      dica: 'Clique no quadrado pra escolher; o código fica do lado, pra copiar.',
      render: () => <CoresEditaveis cores={data.colors} aoSalvar={v => salvar({ colors: v })} />,
    },
    {
      chave: 'fonts', titulo: 'Tipografia', vazio: !(data.fonts?.length),
      dica: 'Qual fonte em quê: título, corpo, destaque.',
      render: () => <CardsEditaveis<Font> itens={data.fonts}
        campos={[{ chave: 'role', rotulo: 'Uso', linhas: 1 }, { chave: 'family', rotulo: 'Fonte', linhas: 1 }]}
        rotuloNovo="Adicionar fonte" aoSalvar={v => salvar({ fonts: v })} />,
    },
    {
      chave: 'taglines', titulo: 'Frases da marca', vazio: !(tov.taglines?.length),
      dica: 'As frases que se repetem nas artes.',
      render: () => <Card><Etiquetas itens={tov.taglines} placeholder="+ frase"
        aoSalvar={v => salvar({ tone_of_voice: { ...tov, taglines: v } })} /></Card>,
    },
  ]} />
}

function OperationalTab({ data, salvar }: { data: ManualData; salvar: Salvar }) {
  const linha = (Icone: React.ElementType, chave: keyof ManualData, dica: string) => (
    <div className="flex items-center gap-2.5">
      <Icone size={13} className="text-[var(--color-text-muted)] flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <TextoEditavel umaLinha valor={data[chave] as string} placeholder={dica}
          aoSalvar={v => salvar({ [chave]: v })} />
      </div>
    </div>
  )

  const semContato = !data.address?.trim() && !data.phone?.trim() && !data.instagram?.trim() && !data.website?.trim()

  return <Grade secoes={[
    {
      chave: 'contato', titulo: 'Contato', vazio: semContato,
      dica: 'O que entra no rodapé da legenda. Confira antes de copiar.',
      render: () => <Card><div className="flex flex-col gap-1">
        {linha(MapPin, 'address', 'Endereço')}
        {linha(Phone, 'phone', 'Telefone')}
        {linha(AtSign, 'instagram', '@ do Instagram')}
        {linha(Globe, 'website', 'Site')}
      </div></Card>,
    },
    {
      chave: 'hours', titulo: 'Horários', vazio: !Object.keys(data.hours || {}).length,
      dica: 'Dia e faixa de horário. Escreva o dia e aperte Enter.',
      render: () => <Card><ParesEditaveis pares={data.hours} rotuloChave="dia" rotuloValor="18h–23h"
        aoSalvar={v => salvar({ hours: v })} /></Card>,
    },
    {
      chave: 'delivery', titulo: 'Delivery', vazio: !(data.delivery_links?.length),
      dica: 'iFood, Rappi, WhatsApp de pedido.',
      render: () => <Card><div className="flex items-start gap-2.5">
        <Truck size={13} className="text-[var(--color-text-muted)] mt-1.5 flex-shrink-0" />
        <div className="flex-1">
          <Etiquetas itens={data.delivery_links} placeholder="+ iFood, Rappi…"
            aoSalvar={v => salvar({ delivery_links: v })} />
        </div>
      </div></Card>,
    },
  ]} />
}

function MenuTab({ data, salvar }: { data: ManualData; salvar: Salvar }) {
  const menu = data.menu || []
  // A categoria nova já abre: fechada, o botão "adicionar" some numa lista de
  // títulos e ninguém acha onde escrever o primeiro item.
  const [abertas, setAbertas] = useState<Set<number>>(new Set([0]))

  function alternar(i: number) {
    setAbertas(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i); else next.add(i)
      return next
    })
  }
  const gravar = (m: MenuCategory[]) => salvar({ menu: m })
  const mudarCat = (ci: number, patch: Partial<MenuCategory>) =>
    gravar(menu.map((c, k) => (k === ci ? { ...c, ...patch } : c)))
  const mudarItem = (ci: number, ii: number, campo: keyof MenuItem, v: string) =>
    mudarCat(ci, { items: (menu[ci].items || []).map((it, k) => (k === ii ? { ...it, [campo]: v } : it)) })

  return (
    <div className="flex flex-col gap-2">
      {menu.map((cat, ci) => {
        const aberta = abertas.has(ci)
        const itens = cat.items || []
        return (
          <div key={ci} className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl overflow-hidden">
            <div className="w-full flex items-center justify-between px-4 py-3 gap-3 group">
              <button onClick={() => alternar(ci)} aria-label={aberta ? 'Fechar' : 'Abrir'} className="flex-shrink-0">
                {aberta
                  ? <ChevronDown size={13} className="text-[var(--color-text-muted)]" />
                  : <ChevronRight size={13} className="text-[var(--color-text-muted)]" />}
              </button>
              <input
                value={cat.category || ''}
                onChange={e => mudarCat(ci, { category: e.target.value })}
                placeholder="Nome da categoria"
                className="flex-1 min-w-0 text-sm font-semibold bg-transparent outline-none text-[var(--color-text-primary)] placeholder-[var(--color-text-faint)] border-b border-transparent focus:border-[var(--color-accent)]"
              />
              <span className="text-xs text-[var(--color-text-muted)] flex-shrink-0">{itens.length} itens</span>
              <button onClick={() => gravar(menu.filter((_, k) => k !== ci))} aria-label="Remover categoria"
                className="opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity flex-shrink-0">
                <X size={12} className="text-[var(--color-text-muted)]" />
              </button>
            </div>

            {aberta && (
              <div className="border-t border-[var(--color-border)]">
                {itens.map((item, ii) => (
                  <div key={ii} className={`px-4 py-3 flex items-start gap-3 group/item ${ii > 0 ? 'border-t border-[var(--color-border)]' : ''}`}>
                    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                      <input value={item.name || ''} onChange={e => mudarItem(ci, ii, 'name', e.target.value)}
                        placeholder="Nome do prato"
                        className="text-sm font-medium bg-transparent outline-none text-[var(--color-text-primary)] placeholder-[var(--color-text-faint)] border-b border-transparent focus:border-[var(--color-accent)]" />
                      <input value={item.description || ''} onChange={e => mudarItem(ci, ii, 'description', e.target.value)}
                        placeholder="Descrição (opcional)"
                        className="text-xs bg-transparent outline-none text-[var(--color-text-muted)] placeholder-[var(--color-text-faint)] border-b border-transparent focus:border-[var(--color-accent)]" />
                    </div>
                    <input value={item.price || ''} onChange={e => mudarItem(ci, ii, 'price', e.target.value)}
                      placeholder="R$"
                      className="w-20 text-sm font-semibold text-right bg-transparent outline-none text-[var(--color-text-primary)] placeholder-[var(--color-text-faint)] border-b border-transparent focus:border-[var(--color-accent)] flex-shrink-0" />
                    <button onClick={() => mudarCat(ci, { items: itens.filter((_, k) => k !== ii) })} aria-label="Remover item"
                      className="opacity-0 group-hover/item:opacity-40 hover:!opacity-100 transition-opacity flex-shrink-0 mt-1">
                      <X size={11} className="text-[var(--color-text-muted)]" />
                    </button>
                  </div>
                ))}
                <button onClick={() => mudarCat(ci, { items: [...itens, { name: '', price: '', description: '' }] })}
                  className="w-full px-4 py-2.5 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)] transition-colors border-t border-[var(--color-border)] text-left">
                  + Item
                </button>
              </div>
            )}
          </div>
        )
      })}
      <button
        onClick={() => { setAbertas(a => new Set([...a, menu.length])); gravar([...menu, { category: '', items: [] }]) }}
        className="inline-flex items-center gap-1.5 self-start text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] border border-dashed border-[var(--color-border)] rounded-lg px-3 py-1.5 transition-colors">
        + Categoria
      </button>
    </div>
  )
}

function ContentTab({ data, salvar }: { data: ManualData; salvar: Salvar }) {
  return <Grade secoes={[
    {
      chave: 'editorial_pillars', titulo: 'Pilares editoriais', vazio: !(data.editorial_pillars?.length),
      dica: 'Os assuntos que se revezam no cronograma.',
      render: () => <CardsEditaveis<Pillar> itens={data.editorial_pillars}
        campos={[{ chave: 'name', rotulo: 'Pilar', linhas: 1 }, { chave: 'description', rotulo: 'O que entra nele', linhas: 2 }]}
        rotuloNovo="Adicionar pilar editorial" aoSalvar={v => salvar({ editorial_pillars: v })} />,
    },
    {
      chave: 'content_series', titulo: 'Séries de conteúdo', vazio: !(data.content_series?.length),
      dica: 'O que se repete toda semana ou todo mês.',
      render: () => <CardsEditaveis<ContentSeries> itens={data.content_series}
        campos={[{ chave: 'name', rotulo: 'Série', linhas: 1 }, { chave: 'description', rotulo: 'Do que se trata', linhas: 2 }, { chave: 'frequency', rotulo: 'Frequência', linhas: 1 }]}
        rotuloNovo="Adicionar série" aoSalvar={v => salvar({ content_series: v })} />,
    },
    {
      chave: 'events', titulo: 'Datas & eventos', vazio: !(data.events?.length),
      dica: 'Aniversário da casa, feriado que lota, festival da cidade.',
      render: () => <CardsEditaveis<CalEvent> itens={data.events}
        campos={[{ chave: 'date', rotulo: 'Quando', linhas: 1 }, { chave: 'title', rotulo: 'O quê', linhas: 1 }, { chave: 'description', rotulo: 'Detalhes', linhas: 2 }]}
        rotuloNovo="Adicionar data" aoSalvar={v => salvar({ events: v })} />,
    },
    {
      chave: 'promotions', titulo: 'Promoções & ativações', vazio: !(data.promotions?.length),
      dica: 'O que está rodando agora e pode virar post.',
      render: () => <CardsEditaveis<Promotion> itens={data.promotions}
        campos={[{ chave: 'title', rotulo: 'Promoção', linhas: 1 }, { chave: 'description', rotulo: 'Como funciona', linhas: 2 }]}
        rotuloNovo="Adicionar promoção" aoSalvar={v => salvar({ promotions: v })} />,
    },
    {
      chave: 'personas', titulo: 'Personas', vazio: !(data.personas?.length), largura: 'cheia',
      dica: 'Pra quem a legenda está falando.',
      render: () => <CardsEditaveis itens={data.personas?.map(p => ({ ...p, age: String(p.age ?? '') })) as any}
        campos={[{ chave: 'name', rotulo: 'Quem é', linhas: 1 }, { chave: 'age', rotulo: 'Idade', linhas: 1 }, { chave: 'profile', rotulo: 'Perfil', linhas: 2 }, { chave: 'behaviors', rotulo: 'Como se comporta', linhas: 2 }]}
        rotuloNovo="Adicionar persona" aoSalvar={v => salvar({ personas: v })} />,
    },
  ]} />
}

function VoiceTab({ data, salvar }: { data: ManualData; salvar: Salvar }) {
  const tov = data.tone_of_voice || {}
  // Editar um pedaço do tom de voz sem apagar os outros: o campo é um objeto
  // só no banco, e mandar `{ personality }` sozinho zeraria as palavras.
  const salvarVoz = (patch: Record<string, any>) => salvar({ tone_of_voice: { ...tov, ...patch } })

  return <Grade secoes={[
    {
      chave: 'personality', titulo: 'Personalidade da marca', vazio: !tov.personality?.trim(), largura: 'cheia',
      dica: 'É daqui que a IA tira o jeito de escrever a legenda.',
      render: () => <Card><TextoEditavel valor={tov.personality} linhas={4}
        placeholder="Como esta marca fala? Ex.: acolhedora, sem formalidade, fala de comida como quem convida pra mesa."
        aoSalvar={v => salvarVoz({ personality: v })} /></Card>,
    },
    {
      chave: 'use_words', titulo: 'Palavras pra usar', vazio: !(tov.use_words?.length),
      dica: 'O vocabulário da casa.',
      render: () => <Card><Etiquetas itens={tov.use_words} cor="boa" placeholder="+ palavra"
        aoSalvar={v => salvarVoz({ use_words: v })} /></Card>,
    },
    {
      chave: 'avoid_words', titulo: 'Palavras pra evitar', vazio: !(tov.avoid_words?.length),
      dica: 'O que o cliente já pediu pra tirar.',
      render: () => <Card><Etiquetas itens={tov.avoid_words} cor="ruim" placeholder="+ palavra"
        aoSalvar={v => salvarVoz({ avoid_words: v })} /></Card>,
    },
    {
      chave: 'production_notes', titulo: 'Notas de produção', vazio: !data.production_notes?.trim(), largura: 'cheia',
      dica: 'O que quem produz precisa saber e sempre esquece.',
      render: () => <Card><TextoEditavel valor={data.production_notes} linhas={4}
        placeholder="O que a equipe precisa saber pra produzir…"
        aoSalvar={v => salvar({ production_notes: v })} /></Card>,
    },
  ]} />
}

// ── GERADOR DE RASCUNHO VIA IA (pesquisa na web) ───────────────────────────────

function ManualGeneratorModal({
  genName, setGenName, genInstagram, setGenInstagram, genWebsite, setGenWebsite,
  genLoading, genError, genDraft, setGenDraft, genSaving, onGenerate, onSave, onClose,
}: {
  genName: string; setGenName: (v: string) => void
  genInstagram: string; setGenInstagram: (v: string) => void
  genWebsite: string; setGenWebsite: (v: string) => void
  genLoading: boolean; genError: string; genDraft: string; setGenDraft: (v: string) => void
  genSaving: boolean
  onGenerate: () => void; onSave: () => void; onClose: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] shadow-pop w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)] flex-shrink-0">
          <p className="font-bold text-[var(--color-text-primary)] flex items-center gap-2"><Sparkles size={16} className="text-[#8b5cf6]" /> Gerar rascunho do manual com IA</p>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-secondary)]"><X size={15} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
            A IA pesquisa na web (site, Google Maps, Instagram, iFood/Rappi, notícias) e monta um rascunho.
            Revise com atenção — pode errar dado, principalmente preços de cardápio — antes de salvar.
          </p>
          <div className="grid grid-cols-1 gap-2.5">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] block mb-1">Nome do negócio</label>
              <input value={genName} onChange={e => setGenName(e.target.value)} placeholder="Ex: Donna Pizzeria"
                className="w-full border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-sm bg-[var(--color-bg-page)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-brand)]" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] block mb-1">Instagram (opcional)</label>
              <input value={genInstagram} onChange={e => setGenInstagram(e.target.value)} placeholder="https://instagram.com/..."
                className="w-full border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-sm bg-[var(--color-bg-page)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-brand)]" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] block mb-1">Site (opcional)</label>
              <input value={genWebsite} onChange={e => setGenWebsite(e.target.value)} placeholder="https://..."
                className="w-full border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-sm bg-[var(--color-bg-page)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-brand)]" />
            </div>
          </div>
          <button onClick={onGenerate} disabled={genLoading || !genName.trim()}
            className="flex items-center justify-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: '#8b5cf6' }}>
            {genLoading ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Pesquisando…</> : <>🔎 Pesquisar e gerar</>}
          </button>
          {genError && <p className="text-xs text-[var(--ds-error-text)] bg-[var(--ds-error-bg)] rounded-lg px-3 py-2">{genError}</p>}
          {genDraft && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] block mb-1">Rascunho gerado — revise antes de salvar</label>
              <textarea value={genDraft} onChange={e => setGenDraft(e.target.value)} rows={16}
                className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-xs font-mono bg-[var(--color-bg-page)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-brand)] resize-none" />
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-[var(--color-border)] flex-shrink-0">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors">Cancelar</button>
          <button onClick={onSave} disabled={!genDraft || genSaving}
            className="px-4 py-1.5 text-sm font-semibold bg-[var(--color-brand)] text-[var(--color-brand-fg)] rounded-lg disabled:opacity-40 transition-opacity">
            {genSaving ? 'Salvando…' : 'Salvar no manual'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

export default function ManualTab({ clientId }: { clientId: string }) {
  const [data, setData]       = useState<ManualData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('mesa')
  const [clientInfo, setClientInfo] = useState<{ name: string; instagram_url: string | null; sous_chef_url: string | null } | null>(null)

  // Gerador de rascunho via IA (pesquisa na web) — pra clientes novos sem manual
  const [showGenerator, setShowGenerator] = useState(false)
  const [genName,      setGenName]      = useState('')
  const [genInstagram, setGenInstagram] = useState('')
  const [genWebsite,   setGenWebsite]   = useState('')
  const [genLoading,   setGenLoading]   = useState(false)
  const [genError,     setGenError]     = useState('')
  const [genDraft,     setGenDraft]     = useState('')
  const [genSaving,    setGenSaving]    = useState(false)

  async function load() {
    const supabase = createClient()
    const [{ data: manual }, { data: client }] = await Promise.all([
      supabase.from('client_manuals').select('*').eq('client_id', clientId).maybeSingle(),
      supabase.from('clients').select('name, instagram_url, sous_chef_url').eq('id', clientId).maybeSingle(),
    ])
    setData(manual)
    setClientInfo(client)
    setLoading(false)
  }

  useEffect(() => { load() }, [clientId])

  function openGenerator() {
    setGenName(clientInfo?.name || '')
    setGenInstagram(clientInfo?.instagram_url || '')
    setGenWebsite('')
    setGenDraft('')
    setGenError('')
    setShowGenerator(true)
  }

  async function runGenerate() {
    if (!genName.trim()) return
    setGenLoading(true); setGenError(''); setGenDraft('')
    try {
      const res = await fetch(withBase('/api/ai-manual'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: genName, instagram: genInstagram, website: genWebsite }),
      })
      const json = await res.json()
      if (!res.ok || json.error) { setGenError(json.error || 'Erro ao gerar'); setGenLoading(false); return }
      // Valida que é JSON parseável antes de mostrar, mas guarda formatado (mais fácil de revisar)
      try {
        const parsed = JSON.parse(json.manual)
        setGenDraft(JSON.stringify(parsed, null, 2))
      } catch {
        setGenDraft(json.manual) // deixa cru pro usuário corrigir manualmente se vier malformado
      }
    } catch {
      setGenError('Erro de conexão ao gerar o rascunho')
    }
    setGenLoading(false)
  }

  // Grava UM pedaço do manual e segue a vida.
  //
  // Sem botão de salvar global de propósito: o manual é consultado muito mais
  // do que editado, e obrigar "entrar em modo edição → mexer → salvar → sair"
  // transforma corrigir uma palavra em cerimônia. Foi parte do motivo de as
  // cores estarem vazias nos 19 clientes.
  //
  // A tela atualiza antes da resposta do banco (o texto que a pessoa acabou de
  // escrever não pode piscar), e volta atrás se a gravação falhar.
  const [salvoAgora, setSalvoAgora] = useState(false)
  async function salvarCampo(patch: Record<string, any>) {
    const antes = data
    setData(d => (d ? { ...d, ...patch } as ManualData : d))
    const supabase = createClient()
    const { error } = await supabase.from('client_manuals')
      .upsert({ client_id: clientId, ...patch }, { onConflict: 'client_id' })
    if (error) {
      setData(antes)
      alert('Não deu pra salvar: ' + error.message)
      return
    }
    setSalvoAgora(true)
    setTimeout(() => setSalvoAgora(false), 1800)
  }

  // Cria a linha vazia e entra no manual editável. Sem isso, "Começar em
  // branco" abriria uma tela onde cada campo tentaria gravar num registro que
  // não existe — o upsert daria conta, mas a tela ainda estaria em `!data`.
  const [criando, setCriando] = useState(false)
  async function comecarEmBranco() {
    setCriando(true)
    const supabase = createClient()
    const { error } = await supabase.from('client_manuals')
      .upsert({ client_id: clientId }, { onConflict: 'client_id' })
    if (error) { setCriando(false); alert('Não deu pra criar: ' + error.message); return }
    await load()
    setCriando(false)
  }

  // Ler o PDF que o cliente já tem.
  //
  // Vários chegam com manual pronto — de outra agência, de um designer, do
  // próprio dono — e esse material morre no Drive, porque transcrever à mão é
  // uma tarde de trabalho. O arquivo vai inteiro pro modelo; ele devolve o
  // mesmo JSON do gerador, e cai no MESMO modal de revisão. Ninguém salva nada
  // sem olhar.
  const importInputRef = useRef<HTMLInputElement>(null)
  const [linkDrive, setLinkDrive] = useState('')
  const [pedindoLink, setPedindoLink] = useState(false)

  async function importarPdf(file: File | null, link?: string) {
    setShowGenerator(true)
    setGenLoading(true); setGenError(''); setGenDraft('')
    setGenName(clientInfo?.name || '')
    try {
      const fd = new FormData()
      // Link é o caminho normal: o manual do cliente já mora numa pasta do
      // Drive, e baixar pra depois subir é um passo inteiro por nada.
      if (link) fd.append('link', link)
      else if (file) fd.append('arquivo', file)
      setPedindoLink(false)
      const res = await fetch(withBase('/api/ai-manual-pdf'), { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok || json.error) { setGenError(json.error || 'Não deu pra ler o PDF'); setGenLoading(false); return }
      try { setGenDraft(JSON.stringify(JSON.parse(json.manual), null, 2)) }
      catch { setGenDraft(json.manual) }
    } catch {
      setGenError('Erro de conexão ao enviar o arquivo')
    }
    setGenLoading(false)
  }

  async function saveGeneratedManual() {
    let parsed: any
    try { parsed = JSON.parse(genDraft) }
    catch { setGenError('JSON inválido — corrija antes de salvar.'); return }
    setGenSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('client_manuals').upsert({ client_id: clientId, ...parsed }, { onConflict: 'client_id' })
    setGenSaving(false)
    if (error) { setGenError('Erro ao salvar: ' + error.message); return }
    setShowGenerator(false)
    setLoading(true)
    await load()
  }

  // Um input só pros dois botões (tela vazia e cabeçalho). `value=''` no clique
  // permite escolher o MESMO arquivo de novo depois de um erro.
  const inputArquivo = (
    <>
      <input ref={importInputRef} type="file" accept=".pdf,.ai,application/pdf,application/postscript,application/illustrator" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; e.currentTarget.value = ''; if (f) void importarPdf(f) }} />

      {/* Duas portas pro mesmo lugar, e o LINK vem primeiro.
      
          O manual do cliente já mora numa pasta do Drive — baixar pra depois
          subir é um passo inteiro por nada. Subir do computador fica pra quem
          recebeu o PDF por WhatsApp ou e-mail. */}
      {pedindoLink && (
        <div className="fixed inset-0 bg-black/40 z-[80] flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setPedindoLink(false) }}>
          <div className="bg-[var(--color-bg-card)] rounded-2xl w-full max-w-md shadow-pop flex flex-col">
            <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">Importar manual em PDF</p>
              <button onClick={() => setPedindoLink(false)} aria-label="Fechar"
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"><X size={15} /></button>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1.5 block">Link do arquivo no Drive</label>
                <input
                  autoFocus
                  value={linkDrive}
                  onChange={e => setLinkDrive(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && linkDrive.trim()) { e.preventDefault(); void importarPdf(null, linkDrive.trim()) } }}
                  placeholder="https://drive.google.com/file/d/…"
                  className="w-full text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2.5 py-2 text-[var(--color-text-primary)] placeholder-[var(--color-text-faint)] outline-none focus:border-[var(--color-accent)]"
                />
                <p className="text-[11px] text-[var(--color-text-faint)] mt-1.5 leading-relaxed">
                  Precisa estar compartilhado como “qualquer pessoa com o link”, e ser o link do ARQUIVO (não da pasta). PDF ou .ai salvo com compatibilidade PDF.
                </p>
              </div>
              <button onClick={() => importarPdf(null, linkDrive.trim())} disabled={!linkDrive.trim()}
                className="w-full text-sm font-semibold py-2 rounded-lg text-white disabled:opacity-40"
                style={{ background: 'var(--color-accent)' }}>
                Ler do Drive
              </button>
              <div className="flex items-center gap-2">
                <span className="flex-1 h-px bg-[var(--color-border)]" />
                <span className="text-[10px] uppercase tracking-widest text-[var(--color-text-faint)]">ou</span>
                <span className="flex-1 h-px bg-[var(--color-border)]" />
              </div>
              <button onClick={() => { setPedindoLink(false); importInputRef.current?.click() }}
                className="w-full flex items-center justify-center gap-1.5 text-sm font-medium py-2 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)] transition-colors">
                <FileUp size={13} /> Escolher do computador
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <p className="text-sm text-[var(--color-text-muted)]">Carregando manual...</p>
    </div>
  )

  if (!data) return (
    <>
      {inputArquivo}
      <div className="flex flex-col items-center justify-center min-h-[360px] gap-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] flex items-center justify-center">
          <BookOpen size={28} className="text-[var(--color-text-faint)]" />
        </div>
        <div>
          <p className="font-semibold text-[var(--color-text-primary)]">Manual não disponível</p>
          <p className="text-sm text-[var(--color-text-muted)] mt-1 max-w-xs">
            Este cliente ainda não tem manual cadastrado.
          </p>
        </div>
        {/* Duas portas, não uma.
        
            10 dos 29 clientes não têm manual, e até aqui a ÚNICA entrada era
            "gerar rascunho com IA" — que devolve JSON cru num textarea pra
            revisar. Quem quer só escrever o conceito à mão não tinha por onde. */}
        <div className="flex items-center gap-2">
          <button onClick={comecarEmBranco} disabled={criando}
            className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)] transition-colors disabled:opacity-50">
            {criando ? 'Criando…' : 'Começar em branco'}
          </button>
          <button onClick={() => setPedindoLink(true)}
            className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)] transition-colors">
            <FileUp size={14} /> Importar PDF
          </button>
          <button onClick={openGenerator}
            className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl text-white transition-opacity hover:opacity-90"
            style={{ background: '#8b5cf6' }}>
            <Sparkles size={14} /> Gerar rascunho com IA
          </button>
        </div>
      </div>
      {showGenerator && <ManualGeneratorModal
        genName={genName} setGenName={setGenName}
        genInstagram={genInstagram} setGenInstagram={setGenInstagram}
        genWebsite={genWebsite} setGenWebsite={setGenWebsite}
        genLoading={genLoading} genError={genError} genDraft={genDraft} setGenDraft={setGenDraft}
        genSaving={genSaving}
        onGenerate={runGenerate} onSave={saveGeneratedManual} onClose={() => setShowGenerator(false)}
      />}
    </>
  )

  return (
    <div className="flex flex-col gap-0 max-w-6xl">
      {inputArquivo}
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-5 pb-5 border-b border-[var(--color-border)]">
        <div>
          {data.tagline && (
            <p className="text-lg font-semibold text-[var(--color-text-primary)] mb-1">{data.tagline}</p>
          )}
          {data.concept && (
            <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">{data.concept}</p>
          )}
        </div>
        {/* O Sous Chef vivia num botão no topo da página do cliente, escrito
            "Manual" — mesmo rótulo da aba, dois destinos diferentes. O botão
            saiu; o link mora aqui, que é onde alguém procurando o manual olha. */}
        <div className="flex items-center gap-2 flex-shrink-0">
        {clientInfo?.sous_chef_url && (
          <a href={clientInfo.sous_chef_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-primary)] transition-colors whitespace-nowrap">
            Sous Chef <ExternalLink size={11} />
          </a>
        )}
        <button onClick={() => setPedindoLink(true)} title="Ler um PDF de manual de marca e preencher a partir dele (você revisa antes de salvar)"
          className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-primary)] transition-colors flex-shrink-0 whitespace-nowrap">
          <FileUp size={12} /> Importar PDF
        </button>
        <button onClick={openGenerator} title="Gerar novo rascunho com IA (sobrescreve ao salvar)"
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0 transition-colors"
          style={{ background: '#8b5cf618', color: '#8b5cf6' }}>
          <Sparkles size={12} /> Regerar com IA
        </button>
        </div>
      </div>
      {showGenerator && <ManualGeneratorModal
        genName={genName} setGenName={setGenName}
        genInstagram={genInstagram} setGenInstagram={setGenInstagram}
        genWebsite={genWebsite} setGenWebsite={setGenWebsite}
        genLoading={genLoading} genError={genError} genDraft={genDraft} setGenDraft={setGenDraft}
        genSaving={genSaving}
        onGenerate={runGenerate} onSave={saveGeneratedManual} onClose={() => setShowGenerator(false)}
      />}

      {/* Section nav */}
      <div className="flex items-center gap-1 mb-5 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap flex-shrink-0 ${
              activeTab === t.key
                ? 'bg-[var(--color-text-primary)] text-[var(--color-bg-page)]'
                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'mesa'        && <MesaTab        data={data} salvar={salvarCampo} />}
      {activeTab === 'overview'    && <OverviewTab    data={data} salvar={salvarCampo} />}
      {activeTab === 'visual'      && <VisualTab      data={data} salvar={salvarCampo} />}
      {activeTab === 'operational' && <OperationalTab data={data} salvar={salvarCampo} />}
      {activeTab === 'menu'        && <MenuTab        data={data} salvar={salvarCampo} />}
      {activeTab === 'content'     && <ContentTab     data={data} salvar={salvarCampo} />}
      {activeTab === 'voice'       && <VoiceTab       data={data} salvar={salvarCampo} />}
    </div>
  )
}
