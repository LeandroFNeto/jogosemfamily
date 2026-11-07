# Spec Delta

## Purpose

Definir comportamentos distintos e mensuráveis para os bots fácil, médio e difícil, de modo que a dificuldade escolhida seja realmente sentida e testada.

## ADDED Requirements

### Requirement: Só informação pública

O sistema SHALL fazer cada bot decidir apenas com a própria mão e o que está visível na mesa, sem ler mãos adversárias, monte ou respostas ocultas.

#### Scenario: Mãos adversárias trocadas

- **WHEN** as mãos adversárias são trocadas por outras e o resto do estado é mantido
- **THEN** a jogada escolhida pelo bot não muda

### Requirement: Nível fácil

O sistema SHALL fazer o bot fácil escolher uma jogada legal ao acaso e, em jogos de resposta, errar com frequência alta.

#### Scenario: Jogada legal

- **WHEN** o bot fácil joga
- **THEN** a jogada é sempre válida pelas regras do jogo

### Requirement: Nível médio

O sistema SHALL fazer o bot médio seguir regras práticas de cada jogo, como jogar a peça de maior soma no dominó, a carta mais forte necessária no Truco e descartar a carta isolada na Cacheta.

#### Scenario: Preferir a maior peça

- **WHEN** o bot médio tem mais de uma peça que encaixa
- **THEN** escolhe a peça de maior soma, com bônus para duplas e para a extremidade que deixa mais peças da própria mão encaixáveis

### Requirement: Nível difícil

O sistema SHALL fazer o bot difícil registrar o que já saiu, estimar as cartas ou peças ocultas possíveis e escolher a jogada de melhor resultado médio em simulações, dentro de 200 ms por decisão.

#### Scenario: Uso do que já saiu

- **WHEN** todas as peças de um número já foram jogadas
- **THEN** o bot difícil deixa de contar com esse número nas mãos adversárias

#### Scenario: Tempo de decisão

- **WHEN** o bot difícil decide uma jogada
- **THEN** a decisão termina em até 200 ms

### Requirement: Qualidade verificada por torneio

O sistema SHALL ter testes com sementes fixas de 200 partidas por jogo em que o médio vence o fácil e o difícil vence o médio em pelo menos 60% das partidas.

#### Scenario: Médio contra fácil

- **WHEN** o torneio de dominó, Truco e Cacheta roda
- **THEN** o médio vence o fácil em 60% ou mais das partidas

#### Scenario: Difícil contra médio

- **WHEN** o mesmo torneio roda
- **THEN** o difícil vence o médio em 60% ou mais das partidas
