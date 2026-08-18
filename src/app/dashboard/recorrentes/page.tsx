'use client'

import { useEffect } from 'react'
import RecorrentesView from '@/components/recorrentes/RecorrentesView'

export default function RecorrentesPage() {
  useEffect(() => { document.title = 'Recorrentes · Bagano Hub' }, [])
  // A tela mora no componente porque ela também é uma aba dentro do cliente —
  // duas cópias iam divergir no primeiro ajuste feito só de um lado.
  return <RecorrentesView />
}
