'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { createClient } from '@/lib/supabase'

export type Member = {
  id: string
  name: string
  role: string
  color: string
  email?: string | null
  /** Sócio: pode ver o hub como outra pessoa. */
  is_owner?: boolean | null
}

type UserContextType = {
  members: Member[]
  currentMember: Member | null
  setCurrentMember: (m: Member | null) => void
  showOnlyMine: boolean
  setShowOnlyMine: (v: boolean) => void
  /** Quem entrou de verdade, independente de estar vendo como outra pessoa. */
  loggedMember: Member | null
  /** Só sócio troca de pessoa. Sem e-mail preenchido, ninguém é travado. */
  canImpersonate: boolean
}

const UserContext = createContext<UserContextType>({
  members: [],
  currentMember: null,
  setCurrentMember: () => {},
  showOnlyMine: false,
  setShowOnlyMine: () => {},
  loggedMember: null,
  canImpersonate: true,
})

export function UserProvider({ children }: { children: ReactNode }) {
  const [members, setMembers] = useState<Member[]>([])
  const [currentMember, setCurrentMemberState] = useState<Member | null>(null)
  const [showOnlyMine, setShowOnlyMineState] = useState(false)
  const [loggedMember, setLoggedMember] = useState<Member | null>(null)
  const [canImpersonate, setCanImpersonate] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      // O select pede email/is_owner, que podem não existir ainda no banco.
      // Se a coluna faltar, o PostgREST recusa a consulta INTEIRA — então cai
      // pro select antigo e o hub segue funcionando como antes, em vez de
      // ficar sem lista de pessoas.
      let data: Member[] | null = null
      const full = await supabase.from('team_members').select('id, name, role, color, email, is_owner').order('name')
      if (full.error) {
        const basic = await supabase.from('team_members').select('id, name, role, color').order('name')
        data = (basic.data as Member[]) || null
      } else {
        data = (full.data as Member[]) || null
      }
      if (data) setMembers(data)

      // Quem entrou é quem manda. O seletor deixa de ser "escolha quem você é"
      // e vira "ver como outra pessoa" — antes dava pra agir no nome de
      // qualquer um, e o registro de atividade saía errado sem má intenção.
      const { data: auth } = await supabase.auth.getUser()
      const email = auth?.user?.email?.toLowerCase() || null
      const me = email && data ? data.find(m => (m.email || '').toLowerCase() === email) || null : null
      setLoggedMember(me)

      // Trava só quando dá pra saber quem é a pessoa. Sem e-mail preenchido
      // na tabela, o hub continua aberto como sempre foi — travar quem o
      // sistema não reconhece deixaria gente de fora do próprio trabalho.
      const locked = !!me && !me.is_owner
      setCanImpersonate(!locked)

      const savedId = localStorage.getItem('bagano_current_member')
      const savedFilter = localStorage.getItem('bagano_show_only_mine')
      if (locked) {
        // Não-sócio é sempre ele mesmo, mesmo que tenha ficado marcado como
        // outra pessoa antes da trava existir.
        setCurrentMemberState(me)
        localStorage.setItem('bagano_current_member', me!.id)
      } else if (savedId && data) {
        const found = data.find(m => m.id === savedId)
        if (found) setCurrentMemberState(found)
        else if (me) setCurrentMemberState(me)
      } else if (me) {
        setCurrentMemberState(me)
      }
      if (savedFilter === 'true') setShowOnlyMineState(true)
    }
    load()
  }, [])

  const setCurrentMember = (m: Member | null) => {
    setCurrentMemberState(m)
    if (m) localStorage.setItem('bagano_current_member', m.id)
    else localStorage.removeItem('bagano_current_member')
  }

  const setShowOnlyMine = (v: boolean) => {
    setShowOnlyMineState(v)
    localStorage.setItem('bagano_show_only_mine', String(v))
  }

  return (
    <UserContext.Provider value={{ members, currentMember, setCurrentMember, showOnlyMine, setShowOnlyMine, loggedMember, canImpersonate }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  return useContext(UserContext)
}
