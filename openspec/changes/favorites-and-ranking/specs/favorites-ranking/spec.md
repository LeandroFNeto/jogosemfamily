# Spec Delta

## Purpose

Mostrar um ranking simples entre a pessoa e seus favoritos, calculado a partir de resultados guardados no banco.

## ADDED Requirements

### Requirement: Resultado guardado

O sistema SHALL gravar no banco o resultado de cada partida terminada, com jogo, data, participantes humanos, vencedores e pontos, e SHALL ignorar bots.

#### Scenario: Partida terminada

- **WHEN** uma partida chega ao fim
- **THEN** um resultado é gravado uma única vez, mesmo se houver revanche

#### Scenario: Partida cancelada

- **WHEN** a partida é cancelada ou encerrada antes do fim
- **THEN** nenhum resultado é gravado

### Requirement: Ranking entre favoritos

O sistema SHALL listar a pessoa e seus favoritos aceitos ordenados por vitórias, com desempate por taxa de vitória e depois por partidas jogadas.

#### Scenario: Ordem do ranking

- **WHEN** a pessoa pede o ranking
- **THEN** vê a lista ordenada com vitórias, partidas e taxa de vitória

#### Scenario: Filtro por jogo

- **WHEN** a pessoa escolhe um jogo
- **THEN** o ranking considera somente as partidas daquele jogo

#### Scenario: Partida com desconhecido

- **WHEN** uma partida teve um humano que não é favorito nem a própria pessoa
- **THEN** ela não entra no ranking dessa pessoa

### Requirement: Acesso ao ranking

O sistema SHALL oferecer o ranking pelo comando `ranking` no WhatsApp e por uma tela no site, mostrando nomes e números, nunca telefones.

#### Scenario: WhatsApp

- **WHEN** a pessoa envia `ranking`
- **THEN** o bot responde com a lista em texto

#### Scenario: Privacidade

- **WHEN** o ranking é exibido
- **THEN** nenhum número de telefone aparece
