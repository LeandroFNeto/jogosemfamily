# Tasks

## 1. Base dos bots

- [x] 1.1 Introduzir o gerador de números injetável nos bots e no baralho; verificar que a mesma semente repete a mesma partida
- [x] 1.2 Testar que bots só usam informação pública trocando as mãos adversárias; verificar que a jogada não muda em dominó e Truco

## 2. Níveis

- [x] 2.1 Reescrever o nível fácil (legal ao acaso, erros em jogos de resposta) e o médio (regras práticas por jogo); verificar com testes de jogadas legais
- [x] 2.2 Implementar o nível difícil por amostragem com orçamento de 200 ms; verificar o limite de tempo e o uso do que já saiu
- [x] 2.3 Criar o torneio de 200 partidas por jogo com sementes fixas e `npm run test:bots`; verificar médio > fácil e difícil > médio em 60% ou mais
- [x] 2.4 Documentar os níveis em `docs/architecture.md`

## 3. Mesas mistas

- [x] 3.1 Guardar `humanSeats` e `botSeats` na sala e criar os bots na criação; verificar Truco 2 pessoas + 2 bots e 3 + 1
- [x] 3.2 Equilibrar equipes no Truco e marcar bots e nível na lista de jogadores; verificar a distribuição
- [x] 3.3 Adicionar as opções prontas de proporção no site e no WhatsApp; verificar a criação nos dois canais
- [x] 3.4 Garantir que bots não entram no ranking e que mesas antigas continuam abrindo; verificar com mesa no formato anterior

## 4. Banco de imagens

- [x] 4.1 Criar o catálogo embutido com 12 imagens, metadados e licença; verificar que cada dificuldade tem pelo menos 4
- [x] 4.2 Criar `GET /api/images` e `/images/:id` e o provedor HTTP com validação de tipo e tamanho; verificar com servidor simulado, incluindo imagem inválida
- [x] 4.3 Generalizar o motor para N×N (9, 16, 25) lendo o formato antigo como 3×3; verificar conclusão e revanche em cada tamanho
- [x] 4.4 Escolher dificuldade e imagem no site e no WhatsApp, com sorteio e foto do perfil; verificar em teste de navegador
- [x] 4.5 Usar o catálogo embutido quando a fonte externa cai; verificar que a criação não falha
- [x] 4.6 Documentar imagens, licenças e variáveis em `docs/architecture.md`

## 5. Integração

- [x] 5.1 Rodar `npm run format`, `npm run check`, `npm test`, `npm run test:bots` e `npm run test:e2e` e confirmar que tudo passa

## Workflow follow-up

- Cacheta usa estes bots; aplicar depois de `cacheta-and-word-search` ou em conjunto.
