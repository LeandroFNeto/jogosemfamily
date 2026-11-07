# Design

## Context

`src/games/core/bots.mjs` escolhe jogadas por heurísticas e usa `randomInt`. O dominó e o Truco têm informação oculta (mãos), o que pede cuidado para o bot difícil não "trapacear". O quebra-cabeça tem 9 peças fixas e imagem `garden.svg` ou foto do perfil. O modo bot cria `capacity - 1` bots.

## Goals / Non-Goals

**Goals:** níveis medidos por torneio, proporção livre de pessoas e bots, imagens variadas.
**Non-Goals:** aprendizado de máquina, bots que conversam, edição de imagens (corte, filtros) no servidor.

## Decisions

### 1. Gerador com semente

Toda aleatoriedade dos bots e do baralho passa por um gerador injetável (`rng`), com padrão criptográfico em produção e semente fixa nos testes. Sem isso, o torneio não seria repetível.

### 2. Bot difícil por amostragem (determinização)

Para jogos com informação oculta: o bot guarda o que foi visto, sorteia K mãos adversárias compatíveis com o que já saiu (K=30), simula o resto com a política média e escolhe a jogada de melhor resultado médio. O orçamento é de 200 ms por decisão; ao estourar, usa a melhor jogada encontrada até ali. Só entram na simulação dados públicos.

- _Alternativa:_ busca em árvore completa. Rejeitada: cara demais para Truco com 8 jogadores.

### 3. Torneio como teste

`bot-tournament.test.mjs` joga 200 partidas por jogo com sementes fixas e exige 60% de vitórias. Roda separado de `npm test` rápido (`npm run test:bots`) para não alongar o ciclo diário, mas entra na validação final.

### 4. Mesa mista: `humanSeats` e `botSeats`

A sala passa a guardar os dois números (`capacity = humanSeats + botSeats`). Os bots entram na criação; os lugares humanos seguem o fluxo de convite. No Truco, a ordem dos assentos intercala equipes, e os bots ocupam os assentos que equilibram as duas equipes.

### 5. Imagens: interface de provedor

`ImageProvider { list(difficulty), get(id) }` com duas implementações: catálogo embutido (arquivos em `src/games/puzzle/images/` e metadados em JSON) e HTTP (variáveis `IMAGE_API_URL` e `IMAGE_API_KEY`). A resposta é validada, guardada em disco e servida por `/images/:id`. O CSP continua com `img-src 'self' data:`. A dificuldade vem dos metadados do provedor, não de análise automática.

### 6. Engine do quebra-cabeça N×N

O estado passa a ter `size` (3, 4 ou 5). O formato antigo (sem `size`) é lido como 3.

## Risks / Trade-offs

- **[Torneio lento ou instável]** → sementes fixas, partidas curtas e tolerância de 60% com 200 partidas.
- **[Direitos de imagem]** → guardar atribuição e licença; só aceitar fontes com licença livre; escolha do provedor fica para a implementação.
- **[Bot difícil lento no Truco de 8]** → limite de tempo e K reduzido por número de jogadores.
- **[Mesa mista confunde o convite]** → o convite fala o número de lugares humanos restantes.

## Open Questions

- Qual provedor externo de imagens usar (não muda os specs, que falam em "fonte externa configurada").
