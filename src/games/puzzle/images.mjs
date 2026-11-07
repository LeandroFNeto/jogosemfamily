import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pick, systemRng } from '../core/rng.mjs';

export const LEVELS = ['easy', 'medium', 'hard'];
/** Peças por lado: fácil 3×3 (9), média 4×4 (16), difícil 5×5 (25). */
export const LEVEL_SIZE = { easy: 3, medium: 4, hard: 5 };
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);
const ID = /^[\w-]{1,64}$/;
const here = dirname(fileURLToPath(import.meta.url));
const EMBEDDED_DIR = join(here, 'images');

const publicEntry = (entry) => ({
  id: entry.id,
  title: entry.title,
  category: entry.category,
  difficulty: entry.difficulty,
  license: entry.license,
  attribution: entry.attribution,
  source: entry.source,
  url: `/images/${entry.id}`,
});

/**
 * Banco de imagens do quebra-cabeça. O catálogo embutido sempre funciona; uma
 * fonte externa opcional (IMAGE_API_URL) soma imagens, que o servidor baixa,
 * valida (JPEG, PNG ou WebP até 2 MB) e guarda para servir pela própria origem.
 * Falhas da fonte externa nunca afetam o catálogo embutido nem mesas abertas.
 */
export function createImageService({
  apiUrl = process.env.IMAGE_API_URL || '',
  apiKey = process.env.IMAGE_API_KEY || '',
  extraHosts = (process.env.IMAGE_API_HOSTS || '')
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean),
  cacheDir = process.env.IMAGE_CACHE_DIR || '',
  fetchImpl = globalThis.fetch,
  timeoutMs = 5000,
  log = console,
} = {}) {
  const embedded = JSON.parse(
    readFileSync(join(EMBEDDED_DIR, 'catalog.json'), 'utf8')
  ).map((entry) => ({ ...entry, source: 'embedded' }));
  const embeddedBytes = new Map();
  // id -> { entry, contentType, body }
  const external = new Map();

  function loadDisk() {
    if (!cacheDir || !existsSync(cacheDir)) return;
    for (const name of readdirSync(cacheDir)) {
      if (!name.endsWith('.json')) continue;
      try {
        const entry = JSON.parse(readFileSync(join(cacheDir, name), 'utf8'));
        const body = readFileSync(join(cacheDir, `${entry.id}.bin`));
        if (ID.test(entry.id) && body.length <= MAX_IMAGE_BYTES)
          external.set(entry.id, {
            entry: { ...entry, source: 'external' },
            contentType: entry.contentType,
            body,
          });
      } catch {
        // cópia corrompida: será baixada de novo no próximo refresh
      }
    }
  }
  loadDisk();

  const all = () => [
    ...embedded,
    ...[...external.values()].map((e) => e.entry),
  ];

  function list(difficulty) {
    return all()
      .filter((entry) => !difficulty || entry.difficulty === difficulty)
      .map(publicEntry);
  }

  const find = (id) => all().find((entry) => entry.id === id) ?? null;

  /** Imagem escolhida ou sorteada para o nível; sempre há uma (a embutida). */
  function choose(level, imageId, rng = systemRng) {
    if (imageId) {
      const found = find(imageId);
      return found && found.difficulty === level ? publicEntry(found) : null;
    }
    const options = all().filter((entry) => entry.difficulty === level);
    return publicEntry(pick(options, rng));
  }

  function get(id) {
    if (!ID.test(id)) return null;
    const outside = external.get(id);
    if (outside)
      return { contentType: outside.contentType, body: outside.body };
    const entry = embedded.find((item) => item.id === id);
    if (!entry) return null;
    if (!embeddedBytes.has(id))
      embeddedBytes.set(id, readFileSync(join(EMBEDDED_DIR, entry.file)));
    return { contentType: 'image/svg+xml', body: embeddedBytes.get(id) };
  }

  const allowedHost = (url) => {
    try {
      const parsed = new URL(url);
      const base = new URL(apiUrl);
      return (
        ['https:', 'http:'].includes(parsed.protocol) &&
        (parsed.origin === base.origin || extraHosts.includes(parsed.hostname))
      );
    } catch {
      return false;
    }
  };

  async function download(item) {
    const response = await fetchImpl(item.url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = (response.headers.get('content-type') || '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    if (!TYPES.has(contentType)) throw new Error('tipo de imagem não aceito');
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > MAX_IMAGE_BYTES) throw new Error('imagem grande demais');
    const body = Buffer.from(await response.arrayBuffer());
    if (!body.length || body.length > MAX_IMAGE_BYTES)
      throw new Error('tamanho de imagem inválido');
    return { contentType, body };
  }

  /** Atualiza a lista externa; devolve quantas imagens novas foram aceitas. */
  async function refresh() {
    if (!apiUrl || !fetchImpl) return 0;
    let accepted = 0;
    try {
      const response = await fetchImpl(apiUrl, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const items = await response.json();
      if (!Array.isArray(items)) throw new Error('lista inválida');
      for (const item of items.slice(0, 200)) {
        const id = `ext-${String(item?.id ?? '')}`;
        try {
          if (
            !ID.test(id) ||
            !LEVELS.includes(item.difficulty) ||
            !item.license ||
            !item.title ||
            !allowedHost(item.url)
          )
            throw new Error('metadados inválidos');
          if (external.has(id)) continue;
          const { contentType, body } = await download(item);
          const entry = {
            id,
            title: String(item.title).slice(0, 80),
            category: String(item.category || 'variadas').slice(0, 40),
            difficulty: item.difficulty,
            license: String(item.license).slice(0, 80),
            attribution: String(item.attribution || '').slice(0, 120),
            source: 'external',
          };
          external.set(id, { entry, contentType, body });
          if (cacheDir) {
            mkdirSync(cacheDir, { recursive: true });
            writeFileSync(join(cacheDir, `${id}.bin`), body);
            writeFileSync(
              join(cacheDir, `${id}.json`),
              JSON.stringify({ ...entry, contentType })
            );
          }
          accepted++;
        } catch (error) {
          log.warn?.(`Imagem externa ignorada (${id}): ${error.message}`);
        }
      }
    } catch (error) {
      log.warn?.(`Fonte de imagens indisponível: ${error.message}`);
    }
    return accepted;
  }

  return { list, find, choose, get, refresh };
}
