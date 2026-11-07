# Spec Delta

## Purpose

Definir como a web desenha cartas, verso, peças de dominó e a mesa, de modo que cada elemento seja legível, distinguível sem depender de cor e falado corretamente por leitores de tela.

## ADDED Requirements

### Requirement: Baralho completo desenhado

O sistema SHALL desenhar cada carta do baralho francês (A, 2 a 10, J, Q, K nos quatro naipes) e o coringa, mostrando valor e naipe nos cantos e no centro, em todos os jogos de cartas.

#### Scenario: Todas as cartas existem

- **WHEN** a galeria ou uma mesa de Truco ou Cacheta exibe qualquer carta do baralho
- **THEN** a carta aparece com valor, naipe e desenho próprio, sem texto de reserva ou imagem quebrada

#### Scenario: Naipe sem depender de cor

- **WHEN** uma pessoa com daltonismo vê copas e ouros, ou paus e espadas
- **THEN** os naipes se distinguem pela forma e pelo símbolo, não só pela cor

### Requirement: Verso e cartas ocultas

O sistema SHALL mostrar o verso padrão para cartas ocultas (monte, mão de adversários, carta coberta) e SHALL NOT incluir no verso nenhuma informação sobre a face.

#### Scenario: Mão do adversário

- **WHEN** a mesa exibe as cartas de outro jogador
- **THEN** cada carta aparece de costas e o conteúdo da página não revela valor nem naipe dela

### Requirement: Peças de dominó desenhadas

O sistema SHALL desenhar as 28 peças do dominó (0 a 6) com pontos em disposição tradicional, na horizontal e na vertical, e uma peça virada para as mãos ocultas.

#### Scenario: Peça girada no tabuleiro

- **WHEN** a peça é jogada na cadeia do tabuleiro
- **THEN** ela aparece na orientação correta, com as pontas que se encostam iguais e visíveis

#### Scenario: Pontas abertas destacadas

- **WHEN** é a vez da pessoa e há jogadas possíveis
- **THEN** as pontas abertas e as peças jogáveis recebem destaque visível além da cor (contorno ou marca)

### Requirement: Nome acessível em português

O sistema SHALL expor para leitores de tela o nome em português do Brasil de cada carta e peça, mesmo que a arte seja decorativa.

#### Scenario: Leitor de tela na mão

- **WHEN** a pessoa navega pela própria mão com leitor de tela
- **THEN** cada item é anunciado como "Sete de copas" ou "Peça seis e quatro", e o verso como "Carta virada"

### Requirement: Adaptação às preferências de acessibilidade

O sistema SHALL ampliar cartas e peças conforme o tamanho de letra escolhido (normal, grande, extra grande) e SHALL reforçar contornos e contraste quando o alto contraste estiver ativo.

#### Scenario: Alto contraste

- **WHEN** a pessoa ativa o alto contraste
- **THEN** valor, naipe e pontos mantêm razão de contraste de pelo menos 4,5:1 contra o fundo da carta ou peça

#### Scenario: Tela de celular

- **WHEN** a mesa é aberta em tela de 360 px de largura
- **THEN** a mão cabe sem rolagem horizontal da página e cada carta ou peça jogável tem área de toque de pelo menos 44 px

### Requirement: Mesa e destaques de jogo

O sistema SHALL desenhar a superfície da mesa e destacar visualmente a manilha e a carta virada do Truco, o descarte e o monte da Cacheta e a vez do jogador.

#### Scenario: Manilha identificada

- **WHEN** o Truco tem carta virada
- **THEN** as cartas que são manilha na mão da pessoa aparecem com marca de destaque e nome acessível "manilha"

### Requirement: Galeria de revisão fora de produção

O sistema SHALL oferecer uma página de galeria com todas as cartas, peças e estados somente quando o ambiente não for de produção.

#### Scenario: Produção

- **WHEN** o servidor roda em produção
- **THEN** a rota da galeria responde como página inexistente

### Requirement: Privacidade e política de segurança preservadas

O sistema SHALL gerar as artes sem estilos inline, scripts de terceiros ou imagens externas, mantendo a política de segurança de conteúdo e a privacidade das mãos.

#### Scenario: Política de conteúdo

- **WHEN** a página é carregada com a política de segurança vigente
- **THEN** todas as artes aparecem sem violações registradas no console
