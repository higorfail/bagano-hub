'use client'

import { useState, useEffect, useRef } from 'react'
import { TextoEditavel, Etiquetas, CardsEditaveis, CoresEditaveis, ParesEditaveis, Salvo } from '@/components/manual/CamposEditaveis'
import { createClient } from '@/lib/supabase'
import { withBase } from '@/lib/base'
import {
  MapPin, Phone, AtSign, Globe, Truck, BookOpen,
  ChevronDown, ChevronRight, Sparkles, X, ExternalLink, FileUp,
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
}

const TABS = [
  { key: 'overview',     label: 'Visão Geral' },
  { key: 'visual',       label: 'Visual' },
  { key: 'operational',  label: 'Operacional' },
  { key: 'menu',         label: 'Cardápio' },
  { key: 'content',      label: 'Conteúdo' },
  { key: 'voice',        label: 'Tom de Voz' },
]

function SectionBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{title}</h3>
      {children}
    </div>
  )
}

function Card({ children, className = '', style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 ${className}`} style={style}>
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

function OverviewTab({ data, salvar }: { data: ManualData; salvar: Salvar }) {
  return (
    <div className="flex flex-col gap-6">
      <SectionBlock title="Tagline">
        <Card>
          <TextoEditavel valor={data.tagline} linhas={2}
            placeholder="A frase que resume a marca…"
            aoSalvar={v => salvar({ tagline: v })} />
        </Card>
      </SectionBlock>

      <SectionBlock title="Conceito">
        <Card>
          <TextoEditavel valor={data.concept} linhas={4}
            placeholder="O que a marca é, em poucas linhas…"
            aoSalvar={v => salvar({ concept: v })} />
        </Card>
      </SectionBlock>

      <SectionBlock title="História">
        <Card>
          <TextoEditavel valor={data.history} linhas={5}
            placeholder="De onde veio, quem começou, o que mudou…"
            aoSalvar={v => salvar({ history: v })} />
        </Card>
      </SectionBlock>

      <SectionBlock title="Pilares da Marca">
        <CardsEditaveis<Pillar>
          itens={data.pillars}
          campos={[
            { chave: 'name', rotulo: 'Pilar', linhas: 1 },
            { chave: 'description', rotulo: 'O que significa', linhas: 2 },
          ]}
          rotuloNovo="Adicionar pilar"
          aoSalvar={v => salvar({ pillars: v })}
        />
      </SectionBlock>

      <SectionBlock title="Diferenciais">
        <Card>
          <Etiquetas itens={data.differentials} placeholder="+ diferencial"
            aoSalvar={v => salvar({ differentials: v })} />
        </Card>
      </SectionBlock>
    </div>
  )
}

function VisualTab({ data, salvar }: { data: ManualData; salvar: Salvar }) {
  const tov = data.tone_of_voice || {}
  return (
    <div className="flex flex-col gap-6">
      <SectionBlock title="Paleta de Cores">
        <CoresEditaveis cores={data.colors} aoSalvar={v => salvar({ colors: v })} />
      </SectionBlock>

      <SectionBlock title="Tipografia">
        <CardsEditaveis<Font>
          itens={data.fonts}
          campos={[
            { chave: 'role', rotulo: 'Uso', linhas: 1 },
            { chave: 'family', rotulo: 'Fonte', linhas: 1 },
          ]}
          rotuloNovo="Adicionar fonte"
          aoSalvar={v => salvar({ fonts: v })}
        />
      </SectionBlock>

      {/* Taglines moram dentro de tone_of_voice no banco, mas quem procura
          "as frases da marca" olha aqui, no visual, junto de cor e fonte. */}
      <SectionBlock title="Taglines">
        <Card>
          <Etiquetas itens={tov.taglines} placeholder="+ tagline"
            aoSalvar={v => salvar({ tone_of_voice: { ...tov, taglines: v } })} />
        </Card>
      </SectionBlock>
    </div>
  )
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

  return (
    <div className="flex flex-col gap-6">
      <SectionBlock title="Contato">
        <Card>
          <div className="flex flex-col gap-1">
            {linha(MapPin, 'address', 'Endereço')}
            {linha(Phone, 'phone', 'Telefone')}
            {linha(AtSign, 'instagram', '@ do Instagram')}
            {linha(Globe, 'website', 'Site')}
          </div>
        </Card>
      </SectionBlock>

      <SectionBlock title="Horários de Funcionamento">
        <Card>
          <ParesEditaveis pares={data.hours} rotuloChave="dia" rotuloValor="18h–23h"
            aoSalvar={v => salvar({ hours: v })} />
        </Card>
      </SectionBlock>

      <SectionBlock title="Delivery">
        <Card>
          <div className="flex items-start gap-2.5">
            <Truck size={13} className="text-[var(--color-text-muted)] mt-1.5 flex-shrink-0" />
            <div className="flex-1">
              <Etiquetas itens={data.delivery_links} placeholder="+ iFood, Rappi…"
                aoSalvar={v => salvar({ delivery_links: v })} />
            </div>
          </div>
        </Card>
      </SectionBlock>
    </div>
  )
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
  return (
    <div className="flex flex-col gap-6">
      <SectionBlock title="Pilares Editoriais">
        <CardsEditaveis<Pillar>
          itens={data.editorial_pillars}
          campos={[
            { chave: 'name', rotulo: 'Pilar', linhas: 1 },
            { chave: 'description', rotulo: 'O que entra nele', linhas: 2 },
          ]}
          rotuloNovo="Adicionar pilar editorial"
          aoSalvar={v => salvar({ editorial_pillars: v })}
        />
      </SectionBlock>

      <SectionBlock title="Séries de Conteúdo">
        <CardsEditaveis<ContentSeries>
          itens={data.content_series}
          campos={[
            { chave: 'name', rotulo: 'Série', linhas: 1 },
            { chave: 'description', rotulo: 'Do que se trata', linhas: 2 },
            { chave: 'frequency', rotulo: 'Frequência', linhas: 1 },
          ]}
          rotuloNovo="Adicionar série"
          aoSalvar={v => salvar({ content_series: v })}
        />
      </SectionBlock>

      <SectionBlock title="Personas">
        <CardsEditaveis<Persona>
          itens={data.personas?.map(p => ({ ...p, age: String(p.age ?? '') }))}
          campos={[
            { chave: 'name', rotulo: 'Quem é', linhas: 1 },
            { chave: 'age', rotulo: 'Idade', linhas: 1 },
            { chave: 'profile', rotulo: 'Perfil', linhas: 2 },
            { chave: 'behaviors', rotulo: 'Como se comporta', linhas: 2 },
          ]}
          rotuloNovo="Adicionar persona"
          aoSalvar={v => salvar({ personas: v })}
        />
      </SectionBlock>

      <SectionBlock title="Promoções & Ativações">
        <CardsEditaveis<Promotion>
          itens={data.promotions}
          campos={[
            { chave: 'title', rotulo: 'Promoção', linhas: 1 },
            { chave: 'description', rotulo: 'Como funciona', linhas: 2 },
          ]}
          rotuloNovo="Adicionar promoção"
          aoSalvar={v => salvar({ promotions: v })}
        />
      </SectionBlock>

      <SectionBlock title="Datas & Eventos">
        <CardsEditaveis<CalEvent>
          itens={data.events}
          campos={[
            { chave: 'date', rotulo: 'Quando', linhas: 1 },
            { chave: 'title', rotulo: 'O quê', linhas: 1 },
            { chave: 'description', rotulo: 'Detalhes', linhas: 2 },
          ]}
          rotuloNovo="Adicionar data"
          aoSalvar={v => salvar({ events: v })}
        />
      </SectionBlock>

      <SectionBlock title="Notas de Produção">
        <Card>
          <TextoEditavel valor={data.production_notes} linhas={4}
            placeholder="O que a equipe precisa saber pra produzir…"
            aoSalvar={v => salvar({ production_notes: v })} />
        </Card>
      </SectionBlock>
    </div>
  )
}

function VoiceTab({ data, salvar }: { data: ManualData; salvar: (p: Record<string, any>) => Promise<void> }) {
  const tov = data.tone_of_voice || {}

  // Editar um pedaço do tom de voz sem apagar os outros: o campo é um objeto
  // só no banco, e mandar `{ personality }` sozinho zeraria as palavras.
  const salvarVoz = (patch: Record<string, any>) => salvar({ tone_of_voice: { ...tov, ...patch } })

  return (
    <div className="flex flex-col gap-6">
      {/* Sem `if (vazio) return`: campo vazio é justamente onde alguém precisa
          escrever. Esconder o que falta foi como 19 manuais ficaram sem cores. */}
      <SectionBlock title="Personalidade da Marca">
        <Card>
          <TextoEditavel
            valor={tov.personality}
            linhas={4}
            placeholder="Como esta marca fala? Ex.: acolhedora, sem formalidade, fala de comida como quem convida pra mesa."
            aoSalvar={v => salvarVoz({ personality: v })}
          />
          <p className="text-[11px] text-[var(--color-text-faint)] mt-2">
            É daqui que a IA tira o jeito de escrever a legenda.
          </p>
        </Card>
      </SectionBlock>

      <SectionBlock title="Palavras & Expressões para Usar">
        <Etiquetas itens={tov.use_words} cor="boa" placeholder="+ palavra"
          aoSalvar={v => salvarVoz({ use_words: v })} />
      </SectionBlock>

      <SectionBlock title="Palavras & Expressões para Evitar">
        <Etiquetas itens={tov.avoid_words} cor="ruim" placeholder="+ palavra"
          aoSalvar={v => salvarVoz({ avoid_words: v })} />
      </SectionBlock>

      <SectionBlock title="Taglines">
        <Etiquetas itens={tov.taglines} placeholder="+ tagline"
          aoSalvar={v => salvarVoz({ taglines: v })} />
      </SectionBlock>

      <SectionBlock title="Personas">
        <CardsEditaveis
          itens={data.personas as any}
          rotuloNovo="Nova persona"
          campos={[
            { chave: 'name', rotulo: 'Nome', linhas: 1 },
            { chave: 'age', rotulo: 'Idade', linhas: 1 },
            { chave: 'profile', rotulo: 'Perfil' },
            { chave: 'behaviors', rotulo: 'Comportamento' },
          ]}
          aoSalvar={v => salvar({ personas: v })}
        />
      </SectionBlock>

      <SectionBlock title="Pilares Editoriais">
        <CardsEditaveis
          itens={data.editorial_pillars as any}
          rotuloNovo="Novo pilar"
          campos={[
            { chave: 'name', rotulo: 'Pilar', linhas: 1 },
            { chave: 'description', rotulo: 'O que é' },
          ]}
          aoSalvar={v => salvar({ editorial_pillars: v })}
        />
      </SectionBlock>
    </div>
  )
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
  const [activeTab, setActiveTab] = useState('overview')
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
  async function importarPdf(file: File) {
    setShowGenerator(true)
    setGenLoading(true); setGenError(''); setGenDraft('')
    setGenName(clientInfo?.name || '')
    try {
      const fd = new FormData()
      fd.append('arquivo', file)
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
    <input ref={importInputRef} type="file" accept="application/pdf" className="hidden"
      onChange={e => { const f = e.target.files?.[0]; e.currentTarget.value = ''; if (f) void importarPdf(f) }} />
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
          <button onClick={() => importInputRef.current?.click()}
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
    <div className="flex flex-col gap-0 max-w-4xl">
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
        <button onClick={() => importInputRef.current?.click()} title="Ler um PDF de manual de marca e preencher a partir dele (você revisa antes de salvar)"
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
      {activeTab === 'overview'    && <OverviewTab    data={data} salvar={salvarCampo} />}
      {activeTab === 'visual'      && <VisualTab      data={data} salvar={salvarCampo} />}
      {activeTab === 'operational' && <OperationalTab data={data} salvar={salvarCampo} />}
      {activeTab === 'menu'        && <MenuTab        data={data} salvar={salvarCampo} />}
      {activeTab === 'content'     && <ContentTab     data={data} salvar={salvarCampo} />}
      {activeTab === 'voice'       && <VoiceTab       data={data} salvar={salvarCampo} />}
    </div>
  )
}
