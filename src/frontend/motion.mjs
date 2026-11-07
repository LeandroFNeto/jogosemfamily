// Marca o que acabou de aparecer na mesa para a animação curta de entrada.
// Não bloqueia nada: é só uma classe; a CSS decide se anima ou só destaca.
// Se chegar outro estado durante a animação, o item continua marcado até
// completar a janela, sem recomeçar do zero e sem duplicar nada na mesa.
export const ENTER_MS = 300;

let seen = new Set();
let recent = new Map();
let scope = '';
let first = true;

export function animateNew(root, scopeId, now = Date.now()) {
  if (!root) return;
  if (scopeId !== scope) {
    scope = scopeId;
    seen = new Set();
    recent = new Map();
    first = true;
  }
  const items = [...root.querySelectorAll('[data-motion]')];
  for (const item of items) {
    const key = item.dataset.motion;
    if (!first && !seen.has(key) && !recent.has(key)) recent.set(key, now);
    const started = recent.get(key);
    if (started === undefined) continue;
    const elapsed = now - started;
    if (elapsed >= ENTER_MS) {
      recent.delete(key);
      continue;
    }
    item.classList.add('enter');
    item.style.setProperty('animation-delay', `-${elapsed}ms`);
  }
  seen = new Set(items.map((item) => item.dataset.motion));
  first = false;
}
