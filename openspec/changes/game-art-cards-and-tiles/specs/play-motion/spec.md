# Spec Delta

## Purpose

Dar movimento curto e legível às jogadas na mesa sem atrasar a ação do jogador nem prejudicar quem prefere menos animação.

## ADDED Requirements

### Requirement: Animação das jogadas

O sistema SHALL animar por no máximo 400 ms as ações visíveis da mesa: comprar do monte, descartar, jogar peça, jogar carta e virar a carta.

#### Scenario: Jogada de outro jogador

- **WHEN** o estado da mesa muda por jogada de outra pessoa ou de um bot
- **THEN** a carta ou peça aparece na mesa com movimento curto indicando de onde veio

### Requirement: Movimento reduzido

O sistema SHALL desativar as animações de deslocamento e giro quando a preferência de movimento reduzido estiver ativa, trocando-as por uma mudança instantânea com destaque estático.

#### Scenario: Preferência ativa

- **WHEN** o navegador informa `prefers-reduced-motion: reduce`
- **THEN** nenhuma carta ou peça se desloca ou gira e a jogada continua destacada por contorno

### Requirement: Animação não bloqueia a ação

O sistema SHALL permitir a próxima ação assim que o servidor aceitar o estado, sem esperar o fim da animação, e SHALL descartar animações pendentes quando chegar um estado mais novo.

#### Scenario: Estados em sequência

- **WHEN** dois estados chegam em menos de 400 ms
- **THEN** a tela mostra o mais novo, os botões ficam ativos e não há cartas duplicadas na mesa
