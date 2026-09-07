'use client'

import { useEffect } from 'react'
import PostsKanban from '@/components/PostsKanban'

// O quadro em si mora em `components/PostsKanban` — a página do cliente usa o
// mesmo, recortado num cliente só. Aqui só sobrou o título da aba do navegador.
export default function KanbanPage() {
  useEffect(() => { document.title = 'Kanban · Bagano Hub' }, [])
  return <PostsKanban />
}
