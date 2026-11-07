# Spec Delta

## Purpose

Apresentar as ações do jogo como botões claros no site e no WhatsApp, escolhendo a forma mais simples que o aparelho aceita.

## ADDED Requirements

### Requirement: Botões grandes no site

O sistema SHALL mostrar cada ação legal da vez como um botão com pelo menos 48 px de altura e um verbo no rótulo, destacando a ação principal.

#### Scenario: Sua vez

- **WHEN** é a vez do jogador
- **THEN** as jogadas possíveis aparecem como botões, como "Jogar [3|5]" ou "Comprar peça"

#### Scenario: Vez de outra pessoa

- **WHEN** não é a vez do jogador
- **THEN** os botões ficam desativados e mostram "Aguarde a vez de Maria"

#### Scenario: Ação sem volta

- **WHEN** o jogador toca em sair ou encerrar a mesa
- **THEN** o site pede confirmação antes de executar

### Requirement: Estratégia de apresentação no WhatsApp

O sistema SHALL escolher a apresentação pelo número de opções: até 3 como botões de resposta, de 4 a 10 como lista e acima de 10 como texto numerado em páginas.

#### Scenario: Poucas opções

- **WHEN** a vez tem 3 opções ou menos
- **THEN** o bot envia botões de resposta

#### Scenario: Muitas opções

- **WHEN** há de 4 a 10 opções
- **THEN** o bot envia uma lista

#### Scenario: Texto sempre presente

- **WHEN** o bot envia botões ou lista
- **THEN** o corpo da mensagem também traz as opções numeradas

### Requirement: Alternativa quando botão não funciona

O sistema SHALL reenviar como texto numerado se o envio de botões ou lista falhar ou estiver desligado, e SHALL evitar tentar de novo por 30 minutos.

#### Scenario: Falha no envio

- **WHEN** o provedor recusa o botão
- **THEN** a mesma mensagem é enviada como texto e os botões ficam em pausa por 30 minutos

#### Scenario: Desligado por configuração

- **WHEN** `WHATSAPP_INTERACTIVE` está em `off`
- **THEN** o bot usa somente texto

### Requirement: Toque em botão desatualizado

O sistema SHALL ligar cada botão à revisão da mesa e SHALL recusar o toque cuja revisão ficou para trás.

#### Scenario: Botão antigo

- **WHEN** o jogador toca em um botão de uma mensagem anterior
- **THEN** a jogada é recusada e o bot reenvia o estado atual

#### Scenario: Número ainda vale

- **WHEN** o jogador digita o número em vez de tocar
- **THEN** a jogada é aceita pelas mesmas regras
