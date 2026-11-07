# Spec Delta

## Purpose

Manter a partida viva quando alguém sai ou some, com um bot no lugar, e devolver o lugar à pessoa que volta.

## ADDED Requirements

### Requirement: Sair não encerra a mesa

O sistema SHALL marcar o lugar como ausente e colocar um bot para jogar nele quando um jogador sai de uma partida em andamento, mantendo a mesa para os demais.

#### Scenario: Jogador sai

- **WHEN** um jogador sai de uma mesa em andamento
- **THEN** um bot assume o lugar e a mesa continua

#### Scenario: Mesa aguardando amigos

- **WHEN** quem sai estava numa mesa que ainda não começou
- **THEN** a pessoa é removida da lista e o lugar fica livre

### Requirement: Ausência por tempo esgotado

O sistema SHALL tratar como ausente o jogador que deixa o tempo da vez esgotar duas vezes seguidas.

#### Scenario: Duas jogadas automáticas seguidas

- **WHEN** o tempo de um jogador esgota duas vezes seguidas
- **THEN** o lugar passa a ausente e um bot assume

### Requirement: Retorno ao mesmo lugar

O sistema SHALL devolver o lugar à pessoa que volta, no próximo ponto de decisão, preservando tudo o que o bot jogou.

#### Scenario: Volta durante a partida

- **WHEN** a pessoa ausente volta à mesa em andamento
- **THEN** reassume o lugar no próximo ponto de decisão e recebe um resumo das últimas jogadas

#### Scenario: Mesa cancelada

- **WHEN** a mesa foi cancelada por inatividade
- **THEN** valem as regras de `match-inactivity`

### Requirement: Bot identificado

O sistema SHALL mostrar a todos os jogadores o lugar ausente com a marca "bot" e a indicação "(ausente)".

#### Scenario: Lista de jogadores

- **WHEN** a mesa é exibida com um lugar ausente
- **THEN** o nome da pessoa aparece com "(ausente)" e o ícone de bot

### Requirement: Só o dono encerra a mesa

O sistema SHALL permitir que apenas o dono encerre a mesa para todos, com confirmação.

#### Scenario: Dono encerra

- **WHEN** o dono confirma "Encerrar mesa"
- **THEN** a mesa é encerrada e todos são avisados

#### Scenario: Outro jogador tenta encerrar

- **WHEN** quem não é dono pede para encerrar
- **THEN** o sistema oferece apenas "Sair (um bot assume)"
