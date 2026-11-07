# Spec Delta

## Purpose

Oferecer um caça-palavras em português com três dificuldades, jogável sozinho, em dupla ou contra um bot, sem revelar a posição das palavras não encontradas.

## ADDED Requirements

### Requirement: Grade por dificuldade

O sistema SHALL gerar a grade conforme a dificuldade: fácil 8×8 com 6 palavras, média 12×12 com 10 e difícil 15×15 com 14.

#### Scenario: Geração

- **WHEN** a partida é criada
- **THEN** todas as palavras escolhidas cabem na grade e os espaços restantes são preenchidos com letras

#### Scenario: Palavras em português

- **WHEN** as palavras são sorteadas
- **THEN** vêm de listas temáticas em português, em maiúsculas e sem acento

### Requirement: Direções por dificuldade

O sistema SHALL colocar as palavras na horizontal e vertical no nível fácil, adicionar diagonais no médio e adicionar palavras invertidas no difícil.

#### Scenario: Nível fácil

- **WHEN** a grade fácil é gerada
- **THEN** nenhuma palavra está na diagonal nem invertida

### Requirement: Marcar uma palavra

O sistema SHALL aceitar a marcação por início e fim das letras (toque ou arrasto no site; "B3 até B8" no WhatsApp) ou pela palavra digitada, e validar tudo no servidor.

#### Scenario: Marcação correta

- **WHEN** o jogador marca o início e o fim de uma palavra escondida
- **THEN** a palavra é marcada como encontrada e o placar é atualizado

#### Scenario: Marcação errada

- **WHEN** o trecho marcado não forma uma palavra da lista
- **THEN** nada é marcado e o jogador pode tentar de novo

#### Scenario: Palavra digitada

- **WHEN** o jogador digita uma palavra da lista ainda não encontrada
- **THEN** o servidor a localiza na grade e a marca

### Requirement: Soluções não vazam

O sistema SHALL enviar a lista de palavras a procurar, mas só enviar a posição das palavras já encontradas.

#### Scenario: Estado público

- **WHEN** o servidor envia o estado
- **THEN** as posições das palavras não encontradas não aparecem

### Requirement: Modos de jogo

O sistema SHALL oferecer os modos individual, cooperativo e contra bot, com progresso separado no modo contra bot e vitória para quem encontrar mais palavras ao fim.

#### Scenario: Contra bot

- **WHEN** o bot joga
- **THEN** encontra palavras com chance de 25%, 55% ou 85% por tentativa conforme o nível

#### Scenario: Cooperativo

- **WHEN** duas pessoas jogam juntas
- **THEN** compartilham as palavras encontradas e vencem juntas ao completar a lista

### Requirement: Leitura no WhatsApp

O sistema SHALL enviar a grade em texto monoespaçado com colunas e linhas rotuladas e a lista de palavras com as encontradas riscadas.

#### Scenario: Grade em texto

- **WHEN** o estado é enviado ao WhatsApp
- **THEN** a mensagem traz a grade rotulada (A–O e 1–15) e a lista de palavras
