# Spec Delta

## Purpose

Permitir jogar Cacheta com amigos ou contra bots, com regras validadas no servidor e cada jogador vendo só a própria mão.

## ADDED Requirements

### Requirement: Preparação da partida

O sistema SHALL jogar a Cacheta com 2 a 4 jogadores, baralho de 52 cartas mais 2 curingas, 9 cartas por jogador e uma carta virada no descarte.

#### Scenario: Distribuição

- **WHEN** a partida começa
- **THEN** cada jogador recebe 9 cartas distintas, uma carta vai ao descarte e o resto forma o monte

#### Scenario: Número de jogadores

- **WHEN** a mesa tem menos de 2 ou mais de 4 lugares
- **THEN** o sistema recusa a criação

### Requirement: Vez de jogo

O sistema SHALL exigir que o jogador da vez compre uma carta do monte ou o topo do descarte e depois descarte uma carta.

#### Scenario: Comprar do monte

- **WHEN** o jogador da vez compra do monte
- **THEN** passa a ter 10 cartas e deve descartar uma

#### Scenario: Descartar sem comprar

- **WHEN** o jogador tenta descartar sem ter comprado
- **THEN** o servidor recusa a jogada

#### Scenario: Monte acabou

- **WHEN** o monte termina
- **THEN** o servidor embaralha o descarte, exceto o topo, para formar novo monte

### Requirement: Jogos válidos

O sistema SHALL aceitar como jogo uma sequência de 3 ou mais cartas do mesmo naipe (o Ás vale baixo ou alto) ou uma trinca de 3 ou 4 cartas de mesmo valor e naipes diferentes, com curinga no lugar de qualquer carta.

#### Scenario: Sequência

- **WHEN** a mão tem 5♣, 6♣ e 7♣
- **THEN** o servidor reconhece uma sequência válida

#### Scenario: Trinca com curinga

- **WHEN** a mão tem 8♥, 8♠ e um curinga
- **THEN** o servidor reconhece uma trinca válida

### Requirement: Bater

O sistema SHALL encerrar a partida quando o jogador da vez, depois de comprar, consegue organizar 9 cartas em jogos válidos e descartar a décima, e SHALL calcular essa organização no servidor.

#### Scenario: Bater válido

- **WHEN** o jogador pede para bater com a mão organizável
- **THEN** a partida termina, ele vence e os outros veem as cartas que ficaram fora de jogos

#### Scenario: Bater inválido

- **WHEN** o jogador pede para bater sem a mão organizável
- **THEN** o servidor recusa e a partida segue

### Requirement: Estado privado

O sistema SHALL mostrar a cada jogador somente a própria mão, o topo do descarte e a quantidade de cartas dos outros.

#### Scenario: Estado público

- **WHEN** o servidor envia o estado da mesa
- **THEN** não inclui mãos adversárias nem a ordem do monte

### Requirement: Jogo completo no site e no WhatsApp

O sistema SHALL oferecer a Cacheta nos modos com amigos, contra bots e mista, com os três níveis de bot, revanche consensual e cronômetro da vez.

#### Scenario: Contra bot

- **WHEN** a pessoa joga contra bots
- **THEN** os bots compram, descartam e batem pelas regras do servidor
