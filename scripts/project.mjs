import { readdir, mkdir, copyFile, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

async function scripts(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await scripts(path)));
    else if (path.endsWith('.mjs')) files.push(path);
  }
  return files;
}

const command = process.argv[2];
if (!['check', 'build'].includes(command))
  throw new Error('Use check ou build.');
for (const path of [...(await scripts('src')), ...(await scripts('scripts'))]) {
  const check = spawnSync(process.execPath, ['--check', path], {
    stdio: 'inherit',
  });
  if (check.status !== 0) process.exit(check.status || 1);
}
JSON.parse(await readFile('package.json', 'utf8'));
console.log('Sintaxe JavaScript e package.json válidos.');
if (command === 'build') {
  await mkdir('dist', { recursive: true });
  for (const file of [
    'index.html',
    'styles.css',
    'app.mjs',
    'components.mjs',
    'games-ui.mjs',
    'turn-timer.mjs',
    'art.mjs',
    'motion.mjs',
    'garden.svg',
    'icon.svg',
  ]) {
    await copyFile(join('src/frontend', file), join('dist', file));
  }
  await copyFile('src/accessibility/client.mjs', 'dist/accessibility.mjs');
  await copyFile('src/family-panel/client.mjs', 'dist/family-panel.mjs');
  await copyFile('src/shared/games.mjs', 'dist/games.mjs');
  console.log('Interface pronta em dist/. Inicie a aplicação com npm start.');
}
