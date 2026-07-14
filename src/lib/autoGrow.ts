// Auto-resize de textarea: cresce com o conteúdo até um teto, depois rola.
// Usar no onInput/onChange: autoGrow(e.currentTarget)
export function autoGrow(el: HTMLTextAreaElement, maxPx = 220) {
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, maxPx) + 'px'
  el.style.overflowY = el.scrollHeight > maxPx ? 'auto' : 'hidden'
}
