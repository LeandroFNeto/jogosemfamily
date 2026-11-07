import { avatar, escapeHtml, openDialog } from '/components.mjs';
import { gameCatalog, enabledGameIds } from '/games.mjs';

export async function readPhoto(file) {
  if (!file) return undefined;
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
    file.size > 8 * 1024 * 1024
  )
    throw new Error('Escolha uma foto JPG, PNG ou WebP de até 8 MB.');
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('Não foi possível abrir a foto. Escolha outra imagem.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 160;
  const context = canvas.getContext('2d');
  const size = Math.min(bitmap.width, bitmap.height);
  context.fillStyle = '#fff';
  context.fillRect(0, 0, 160, 160);
  context.drawImage(
    bitmap,
    (bitmap.width - size) / 2,
    (bitmap.height - size) / 2,
    size,
    size,
    0,
    0,
    160,
    160
  );
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.8);
}

export function showFamilyPanel(profile, save, revoke) {
  const dialog = openDialog(
    'Painel do familiar',
    `
    <p>Uma configuração simples, para jogar com tranquilidade.</p>
    <form id="family-form" class="stack">
      <label>Nome do jogador<input name="name" value="${escapeHtml(profile.name)}" minlength="2" maxlength="40" required autocomplete="given-name"></label>
      <div class="photo-row">${avatar(profile)}<label>Foto do jogador<input name="photo" type="file" accept="image/jpeg,image/png,image/webp"></label></div>
      <label class="check"><input type="checkbox" name="removePhoto"> Remover foto atual</label>
      <fieldset><legend>Jogos permitidos</legend>${gameCatalog.map((game) => `<label class="check"><input type="checkbox" name="enabledGames" value="${game.id}" ${enabledGameIds(profile).includes(game.id) ? 'checked' : ''}> ${escapeHtml(game.name)}</label>`).join('')}</fieldset>
      <button class="primary" type="submit">Salvar configuração</button>
      <p id="form-error" role="alert"></p>
    </form>
    <hr><h3>Contatos autorizados</h3>
    <p class="muted">Quem você confirma na primeira partida aparece aqui. Remover um contato encerra as mesas que você criou com essa pessoa.</p>
    <div class="stack">${profile.contacts.length ? profile.contacts.map((contact) => `<div class="contact-row">${avatar(contact)}<span>${escapeHtml(contact.name)}</span><button class="quiet" data-revoke="${contact.id}" aria-label="Remover ${escapeHtml(contact.name)}">Remover</button></div>`).join('') : '<p>Nenhum contato ainda. Convide um familiar para começar.</p>'}</div>`
  );
  const form = dialog.querySelector('form');
  form.onsubmit = async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type=submit]');
    button.disabled = true;
    try {
      const photo = form.elements.removePhoto.checked
        ? ''
        : ((await readPhoto(form.elements.photo.files[0])) ?? profile.photo);
      await save({
        ...profile,
        name: form.elements.name.value,
        photo,
        enabledGames: [
          ...form.querySelectorAll('[name="enabledGames"]:checked'),
        ].map((input) => input.value),
      });
      dialog.close();
    } catch (error) {
      form.querySelector('#form-error').textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
  dialog.querySelectorAll('[data-revoke]').forEach((button) => {
    button.onclick = async () => {
      button.disabled = true;
      try {
        await revoke(button.dataset.revoke);
        button.closest('.contact-row').remove();
      } catch (error) {
        form.querySelector('#form-error').textContent = error.message;
        button.disabled = false;
      }
    };
  });
}
