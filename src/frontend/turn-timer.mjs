import { escapeHtml as e } from '/components.mjs';
import { speak } from '/accessibility.mjs';

// Faixas de cor: verde acima de 50%, laranja de 50% a 20%, vermelha abaixo.
export function timerBand(ratio) {
  return ratio > 0.5 ? 'green' : ratio > 0.2 ? 'orange' : 'red';
}

// Intervalo do balanço: 1,2 s aos 50% do tempo até 0,2 s no fim.
export function shakeSeconds(ratio) {
  if (ratio > 0.5) return 0;
  return Number((0.2 + (Math.max(0, ratio) / 0.5) * 1).toFixed(2));
}

let frame = 0;
let announcedKey = '';

/**
 * Desenha a linha de tempo com o relógio na ponta. O prazo vem do servidor; o
 * navegador só mede a diferença entre os dois relógios, uma vez por mensagem.
 */
export function mountTurnTimer({ room, me, container, receivedAt }) {
  cancelAnimationFrame(frame);
  container.querySelector('.turn-timer')?.remove();
  const turn = room.turn;
  if (!turn || room.status !== 'PLAYING' || room.game?.status !== 'PLAYING')
    return;
  const mine = turn.playerId === me.id;
  const name =
    room.players.find((player) => player.id === turn.playerId)?.name ??
    'outro jogador';
  const wrapper = document.createElement('div');
  wrapper.className = 'turn-timer';
  wrapper.dataset.mine = String(mine);
  wrapper.innerHTML = `<p class="turn-timer-label">${mine ? 'Seu tempo' : `Tempo de ${e(name)}`}: <strong class="turn-timer-seconds" role="timer" aria-live="off"></strong></p>
    <div class="turn-timer-track" aria-hidden="true"><div class="turn-timer-fill"></div><span class="turn-timer-clock">⏰</span></div>
    <p class="visually-hidden" id="turn-timer-announce" role="status" aria-live="polite"></p>`;
  const anchor = container.querySelector('#turn-status');
  if (anchor) anchor.after(wrapper);
  else container.prepend(wrapper);
  const fill = wrapper.querySelector('.turn-timer-fill');
  const clock = wrapper.querySelector('.turn-timer-clock');
  const label = wrapper.querySelector('.turn-timer-seconds');
  const announce = wrapper.querySelector('#turn-timer-announce');
  const offset = room.serverNow - receivedAt;
  const total = turn.seconds * 1000;
  const key = `${room.id}:${turn.deadline}`;

  const tick = () => {
    if (!wrapper.isConnected) return;
    const left = Math.max(0, turn.deadline - (Date.now() + offset));
    const ratio = Math.min(1, left / total);
    const percent = `${(ratio * 100).toFixed(2)}%`;
    fill.style.width = percent;
    clock.style.left = percent;
    wrapper.dataset.band = timerBand(ratio);
    const shake = shakeSeconds(ratio);
    clock.style.setProperty('--shake', shake ? `${shake}s` : '0s');
    clock.classList.toggle('shaking', shake > 0 && left > 0);
    label.textContent = `${Math.ceil(left / 1000)} s`;
    if (mine && left <= 10000 && left > 0 && announcedKey !== key) {
      announcedKey = key;
      announce.textContent = 'Faltam 10 segundos para a sua jogada.';
      speak('Faltam 10 segundos.', me.preferences.speech);
    }
    if (left > 0) frame = requestAnimationFrame(tick);
  };
  tick();
}

export function stopTurnTimer() {
  cancelAnimationFrame(frame);
}
