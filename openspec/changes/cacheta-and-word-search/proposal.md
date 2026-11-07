# Proposal

## Why

O catálogo tem dominó, Truco, palavras cruzadas e quebra-cabeça. Você pediu poucas modalidades novas por enquanto: Cacheta e caça-palavras, que se encaixam bem no WhatsApp e atendem tanto quem gosta de baralho quanto de passatempo.

## What Changes

- **Cacheta:** 2 a 4 jogadores, 9 cartas, comprar e descartar, bater ao formar sequências e trincas.
- **Caça-palavras:** grade com palavras escondidas em três dificuldades, nos modos individual, cooperativo e contra bot.
- Os dois entram no catálogo, no painel do familiar (habilitar por jogo), no site e no WhatsApp, e usam o cronômetro, os botões e os bots das outras changes.

Fora do escopo agora: Buraco, Paciência e outras modalidades.

## Capabilities

### New Capabilities

- `cacheta`: regras, estado privado, validação de jogos e fim da partida.
- `word-search`: geração da grade, marcação de palavras, modos e privacidade das soluções.

### Modified Capabilities

<!-- Nenhuma. O catálogo e o painel do familiar passam a listar os dois jogos novos. -->

## Impact

- `src/games/cacheta/` e `src/games/wordsearch/` (motores, independentes de HTTP e DOM), registro em `core/registry.mjs` e `shared/games.mjs`.
- `bots.mjs`: estratégias para os dois jogos.
- Site e WhatsApp: telas e renderizadores de texto.
- Painel do familiar: `enabledGames` com os novos ids; perfis antigos não ganham os jogos automaticamente além do padrão atual.
- Documentação: `docs/tutorial.md`, `docs/architecture.md`.
