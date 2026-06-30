'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { createClient } from '@/lib/supabase'

export type Member = {
  id: string
  name: string
  role: string
  color: string
}

type UserContextType = {
  members: Member[]
  currentMember: Member | null
  setCurrentMember: (m: Member | null) => void
  showOnlyMine: boolean
  setShowOnlyMine: (v: boolean) => void
}

const UserContext = createContext<UserContextType>({
  members: [],
  currentMember: null,
  setCurrentMember: () => {},
  showOnlyMine: false,
  setShowOnlyMine: () => {},
})

export function UserProvider({ children }: { children: ReactNode }) {
  const [members, setMembers] = useState<Member[]>([])
  const [currentMember, setCurrentMemberState] = useState<Member | null>(null)
  const [showOnlyMine, setShowOnlyMineState] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('team_members').select('id, name, role, color').order('name')
      .then(({ data }) => {
        if (data) setMembers(data)
        // Restaura seleção salva
        const savedId = localStorage.getItem('bagano_current_member')
        const savedFilter = localStorage.getItem('bagano_show_only_mine')
        if (savedId && data) {
          const found = data.find(m => m.id === savedId)
          if (found) setCurrentMemberState(found)
        }
        if (savedFilter === 'true') setShowOnlyMineState(true)
      })
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
    <UserContext.Provider value={{ members, currentMember, setCurrentMember, showOnlyMine, setShowOnlyMine }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  return useContext(UserContext)
}
