# Spec Delta

## Purpose

Permitir mesas com qualquer proporção de pessoas e bots, dentro dos limites de cada jogo.

## ADDED Requirements

### Requirement: Lugares de pessoas e de bots

O sistema SHALL permitir definir, ao criar a mesa, quantos lugares são de pessoas e quantos são de bots, com pelo menos uma pessoa e o total dentro do limite do jogo.

#### Scenario: Truco com duas pessoas e dois bots

- **WHEN** o dono cria um Truco de 4 lugares com 2 pessoas e 2 bots
- **THEN** os 2 bots ocupam seus lugares na criação e a partida começa quando a segunda pessoa entra

#### Scenario: Sem pessoas

- **WHEN** a configuração não tem nenhuma pessoa
- **THEN** o sistema recusa e explica que é preciso pelo menos uma pessoa

### Requirement: Equipes equilibradas

O sistema SHALL distribuir os bots no Truco de modo a equilibrar o número de jogadores das duas equipes.

#### Scenario: Três pessoas e um bot

- **WHEN** a mesa de 4 lugares tem 3 pessoas e 1 bot
- **THEN** o bot fica na equipe com menos pessoas

### Requirement: Dificuldade única e sinalização

O sistema SHALL aplicar a mesma dificuldade a todos os bots da mesa e identificá-los como bots para todos os jogadores.

#### Scenario: Lista de jogadores

- **WHEN** a mesa é exibida
- **THEN** cada bot aparece com a marca "bot" e o nível escolhido

### Requirement: Escolha simples de proporção

O sistema SHALL oferecer no site e no WhatsApp opções prontas de proporção, como "só pessoas", "metade bots" e "eu e bots".

#### Scenario: Opção pronta

- **WHEN** o dono escolhe "metade bots" em uma mesa de 4 lugares
- **THEN** a mesa fica com 2 pessoas e 2 bots

### Requirement: Ranking sem bots

O sistema SHALL ignorar bots em qualquer contagem de ranking.

#### Scenario: Partida mista

- **WHEN** uma partida mista termina
- **THEN** apenas as pessoas recebem vitórias e partidas no ranking
