#!/usr/bin/env node
// Vigia o vazamento de cliente desativado.
//
// Desativar um cliente muda só a tabela `clients`. O conteúdo dele continua no
// banco, e as telas que buscam conteúdo POR PESSOA ou POR DATA — e não por
// cliente — não têm o filtro no caminho. Foi assim que o Mundo Selvagem seguiu
// contando como pendência, aparecendo como atrasado e mandando "⚠️ Publicação
// atrasada" no celular de quem estava marcado, semanas depois de ter saído.
//
// A regra: quem lê schedules/extras/materials SEM amarrar num `client_id`
// específico tem que passar por src/lib/activeClients.ts.
//
// Rode com: node scripts/checar-cliente-inativo.mjs
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const CONTEUDO = /\.from\('(schedules|extras|materials|captacoes)'\)/
const RECORTE  = /activeClientIds|fromActiveClients/

// Telas que já leem de um cliente só. O recorte veio do próprio `eq`, e cobrar
// o filtro aqui seria pedir para filtrar o que já está filtrado.
const POR_CLIENTE = [
  'src/app/dashboard/clientes/[id]/[[...aba]]/page.tsx',
  'src/app/dashboard/feed/page.tsx',
  'src/app/aprovar/[token]/AprovarClient.tsx',
  'src/app/aprovar/[token]/page.tsx',
  'src/lib/pendingMonths.ts',
  'src/lib/approvalLinks.ts',
  'src/components/CronogramaTab.tsx',
  'src/components/CampaignsTab.tsx',
  'src/components/PostCard.tsx',
  'src/components/ExtraCard.tsx',
  'src/components/MaterialCard.tsx',
  'src/components/PostFormModal.tsx',
  'src/components/MaterialFormModal.tsx',
  'src/components/CommandPalette.tsx',   // busca: achar cliente antigo é útil
  'src/app/api/push/notify/route.ts',    // reage a um card específico
  'src/app/api/ai-legenda/route.ts',     // recebe o post pronto
  'src/app/api/cron/archive-completed/route.ts', // arquiva o que já fechou
  'src/lib/queries.ts',
  'src/lib/calendarSync.ts',        // grava numa captação por id, não lê em bloco
  'src/lib/renumerarPosts.ts',      // grava em posts por id, não lê em bloco
  'src/lib/fecharMes.ts',           // lê os posts de UM cliente/mês
]

const arquivos = []
;(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(ts|tsx)$/.test(f)) arquivos.push(p)
  }
})('src')

const faltando = []
for (const a of arquivos) {
  if (POR_CLIENTE.includes(a) || a === 'src/lib/activeClients.ts') continue
  const src = readFileSync(a, 'utf8')
  if (CONTEUDO.test(src) && !RECORTE.test(src)) faltando.push(a)
}

if (faltando.length) {
  console.error('\n✗ Lê conteúdo sem recortar cliente ativo:\n')
  for (const f of faltando) console.error(`   ${f}`)
  console.error('\n  Use activeClientIds/fromActiveClients de src/lib/activeClients.ts.')
  console.error('  Se a tela já lê de um cliente só, acrescente o caminho em POR_CLIENTE.\n')
  process.exit(1)
}
console.log('✓ Nenhum vazamento de cliente desativado.')
