'use client'

import { useState } from 'react'

const statusConfig: Record<string, { label: string; bg: string; color: string }> = {
  approved: { label: '✓ Aprovado', bg: '#EAF3DE', color: '#27500A' },
  revision: { label: '↻ Alteração', bg: '#FCEBEB', color: '#791F1F' },
  sent: { label: '📤 Enviado', bg: '#FAEEDA', color: '#633806' },
  production: { label: '⚙ Em produção', bg: '#E6F1FB', color: '#0C447C' },
  waiting: { label: '⏳ Aguardando', bg: '#F1EFE8', color: 'var(--color-text-secondary)' },
  ready: { label: '✅ Arte pronta', bg: '#EAF3DE', color: '#27500A' },
}

const mockPost = {
  id: '3',
  number: 4,
  type: 'reel',
  copy: 'O jardim mais bonito de BC espera por vocês dois 🌿\n\nReservas abertas — link na bio.',
  description: 'Reel de revelação do Garden decorado para Namorados. Jardim à noite, velas, flores, mesa posta para dois. CTA suave: Reservas abertas — link na bio.',
  publish_date: '07/06/2026',
  drive_link: 'https://drive.google.com/drive/folders/exemplo',
  status: 'revision',
  urgent: true,
  responsible: { initials: 'HB', name: 'Higor', role: 'Editor', bg: '#FAECE7', color: '#712B13' },
  comments: [
    { id: '1', author: 'Cliente', author_type: 'client', content: 'Colocar o nome do evento no início do vídeo', time: '07/06 às 14:32' },
    { id: '2', author: 'Letícia', author_type: 'internal', content: 'Higor, cliente pediu para colocar o nome do evento no início', time: '07/06 às 14:45' },
  ]
}

export default function PostPage() {
  const [status, setStatus] = useState(mockPost.status)
  const [comment, setComment] = useState('')
  const [comments, setComments] = useState(mockPost.comments)
  const s = statusConfig[status]

  function addComment() {
    if (!comment.trim()) return
    setComments([...comments, {
      id: Date.now().toString(),
      author: 'Higor',
      author_type: 'internal',
      content: comment,
      time: 'agora'
    }])
    setComment('')
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-[#EBEAE5] px-6 py-4 flex items-center gap-3 bg-white">
        <a href="/dashboard/clientes/1" className="text-[var(--color-text-muted)] text-sm hover:text-[var(--color-text-primary)]">← Big Poke</a>
        <span className="text-[var(--color-border)]">/</span>
        <span className="text-sm text-[var(--color-text-primary)] font-medium">Post #{mockPost.number}</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] font-medium px-2 py-1 rounded-full" style={{ background: s.bg, color: s.color }}>{s.label}</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-2 gap-0 h-full">
          <div className="p-6 border-r border-[#EBEAE5] flex flex-col gap-5">
            <div>
              <div className="text-xs font-medium text-[var(--color-text-muted)] mb-1">TIPO</div>
              <span className="text-[10px] font-medium px-2 py-1 rounded bg-[#E6F1FB] text-[#0C447C]">🎬 Reel</span>
            </div>

            <div>
              <div className="text-xs font-medium text-[var(--color-text-muted)] mb-1">DATA ESTIMADA</div>
              <div className="text-sm text-[var(--color-text-primary)] font-medium">
                {mockPost.urgent && <span className="text-[#E24B4A] mr-1">🔴</span>}
                {mockPost.publish_date}
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-[var(--color-text-muted)] mb-2">RESPONSÁVEL</div>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium" style={{ background: mockPost.responsible.bg, color: mockPost.responsible.color }}>
                  {mockPost.responsible.initials}
                </div>
                <div>
                  <div className="text-sm font-medium text-[var(--color-text-primary)]">{mockPost.responsible.name}</div>
                  <div className="text-[10px] font-medium px-1 rounded" style={{ background: mockPost.responsible.bg, color: mockPost.responsible.color }}>{mockPost.responsible.role}</div>
                </div>
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-[var(--color-text-muted)] mb-2">LEGENDA</div>
              <div className="bg-[var(--color-bg-input)] rounded-xl p-3 text-sm text-[var(--color-text-primary)] whitespace-pre-line leading-relaxed">
                {mockPost.copy}
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-[var(--color-text-muted)] mb-2">DIRECIONAMENTO</div>
              <div className="bg-[var(--color-bg-input)] rounded-xl p-3 text-sm text-[var(--color-text-secondary)] leading-relaxed">
                {mockPost.description}
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-[var(--color-text-muted)] mb-2">ARQUIVO NO DRIVE</div>
              {mockPost.drive_link ? (
                <a href={mockPost.drive_link} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-[var(--color-bg-input)] rounded-xl p-3 text-sm text-[#0C447C] hover:bg-[var(--color-border)] transition-colors">
                  <span>📁</span>
                  <span>Abrir pasta no Drive</span>
                </a>
              ) : (
                <div className="bg-[var(--color-bg-input)] rounded-xl p-3 text-sm text-[var(--color-text-muted)]">Nenhum arquivo adicionado</div>
              )}
            </div>

            <div>
              <div className="text-xs font-medium text-[var(--color-text-muted)] mb-2">STATUS</div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(statusConfig).map(([key, val]) => (
                  <button key={key} onClick={() => setStatus(key)}
                    className="text-[10px] font-medium px-2 py-1 rounded-full border transition-all"
                    style={{
                      background: status === key ? val.bg : 'transparent',
                      color: status === key ? val.color : '#A8A59E',
                      borderColor: status === key ? val.color : '#EBEAE5'
                    }}>
                    {val.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="p-6 flex flex-col gap-4">
            <div className="text-xs font-medium text-[var(--color-text-muted)]">COMENTÁRIOS</div>
            <div className="flex flex-col gap-3 flex-1">
              {comments.map(c => (
                <div key={c.id} className={`rounded-xl p-3 ${c.author_type === 'client' ? 'bg-[#FCEBEB] border-l-2 border-[#E24B4A]' : 'bg-[var(--color-bg-input)] border-l-2 border-[#378ADD]'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-[var(--color-text-primary)]">{c.author}</span>
                    <span className="text-[10px] text-[var(--color-text-muted)]">{c.time}</span>
                  </div>
                  <p className="text-sm text-[var(--color-text-primary)]">{c.content}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Adicionar comentário interno..."
                rows={3}
                className="w-full border border-[#EBEAE5] rounded-xl px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[#1A1916] transition-colors bg-white resize-none"
              />
              <button onClick={addComment}
                className="self-end bg-[var(--color-text-primary)] text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-[#2d2d2a] transition-colors">
                Comentar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}