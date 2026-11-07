# Spec Delta

## Purpose

Deixar o WhatsApp apenas com as decisões e o convite de amigos, e a partida somente na web.

## ADDED Requirements

### Requirement: Decisões de preparação no WhatsApp

O sistema SHALL permitir no WhatsApp escolher o jogo, o modo (sozinho contra bots ou com amigos), a dificuldade dos bots (fácil, média ou difícil), os lugares e a mistura de humanos e bots, respeitando as regras de lugares de cada jogo.

#### Scenario: Sozinho contra bots com dificuldade definida

- **WHEN** a pessoa escolhe um jogo, o modo contra bots e a dificuldade média
- **THEN** o servidor cria a mesa com os bots em dificuldade média e o bot envia o link web

#### Scenario: Com amigos

- **WHEN** a pessoa escolhe um jogo e o modo com amigos
- **THEN** o bot cria a mesa, envia o link web pessoal e uma mensagem pronta de convite para encaminhar

### Requirement: Convites e decisões sociais no WhatsApp

O sistema SHALL manter no WhatsApp o convite por link `wa.me`, o chamado de favoritos, a resposta a convites e pedidos de favorito, `sair`, `retirar`, `encerrar`, `revanche`, `favoritos` e `ranking`.

#### Scenario: Amigo aceita o chamado

- **WHEN** um favorito toca em "Entrar" na mensagem de chamado
- **THEN** ele entra na mesa e recebe o seu link web pessoal

#### Scenario: Mesa cheia

- **WHEN** alguém tenta entrar numa mesa lotada
- **THEN** o bot informa que a sala está cheia e oferece criar outra do mesmo jogo

### Requirement: O jogo não acontece no WhatsApp

O sistema SHALL NOT enviar tabuleiro, mão, cartas, grade ou pista pelo WhatsApp e SHALL NOT aceitar jogadas por mensagem.

#### Scenario: Mensagem de jogada durante a partida

- **WHEN** a pessoa envia um número ou palavra de jogada com a mesa em andamento
- **THEN** o bot não altera o jogo e responde com o link para continuar na web e os comandos de decisão

#### Scenario: Partida privada

- **WHEN** a partida está em andamento
- **THEN** nenhuma informação privada de mão ou palavra chega pelo WhatsApp

### Requirement: Avisos essenciais

O sistema SHALL avisar pelo WhatsApp que a partida começou (com o link), lembrar a pessoa parada da sua vez com o link e informar o resultado final com a opção de revanche.

#### Scenario: Partida começa

- **WHEN** a mesa enche e a partida começa
- **THEN** cada pessoa da mesa que usa o WhatsApp recebe um aviso com o seu link

#### Scenario: Fim da partida

- **WHEN** a partida termina
- **THEN** o bot envia o resultado resumido e pergunta se querem revanche, sem renderizar o jogo

#### Scenario: Mensagem de ajuda

- **WHEN** a pessoa envia `ajuda` ou chega pela primeira vez
- **THEN** o bot explica em poucas linhas o que faz no WhatsApp, que o jogo é na web e o que fazer se não houver resposta
