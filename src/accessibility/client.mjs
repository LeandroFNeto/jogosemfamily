import { openDialog } from '/components.mjs';

export function applyPreferences(prefs) {
  document.documentElement.dataset.font = prefs.fontSize;
  document.documentElement.dataset.contrast = String(prefs.contrast);
}

export function speak(text, enabled) {
  if (!enabled || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'pt-BR';
  utterance.rate = 0.88;
  speechSynthesis.speak(utterance);
}

export function showAccessibility(profile, save) {
  const prefs = profile.preferences;
  const dialog = openDialog(
    'Do seu jeito',
    `
    <p>Escolha o que deixa a leitura mais confortável.</p>
    <form id="accessibility-form" class="stack">
      <label>Tamanho da letra<select name="fontSize"><option value="normal" ${prefs.fontSize === 'normal' ? 'selected' : ''}>Normal</option><option value="large" ${prefs.fontSize === 'large' ? 'selected' : ''}>Grande</option><option value="extra" ${prefs.fontSize === 'extra' ? 'selected' : ''}>Extra grande</option></select></label>
      <label class="check"><input type="checkbox" name="contrast" ${prefs.contrast ? 'checked' : ''}> Alto contraste</label>
      <label class="check"><input type="checkbox" name="speech" ${prefs.speech ? 'checked' : ''}> Ler instruções em voz alta</label>
      <p class="muted">A leitura em voz alta depende do suporte do navegador.</p>
      <button class="primary" type="submit">Salvar preferências</button>
      <p id="form-error" role="alert"></p>
    </form>`
  );
  dialog.querySelector('form').onsubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type=submit]');
    button.disabled = true;
    const preferences = {
      fontSize: form.fontSize.value,
      contrast: form.contrast.checked,
      speech: form.speech.checked,
    };
    try {
      await save({ ...profile, preferences });
      applyPreferences(preferences);
      speak('Preferências salvas. Vamos jogar juntos?', preferences.speech);
      dialog.close();
    } catch (error) {
      form.querySelector('#form-error').textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
}
