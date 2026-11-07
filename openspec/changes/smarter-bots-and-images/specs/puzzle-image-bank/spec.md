# Spec Delta

## Purpose

Oferecer ao quebra-cabeça imagens variadas em níveis de dificuldade, com uma API própria do servidor e uma alternativa que funciona sem internet.

## ADDED Requirements

### Requirement: Catálogo de imagens

O sistema SHALL manter um catálogo com id, título, atribuição e licença, categoria e dificuldade (fácil, média ou difícil), com pelo menos 12 imagens embutidas.

#### Scenario: Catálogo embutido

- **WHEN** nenhuma fonte externa está configurada
- **THEN** o catálogo embutido atende todas as dificuldades

### Requirement: API de imagens

O sistema SHALL expor `GET /api/images?difficulty=` com a lista e servir cada imagem pela própria origem, buscando imagens externas no servidor e nunca no navegador.

#### Scenario: Listar por dificuldade

- **WHEN** o site pede imagens difíceis
- **THEN** recebe somente imagens marcadas como difíceis

#### Scenario: Imagem externa

- **WHEN** a fonte externa configurada fornece uma imagem
- **THEN** o servidor valida tipo (JPEG, PNG ou WebP) e tamanho (até 2 MB), guarda a cópia e a serve pela própria origem

### Requirement: Dificuldade pelo número de peças

O sistema SHALL ligar a dificuldade ao número de peças: fácil com 9 (3×3), média com 16 (4×4) e difícil com 25 (5×5).

#### Scenario: Escolher dificuldade

- **WHEN** o jogador cria um quebra-cabeça difícil
- **THEN** a grade tem 25 peças e uma imagem de nível difícil

#### Scenario: Imagem aleatória

- **WHEN** o jogador não escolhe a imagem
- **THEN** o servidor sorteia uma imagem da dificuldade pedida

### Requirement: Falha da fonte externa

O sistema SHALL usar o catálogo embutido quando a fonte externa estiver fora do ar, sem quebrar mesas em andamento.

#### Scenario: Fonte indisponível

- **WHEN** a fonte externa não responde
- **THEN** a criação continua com uma imagem embutida

### Requirement: Foto do perfil continua possível

O sistema SHALL manter a foto do perfil como opção explícita de imagem, na grade escolhida.

#### Scenario: Foto do perfil

- **WHEN** o jogador escolhe usar a própria foto
- **THEN** o quebra-cabeça usa a foto na dificuldade pedida
