'use client'

import { useEffect, useState } from 'react'
import { createClient } from './supabase'

// Traduz o pedaço do endereço em id de cliente.
//
// A página do cliente usa o parâmetro da URL como `client_id` em sete
// consultas. Trocar a URL por apelido sem traduzir antes quebraria todas de uma
// vez — e em silêncio, porque `client_id = 'piastro-cucina'` não é erro de
// sintaxe, é só um filtro que não acha nada: a tela abriria vazia, como se o
// cliente não tivesse nada.
//
// Por isso a tradução acontece ANTES de a página montar, e o miolo continua
// recebendo UUID exatamente como antes.
//
// Aceita os dois formatos de propósito. Os links de UUID estão em favoritos,
// em conversa de WhatsApp e no histórico do navegador de todo mundo — quebrar
// isso pra ganhar endereço bonito seria trocar um incômodo por outro maior.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const ehUUID = (s: string) => UUID.test(s)

export type Resolucao = { id: string; slug: string | null } | 'carregando' | 'nao-encontrado'

export function useClienteDaURL(param: string): Resolucao {
  const [r, setR] = useState<Resolucao>(() => (ehUUID(param) ? { id: param, slug: null } : 'carregando'))

  useEffect(() => {
    if (ehUUID(param)) { setR({ id: param, slug: null }); return }
    let vivo = true
    createClient().from('clients').select('id, slug').eq('slug', param).maybeSingle()
      .then(({ data, error }) => {
        if (!vivo) return
        // Erro aqui quer dizer coluna `slug` ainda inexistente ou sem permissão
        // — e nesse caso é melhor dizer "não encontrado" do que abrir a página
        // com um id inválido e mostrar um cliente vazio.
        setR(error || !data ? 'nao-encontrado' : { id: data.id, slug: data.slug })
      })
    return () => { vivo = false }
  }, [param])

  return r
}

/**
 * O caminho da página de um cliente.
 *
 * Cai no UUID quando não há apelido — cliente recém-criado antes de alguém
 * preencher o slug, por exemplo. Melhor um endereço feio que funciona do que
 * um bonito que abre em branco.
 */
export function caminhoCliente(c: { id: string; slug?: string | null }, aba?: string): string {
  // A aba entra no CAMINHO, não em `?tab=`: aba é lugar, e o botão voltar do
  // navegador precisa sair dela em vez de pular a tela do cliente inteira.
  return `/dashboard/clientes/${c.slug || c.id}${aba ? `/${aba}` : ''}`
}
