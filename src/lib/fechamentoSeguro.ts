'use client'

// Fechar um formulário não pode apagar o que a pessoa escreveu.
//
// O hub tem dois jeitos de salvar, e os dois estão certos pro lugar onde
// estão:
//
//   - EDIÇÃO NO LUGAR (card do post, do extra, manual do cliente): salva
//     sozinho ao sair do campo. O registro já existe, então sempre há onde
//     gravar, e exigir "editar → salvar → sair" transforma corrigir uma
//     palavra em cerimônia.
//
//   - FORMULÁRIO DE CRIAR (recorrente, post novo, material): tem botão de
//     salvar, porque antes dele não existe linha nenhuma no banco. Salvar a
//     cada tecla criaria um registro pela metade que já apareceria nas telas
//     de todo mundo — e a recorrente, em especial, começa a gerar tarefa no
//     dia seguinte.
//
// O que NÃO pode acontecer é o segundo caso perder o trabalho. No formulário
// de recorrente, clicar fora do modal fechava e descartava tudo, em silêncio,
// depois de alguém ter escrito legenda de sete dias. Daí esta guarda: fechar
// com coisa escrita pergunta antes.

import { useEffect, useRef } from 'react'

export function useFechamentoSeguro(valores: unknown, onClose: () => void) {
  // O retrato de como o formulário nasceu. Comparar com ele é mais confiável
  // que um `sujo = true` espalhado por quinze `onChange` — campo novo entra na
  // conta sozinho, e quem escreve e apaga de volta não é cobrado por nada.
  const inicial = useRef<string>(JSON.stringify(valores))
  const atual = JSON.stringify(valores)
  const sujo = atual !== inicial.current

  // Fechar a aba com formulário preenchido também é perder trabalho. O
  // navegador mostra o aviso padrão dele; o texto não é nosso, mas a pergunta
  // é a mesma.
  useEffect(() => {
    if (!sujo) return
    const aviso = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', aviso)
    return () => window.removeEventListener('beforeunload', aviso)
  }, [sujo])

  function fechar() {
    if (sujo && !window.confirm('Você escreveu coisas que ainda não foram salvas. Descartar?')) return
    onClose()
  }

  /** Chamado depois de gravar: o que está na tela passa a ser o novo "limpo". */
  function marcarSalvo() { inicial.current = JSON.stringify(valores) }

  return { sujo, fechar, marcarSalvo }
}
