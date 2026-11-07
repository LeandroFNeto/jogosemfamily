# Spec Delta

## Purpose

Encerrar partidas abandonadas e definir, de forma simples, quem pode voltar a uma mesa e quem precisa criar outra.

## ADDED Requirements

### Requirement: Presença do jogador

O sistema SHALL considerar presente o jogador humano que tem conexão aberta no site ou fez uma ação ou enviou mensagem nos últimos 5 minutos.

#### Scenario: Conexão aberta

- **WHEN** o jogador mantém a mesa aberta no site
- **THEN** ele conta como presente

#### Scenario: Mensagem recente no WhatsApp

- **WHEN** o jogador enviou uma mensagem há 2 minutos
- **THEN** ele conta como presente

### Requirement: Cancelamento por inatividade

O sistema SHALL cancelar a partida em andamento quando nenhum jogador humano estiver presente por 5 minutos seguidos.

#### Scenario: Todos saíram

- **WHEN** passam 5 minutos sem nenhum humano presente
- **THEN** a partida é cancelada com o motivo "inatividade" e o convite deixa de funcionar

#### Scenario: Alguém continua

- **WHEN** pelo menos um humano está presente
- **THEN** a partida não é cancelada

#### Scenario: Mesa aguardando amigos

- **WHEN** a mesa ainda espera jogadores
- **THEN** esta regra não se aplica e valem as 24 horas de validade

### Requirement: Retorno a partida ativa

O sistema SHALL permitir que um jogador da mesa volte a ela enquanto a partida não foi cancelada e ainda há gente jogando.

#### Scenario: Voltar pelo site

- **WHEN** o jogador abre de novo o endereço da mesa
- **THEN** vê a mesa no estado atual

#### Scenario: Voltar pelo WhatsApp

- **WHEN** o jogador envia qualquer mensagem à mesa ativa
- **THEN** o bot reenvia o estado atual da mesa

### Requirement: Retorno a partida cancelada

O sistema SHALL informar que a partida foi cancelada, levar a pessoa ao menu e exigir que ela crie outra partida.

#### Scenario: Voltar depois do cancelamento

- **WHEN** o jogador tenta voltar a uma mesa cancelada
- **THEN** recebe "Essa partida foi cancelada por falta de jogadores", o menu e a opção de criar outra

#### Scenario: Link antigo

- **WHEN** alguém usa o convite de uma mesa cancelada
- **THEN** o sistema informa que o convite não é mais válido e a mesa não é reaberta
