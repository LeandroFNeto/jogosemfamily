import { tileSvg } from '/art.mjs';

export const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]
  );

const PERSON_SVG =
  '<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><circle cx="20" cy="14" r="7" fill="currentColor"/><path d="M6 36c1-8 6.5-12 14-12s13 4 14 12z" fill="currentColor"/></svg>';
const ROBOT_SVG =
  '<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><path d="M20 3v5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><circle cx="20" cy="3.5" r="2" fill="currentColor"/><rect x="7" y="9" width="26" height="22" rx="6" fill="currentColor"/><circle cx="14.5" cy="19" r="3.5" fill="#fff"/><circle cx="25.5" cy="19" r="3.5" fill="#fff"/><rect x="14" y="25" width="12" height="2.5" rx="1.200" fill="#fff"/><rect x="3" y="16" width="3" height="8" rx="1.5" fill="currentColor"/><rect x="34" y="16" width="3" height="8" rx="1.5" fill="currentColor"/></svg>';

export function avatar(profile, large = false) {
  const name = escapeHtml(profile?.name || 'Familiar');
  const bot = profile?.bot === true;
  const inner = profile?.photo
    ? `<img src="${escapeHtml(profile.photo)}" alt="Foto de ${name}">`
    : bot
      ? ROBOT_SVG
      : PERSON_SVG;
  return `<span class="avatar${large ? ' avatar-large' : ''}${bot ? ' avatar-bot' : ''}">${inner}</span>`;
}

// Indicativo de quem joga por bot: bots da mesa e lugares de quem saiu.
export const isBotSeat = (player) =>
  player?.bot === true || (player?.seat && player.seat !== 'present');

export const botTag = (player) =>
  isBotSeat(player)
    ? ' <span class="bot-tag"><span aria-hidden="true">🤖</span> bot</span>'
    : '';

export function tileMarkup(tile, { vertical = false } = {}) {
  return `<span class="tile${vertical ? ' tile-v' : ''}" aria-hidden="true">${tileSvg(tile, { vertical })}</span>`;
}

export function openDialog(title, content) {
  const dialog = document.querySelector('#dialog');
  dialog.innerHTML = `<div class="dialog-head"><h2 id="dialog-title">${escapeHtml(title)}</h2><button type="button" class="quiet" id="close-dialog" aria-label="Fechar janela">Fechar ×</button></div>${content}`;
  dialog.querySelector('#close-dialog').onclick = () => dialog.close();
  if (!dialog.open) dialog.showModal();
  return dialog;
}

export function showHelp(gameId = 'domino') {
  if (typeof gameId !== 'string') gameId = 'domino';
  if (gameId !== 'domino') {
    const guides = {
      cards: [
        'Truco paulista',
        '<li>Escolha uma mesa de 2, 4, 6 ou 8 participantes. Os assentos alternam equipes A e B; as mesas de 6 e 8 adaptam as regras para equipes maiores.</li><li>Cada pessoa recebe 3 cartas. A ordem crescente é 4, 5, 6, 7, Dama, Valete, Rei, Ás, 2, 3. A carta seguinte à vira vira manilha.</li><li>Nas manilhas, a ordem é ouros, espadas, copas e paus. Cartas comuns do mesmo valor empatam.</li><li>Jogue uma carta na sua vez. Duas vazas vencidas ganham a mão. Um empate favorece quem ganhou a primeira vaza; se as duas primeiras empatarem, decide a terceira. Três empates não pontuam.</li><li>A mão começa valendo 1. Os pedidos seguem 3, 6, 9 e 12 pontos. Quem corre entrega o valor já aceito. Só a equipe que aceitou pode pedir novo aumento; o próximo adversário decide pela equipe.</li><li>Com onze pontos, o primeiro jogador da equipe decide: jogar valendo 3 ou correr e entregar 1. Parceiros podem ver suas cartas nessa decisão. Se as duas equipes têm onze, a mão vale 1, sem aumento e com cartas abertas para os próprios jogadores.</li><li>Entre mãos, toque em Próxima mão. Vence a partida a equipe que chegar a 12 pontos. Não há apostas em dinheiro.</li>',
      ],
      crossword: [
        'Palavras cruzadas',
        '<li>Escolha uma pista e leia a dica. A quantidade de letras aparece na opção.</li><li>Escreva a palavra e toque em Conferir palavra. Acentos não são obrigatórios.</li><li>As palavras certas preenchem a grade e ajudam nas pistas que se cruzam.</li><li>Sozinho ou com familiar, descubra as seis palavras. Com familiar, vocês resolvem a mesma grade e ganham juntos.</li><li>Contra o bot, cada um resolve sua própria grade. Cada tentativa dá uma vez ao bot; vence quem completar primeiro. O bot fácil acerta menos vezes, o difícil acerta mais. Não há cronômetro.</li>',
      ],
      cacheta: [
        'Cacheta',
        '<li>Jogam de 2 a 4 pessoas. O baralho tem 52 cartas e 2 curingas. Cada pessoa recebe 9 cartas e uma carta vai virada para o descarte.</li><li>Na sua vez, primeiro compre: do monte (carta escondida) ou pegue a carta de cima do descarte. Depois descarte uma carta. Quem pegou do descarte não pode devolver a mesma carta nessa vez.</li><li>Um jogo é uma sequência de 3 ou mais cartas seguidas do mesmo naipe (o Ás vale 1 ou vem depois do Rei) ou uma trinca de 3 ou 4 cartas de mesmo valor e naipes diferentes. Não vale K, Ás, 2.</li><li>O curinga ocupa o lugar de qualquer carta, no máximo um curinga em cada jogo.</li><li>Você vence ao bater: depois de comprar, suas 9 cartas precisam estar todas em jogos, e você descarta a décima. O botão Bater só aparece quando isso é possível; o servidor confere.</li><li>Se o monte acabar, o descarte (menos a carta de cima) é embaralhado e vira o novo monte. Se ninguém bater depois de muitas rodadas, a partida empata.</li><li>Com tempo ligado, se o prazo acabar o jogo compra e descarta por você.</li>',
      ],
      wordsearch: [
        'Caça-palavras',
        '<li>A grade esconde as palavras da lista. Fácil: 8×8 e 6 palavras, só na horizontal e na vertical. Média: 12×12 e 10 palavras, também na diagonal. Difícil: 15×15 e 14 palavras, e algumas de trás para a frente.</li><li>Para marcar, toque na primeira letra e depois na última, ou arraste o dedo por cima da palavra. Com teclado, use Tab e Enter nas letras.</li><li>Se preferir, digite a palavra da lista e toque em Marcar palavra: ela é achada para você.</li><li>Sozinho ou com familiar, vocês procuram juntos a mesma lista. Contra o bot, cada um procura na própria lista, uma tentativa por vez, e vence quem achar todas primeiro.</li><li>Acentos não importam. As palavras achadas ficam coloridas e riscadas na lista.</li>',
      ],
      puzzle: [
        'Quebra-cabeça',
        '<li>Observe a imagem de referência. A montagem tem nove partes, em três linhas e três colunas.</li><li>Toque em uma parte e depois em outra para trocar as posições. Não precisa arrastar.</li><li>Ative Mostrar números de ajuda para identificar a posição correta de cada parte, de 1 a 9.</li><li>Sozinho ou com familiar, vocês montam a mesma imagem. Contra o bot, cada lado monta sua própria imagem e vence quem terminar primeiro.</li><li>O bot fácil faz mais trocas ao acaso; o médio mistura estratégias; o difícil procura uma posição correta a cada troca. Ele joga depois de você, sem cronômetro.</li><li>Se tiver uma foto no perfil, você pode usá-la ao criar a montagem. A foto será compartilhada com os participantes dessa mesa.</li>',
      ],
    };
    const guide = guides[gameId];
    if (guide) {
      openDialog(
        guide[0],
        `<p>Jogue com calma. Você também pode usar o teclado e ajustar a leitura em Acessibilidade.</p><ol class="steps">${guide[1]}</ol><p>Todos os jogos oferecem bots fácil, médio e difícil. No dominó, no Truco e na Cacheta, a dificuldade muda a escolha das jogadas usando somente cartas próprias e informações públicas. Para outra partida, todos os participantes humanos precisam pedir Jogar novamente.</p>`
      );
      return;
    }
  }
  openDialog(
    'Vamos jogar dominó?',
    `
    <p>O importante é aproveitar a companhia. Aqui, ninguém precisa correr.</p>
    <ol class="steps">
      <li><strong>Convide alguém conhecido.</strong> Envie o link e confirme a pessoa antes de começar.</li>
      <li><strong>Espere a sua vez.</strong> Cada pessoa recebe 7 peças. Começa quem tem a maior dupla; sem dupla, a maior soma. Pode abrir com qualquer peça.</li>
      <li><strong>Toque em uma peça disponível.</strong> Números iguais se encontram. Se couber nas duas pontas, escolha onde colocar.</li>
      <li><strong>Não tem uma peça que encaixe?</strong> Compre uma por vez. Se acabarem as peças, passe a vez.</li>
      <li><strong>Ganha quem ficar sem peças.</strong> Se os dois passarem, ganha quem tiver a menor soma. Empate não dá pontos.</li>
    </ol>
    <p>O vencedor recebe a diferença entre os pontos restantes nas mãos. Para outra rodada, os dois tocam em <strong>Jogar novamente</strong>.</p>
    <div class="safety"><strong>Um convite seguro</strong><p>Confira o nome e a foto de quem convidou. Se tiver dúvida, fale com o familiar antes de entrar. Nunca pedimos pagamento ou dados bancários.</p></div>`
  );
}
