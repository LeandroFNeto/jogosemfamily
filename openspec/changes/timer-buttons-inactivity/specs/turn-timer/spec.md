# Spec Delta

## Purpose

Limitar o tempo de cada jogada com um cronômetro visível e uma jogada automática, para que a mesa nunca fique parada esperando uma pessoa.

## ADDED Requirements

### Requirement: Tempo por jogada configurável

O sistema SHALL permitir escolher o tempo da vez entre desligado, 30, 60 ou 90 segundos (padrão 60) e aplicá-lo somente a jogos e modos que têm vez.

#### Scenario: Mesa com vez

- **WHEN** começa a vez de um jogador em dominó, Truco ou modo competitivo
- **THEN** o servidor define o prazo da vez e o envia no estado da mesa

#### Scenario: Modo sem vez

- **WHEN** a partida é individual ou cooperativa
- **THEN** não há cronômetro

#### Scenario: Tempo desligado

- **WHEN** o tempo está desligado na mesa
- **THEN** a vez não tem prazo, como hoje

### Requirement: Relógio do servidor como referência

O sistema SHALL calcular o prazo no servidor e SHALL recusar ações que cheguem depois dele.

#### Scenario: Reconexão no meio da vez

- **WHEN** o jogador reconecta durante a própria vez
- **THEN** a barra continua do ponto correto

#### Scenario: Ação tardia

- **WHEN** uma ação chega depois do prazo
- **THEN** o servidor a recusa e devolve o estado atualizado com a jogada automática

### Requirement: Barra de tempo no site

O sistema SHALL mostrar uma linha que esvazia com o tempo, verde acima de 50%, laranja de 50% a 20% e vermelha abaixo de 20%, com um relógio na ponta da linha.

#### Scenario: Mudança de cor

- **WHEN** o tempo restante cruza 50% e depois 20%
- **THEN** a linha passa de verde para laranja e depois para vermelha

#### Scenario: Relógio que balança

- **WHEN** o tempo restante diminui
- **THEN** o relógio balança e o intervalo do balanço encurta de 1,2 s em 50% até 0,2 s no fim

#### Scenario: Acessibilidade

- **WHEN** o aparelho pede menos movimento ou o alto contraste está ligado
- **THEN** o relógio não balança, os segundos aparecem em texto e a cor não é o único sinal

### Requirement: Cronômetro no WhatsApp

O sistema SHALL enviar a barra em texto (dez quadrados 🟩, 🟧 e 🟥 e um ⏰) junto da mensagem de vez e SHALL enviar no máximo dois lembretes ao jogador da vez.

#### Scenario: Lembretes

- **WHEN** o jogador da vez chega à metade do tempo e depois aos últimos 15 segundos
- **THEN** recebe um lembrete cada vez, com mais ⏰ no último

#### Scenario: Jogou antes do aviso

- **WHEN** o jogador joga antes de um lembrete
- **THEN** o lembrete pendente é cancelado

### Requirement: Jogada automática

O sistema SHALL, ao esgotar o tempo, executar uma jogada legal pela estratégia fácil, registrá-la como automática e avisar a mesa.

#### Scenario: Tempo esgotado

- **WHEN** o prazo da vez termina
- **THEN** o servidor joga por ela e todos recebem "Tempo esgotado: jogada automática de Ana"

#### Scenario: Ninguém presente

- **WHEN** não há humano presente
- **THEN** a regra de `match-inactivity` encerra a partida em vez de jogar para sempre
