# Design

## Context

Os motores seguem o contrato `createGame`, `processAction`, `publicGame` e `requestRematch`, sem HTTP. `shared/games.mjs` define o catálogo; `registry.mjs` liga os motores; o painel do familiar usa `enabledGames`.

## Goals / Non-Goals

**Goals:** dois jogos novos no mesmo contrato, com regras no servidor.
**Non-Goals:** variantes regionais de Cacheta, Buraco, torneios.

## Decisions

### 1. Cacheta: variante única e documentada

9 cartas, 52 cartas + 2 curingas, 2 a 4 jogadores (com 4 jogadores restam 17 cartas no monte). Os curingas substituem qualquer carta; no máximo um curinga por jogo. As regras aparecem na ajuda do jogo.

- _Alternativa:_ dois baralhos para mais jogadores. Rejeitada por ora: complica a ajuda sem ganho claro.

### 2. Validar "bater" com um solucionador por busca

Particionar 9 cartas em grupos de 3 a 5 é pequeno: busca recursiva com poda, sem heurística. O servidor retorna a organização encontrada, usada pela tela do vencedor. O jogador não precisa organizar a mão (importante para o WhatsApp).

### 3. Fases da vez

`phase`: `draw` → `discard`. Ações: `draw-stock`, `draw-discard`, `discard {cardId}`, `knock`. O cronômetro usa o mesmo `turn.deadline` da change `timer-buttons-inactivity`.

### 4. Caça-palavras: geração determinística com semente

`rng` injetável. Para cada palavra, tenta posições e direções permitidas até caber; se não couber após N tentativas, troca a palavra. A solução fica em `solution` no servidor e só vai ao cliente a posição das palavras encontradas.

### 5. Marcação por coordenadas ou texto

A ação `mark {start, end}` valida linha reta (horizontal, vertical ou diagonal) e compara o trecho com as palavras restantes (direto ou invertido). A ação `word {text}` procura a palavra em `solution`. Isso cobre site (arrasto) e WhatsApp (texto).

### 6. Bots

Cacheta: fácil descarta ao acaso, médio descarta a carta isolada, difícil considera o que o adversário pegou do descarte (usa a change `smarter-bots-and-images`). Caça-palavras: probabilidade de achar uma palavra por vez, como nos outros jogos de resposta.

## Risks / Trade-offs

- **[Regras de Cacheta variam por região]** → uma variante fixa e escrita na ajuda; ajustes ficam para depois.
- **[Grade 15×15 difícil de ler no WhatsApp]** → fonte monoespaçada e rótulos; avaliar na validação com usuários.
- **[Perfis antigos sem os jogos novos]** → o padrão de `enabledGames` passa a incluí-los apenas para perfis novos; o familiar liga para os antigos.

## Migration Plan

1. Adicionar ids `cacheta` e `wordsearch` ao catálogo.
2. Perfis existentes mantêm o que já tinham habilitado.
3. Rollback: remover os ids do catálogo; mesas antigas desses jogos ficam ilegíveis e expiram em 24 h.
