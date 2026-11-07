# Proposal

## Why

Os níveis dos bots são heurísticas que nunca foram medidas: não se sabe se o "difícil" realmente vence o "médio". As mesas só aceitam um humano contra bots, e o quebra-cabeça tem uma imagem fixa de 9 peças.

## What Changes

- **Bots com níveis mensuráveis:** o difícil rastreia o que já saiu e simula jogadas; o fácil erra de propósito. Um torneio simulado nos testes prova que médio vence fácil e difícil vence médio em pelo menos 60% das partidas.
- **Mesas mistas:** qualquer proporção de pessoas e bots (por exemplo, 2 pessoas e 2 bots no Truco de 4 lugares).
- **Banco de imagens para o quebra-cabeça:** API do servidor com imagens variadas e três níveis de dificuldade (9, 16 e 25 peças), com catálogo embutido como alternativa.

## Capabilities

### New Capabilities

- `bot-intelligence`: comportamento de cada nível e como medi-lo.
- `mixed-tables`: mesas com número livre de pessoas e bots.
- `puzzle-image-bank`: catálogo e API de imagens, dificuldade e peças.

### Modified Capabilities

<!-- Nenhuma. Substitui a regra de docs/architecture.md de que "o modo bot usa uma pessoa e não mistura convidados humanos". -->

## Impact

- `src/games/core/bots.mjs`: estratégias por jogo e nível, gerador de números com semente.
- `src/games/puzzle/engine.mjs`: grade N×N em vez de 9 peças fixas.
- `rooms-service.mjs`: criação com lugares de humanos e de bots.
- Novos módulos de imagens e rota `/api/images`; site e bot escolhem dificuldade e imagem.
- Testes: torneios simulados com sementes fixas.
- Documentação: `docs/architecture.md` (níveis, mesas mistas, imagens).
