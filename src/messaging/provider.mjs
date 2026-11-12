/**
 * Interface de provedor de mensagens:
 *   send(to, message, interactive?) -> Promise<{ id }>
 *   status() -> Promise<'connected' | 'disconnected'>
 *
 * Nada fora desta pasta e do canal sabe qual serviço envia de fato. O
 * WPPConnect é a implementação inicial; a API oficial do WhatsApp pode virar
 * outro arquivo com a mesma forma.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const INTERACTIVE_PAUSE = 30 * 60000;
const ASSETS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../whatsapp/assets'
);
// Imagens do bot (menu de jogos e decisões): só nomes simples, que viram um PNG
// da pasta de assets (nada de caminhos livres). Arquivo ausente cai no texto.
const ASSET_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const assetCache = new Map();
function loadAsset(name) {
  if (!ASSET_NAME.test(String(name))) throw new Error('Imagem desconhecida.');
  const file = `${name}.png`;
  if (!assetCache.has(name))
    assetCache.set(
      name,
      `data:image/png;base64,${readFileSync(join(ASSETS_DIR, file)).toString('base64')}`
    );
  return { base64: assetCache.get(name), filename: file };
}

export function createWppProvider({
  client,
  interactive = 'on',
  now = () => Date.now(),
  log = console,
}) {
  // Disjuntor: após uma falha de botão/lista, só texto por 30 minutos.
  let pausedUntil = 0;
  const mode = () =>
    typeof interactive === 'function' ? interactive() : interactive;
  const interactiveOn = () => mode() !== 'off' && now() >= pausedUntil;
  return {
    name: 'wppconnect',
    async send(to, message, extra) {
      // Imagem (ex.: menu de jogos): se falhar, o texto da mensagem a substitui.
      if (extra?.kind === 'image') {
        try {
          await client.sendImage(to, {
            ...loadAsset(extra.asset),
            caption: extra.caption ?? '',
          });
          return { id: null };
        } catch (error) {
          log.warn?.(
            `Imagem indisponível, enviando só texto: ${error.message}`
          );
        }
        await client.sendText(to, message);
        return { id: null };
      }
      if (extra && extra.kind !== 'text' && interactiveOn()) {
        try {
          if (extra.kind === 'buttons')
            await client.sendButtons(to, message, extra.buttons);
          else await client.sendList(to, message, extra.rows);
          return { id: null };
        } catch (error) {
          pausedUntil = now() + INTERACTIVE_PAUSE;
          log.warn?.(
            `Botões indisponíveis, voltando ao texto por 30 min: ${error.message}`
          );
        }
      }
      await client.sendText(to, message);
      return { id: null };
    },
    async status() {
      const current = await client.status();
      return current?.status === 'CONNECTED' ? 'connected' : 'disconnected';
    },
  };
}
