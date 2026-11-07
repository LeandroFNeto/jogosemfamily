# Repository Guidelines

## Project Structure & Module Organization

`roadmap_mvp_jogos_familiares.md` defines the MVP; `docs/status.md` tracks delivery and outstanding validation. `src/frontend/` contains browser modules and styles, `src/backend/` the Node HTTP server and SQLite store, and `src/games/` the domino, Truco, crossword, puzzle, and bot engines. `src/shared/games.mjs` defines the browser-safe catalog and profile defaults. Invitations, accessibility, and family settings have separate modules. Tests live in `src/tests/`, including browser scenarios in `browser/`. Runtime data belongs in ignored `data/`; builds go to `dist/`.

## Build, Test, and Development Commands

Use Node.js 24.14+. Run `npm ci`, then `npm start` for localhost:3000 or `npm run dev` for server watch mode. `npm run check` validates syntax, `npm run build` prepares public assets, and `npm run format:check` checks Prettier formatting. Use `npm.cmd` in PowerShell if its script policy blocks `npm`.

## Coding Style & Naming Conventions

Use JavaScript ES modules (`.mjs`), two-space indentation, and single quotes. Run `npm run format` before submitting. Keep game rules independent of HTTP and DOM code; reuse `components.mjs` for escaped markup and dialogs. Write user-facing copy in Brazilian Portuguese. Prefer Node and browser APIs over production dependencies.

## Testing Guidelines

Run `npm test` for Node tests (`*.test.mjs`) and `npm run test:e2e` for Playwright scenarios (`*.spec.mjs`, Chrome installed). Test rules, scoring, authorization, invitation expiry, private state, and persistence when changing those paths. No numeric coverage threshold is configured. See README for browser setup.

## Commit & Pull Request Guidelines

The limited history uses a `fix:` prefix. Follow the roadmap's `feat:`, `fix:`, `refactor:`, `test:`, and `docs:` prefixes with concise descriptions. PRs should explain behavior, link related work, list validation, and include screenshots for interface changes.

## Security & Configuration

Never commit `.env`, databases, or credentials. Validate all actions on the server and preserve private hands. Production requires HTTPS, `PUBLIC_ORIGIN`, persistent storage, and one server instance; see `docs/architecture.md`.

## Regra do WhatsApp

Nunca envie notificação automática do jogo pelo WhatsApp (início, vez, tempo, rodada, fim, saída, retirada, mesa encerrada, entrada de convidado): spam gera banimento do número. O WhatsApp só responde ao que a pessoa pede (_jogo_, _menu_, _revanche_) e serve para convite e entrada na mesa; tudo o que acontece na partida é avisado só na web.

## Regra da cruz (jogos de mesa)

Em todo jogo multiplayer com mesa (dominó, Truco, cacheta e os demais), os lugares seguem o padrão ocidental: quem vê a tela fica embaixo e os outros ficam em cruz, no **sentido horário**: o próximo da vez é o da esquerda, depois o do topo, depois o da direita. Com 4 jogadores usam-se os quatro pontos (parceiros do Truco ficam frente a frente); com 3, esquerda e direita; com 2, topo. A ordem dos `playerIds` no motor é a ordem da vez, então o lugar na tela sai de `(índice − meu índice) % total`. Veja `CROSS_PLACES`/`crossOrder` em `games-ui.mjs`, `SEAT_POSITIONS` em `app.mjs` e `placeOf` no Truco. Qualquer mudança de jogabilidade, posição de jogador ou ordem de vez deve manter essa regra. O jogador da vez cresce, fica em amarelo e mostra os segundos.

## Uma mesa por pessoa

Cada pessoa joga uma mesa por vez. Criar ou entrar em uma mesa encerra as outras abertas dela (`retireOtherRooms` em `rooms-service.mjs`; se ainda há outras pessoas jogando, ela só sai e um bot assume). Ao subir o servidor e a cada minuto, `consolidate()` limpa mesas acumuladas. Isso evita sessões velhas, avisos repetidos e conversas do WhatsApp presas a mesas antigas.
