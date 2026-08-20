#!/usr/bin/env node
// Vigia o vocabulário visual do hub: status e tipo de conteúdo devem ter UMA
// definição, em src/lib/. Sem isso, cada tela vai criando a sua e as cores
// param de significar a mesma coisa — foi assim que "aprovado" virou azul em
// Publicações e verde no Cronograma, e que "estratégia" e "revisão interna"
// dividiram o mesmo roxo dentro do mesmo seletor.
//
// Rode com: node scripts/checar-coesao.mjs
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const FONTE = ['src/lib/status.ts', 'src/lib/socialItems.ts', 'src/lib/recurrings.ts']
const STATUS = ['estrategia', 'captacao', 'producao', 'revisao_interna',
                'aguardando_aprovacao', 'ajuste', 'aprovado', 'agendado', 'publicado']

const arquivos = []
;(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(ts|tsx)$/.test(p) && !FONTE.includes(p)) arquivos.push(p)
  }
})('src')

const problemas = []
for (const p of arquivos) {
  const linhas = readFileSync(p, 'utf8').split('\n')
  linhas.forEach((l, i) => {
    // "<status>: '#hex'" ou "<status>: 'bg-…'" = a tela definindo cor por conta própria
    for (const st of STATUS) {
      const re = new RegExp(`['"]?${st}['"]?\\s*:\\s*['"](#[0-9a-fA-F]{6}|bg-)`)
      if (re.test(l)) problemas.push(`${p}:${i + 1}  define cor própria para "${st}"`)
    }
  })
}

if (problemas.length) {
  console.error(`✗ ${problemas.length} definição(ões) de cor fora de src/lib/status.ts:\n`)
  problemas.forEach(p => console.error('   ' + p))
  console.error('\n   Importe de @/lib/status (statusColor / statusBadge / statusLabel).')
  process.exit(1)
}
console.log('✓ status e tipo têm uma definição só — nenhuma tela inventando cor')
