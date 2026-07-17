'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase'
import { X, Calendar, Trash2, Link2, ImagePlus, XCircle, Package, Check, ChevronDown, Send, ExternalLink, Bold, Italic, List, Smile, Copy, Move, Pencil, Users, Tag } from 'lucide-react'
import { useToast } from '@/lib/ToastContext'
import { useUser } from '@/lib/UserContext'
import { moveToTrash } from '@/lib/trash'
import { logActivity } from '@/lib/activity'
import { dbError } from '@/lib/dbError'
import { autoGrow } from '@/lib/autoGrow'
import { DriveThumbnail, FolderThumbnail } from '@/components/DriveThumbnail'
import { renderWithMentions } from '@/lib/useMentions'
import { generateAiSummary } from '@/lib/aiSummary'
import { ensureWatching } from '@/lib/watch'
import WatchButton from '@/components/WatchButton'
import ModalPortal from '@/components/ModalPortal'
import DeliverySection from '@/components/DeliverySection'
import PropertyPill, { pillSelectCls } from '@/components/PropertyPill'

const POST_TYPES = [
  { value: 'carrossel',         label: 'Carrossel',         color: '#3b82f6' },
  { value: 'reels',             label: 'Reels',             color: '#ef4444' },
  { value: 'post',              label: 'Post',              color: '#f59e0b' },
  { value: 'story',             label: 'Story',             color: '#8b5cf6' },
  { value: 'carrossel_stories', label: 'Carrossel/Stories', color: '#6366f1' },
]
const STATUSES = [
  { value: 'estrategia',                 label: 'Estratégia',           color: '#8b5cf6' },
  { value: 'aguardando_aprovacao_crono', label: 'Ag. crono',            color: '#f472b6' },
  { value: 'captacao',                   label: 'Captação',             color: '#0ea5e9' },
  { value: 'producao',                   label: 'Produção',             color: '#f59e0b' },
  { value: 'revisao_interna',            label: 'Revisão interna',      color: '#8b5cf6' },
  { value: 'aguardando_aprovacao',       label: 'Aguardando aprovação', color: '#ec4899' },
  { value: 'ajuste',                     label: 'Ajuste solicitado',    color: '#ef4444' },
  { value: 'aprovado',                   label: 'Aprovado',             color: '#22c55e' },
  { value: 'agendado',                   label: 'Agendado',             color: '#3b82f6' },
  { value: 'publicado',                  label: 'Publicado',            color: '#059669' },
]
const FUNIL_OPTIONS = ['Topo de funil','Meio de funil','Fundo de funil','Institucional','Promocional','Engajamento','Venda']
const LABEL_PALETTE = [
  { name: 'Vermelho', color: '#EF4444' }, { name: 'Laranja', color: '#F59E0B' },
  { name: 'Amarelo',  color: '#EAB308' }, { name: 'Verde',   color: '#22C55E' },
  { name: 'Azul',     color: '#3B82F6' }, { name: 'Roxo',    color: '#8B5CF6' },
  { name: 'Rosa',     color: '#EC4899' }, { name: 'Cinza',   color: '#6B7280' },
]
const STATUS_LABEL: Record<string, string> = Object.fromEntries(STATUSES.map(s => [s.value, s.label]))

const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']
const DIAS  = ['dom','seg','ter','qua','qui','sex','sáb']

type PostForm = {
  title: string; briefing: string; copy: string; legenda: string
  post_type: string; scheduled_date: string; status: string; drive_url: string; drive_folder_url: string
  reference_notes: string; funil: string; campaign_type: string; reference_images: string[]
}
const EMPTY: PostForm = { title:'', briefing:'', copy:'', legenda:'', post_type:'carrossel', scheduled_date:'', status:'estrategia', drive_url:'', drive_folder_url:'', reference_notes:'', funil:'', campaign_type:'', reference_images:[] }

type Props = {
  postId?: string
  clientId: string
  clientName?: string
  clientColor?: string
  month: number
  year: number
  postNumber?: number
  initialDate?: string
  onClose: () => void
  onSaved: () => void
  onDeleted?: () => void
}

type TextField = 'title' | 'briefing' | 'copy' | 'legenda' | 'reference_notes' | 'drive_url' | 'drive_folder_url'
type Comment = { id: string; author_name: string | null; body: string; created_at: string }

function relTime(iso: string) {
  const d = new Date(iso); const mins = Math.floor((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return 'agora'; if (mins < 60) return `${mins}min`
  const hrs = Math.floor(mins / 60); if (hrs < 24) return `${hrs}h`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}
function fullDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function hostOf(url: string) { try { return new URL(url).hostname.replace('www.', '') } catch { return url } }
// markdown leve: **negrito**, *itálico* e "- " bullets (escapa HTML antes)
function renderMd(text: string) {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const inline = (s: string) => s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
  const blocks: string[] = []
  let buf: string[] = [], items: string[] = []
  const flush = () => { if (buf.length) { blocks.push('<div>' + buf.join('<br/>') + '</div>'); buf = [] } }
  const flushList = () => { if (items.length) { blocks.push('<ul>' + items.join('') + '</ul>'); items = [] } }
  for (const line of esc.split('\n')) {
    const m = line.match(/^\s*[-•]\s+(.*)$/)
    if (m) { flush(); items.push('<li>' + inline(m[1]) + '</li>') }
    else { flushList(); buf.push(inline(line)) }
  }
  flush(); flushList()
  return blocks.join('')
}
const EMOJI_GROUPS: [string, string[]][] = [
  ['Rostos', ['😀','😃','😄','😁','😆','😅','😂','🤣','🥲','☺️','😊','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🥸','🤩','🥳','😏','😒','😞','😔','😟','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👾','🤖','🫥','😶','😑','😐','🙄','😬','🤥','🤫','🤭','🫢','🫣','🤔','🫠','🤐','🥴','😵','😵‍💫','🤯','🤠','🥸','😳','🥱','😴','🤤','😪','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','😨','😰','😥','😓','😦','😧','😲','😯','😮','🥹','😱','😺','😸','😹','😻','😼','😽','🙀','😿','😾']],
  ['Gestos & mãos', ['👋','🤚','🖐️','✋','🖖','🫱','🫲','🫳','🫴','🫷','🫸','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','🫵','👍','👎','✊','👊','🤛','🤜','👏','🫶','🙌','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🫀','🫁','🧠','🦷','🦴','👁️','👀','👅','👄','🫦']],
  ['Pessoas & profissões', ['👶','🧒','👦','👧','🧑','👱','👨','🧔','👩','🧓','👴','👵','👮','🕵️','💂','🥷','👷','🫅','🤴','👸','👼','🎅','🤶','🧙','🧝','🧛','🧟','🧞','🧜','🧚','🧑‍⚕️','👨‍⚕️','👩‍⚕️','🧑‍🎓','👨‍🎓','👩‍🎓','🧑‍🏫','👨‍🏫','👩‍🏫','🧑‍⚖️','👨‍⚖️','👩‍⚖️','🧑‍🌾','👨‍🌾','👩‍🌾','🧑‍🍳','👨‍🍳','👩‍🍳','🧑‍🔧','👨‍🔧','👩‍🔧','🧑‍🏭','👨‍🏭','👩‍🏭','🧑‍💼','👨‍💼','👩‍💼','🧑‍🔬','👨‍🔬','👩‍🔬','🧑‍🎨','👨‍🎨','👩‍🎨','🧑‍✈️','👨‍✈️','👩‍✈️','🧑‍🚀','👨‍🚀','👩‍🚀','🧑‍🚒','👨‍🚒','👩‍🚒','🧑‍💻','👨‍💻','👩‍💻','💃','🕺','🧖','🧘','🏋️','🤸','🏄','🚴','🤼','⛹️','🤾','🏌️','🧗','🚵','🤺','🏇']],
  ['Roupas & acessórios', ['👔','👗','👘','👙','👚','👕','👖','🧥','🥻','🩱','🩲','🩳','🧣','🧤','🧦','🧢','👒','🎩','🪖','⛑️','👑','💍','💎','👟','👠','👡','👢','🥾','🥿','👞','👜','👝','🎒','🛍️','👛','💼','🧳','👓','🕶️','🥽','🌂','☂️','💄','💅','💍','🪬','🧿','📿','🔮']],
  ['Corações & celebração', ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','💖','💗','💓','💞','💕','💟','❣️','💌','💘','💝','💋','❤','🩷','🩵','🩶','🎉','🎊','🎈','🎁','🎀','🪅','🥳','🙌','✨','⭐','🌟','💫','🔥','⚡','💥','🌈','💯','🚀','🏆','🥇','🎯','🎗️']],
  ['Animais (terrestres)', ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🦌','🦬','🐃','🐂','🐄','🐑','🐏','🐐','🦙','🐪','🐫','🦒','🦘','🐘','🦛','🦏','🐊','🐆','🐅','🦍','🦧','🐇','🦝','🦨','🦡','🦫','🦦','🦥','🐁','🐀','🐿️','🦔','🐕','🐩','🦮','🐈','🐈‍⬛','🐓','🦃','🦤','🦚','🦜','🦢','🦩','🕊️','🐓','🦋','🐌','🐛','🐝','🪱','🐞','🐜','🪲','🦟','🦗','🕷️','🦂']],
  ['Animais (aquáticos)', ['🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🦭','🐢','🐍','🦎','🦖','🦕','🦠','🪸','🌊']],
  ['Plantas & natureza', ['🌵','🎄','🌲','🌳','🌴','🪵','🌱','🌿','☘️','🍀','🎍','🪴','🎋','🍃','🍂','🍁','🪺','🪹','🍄','🌾','🌰','🪨','💐','🌷','🌹','🥀','🪷','🌺','🌸','🌼','🌻','🫧']],
  ['Clima & espaço', ['☀️','🌤️','⛅','🌥️','☁️','🌦️','🌧️','⛈️','🌩️','🌨️','❄️','☃️','⛄','🌬️','💨','🌀','🌈','☂️','☔','⛱️','⚡','🔥','💧','🌫️','🌁','🌙','🌛','🌜','🌚','🌝','🌞','🌕','🌖','🌗','🌘','🌑','🌒','🌓','🌔','🌟','⭐','🌠','🌌','🪐','☄️','🌍','🌎','🌏','🌐','🗺️','🧭']],
  ['Frutas & vegetais', ['🍏','🍎','🍐','🍊','🍋','🫛','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🫑','🧄','🧅','🥔','🍠','🌽','🥕','🥜','🌰','🫚','🧅']],
  ['Comida', ['🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🫓','🥪','🥙','🧆','🌮','🌯','🫔','🥗','🥘','🫕','🥫','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥮','🍡','🍢','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🍯','🧂','🥄','🍴','🍽️','🫙']],
  ['Bebidas', ['☕','🍵','🧃','🥤','🧋','🍺','🍻','🥂','🍷','🫗','🥃','🍸','🍹','🧉','🍾','🧊','🫖','🥛','🍼','🧊']],
  ['Transporte', ['🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🛴','🚲','🛵','🏍️','🛺','🚁','🛸','🚀','✈️','🛩️','🛫','🛬','🛥️','🚢','⛴️','🚤','🛟','⚓','🛶','⛵','🚂','🚃','🚄','🚅','🚆','🚇','🚈','🚉','🚊','🚝','🚞','🛤️','🛣️','🚦','🚥','🛑','🚧','⛽','🛞','🪂','🛡️','🚀','🛸','🏎️']],
  ['Lugares & construções', ['🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏨','🏩','🏪','🏫','🏬','🏭','🏯','🏰','🗼','🗽','⛪','🕌','🛕','🕍','⛩️','🕋','⛲','⛺','🌁','🌃','🏙️','🌄','🌅','🌆','🌇','🌉','🏔️','⛰️','🌋','🗻','🏕️','🏖️','🏜️','🏝️','🏞️','🏗️','🏘️','🏚️']],
  ['Esportes', ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🏓','🏸','🏒','🥍','🏑','🥊','🥋','🎽','🛹','🛼','🛷','⛸️','⛷️','🏂','🏋️','🤼','🤸','⛹️','🤾','🏌️','🏄','🚣','🧗','🚵','🚴','🏇','🤺','🏆','🥇','🥈','🥉','🏅','🎖️','🏵️','🎯','🎳','🤿','🎣','🏹','🥋','🥊']],
  ['Música & artes', ['🎵','🎶','🎼','🎤','🎧','🎷','🪗','🎸','🎹','🎺','🎻','🥁','🪘','🪈','📻','🎙️','🎬','🎥','📽️','🎞️','🎭','🎨','🖌️','🖍️','✏️','🖊️','🖋️','🎤','🎪','🎠','🎡','🎢','🪩','🎑','🖼️','🪆']],
  ['Jogos & entretenimento', ['🎮','🕹️','🎲','♟️','🎯','🎱','🎰','🃏','🀄','🎴','🧩','🪀','🪁','🃏','🎳','🪃']],
  ['Tecnologia', ['📱','📲','💻','⌨️','🖥️','🖨️','🖱️','🖲️','💽','💾','💿','📀','📡','🔋','🪫','🔌','💡','🔦','🕯️','🪔','📣','📢','🔔','🔕','📯','📶','🛰️','📷','📸','📹','🎥','📞','☎️','📟','📠','📺','📻']],
  ['Escritório & educação', ['📝','📋','📁','📂','🗂️','📊','📈','📉','📌','📍','✂️','🗃️','🗄️','🗑️','📇','📃','📄','📑','🗒️','🗓️','📅','📆','📎','🖇️','📏','📐','✏️','🖊️','🖋️','🖌️','📓','📔','📒','📕','📗','📘','📙','📚','📖','🔖','🏷️','📧','📨','📩','📤','📥','📦','📫','📪','📬','📭','📮','🗳️','✉️','💼']],
  ['Dinheiro & negócios', ['💰','💴','💵','💶','💷','💸','💳','🪙','💹','💱','💲','🏧','🧾','💎','🔐','🔑','🗝️','🔒','🔓','🔏','📛','🔰','🏆','🥇','🎯','🚀','📣','📢']],
  ['Ferramentas & ciência', ['🔧','🔨','⚒️','🛠️','⛏️','🪚','🔩','⚙️','🗜️','⚖️','🔗','⛓️','🪝','🧲','🪜','🪤','🔫','💣','🪓','🔪','🗡️','⚔️','🛡️','🩺','🩻','💊','💉','🩹','🩼','🧬','🔬','🔭','🧪','🧫','🌡️','🧭']],
  ['Objetos do lar', ['🚪','🪞','🪟','🛋️','🪑','🛏️','🛁','🚿','🪠','🧴','🧹','🧺','🧻','🪣','🧼','🧽','🧯','🛒','🪤','💈','🪄','🏺','⚰️','🪦','⚱️','🗿','🛒','🧳','🎒','👜','👝','👛']],
  ['Símbolos', ['✅','❌','❓','❗','⭕','🚫','⛔','🔞','♾️','©️','®️','™️','♻️','🔱','📛','🔰','💤','🔃','🔄','🔙','🔚','🔛','🔜','🔝','🆗','🆕','🆙','🆒','🆓','🆖','🆔','🆘','🆎','🆑','🅰️','🅱️','🅾️','✔️','❎','❔','❕','🔅','🔆','📶','📳','📴','📵','➕','➖','➗','✖️','💲','💱','↗️','➡️','↘️','⬇️','↙️','⬅️','↖️','⬆️','↕️','↔️','↩️','↪️','⤴️','⤵️','🔼','🔽','⏩','⏫','⏪','⏬','▶️','⏸️','⏹️','⏺️','⏏️','🎦','🔴','🟠','🟡','🟢','🔵','🟣','🟤','⚫','⚪','🔶','🔷','🔸','🔹','🔺','🔻','💠','🔘','🔲','🔳','⬛','⬜','🟥','🟧','🟨','🟩','🟦','🟪','🟫','▪️','▫️','◾','◽','◼️','◻️']],
  ['Números & letras', ['0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟','#️⃣','*️⃣','🔠','🔡','🔢','🔣','🔤']],
  ['Relógios & tempo', ['🕐','🕑','🕒','🕓','🕔','🕕','🕖','🕗','🕘','🕙','🕚','🕛','🕜','🕝','🕞','🕟','🕠','🕡','🕢','🕣','🕤','🕥','🕦','🕧','⌛','⏳','⏰','⏱️','⏲️','🕰️']],
  ['Signos & religião', ['♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','⛎','✝️','☦️','🕉️','☪️','☮️','✡️','🔯','🪯','☯️','☸️','🪬','🧿','📿','🛐','⛎']],
  ['Bandeiras', ['🏳️','🏴','🚩','🏁','🏳️‍🌈','🏳️‍⚧️','🏴‍☠️','🇦🇨','🇦🇩','🇦🇪','🇦🇫','🇦🇬','🇦🇮','🇦🇱','🇦🇲','🇦🇴','🇦🇶','🇦🇷','🇦🇸','🇦🇹','🇦🇺','🇦🇼','🇦🇽','🇦🇿','🇧🇦','🇧🇧','🇧🇩','🇧🇪','🇧🇫','🇧🇬','🇧🇭','🇧🇮','🇧🇯','🇧🇱','🇧🇲','🇧🇳','🇧🇴','🇧🇶','🇧🇷','🇧🇸','🇧🇹','🇧🇻','🇧🇼','🇧🇾','🇧🇿','🇨🇦','🇨🇨','🇨🇩','🇨🇫','🇨🇬','🇨🇭','🇨🇮','🇨🇰','🇨🇱','🇨🇲','🇨🇳','🇨🇴','🇨🇵','🇨🇷','🇨🇺','🇨🇻','🇨🇼','🇨🇽','🇨🇾','🇨🇿','🇩🇪','🇩🇬','🇩🇯','🇩🇰','🇩🇲','🇩🇴','🇩🇿','🇪🇦','🇪🇨','🇪🇪','🇪🇬','🇪🇭','🇪🇷','🇪🇸','🇪🇹','🇪🇺','🇫🇮','🇫🇯','🇫🇰','🇫🇲','🇫🇴','🇫🇷','🇬🇦','🇬🇧','🇬🇩','🇬🇪','🇬🇫','🇬🇬','🇬🇭','🇬🇮','🇬🇱','🇬🇲','🇬🇳','🇬🇵','🇬🇶','🇬🇷','🇬🇸','🇬🇹','🇬🇺','🇬🇼','🇬🇾','🇭🇰','🇭🇲','🇭🇳','🇭🇷','🇭🇹','🇭🇺','🇮🇨','🇮🇩','🇮🇪','🇮🇱','🇮🇲','🇮🇳','🇮🇴','🇮🇶','🇮🇷','🇮🇸','🇮🇹','🇯🇪','🇯🇲','🇯🇴','🇯🇵','🇰🇪','🇰🇬','🇰🇭','🇰🇮','🇰🇲','🇰🇳','🇰🇵','🇰🇷','🇰🇼','🇰🇾','🇰🇿','🇱🇦','🇱🇧','🇱🇨','🇱🇮','🇱🇰','🇱🇷','🇱🇸','🇱🇹','🇱🇺','🇱🇻','🇱🇾','🇲🇦','🇲🇨','🇲🇩','🇲🇪','🇲🇫','🇲🇬','🇲🇭','🇲🇰','🇲🇱','🇲🇲','🇲🇳','🇲🇴','🇲🇵','🇲🇶','🇲🇷','🇲🇸','🇲🇹','🇲🇺','🇲🇻','🇲🇼','🇲🇽','🇲🇾','🇲🇿','🇳🇦','🇳🇨','🇳🇪','🇳🇫','🇳🇬','🇳🇮','🇳🇱','🇳🇴','🇳🇵','🇳🇷','🇳🇺','🇳🇿','🇴🇲','🇵🇦','🇵🇪','🇵🇫','🇵🇬','🇵🇭','🇵🇰','🇵🇱','🇵🇲','🇵🇳','🇵🇷','🇵🇸','🇵🇹','🇵🇼','🇵🇾','🇶🇦','🇷🇪','🇷🇴','🇷🇸','🇷🇺','🇷🇼','🇸🇦','🇸🇧','🇸🇨','🇸🇩','🇸🇪','🇸🇬','🇸🇭','🇸🇮','🇸🇯','🇸🇰','🇸🇱','🇸🇲','🇸🇳','🇸🇴','🇸🇷','🇸🇸','🇸🇹','🇸🇻','🇸🇽','🇸🇾','🇸🇿','🇹🇦','🇹🇨','🇹🇩','🇹🇫','🇹🇬','🇹🇭','🇹🇯','🇹🇰','🇹🇱','🇹🇲','🇹🇳','🇹🇴','🇹🇷','🇹🇹','🇹🇻','🇹🇼','🇹🇿','🇺🇦','🇺🇬','🇺🇲','🇺🇳','🇺🇸','🇺🇾','🇺🇿','🇻🇦','🇻🇨','🇻🇪','🇻🇬','🇻🇮','🇻🇳','🇻🇺','🇼🇫','🇼🇸','🇽🇰','🇾🇪','🇾🇹','🇿🇦','🇿🇲','🇿🇼','🏴󠁧󠁢󠁥󠁮󠁧󠁿','🏴󠁧󠁢󠁳󠁣󠁴󠁿','🏴󠁧󠁢󠁷󠁬󠁳󠁿']],
]

export default function PostCard({ postId, clientId, clientName, clientColor, month, year, postNumber, initialDate, onClose, onSaved, onDeleted }: Props) {
  const supabase = createClient()
  const { toast } = useToast()
  const { currentMember, members } = useUser()
  const [loading,      setLoading]      = useState(!!postId)
  const [deleting,     setDeleting]     = useState(false)
  const [confirmDelete,setConfirmDelete]= useState(false)
  const [uploadingRef, setUploadingRef] = useState(false)
  const [currentId,    setCurrentId]    = useState<string | undefined>(postId)
  const [campaigns,    setCampaigns]    = useState<{ id: string; name: string; type: string }[]>([])
  const [editingField, setEditingField] = useState<TextField | null>(null)
  const [justSaved,    setJustSaved]    = useState(false)
  const [linkCopied,   setLinkCopied]   = useState(false)
  const [activityKey,  setActivityKey]  = useState(0)
  const [comments,     setComments]     = useState<Comment[]>([])
  const [newComment,   setNewComment]   = useState('')
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editCommentText,  setEditCommentText]  = useState('')
  const [mentionOpen,      setMentionOpen]      = useState(false)
  const [mentionQuery,     setMentionQuery]      = useState('')
  const [mentionPos,       setMentionPos]        = useState<{ top: number; left: number; width: number } | null>(null)
  const commentTextareaRef = useRef<HTMLTextAreaElement>(null)
  const [activities,   setActivities]   = useState<{ id: string; action: string; actor_name: string | null; description: string; created_at: string }[]>([])
  const [createdAt,    setCreatedAt]    = useState<string | null>(null)
  const [showDetails,  setShowDetails]  = useState(false)
  // No mobile as duas colunas (conteúdo/comentários) viram abas — trocar em vez de empilhar (padrão Trello)
  const [mobilePane, setMobilePane] = useState<'details' | 'comments'>('details')
  const [emojiOpen,    setEmojiOpen]    = useState<TextField | null>(null)
  const [clientList,   setClientList]   = useState<{ id: string; name: string; color_hex: string }[]>([])
  const [moveOpen,     setMoveOpen]     = useState(false)
  const [moveMonth,    setMoveMonth]    = useState(month)
  const [moveYear,     setMoveYear]     = useState(year)
  const refInputRef = useRef<HTMLInputElement>(null)

  const [form,           setForm]           = useState<PostForm>(() => postId ? EMPTY : { ...EMPTY, scheduled_date: initialDate || '' })
  const [approvalStatus, setApprovalStatus] = useState<string>('')
  const [assignedMembers, setAssignedMembers] = useState<string[]>([])
  const [labels,          setLabels]          = useState<{ text: string; color: string }[]>([])
  const [showLabelPicker, setShowLabelPicker] = useState(false)
  const [globalLabels,    setGlobalLabels]    = useState<any[]>([])
  const [labelDraft,      setLabelDraft]      = useState({ text: '', color: '#3B82F6' })
  const [editingLabel,    setEditingLabel]    = useState<any>(null)
  const formRef = useRef(form); formRef.current = form
  const [showCal,  setShowCal]  = useState(false)
  const [calMonth, setCalMonth] = useState(() => ({ y: year, m: month - 1 }))
  const [calPos,   setCalPos]   = useState<{ top: number, left: number } | null>(null)
  const [dateText,  setDateText] = useState('')
  const dateBtnRef = useRef<HTMLButtonElement>(null)

  const isNew = !postId
  const savedTimer      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mentionTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const linkCopiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const discardRef = useRef(false)
  const editOriginal = useRef('')
  const backdropDown = useRef(false)
  const editTextareaRef = useRef<HTMLTextAreaElement>(null)

  // Não entra em modo de edição se o clique foi pra soltar uma seleção de texto (copiar)
  function selectionGuardClick(field: TextField, e: React.MouseEvent<HTMLElement>) {
    const sel = window.getSelection()
    if (sel && sel.toString().length > 0) return
    startEdit(field)
  }

  // Envolve a seleção do textarea com um marcador (** ou *)
  function wrapSelection(field: TextField, marker: string) {
    const ta = editTextareaRef.current
    if (!ta) return
    const start = ta.selectionStart, end = ta.selectionEnd
    const val = String(formRef.current[field] || '')
    const sel = val.slice(start, end) || 'texto'
    const next = val.slice(0, start) + marker + sel + marker + val.slice(end)
    setForm(f => ({ ...f, [field]: next }))
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(start + marker.length, start + marker.length + sel.length)
    })
  }

  // Insere emoji na posição do cursor e fecha o painel
  function insertEmoji(field: TextField, emoji: string) {
    const ta = editTextareaRef.current
    if (!ta) return
    const start = ta.selectionStart, end = ta.selectionEnd
    const val = String(formRef.current[field] || '')
    const next = val.slice(0, start) + emoji + val.slice(end)
    setForm(f => ({ ...f, [field]: next }))
    setEmojiOpen(null)
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(start + emoji.length, start + emoji.length) })
  }

  // Prefixa a linha atual com "- " (bullet)
  function toggleBullet(field: TextField) {
    const ta = editTextareaRef.current
    if (!ta) return
    const val = String(formRef.current[field] || '')
    const pos = ta.selectionStart
    const lineStart = val.lastIndexOf('\n', pos - 1) + 1
    const next = val.slice(0, lineStart) + '- ' + val.slice(lineStart)
    setForm(f => ({ ...f, [field]: next }))
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(pos + 2, pos + 2) })
  }


  useEffect(() => {
    const main = document.querySelector('main') as HTMLElement | null
    const prev = main?.style.overflow ?? ''
    if (main) main.style.overflow = 'hidden'
    return () => { if (main) main.style.overflow = prev }
  }, [])

  useEffect(() => {
    supabase.from('campaigns').select('id, name, type').eq('client_id', clientId).then(({ data }) => setCampaigns(data || []))
  }, [clientId])

  useEffect(() => {
    supabase.from('clients').select('id, name, color_hex').eq('status', 'active').order('name').then(({ data }) => setClientList(data || []))
  }, [])

  useEffect(() => {
    supabase.from('labels').select('*').order('created_at', { ascending: true })
      .then(({ data }) => { if (data) setGlobalLabels(data) })
  }, [])

  useEffect(() => {
    if (!postId) return
    async function load() {
      const { data } = await supabase.from('schedules').select('*').eq('id', postId).single()
      if (data) {
        setForm({
          title: data.title || '', briefing: data.briefing || '', copy: data.copy || '', legenda: data.legenda || '',
          post_type: data.post_type || 'carrossel', scheduled_date: data.scheduled_date || '', status: data.status || 'producao',
          drive_url: data.drive_url || '', drive_folder_url: data.drive_folder_url || '', reference_notes: data.reference_notes || '',
          funil: data.funil || '', campaign_type: data.campaign_type || '',
          reference_images: Array.isArray(data.reference_images) ? data.reference_images : [],
        })
        setApprovalStatus(data.approval_status || '')
        setAssignedMembers(Array.isArray(data.assigned_members) ? data.assigned_members : [])
        setLabels(Array.isArray(data.labels) ? data.labels : [])
        setCreatedAt(data.created_at || null)
      }
      setLoading(false)
    }
    load()
  }, [postId])

  useEffect(() => {
    if (!currentId) return
    supabase.from('schedule_comments').select('id, author_name, body, created_at').eq('schedule_id', currentId).order('created_at', { ascending: true })
      .then(({ data }) => { if (data) setComments(data) })
  }, [currentId])

  useEffect(() => {
    if (!currentId) { setActivities([]); return }
    supabase.from('activity_log').select('id, action, actor_name, description, created_at')
      .eq('table_name', 'schedules').eq('record_id', currentId).order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error('activity_log fetch error (schedules):', error)
        setActivities(data || [])
      })
  }, [currentId, activityKey])

  useEffect(() => () => {
    if (savedTimer.current) clearTimeout(savedTimer.current)
    if (mentionTimer.current) clearTimeout(mentionTimer.current)
    if (linkCopiedTimer.current) clearTimeout(linkCopiedTimer.current)
  }, [])

  function flashSaved() {
    setJustSaved(true)
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setJustSaved(false), 1600)
  }

  async function ensurePostId(): Promise<string | undefined> {
    if (currentId) return currentId
    const f = formRef.current
    const { data, error } = await supabase.from('schedules').insert({
      client_id: clientId, month, year, post_number: postNumber,
      title: f.title.trim() || 'Sem título', briefing: f.briefing, copy: f.copy, legenda: f.legenda,
      post_type: f.post_type, status: f.status, scheduled_date: f.scheduled_date || null,
      drive_url: f.drive_url, drive_folder_url: f.drive_folder_url || null, reference_notes: f.reference_notes, funil: f.funil,
      campaign_type: f.campaign_type || null, reference_images: f.reference_images, labels,
    }).select().single()
    if (dbError(error, toast, 'criar post')) return undefined
    if (data) {
      setCurrentId(data.id)
      ensureWatching('schedules', data.id, [currentMember?.id])
      await logActivity({ tableName: 'schedules', recordId: data.id, clientId, action: 'created', actorName: currentMember?.name, actorId: currentMember?.id, description: `${currentMember?.name || 'Alguém'} criou "${f.title.trim() || 'Sem título'}"` })
      setActivityKey(k => k + 1); flashSaved(); onSaved()
      return data.id
    }
    return undefined
  }

  async function persist(patch: Record<string, any>, logMsg?: string, action = 'updated'): Promise<string | undefined> {
    const hadId = !!currentId
    const pid = await ensurePostId()
    if (!pid) return undefined
    const dbPatch: Record<string, any> = { ...patch }
    if ('scheduled_date' in dbPatch) dbPatch.scheduled_date = dbPatch.scheduled_date || null
    if ('campaign_type' in dbPatch) dbPatch.campaign_type = dbPatch.campaign_type || null
    const { error } = await supabase.from('schedules').update(dbPatch).eq('id', pid)
    if (dbError(error, toast, 'salvar')) return undefined
    if (hadId) flashSaved()
    if (logMsg) {
      await logActivity({ tableName: 'schedules', recordId: pid, clientId, action, actorName: currentMember?.name, actorId: currentMember?.id, description: logMsg })
      setActivityKey(k => k + 1)
    }
    onSaved()
    return pid
  }

  const who = currentMember?.name || 'Alguém'
  const FIELD_LABEL: Record<TextField, string> = { title: 'o título', briefing: 'o briefing', copy: 'a copy', legenda: 'a legenda', reference_notes: 'as referências', drive_url: 'o link do Drive', drive_folder_url: 'a pasta do carrossel' }

  async function commitText(field: TextField) {
    setEditingField(null)
    const v = formRef.current[field]
    if (v === editOriginal.current) return  // nada mudou → não salva/registra
    const pid = await persist({ [field]: v }, `${who} editou ${FIELD_LABEL[field]}`)
    if (field === 'copy' && pid) {
      const summary = await generateAiSummary(v, formRef.current.title)
      if (summary != null) await supabase.from('schedules').update({ ai_summary: summary }).eq('id', pid)
    }
  }
  function startEdit(field: TextField) { editOriginal.current = String(formRef.current[field] || ''); setEditingField(field) }
  function discardEdit(field: TextField) { discardRef.current = true; setForm(f => ({ ...f, [field]: editOriginal.current })); setEditingField(null) }
  function blurCommit(field: TextField) { if (discardRef.current) { discardRef.current = false; return } commitText(field) }
  function changeType(v: string) {
    const label = POST_TYPES.find(t => t.value === v)?.label || v
    setForm(f => ({ ...f, post_type: v })); persist({ post_type: v }, `${who} definiu o tipo: ${label}`)
  }
  function changeStatus(v: string) {
    const old = STATUS_LABEL[formRef.current.status] || formRef.current.status
    // Sair de "Ajuste solicitado" por QUALQUER caminho limpa o approval_status (o alerta
    // vermelho some) mas mantém approval_comment — o card mostra "✓ Ajuste aplicado" em
    // vez do pedido original, sem perder o histórico do que foi pedido.
    const clearRejection = formRef.current.status === 'ajuste' && v !== 'ajuste'
    setForm(f => ({ ...f, status: v }))
    if (clearRejection) setApprovalStatus('')
    persist(clearRejection ? { status: v, approval_status: null } : { status: v }, `${who} moveu de "${old}" para "${STATUS_LABEL[v] || v}"`, 'status_changed')
  }
  function setField(field: keyof PostForm, v: any, logMsg?: string) { setForm(f => ({ ...f, [field]: v })); persist({ [field]: v }, logMsg) }
  function toggleMember(id: string) {
    const adding = !assignedMembers.includes(id)
    const next = adding ? [...assignedMembers, id] : assignedMembers.filter(x => x !== id)
    setAssignedMembers(next)
    const memberName = members.find(m => m.id === id)?.name || ''
    if (adding && currentId) ensureWatching('schedules', currentId, [id])
    const logMsg = adding
      ? `${who} adicionou ${memberName} ao post "${formRef.current.title || 'sem título'}"`
      : `${who} removeu ${memberName} do post "${formRef.current.title || 'sem título'}"`
    persist({ assigned_members: next }, logMsg, adding ? 'member_assigned' : 'updated')
  }

  async function createGlobalLabel(text: string, color: string) {
    const { data } = await supabase.from('labels').insert({ text, color }).select().single()
    if (data) setGlobalLabels(g => [...g, data]); return data
  }
  async function updateGlobalLabel(labelId: string, text: string, color: string) {
    const old = globalLabels.find(g => g.id === labelId)
    await supabase.from('labels').update({ text, color }).eq('id', labelId)
    setGlobalLabels(g => g.map(x => x.id === labelId ? { ...x, text, color } : x))
    if (old) setLabels(ls => ls.map(l => (l.text === old.text && l.color === old.color) ? { text, color } : l))
    setEditingLabel(null)
  }
  async function deleteGlobalLabel(labelId: string) {
    const old = globalLabels.find(g => g.id === labelId)
    await supabase.from('labels').delete().eq('id', labelId)
    setGlobalLabels(g => g.filter(x => x.id !== labelId))
    if (old) setLabels(ls => ls.filter(l => !(l.text === old.text && l.color === old.color)))
    setEditingLabel(null)
  }

  async function addComment() {
    const body = newComment.trim(); if (!body) return
    const pid = await ensurePostId(); if (!pid) { toast('Adicione um título primeiro'); return }
    const { data, error } = await supabase.from('schedule_comments').insert({ schedule_id: pid, author_name: currentMember?.name || null, body }).select().single()
    if (dbError(error, toast, 'comentar')) return
    if (data) setComments(c => [...c, data])
    setNewComment('')
    requestAnimationFrame(() => { if (commentTextareaRef.current) autoGrow(commentTextareaRef.current) })
    await logActivity({ tableName: 'schedules', recordId: pid, clientId, action: 'commented', actorName: currentMember?.name, actorId: currentMember?.id, description: `${currentMember?.name || 'Alguém'} comentou` })
    setActivityKey(k => k + 1)
  }

  function insertMention(member: { name: string }) {
    const ta = commentTextareaRef.current
    const pos = ta?.selectionStart ?? newComment.length
    const before = newComment.slice(0, pos)
    const after  = newComment.slice(pos)
    const match  = before.match(/@\w*$/)
    const start  = match ? pos - match[0].length : pos
    const firstName = member.name.split(' ')[0]
    const inserted = newComment.slice(0, start) + `@${firstName} ` + after
    setNewComment(inserted)
    setMentionOpen(false)
    requestAnimationFrame(() => {
      ta?.focus()
      const p = start + firstName.length + 2
      ta?.setSelectionRange(p, p)
    })
  }

  async function saveEditComment(cid: string) {
    const body = editCommentText.trim()
    if (!body) { setEditingCommentId(null); return }
    const { error } = await supabase.from('schedule_comments').update({ body }).eq('id', cid)
    if (dbError(error, toast, 'editar comentário')) return
    setComments(c => c.map(x => x.id === cid ? { ...x, body } : x))
    setEditingCommentId(null)
  }

  async function deleteComment(cid: string) {
    const prev = comments
    setComments(c => c.filter(x => x.id !== cid))
    const { error } = await supabase.from('schedule_comments').delete().eq('id', cid)
    if (error) { setComments(prev); dbError(error, toast, 'excluir comentário') }
  }

  async function uploadImageFile(file: File) {
    setUploadingRef(true)
    const pid = await ensurePostId()
    if (!pid) { toast('Adicione um título antes de subir imagens'); setUploadingRef(false); return }
    const safeName = file.name.normalize('NFD').replace(/[^a-zA-Z0-9._-]/g, '_') || `img_${Date.now()}.png`
    const path = `posts/${pid}/${Date.now()}_${safeName}`
    const { error } = await supabase.storage.from('bagano-materiais').upload(path, file, { upsert: false })
    if (error) { toast('Erro no upload: ' + error.message); setUploadingRef(false); return }
    const { data: { publicUrl } } = supabase.storage.from('bagano-materiais').getPublicUrl(path)
    const newImages = [...formRef.current.reference_images, publicUrl]
    setForm(f => ({ ...f, reference_images: newImages }))
    await supabase.from('schedules').update({ reference_images: newImages }).eq('id', pid)
    await logActivity({ tableName: 'schedules', recordId: pid, clientId, action: 'updated', actorName: currentMember?.name, actorId: currentMember?.id, description: `${who} anexou uma imagem de referência` })
    setActivityKey(k => k + 1)
    flashSaved(); setUploadingRef(false)
  }
  async function handleRefImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    await uploadImageFile(file)
    if (refInputRef.current) refInputRef.current.value = ''
  }
  async function handlePaste(e: React.ClipboardEvent) {
    const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'))
    if (!item) return
    const file = item.getAsFile(); if (!file) return
    e.preventDefault(); await uploadImageFile(file)
  }

  async function removeRefImage(url: string) {
    const newImages = formRef.current.reference_images.filter(u => u !== url)
    setForm(f => ({ ...f, reference_images: newImages }))
    if (currentId) {
      await supabase.from('schedules').update({ reference_images: newImages }).eq('id', currentId)
      await logActivity({ tableName: 'schedules', recordId: currentId, clientId, action: 'updated', actorName: currentMember?.name, actorId: currentMember?.id, description: `${who} removeu uma imagem de referência` })
      setActivityKey(k => k + 1)
    }
    const path = url.split('/bagano-materiais/')[1]
    if (path) supabase.storage.from('bagano-materiais').remove([path])
  }

  async function handleDelete() {
    if (!postId) return
    setDeleting(true)
    try { await moveToTrash('post', postId, form.title || 'Post sem título', currentMember?.name) }
    catch (err) { toast('Erro na lixeira: ' + (err instanceof Error ? err.message : String(err))); setDeleting(false); return }
    await supabase.from('schedules').delete().eq('id', postId)
    setDeleting(false); if (onDeleted) onDeleted(); onClose()
  }

  async function duplicatePost() {
    const pid = await ensurePostId(); if (!pid) { toast('Adicione um título primeiro'); return }
    const f = formRef.current
    const { count } = await supabase.from('schedules').select('id', { count: 'exact', head: true }).eq('client_id', clientId).eq('month', month).eq('year', year)
    const { data, error } = await supabase.from('schedules').insert({
      client_id: clientId, month, year, post_number: (count || 0) + 1,
      title: (f.title || 'Post') + ' (cópia)', briefing: f.briefing, copy: f.copy, legenda: f.legenda,
      post_type: f.post_type, status: 'estrategia', scheduled_date: null, drive_url: f.drive_url, drive_folder_url: f.drive_folder_url || null,
      reference_notes: f.reference_notes, funil: f.funil, campaign_type: f.campaign_type || null, reference_images: f.reference_images, labels,
    }).select().single()
    if (dbError(error, toast, 'duplicar')) return
    if (data) await logActivity({ tableName: 'schedules', recordId: data.id, clientId, action: 'created', actorName: currentMember?.name, actorId: currentMember?.id, description: `${who} duplicou de "${f.title}"` })
    toast('Post duplicado!'); onSaved(); onClose()
  }

  async function moveToClientId(newClientId: string) {
    const pid = await ensurePostId(); if (!pid) return
    const { error } = await supabase.from('schedules').update({ client_id: newClientId, campaign_type: null }).eq('id', pid)
    if (dbError(error, toast, 'mover')) return
    const name = clientList.find(c => c.id === newClientId)?.name
    await logActivity({ tableName: 'schedules', recordId: pid, clientId, action: 'updated', actorName: currentMember?.name, actorId: currentMember?.id, description: `Movido para o cliente ${name || ''}` })
    toast('Post movido de cliente'); onSaved(); onClose()
  }

  async function moveToMonth() {
    const pid = await ensurePostId(); if (!pid) return
    if (moveMonth === month && moveYear === year) { setMoveOpen(false); return }
    const { error } = await supabase.from('schedules').update({ month: moveMonth, year: moveYear }).eq('id', pid)
    if (dbError(error, toast, 'mover')) return
    await logActivity({ tableName: 'schedules', recordId: pid, clientId, action: 'updated', actorName: currentMember?.name, actorId: currentMember?.id, description: `Movido para ${MESES[moveMonth - 1]} ${moveYear}` })
    toast('Post movido de mês'); onSaved(); onClose()
  }

  const typeObj   = POST_TYPES.find(t => t.value === form.post_type) || POST_TYPES[0]
  const statusObj = STATUSES.find(s => s.value === form.status) || STATUSES[0]
  const refLinks  = form.reference_notes.match(/https?:\/\/[^\s]+/g) || []

  // Feed unificado (comentários + atividade), como no Trello
  type FeedItem =
    | { kind: 'comment'; id: string; cid: string; at: string; author: string | null; body: string }
    | { kind: 'activity'; id: string; at: string; action: string; author: string | null; body: string }
  const feed: FeedItem[] = [
    ...comments.map(c => ({ kind: 'comment' as const, id: 'c' + c.id, cid: c.id, at: c.created_at, author: c.author_name, body: c.body })),
    ...activities.map(a => ({ kind: 'activity' as const, id: 'a' + a.id, at: a.created_at, action: a.action, author: a.actor_name, body: a.description })),
    // Garante uma entrada de criação mesmo em posts antigos (que não logavam)
    ...(createdAt && !activities.some(a => a.action === 'created')
      ? [{ kind: 'activity' as const, id: '__created__', at: createdAt, action: 'created', author: null, body: 'Card criado' }]
      : []),
  ].sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime())
  const visibleFeed = showDetails ? feed : feed.filter(f => f.kind === 'comment')

  const dueDateLabel = (() => {
    if (!form.scheduled_date) return null
    const now = new Date()
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const [fy, fm, fd] = form.scheduled_date.split('-').map(Number)
    const schedMidnight = new Date(fy, fm - 1, fd)
    const diff = Math.round((schedMidnight.getTime() - todayMidnight.getTime()) / 86400000)
    const color = diff < 0 ? '#EF4444' : diff <= 2 ? '#F59E0B' : 'var(--color-text-secondary)'
    const suffix = diff < 0 ? ' · atrasado' : diff === 0 ? ' · hoje' : diff === 1 ? ' · amanhã' : ''
    return { text: new Date(form.scheduled_date + 'T12:00:00').toLocaleDateString('pt-BR', { day:'2-digit', month:'short' }) + suffix, color }
  })()

  if (loading) return (
    <ModalPortal>
      <div className="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center">
        <div className="bg-[var(--color-bg-card)] rounded-2xl px-6 py-4 text-sm text-[var(--color-text-muted)]">Carregando…</div>
      </div>
    </ModalPortal>
  )

  const fieldEditCls = 'w-full bg-[var(--color-bg-card)] border border-[var(--color-accent)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none resize-none leading-relaxed'
  const fieldViewCls = 'cursor-text text-sm text-[var(--color-text-primary)] leading-relaxed whitespace-pre-line rounded-lg hover:bg-[var(--color-bg-subtle)] -mx-2 px-2 py-1.5 transition-colors'
  const mdViewCls   = 'cursor-text text-sm text-[var(--color-text-primary)] leading-relaxed rounded-lg hover:bg-[var(--color-bg-subtle)] -mx-2 px-2 py-1.5 transition-colors md-content'

  // Campo de texto editável (click-to-edit + autosave)
  function textField(field: TextField, label: string, hint: string, placeholder: string, minH = 60) {
    return (
      <div>
        <div className="flex items-baseline gap-2 mb-1.5">
          <span className="text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">{label}</span>
          <span className="text-[10px] text-[var(--color-text-faint)]">{hint}</span>
        </div>
        {editingField === field ? (
          <div>
            <div className="flex items-center gap-1 mb-1.5 relative">
              <button onMouseDown={e => { e.preventDefault(); wrapSelection(field, '**') }} title="Negrito"
                className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] transition-colors"><Bold size={13} /></button>
              <button onMouseDown={e => { e.preventDefault(); wrapSelection(field, '*') }} title="Itálico"
                className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] transition-colors"><Italic size={13} /></button>
              <button onMouseDown={e => { e.preventDefault(); toggleBullet(field) }} title="Lista (bullet)"
                className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] transition-colors"><List size={14} /></button>
              <button onMouseDown={e => { e.preventDefault(); setEmojiOpen(o => o === field ? null : field) }} title="Emoji"
                className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] transition-colors"><Smile size={14} /></button>
              <span className="text-[10px] text-[var(--color-text-faint)] ml-1">**negrito** · *itálico* · ou Ctrl+⌘+Espaço</span>
              {emojiOpen === field && (
                <>
                  <div className="fixed inset-0 z-[84]" onMouseDown={e => { e.preventDefault(); setEmojiOpen(null) }} />
                  <div className="absolute top-7 left-0 z-[85] bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl shadow-pop p-2 w-[300px] max-h-80 overflow-y-auto">
                    {EMOJI_GROUPS.map(([name, emojis]) => (
                      <div key={name} className="mb-2 last:mb-0">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--color-text-faint)] px-1 mb-1">{name}</p>
                        <div className="grid grid-cols-9 gap-0.5">
                          {emojis.map(em => (
                            <button key={em} onMouseDown={e => { e.preventDefault(); insertEmoji(field, em) }}
                              className="w-7 h-7 rounded-md hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-lg transition-colors">{em}</button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <textarea ref={el => { editTextareaRef.current = el; if (el) autoGrow(el, 9999) }} autoFocus value={form[field] as string}
              onChange={e => { setForm(f => ({ ...f, [field]: e.target.value })); autoGrow(e.currentTarget, 9999) }}
              onBlur={() => blurCommit(field)} onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); discardEdit(field) } }}
              placeholder={placeholder} className={fieldEditCls} style={{ minHeight: minH }} />
            <div className="flex items-center gap-2 mt-1.5">
              <button onMouseDown={e => { e.preventDefault(); commitText(field) }}
                className="text-xs font-semibold px-3 py-1 rounded-lg text-white" style={{ background: 'var(--color-accent)' }}>Salvar</button>
              <button onMouseDown={e => { e.preventDefault(); discardEdit(field) }}
                className="text-xs px-3 py-1 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] transition-colors">Descartar</button>
              <span className="text-[10px] text-[var(--color-text-faint)]">salva ao sair · Esc descarta</span>
            </div>
          </div>
        ) : (
          <div onClick={e => selectionGuardClick(field, e)} className={mdViewCls} style={{ minHeight: minH }}>
            {(form[field] as string)
              ? <div dangerouslySetInnerHTML={{ __html: renderMd(form[field] as string) }} />
              : <span className="text-[var(--color-text-faint)]">{placeholder}</span>}
          </div>
        )}
      </div>
    )
  }

  return (
    <ModalPortal>
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center md:py-4 md:px-4"
      onMouseDown={e => { backdropDown.current = e.target === e.currentTarget }}
      onMouseUp={e => { if (backdropDown.current && e.target === e.currentTarget) onClose(); backdropDown.current = false }}
      onPaste={handlePaste}>
      <div className="bg-[var(--color-bg-alt)] rounded-none md:rounded-2xl w-full h-full md:h-auto max-w-[1040px] max-h-full md:max-h-[92vh] flex flex-col shadow-pop overflow-hidden animate-scale-in" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>

        <div className="h-[3px] flex-shrink-0 md:rounded-t-2xl" style={{ background: clientColor || typeObj.color }} />

        {/* Abas Detalhes/Comentários — só no mobile (padrão Trello: alterna em vez de empilhar) */}
        <div className="md:hidden flex items-center border-b border-[var(--color-border)] bg-[var(--color-bg-card)] flex-shrink-0">
          <button onClick={() => setMobilePane('details')}
            className="flex-1 text-center py-2.5 text-sm font-semibold transition-colors relative"
            style={{ color: mobilePane === 'details' ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
            Detalhes
            {mobilePane === 'details' && <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full" style={{ background: clientColor || typeObj.color }} />}
          </button>
          <button onClick={() => setMobilePane('comments')}
            className="flex-1 text-center py-2.5 text-sm font-semibold transition-colors relative"
            style={{ color: mobilePane === 'comments' ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
            Comentários
            {mobilePane === 'comments' && <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full" style={{ background: clientColor || typeObj.color }} />}
          </button>
        </div>

        {/* CORPO — esquerda (header + props + conteúdo) | sidebar altura total (abas no mobile, lado a lado no desktop) */}
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden divide-y md:divide-y-0 md:divide-x divide-[var(--color-border)]">
        <div className={`${mobilePane === 'comments' ? 'hidden md:flex' : 'flex'} flex-1 min-w-0 flex-col overflow-hidden`}>

        {/* HEADER — título */}
        <div className="flex items-start justify-between gap-4 px-4 md:px-7 pt-4 pb-3 bg-[var(--color-bg-card)] border-b border-[var(--color-border)]">
          <div className="flex-1 min-w-0">
            {postNumber && <span className="text-[11px] font-black text-[var(--color-border-strong)]">#{postNumber}</span>}
            {editingField === 'title' ? (
              <input autoFocus value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                onBlur={() => blurCommit('title')} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); else if (e.key === 'Escape') { e.preventDefault(); discardEdit('title') } }}
                placeholder="Título do post…"
                className="w-full text-2xl font-bold text-[var(--color-text-primary)] bg-transparent outline-none placeholder:text-[var(--color-text-faint)] leading-tight" />
            ) : (
              <div onClick={e => selectionGuardClick('title', e)} className="cursor-text text-2xl font-bold text-[var(--color-text-primary)] leading-tight hover:opacity-80 transition-opacity">
                {form.title || <span className="text-[var(--color-text-faint)]">Título do post…</span>}
              </div>
            )}
            {clientName && (
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                em <span className="font-semibold" style={{ color: clientColor }}>{clientName}</span>
                <span className="mx-1.5 text-[var(--color-text-faint)]">·</span>{MESES[month - 1]} {year}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`flex items-center gap-1 text-[11px] font-medium text-[var(--ds-success-text)] transition-opacity ${justSaved ? 'opacity-100' : 'opacity-0'}`}>
              <Check size={12} /> salvo
            </span>
            {currentId && (
              <button
                onClick={() => {
                  const url = `${window.location.origin}/dashboard/cronograma?client=${clientId}&post=${currentId}&m=${month}&y=${year}`
                  navigator.clipboard.writeText(url)
                  setLinkCopied(true)
                  if (linkCopiedTimer.current) clearTimeout(linkCopiedTimer.current)
                  linkCopiedTimer.current = setTimeout(() => setLinkCopied(false), 2000)
                }}
                title="Copiar link do card"
                className="w-8 h-8 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center transition-colors"
                style={{ color: linkCopied ? 'var(--ds-success-text)' : 'var(--color-text-secondary)' }}>
                {linkCopied ? <Check size={14} /> : <Link2 size={14} />}
              </button>
            )}
            <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-secondary)] transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* PROPRIEDADES — grid de pills com label embutido (encaixe determinístico) */}
        <div className="px-4 md:px-7 py-2.5 bg-[var(--color-bg-card)] border-b border-[var(--color-border)] flex flex-col gap-1.5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-2">
          {/* Tipo */}
          <PropertyPill label="Tipo">
            <div className="relative min-w-0">
              <select value={form.post_type} onChange={e => changeType(e.target.value)}
                className={pillSelectCls} style={{ background: typeObj.color + '18', color: typeObj.color, borderColor: typeObj.color + '44' }}>
                {POST_TYPES.map(t => <option key={t.value} value={t.value} style={{ color: 'var(--color-text-primary)' }}>{t.label}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: typeObj.color }} />
            </div>
          </PropertyPill>
          {/* Status */}
          <PropertyPill label="Status">
            <div className="relative min-w-0">
              <select value={form.status} onChange={e => changeStatus(e.target.value)}
                className={pillSelectCls} style={{ background: statusObj.color + '18', color: statusObj.color, borderColor: statusObj.color + '44' }}>
                {STATUSES.map(s => <option key={s.value} value={s.value} style={{ color: 'var(--color-text-primary)' }}>{s.label}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: statusObj.color }} />
            </div>
          </PropertyPill>
          {/* Data */}
          <div className="relative min-w-0">
            <PropertyPill label="Data">
              <button ref={dateBtnRef} onClick={() => {
                  if (!showCal) {
                    const r = dateBtnRef.current?.getBoundingClientRect()
                    if (r) setCalPos({ top: r.bottom + 8, left: r.left })
                    setDateText(form.scheduled_date || '')
                  }
                  setShowCal(v => !v)
                }}
                className="w-full flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border border-[var(--color-border)] hover:border-[var(--color-border-hover)] transition-colors truncate"
                style={{ color: dueDateLabel ? dueDateLabel.color : 'var(--color-text-muted)' }}>
                <Calendar size={12} className="flex-shrink-0" /> <span className="truncate">{dueDateLabel ? dueDateLabel.text : 'Definir'}</span>
              </button>
            </PropertyPill>
            {showCal && calPos && (() => {
              const startWeekday = new Date(calMonth.y, calMonth.m, 1).getDay()
              const daysInMonth  = new Date(calMonth.y, calMonth.m + 1, 0).getDate()
              const cells: (number|null)[] = [...Array(startWeekday).fill(null), ...Array.from({length:daysInMonth},(_,i)=>i+1)]
              function pick(d: number) {
                const mm = String(calMonth.m+1).padStart(2,'0'), dd = String(d).padStart(2,'0')
                const s = `${calMonth.y}-${mm}-${dd}`
                setForm(f => ({ ...f, scheduled_date: s })); persist({ scheduled_date: s }, `${who} definiu a data para ${new Date(s + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}`); setShowCal(false)
              }
              function applyTyped() {
                const m = dateText.trim().match(/^(\d{4})-(\d{2})-(\d{2})$|^(\d{2})\/(\d{2})\/(\d{4})$/)
                if (!m) return
                const s = m[1] ? `${m[1]}-${m[2]}-${m[3]}` : `${m[6]}-${m[5]}-${m[4]}`
                if (Number.isNaN(new Date(s + 'T12:00:00').getTime())) return
                setForm(f => ({ ...f, scheduled_date: s })); persist({ scheduled_date: s }, `${who} definiu a data para ${new Date(s + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}`); setShowCal(false)
              }
              return (
                <ModalPortal>
                  <div className="fixed inset-0 z-[79]" onClick={() => setShowCal(false)} />
                  <div className="fixed z-[80] bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-4 w-72 shadow-pop"
                    style={{ top: calPos.top, left: calPos.left }}>
                    <div className="flex items-center gap-1.5 mb-3">
                      <input value={dateText} onChange={e => setDateText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyTyped() } }}
                        placeholder="dd/mm/aaaa"
                        className="flex-1 min-w-0 rounded-lg px-2.5 py-1.5 text-xs border border-[var(--color-border)] bg-transparent text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-hover)]" />
                      <button onClick={applyTyped} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg text-white flex-shrink-0" style={{ background: 'var(--color-accent)' }}>Ir</button>
                    </div>
                    <div className="flex items-center justify-between mb-3">
                      <button onClick={() => setCalMonth(c => c.m===0?{y:c.y-1,m:11}:{y:c.y,m:c.m-1})} className="w-7 h-7 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-secondary)]">‹</button>
                      <span className="text-sm font-semibold text-[var(--color-text-primary)] capitalize">{MESES[calMonth.m]} {calMonth.y}</span>
                      <button onClick={() => setCalMonth(c => c.m===11?{y:c.y+1,m:0}:{y:c.y,m:c.m+1})} className="w-7 h-7 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-secondary)]">›</button>
                    </div>
                    <div className="grid grid-cols-7 gap-1 mb-1">
                      {DIAS.map(d => <div key={d} className="text-center text-[10px] font-semibold text-[var(--color-text-muted)] py-1">{d}</div>)}
                    </div>
                    <div className="grid grid-cols-7 gap-1 mb-3">
                      {cells.map((d, i) => {
                        if (!d) return <div key={i} />
                        const mm=String(calMonth.m+1).padStart(2,'0'), dd=String(d).padStart(2,'0')
                        const s = `${calMonth.y}-${mm}-${dd}`
                        const isSel = form.scheduled_date === s
                        const today = new Date()
                        const isToday = today.getFullYear()===calMonth.y&&today.getMonth()===calMonth.m&&today.getDate()===d
                        return <button key={i} onClick={() => pick(d)}
                          className={`h-8 rounded-lg text-sm transition-colors ${isSel ? 'text-white font-semibold' : isToday ? 'ring-1 font-bold text-[var(--color-text-primary)]' : 'text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)]'}`}
                          style={isSel ? { background: clientColor || 'var(--color-brand)' } : {}}>{d}</button>
                      })}
                    </div>
                    {form.scheduled_date && (
                      <button onClick={() => { setForm(f=>({...f,scheduled_date:''})); persist({ scheduled_date: '' }, `${who} removeu a data`); setShowCal(false) }} className="w-full py-1.5 text-xs text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-bg-subtle)]">
                        Remover data
                      </button>
                    )}
                  </div>
                </ModalPortal>
              )
            })()}
          </div>
          {/* Funil */}
          <PropertyPill label="Funil">
            <div className="relative min-w-0">
              <select value={form.funil} onChange={e => setField('funil', e.target.value, e.target.value ? `${who} definiu o funil: ${e.target.value}` : `${who} removeu o funil`)}
                className={pillSelectCls + ' bg-[var(--color-bg-card)] border-[var(--color-border)]'} style={{ color: form.funil ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                <option value="">Funil</option>
                {FUNIL_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
            </div>
          </PropertyPill>
          {/* Campanha */}
          {campaigns.length > 0 && (
            <PropertyPill label="Campanha">
              <div className="relative min-w-0">
                <select value={form.campaign_type} onChange={e => { const nm = campaigns.find(c => c.type === e.target.value)?.name; setField('campaign_type', e.target.value, e.target.value ? `${who} definiu a campanha: ${nm || ''}` : `${who} removeu a campanha`) }}
                  className={pillSelectCls + ' bg-[var(--color-bg-card)] border-[var(--color-border)]'} style={{ color: form.campaign_type ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                  <option value="">Campanha</option>
                  {campaigns.map(c => <option key={c.type} value={c.type}>{c.name}</option>)}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
              </div>
            </PropertyPill>
          )}
          </div>
          {/* Linha 2 — grupos largos (chips) */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <Users size={12} className="text-[var(--color-text-muted)] flex-shrink-0" />
            <div className="flex flex-wrap gap-1 flex-1 min-w-0">
              {members.map(m => {
                const sel = assignedMembers.includes(m.id)
                return (
                  <button key={m.id} onClick={() => toggleMember(m.id)}
                    className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${sel ? 'bg-[var(--color-brand)] text-[var(--color-brand-fg)] border-transparent' : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)]'}`}>
                    {m.name.split(' ')[0]}
                  </button>
                )
              })}
            </div>
          </div>
          {/* Linha 3 — etiquetas */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <Tag size={12} className="text-[var(--color-text-muted)] flex-shrink-0" />
            <div className="flex flex-wrap gap-1.5 items-center min-w-0">
              {labels.map((l, i) => (
                <span key={i} className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md text-white" style={{ background: l.color }}>
                  {l.text}
                  <button onClick={() => {
                    const next = labels.filter((_, idx) => idx !== i)
                    setLabels(next)
                    persist({ labels: next }, `${who} removeu a etiqueta "${l.text}"`)
                  }}><X size={9} /></button>
                </span>
              ))}
              <button onClick={() => setShowLabelPicker(true)}
                className="text-[11px] px-2 py-0.5 rounded-full border border-dashed border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-border-strong)] transition-colors">
                + Etiqueta
              </button>
            </div>
          </div>
        </div>

        {showLabelPicker && (
          <ModalPortal>
            <div className="fixed inset-0 z-[80] flex items-center justify-center" onClick={() => setShowLabelPicker(false)}>
              <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-4 w-72 shadow-pop" onClick={e => e.stopPropagation()}>
                <p className="text-sm font-bold text-[var(--color-text-primary)] mb-3">Etiquetas</p>
                {globalLabels.length > 0 && (
                  <div className="flex flex-col gap-1.5 mb-3 max-h-52 overflow-y-auto">
                    {globalLabels.map(gl => {
                      const applied  = labels.some(l => l.text === gl.text && l.color === gl.color)
                      const isEditing = editingLabel?.id === gl.id
                      if (isEditing) return (
                        <div key={gl.id} className="border border-[var(--color-border)] rounded-lg p-2.5 bg-[var(--color-bg-alt)]">
                          <input value={editingLabel.text} onChange={e => setEditingLabel((d: any) => ({ ...d, text: e.target.value }))}
                            className="w-full border border-[var(--color-border)] rounded-lg px-2.5 py-1 text-sm outline-none focus:border-[var(--color-brand)] mb-2" />
                          <div className="flex flex-wrap gap-1 mb-2">
                            {LABEL_PALETTE.map(p => <button key={p.color} onClick={() => setEditingLabel((d: any) => ({ ...d, color: p.color }))}
                              className={`w-6 h-6 rounded ${editingLabel.color === p.color ? 'ring-2 ring-offset-1 ring-[var(--color-brand)]' : ''}`} style={{ background: p.color }} />)}
                          </div>
                          <div className="flex gap-1.5">
                            <button onClick={() => updateGlobalLabel(gl.id, editingLabel.text, editingLabel.color)} className="flex-1 py-1.5 text-xs font-medium bg-[var(--color-brand)] text-[var(--color-brand-fg)] rounded-lg">Salvar</button>
                            <button onClick={() => deleteGlobalLabel(gl.id)} className="px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors" style={{ borderColor: 'var(--ds-error-border)', color: 'var(--ds-error-text)' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--ds-error-bg)')} onMouseLeave={e => (e.currentTarget.style.background = '')}>Excluir</button>
                            <button onClick={() => setEditingLabel(null)} className="px-3 py-1.5 text-xs border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg">×</button>
                          </div>
                        </div>
                      )
                      return (
                        <div key={gl.id} className="flex items-center gap-1.5 group">
                          <button onClick={() => {
                            const next = applied
                              ? labels.filter(l => !(l.text === gl.text && l.color === gl.color))
                              : [...labels, { text: gl.text, color: gl.color }]
                            setLabels(next)
                            persist({ labels: next }, applied ? `${who} removeu a etiqueta "${gl.text}"` : `${who} adicionou a etiqueta "${gl.text}"`)
                          }}
                            className="flex-1 flex items-center gap-2 min-w-0">
                            <span className="flex-1 text-left text-[11px] font-bold uppercase tracking-wide px-2.5 py-1.5 rounded text-white truncate" style={{ background: gl.color }}>{gl.text}</span>
                            {applied && <Check size={14} className="text-[var(--color-text-primary)] flex-shrink-0" />}
                          </button>
                          <button onClick={() => setEditingLabel({ id: gl.id, text: gl.text, color: gl.color })}
                            className="w-7 h-7 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-text-muted)] flex-shrink-0">
                            <Pencil size={12} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
                <div className="border-t border-[var(--color-border)] pt-3">
                  <p className="text-xs text-[var(--color-text-muted)] mb-2">Criar nova</p>
                  <input value={labelDraft.text} onChange={e => setLabelDraft(d => ({ ...d, text: e.target.value }))} placeholder="Texto da etiqueta"
                    className="w-full border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[var(--color-brand)] mb-2" />
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {LABEL_PALETTE.map(p => <button key={p.color} onClick={() => setLabelDraft(d => ({ ...d, color: p.color }))}
                      className={`w-7 h-7 rounded-lg ${labelDraft.color === p.color ? 'ring-2 ring-offset-1 ring-[var(--color-brand)]' : ''}`} style={{ background: p.color }} />)}
                  </div>
                  <button onClick={async () => {
                    if (labelDraft.text.trim()) {
                      await createGlobalLabel(labelDraft.text, labelDraft.color)
                      const next = [...labels, { ...labelDraft }]
                      setLabels(next)
                      persist({ labels: next }, `${who} criou e aplicou a etiqueta "${labelDraft.text}"`)
                      setLabelDraft({ text: '', color: '#3B82F6' })
                    }
                  }}
                    className="w-full py-2 text-sm font-medium bg-[var(--color-brand)] text-[var(--color-brand-fg)] rounded-lg">Criar e aplicar</button>
                </div>
              </div>
            </div>
          </ModalPortal>
        )}

          {/* LEFT — campos + referências + entrega */}
          <div className="flex-1 min-w-0 flex flex-col overflow-y-auto px-4 md:px-7 py-5 gap-5">

            {textField('briefing', 'Briefing', '· instruções pro time (o que fazer)', 'O que precisa ser feito, direção criativa, referências de estilo…', 70)}
            {textField('copy', 'Copy', '· conceito / roteiro', 'Ideia central, roteiro do reels, texto das artes…', 70)}
            {textField('legenda', 'Legenda', '· o texto que vai no Instagram', 'A legenda final do post, com hashtags e CTA…', 70)}


            {/* Referências */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">Referências</span>
                  <span className="text-[10px] text-[var(--color-text-faint)]">· inspiração · cole imagens (Ctrl+V)</span>
                </div>
                <button onClick={() => refInputRef.current?.click()} disabled={uploadingRef}
                  className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors disabled:opacity-50">
                  <ImagePlus size={13} /> {uploadingRef ? 'Enviando…' : 'Imagem'}
                </button>
                <input ref={refInputRef} type="file" accept="image/*" className="hidden" onChange={handleRefImageUpload} />
              </div>
              {editingField === 'reference_notes' ? (
                <textarea autoFocus ref={el => { if (el) autoGrow(el, 9999) }} value={form.reference_notes}
                  onChange={e => { setForm(f => ({ ...f, reference_notes: e.target.value })); autoGrow(e.currentTarget, 9999) }}
                  onBlur={() => blurCommit('reference_notes')} onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); discardEdit('reference_notes') } }}
                  placeholder="Cole links de referência, observações…"
                  className={fieldEditCls} style={{ minHeight: 60 }} />
              ) : (
                <div onClick={e => selectionGuardClick('reference_notes', e)} className={fieldViewCls} style={{ minHeight: 40 }}>
                  {form.reference_notes || <span className="text-[var(--color-text-faint)]">Clique para adicionar links/observações…</span>}
                </div>
              )}
              {/* chips de link */}
              {refLinks.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {refLinks.map((url: string, i: number) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg pl-1.5 pr-2 py-1 text-[11px] font-medium text-[var(--color-text-secondary)] hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-primary)] transition-colors max-w-[200px]">
                      <img src={`https://www.google.com/s2/favicons?domain=${hostOf(url)}&sz=32`} alt="" className="w-3.5 h-3.5 rounded-sm flex-shrink-0" />
                      <span className="truncate">{hostOf(url)}</span>
                      <ExternalLink size={10} className="flex-shrink-0 opacity-60" />
                    </a>
                  ))}
                </div>
              )}
              {/* imagens */}
              {form.reference_images.length > 0 && (
                <div className="grid grid-cols-4 gap-2 mt-2.5">
                  {form.reference_images.map((url, i) => (
                    <div key={i} className="group relative aspect-square rounded-xl overflow-hidden border border-[var(--color-border)]">
                      <img src={url} alt={`Referência ${i + 1}`} className="w-full h-full object-cover" style={{ height: '100%' }} />
                      <button onClick={() => removeRefImage(url)} className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 rounded-full p-0.5">
                        <XCircle size={14} className="text-white" />
                      </button>
                      <a href={url} target="_blank" rel="noopener noreferrer" className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 flex items-end p-1.5">
                        <span className="text-[9px] text-white font-medium bg-black/40 rounded px-1">abrir</span>
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 📦 Entrega — padrão design system */}
            <DeliverySection
              value={form.drive_folder_url || form.drive_url}
              isVideo={form.post_type === 'reels'}
              onCommit={v => {
                if (/\/folders\//.test(v)) {
                  setForm(f => ({ ...f, drive_folder_url: v, drive_url: '' }))
                  persist({ drive_folder_url: v || null, drive_url: null }, `${who} editou o link do Drive`)
                } else {
                  setForm(f => ({ ...f, drive_url: v, drive_folder_url: '' }))
                  persist({ drive_url: v || null, drive_folder_url: null }, `${who} editou o link do Drive`)
                }
              }}
            />
          </div>
          </div>

          {/* RIGHT — comentários + atividade (feed único, tipo Trello) */}
          <div className={`${mobilePane === 'details' ? 'hidden md:flex' : 'flex'} w-full md:w-[380px] flex-1 md:flex-none bg-[var(--color-bg-card)] flex-col overflow-hidden`}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
              <span className="text-xs font-bold text-[var(--color-text-primary)]">Comentários e atividade</span>
              <div className="flex items-center gap-2">
                <WatchButton tableName="schedules" recordId={currentId} />
                <button onClick={() => setShowDetails(v => !v)} className="text-[11px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
                  {showDetails ? 'Ocultar detalhes' : 'Mostrar detalhes'}
                </button>
              </div>
            </div>

            {/* Campo de comentário — estilo Trello: avatar + caixa + botão "Comentar" abaixo */}
            <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 mt-0.5"
                style={{ background: (currentMember as any)?.color || 'var(--color-brand)' }}>
                {(currentMember?.name || '?').split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                {mentionOpen && mentionPos && (() => {
                  const filtered = members.filter(m => !mentionQuery || m.name.toLowerCase().startsWith(mentionQuery.toLowerCase())).slice(0, 6)
                  if (!filtered.length) return null
                  return createPortal(
                    <div style={{ position: 'fixed', bottom: window.innerHeight - mentionPos.top + 4, left: mentionPos.left, width: mentionPos.width, zIndex: 9999, background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', overflow: 'hidden' }}>
                      {filtered.map(m => (
                        <button key={m.id} onMouseDown={e => { e.preventDefault(); insertMention(m) }}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--color-bg-subtle)] text-left transition-colors">
                          <div className="w-5 h-5 rounded-md flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0"
                            style={{ background: (m as any).color || 'var(--color-brand)' }}>
                            {m.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <span className="text-xs font-medium text-[var(--color-text-primary)]">{m.name}</span>
                        </button>
                      ))}
                    </div>,
                    document.body
                  )
                })()}
                <textarea ref={commentTextareaRef} value={newComment}
                  onChange={e => {
                    const val = e.target.value
                    setNewComment(val)
                    autoGrow(e.currentTarget)
                    const pos = e.target.selectionStart
                    const before = val.slice(0, pos)
                    const m = before.match(/@(\w*)$/)
                    if (m) {
                      setMentionOpen(true); setMentionQuery(m[1])
                      const rect = commentTextareaRef.current?.getBoundingClientRect()
                      if (rect) setMentionPos({ top: rect.top, left: rect.left, width: rect.width })
                    } else setMentionOpen(false)
                  }}
                  onKeyDown={e => {
                    if (mentionOpen && e.key === 'Escape') { setMentionOpen(false); return }
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addComment() }
                  }}
                  onBlur={() => { mentionTimer.current = setTimeout(() => setMentionOpen(false), 150) }}
                  placeholder="Escrever um comentário… @ para mencionar" rows={3}
                  className="w-full bg-[var(--color-bg-page)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-xs text-[var(--color-text-primary)] outline-none resize-none focus:border-[var(--color-accent)] focus:bg-[var(--color-bg-card)] transition-colors" />
                <div className="flex justify-end mt-2">
                  <button onClick={addComment} disabled={!newComment.trim()}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-1.5 rounded-lg text-white disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:opacity-90 enabled:cursor-pointer transition-opacity flex-shrink-0"
                    style={{ background: 'var(--color-accent)' }}>
                    <Send size={12} /> Comentar
                  </button>
                </div>
              </div>
            </div>

            {/* Feed */}
            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
              {visibleFeed.length === 0 ? (
                <p className="text-xs text-[var(--color-text-faint)] text-center py-8">
                  {currentId ? 'Nada ainda. Comente mudanças, dúvidas, ajustes…' : 'Comentários e atividade aparecem após salvar o post.'}
                </p>
              ) : visibleFeed.map(item => {
                const n = item.author || null
                const memberMatch = n ? members.find(x => x.name === n) : null
                const av = {
                  initials: n ? n.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase() : '?',
                  color: (memberMatch as any)?.color || '#9ca3af',
                }
                return item.kind === 'comment' ? (
                  <div key={item.id} className="flex items-start gap-2.5 group">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 mt-0.5"
                      style={{ background: av.color }}>{av.initials}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[11px] font-semibold text-[var(--color-text-primary)]">{item.author || 'Alguém'}</span>
                        <span className="text-[10px] text-[var(--color-text-faint)]" title={fullDateTime(item.at)}>{fullDateTime(item.at)} · {relTime(item.at)}</span>
                        {editingCommentId !== item.cid && (
                          <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { setEditingCommentId(item.cid); setEditCommentText(item.body) }} title="Editar"
                              className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-page)] transition-colors"><Pencil size={11} /></button>
                            <button onClick={() => deleteComment(item.cid)} title="Excluir"
                              className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--color-text-faint)] hover:text-[var(--ds-error-text)] hover:bg-[var(--color-bg-page)] transition-colors"><Trash2 size={11} /></button>
                          </div>
                        )}
                      </div>
                      {editingCommentId === item.cid ? (
                        <div>
                          <textarea autoFocus value={editCommentText} ref={el => { if (el) autoGrow(el) }}
                            onChange={e => { setEditCommentText(e.target.value); autoGrow(e.currentTarget) }}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEditComment(item.cid) } else if (e.key === 'Escape') { setEditingCommentId(null) } }}
                            rows={2} className="w-full bg-[var(--color-bg-card)] border border-[var(--color-accent)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--color-text-primary)] outline-none resize-none" />
                          <div className="flex items-center gap-2 mt-1">
                            <button onClick={() => saveEditComment(item.cid)} className="text-[11px] font-semibold px-2.5 py-1 rounded-md text-white" style={{ background: 'var(--color-accent)' }}>Salvar</button>
                            <button onClick={() => setEditingCommentId(null)} className="text-[11px] px-2.5 py-1 rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]">Cancelar</button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-[var(--color-text-secondary)] bg-[var(--color-bg-subtle)] rounded-xl rounded-tl-sm px-3 py-2 leading-relaxed whitespace-pre-line break-words">{renderWithMentions(item.body)}</div>
                      )}
                    </div>
                  </div>
                ) : item.body?.includes('marcou ajuste como feito') || item.body?.includes('moveu de "Ajuste solicitado"') ? (
                  <div key={item.id} className="flex items-start gap-2">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 mt-0.5"
                      style={{ background: '#f59e0b' }}>
                      {av.initials}
                    </div>
                    <div className="flex-1">
                      <p className="text-[11px] font-semibold text-white px-2.5 py-1.5 rounded-lg leading-snug break-words" style={{ background: '#f59e0b' }}>
                        🟡 {item.body}
                      </p>
                      <span className="text-[10px] text-[var(--color-text-faint)]" title={fullDateTime(item.at)}>{fullDateTime(item.at)}</span>
                    </div>
                  </div>
                ) : item.body?.includes('ajuste') || item.body?.includes('alterações') ? (
                  <div key={item.id} className="flex items-start gap-2">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 mt-0.5"
                      style={{ background: '#ef4444' }}>
                      {av.initials}
                    </div>
                    <div className="flex-1">
                      <p className="text-[11px] font-semibold text-white px-2.5 py-1.5 rounded-lg leading-snug break-words" style={{ background: '#ef4444' }}>
                        🔴 {item.body}
                      </p>
                      <span className="text-[10px] text-[var(--color-text-faint)]" title={fullDateTime(item.at)}>{fullDateTime(item.at)}</span>
                    </div>
                  </div>
                ) : (
                  <div key={item.id} className="flex items-start gap-2">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 mt-0.5 opacity-80"
                      style={{ background: av.color }}>{av.initials}</div>
                    <p className="text-[11px] text-[var(--color-text-muted)] leading-snug flex-1 pt-0.5 break-words">
                      {item.body}
                      <span className="text-[var(--color-text-faint)]" title={fullDateTime(item.at)}> · {fullDateTime(item.at)}</span>
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="px-4 md:px-7 py-3 border-t border-[var(--color-border)] flex items-center justify-between bg-[var(--color-bg-card)] relative">
          {!isNew ? (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium" style={{ color: 'var(--ds-error-text)' }}>Confirmar exclusão?</span>
                <button onClick={() => setConfirmDelete(false)} className="text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)]">Cancelar</button>
                <button onClick={handleDelete} disabled={deleting} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-50" style={{ background: 'var(--ds-error-accent)' }}>
                  {deleting ? 'Excluindo…' : 'Excluir'}
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] transition-colors" onMouseEnter={e => (e.currentTarget.style.color = 'var(--ds-error-text)')} onMouseLeave={e => (e.currentTarget.style.color = '')}>
                <Trash2 size={13} /> Excluir post
              </button>
            )
          ) : <div />}

          <div className="flex items-center gap-3">
            {form.status === 'revisao_interna' && currentId && (
              <button
                onClick={() => changeStatus('aguardando_aprovacao')}
                className="flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-xl transition-all"
                style={{ background: '#8b5cf6', color: '#fff' }}
              >
                ✓ Aprovado internamente — Enviar pro cliente
              </button>
            )}
            {form.status === 'ajuste' && currentId && (
              <button
                onClick={async () => {
                  setForm(f => ({ ...f, status: 'aguardando_aprovacao' }))
                  setApprovalStatus('')
                  await persist({ approval_status: null, status: 'aguardando_aprovacao' }, `${who} marcou ajuste como feito e reenviou para aprovação`, 'status_changed')
                }}
                className="flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-xl transition-all"
                style={{ background: 'var(--ds-error-bg)', color: 'var(--ds-error-text)', border: '1px solid var(--ds-error-border)' }}
              >
                ✏ Ajuste feito — Reenviar para aprovação
              </button>
            )}
            {approvalStatus === 'aprovado' && (
              <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl"
                style={{ background: 'var(--ds-success-bg)', color: 'var(--ds-success-text)' }}>
                ✓ Aprovado pelo cliente
              </span>
            )}
            {currentId && (
              <div className="relative">
                <button onClick={() => setMoveOpen(v => !v)}
                  className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] px-2.5 py-1.5 rounded-lg hover:bg-[var(--color-bg-subtle)] transition-colors">
                  <Move size={13} /> Mover / Duplicar
                </button>
                {moveOpen && (
                  <>
                    <div className="fixed inset-0 z-[79]" onClick={() => setMoveOpen(false)} />
                    <div className="absolute bottom-9 right-0 z-[80] bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl shadow-pop p-3 w-64 flex flex-col gap-3">
                      <button onClick={duplicatePost} className="w-full text-left text-xs font-medium px-2 py-1.5 rounded-lg hover:bg-[var(--color-bg-subtle)] flex items-center gap-2 transition-colors">
                        <Copy size={13} /> Duplicar post (este mês)
                      </button>
                      <div className="border-t border-[var(--color-border)]" />
                      <div>
                        <p className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5">Mover para o mês</p>
                        <div className="flex items-center gap-1.5">
                          <select value={moveMonth} onChange={e => setMoveMonth(Number(e.target.value))} className="flex-1 capitalize text-xs border border-[var(--color-border)] rounded-lg px-2 py-1.5 bg-[var(--color-bg-card)] text-[var(--color-text-primary)] outline-none">
                            {MESES.map((m, i) => <option key={i} value={i + 1} className="capitalize">{m}</option>)}
                          </select>
                          <select value={moveYear} onChange={e => setMoveYear(Number(e.target.value))} className="text-xs border border-[var(--color-border)] rounded-lg px-2 py-1.5 bg-[var(--color-bg-card)] text-[var(--color-text-primary)] outline-none">
                            {[year - 1, year, year + 1].map(y => <option key={y} value={y}>{y}</option>)}
                          </select>
                          <button onClick={moveToMonth} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: 'var(--color-accent)' }}>Ir</button>
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5">Mover para o cliente</p>
                        <select value="" onChange={e => { if (e.target.value) moveToClientId(e.target.value) }} className="w-full text-xs border border-[var(--color-border)] rounded-lg px-2 py-1.5 bg-[var(--color-bg-card)] text-[var(--color-text-primary)] outline-none">
                          <option value="">Escolher cliente…</option>
                          {clientList.filter(c => c.id !== clientId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
            <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-faint)]">
              <Check size={12} /> Salvo automaticamente
            </div>
          </div>
        </div>

      </div>
    </div>
    </ModalPortal>
  )
}
