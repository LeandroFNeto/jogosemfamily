# Spec Delta

## Purpose

Permitir jogar Dominó, Truco, Palavras cruzadas e Quebra-cabeça inteiramente por conversa no WhatsApp, sozinho contra bots ou com amigos, mantendo o servidor como única fonte de verdade.

## ADDED Requirements

### Requirement: Menu conversacional

O sistema SHALL apresentar menu em português do Brasil com opções numeradas e aceitar o número ou palavras-chave (`menu`, `ajuda`, `sair`) a qualquer momento.

#### Scenario: Primeira conversa

- **WHEN** a pessoa envia qualquer mensagem sem mesa ativa
- **THEN** o bot cumprimenta e lista os jogos habilitados com números

#### Scenario: Comando de ajuda durante a partida

- **WHEN** a pessoa envia `ajuda` em uma partida
- **THEN** o bot explica os comandos válidos da vez sem alterar o jogo

#### Scenario: Entrada inválida

- **WHEN** a pessoa envia texto que não corresponde a nenhuma opção
- **THEN** o bot responde que não entendeu e repete as opções válidas

### Requirement: Criação de partida com amigos ou contra bots

O sistema SHALL permitir escolher o jogo e o modo — com amigos ou sozinho contra bots em dificuldade fácil, média ou difícil — respeitando as regras de lugares de cada jogo.

#### Scenario: Partida contra bots

- **WHEN** a pessoa escolhe jogar contra bots e informa a dificuldade
- **THEN** a partida começa imediatamente e os bots jogam pelo servidor

#### Scenario: Jogo sem modo solo contra bots exigido

- **WHEN** a pessoa escolhe Palavras cruzadas ou Quebra-cabeça
- **THEN** o bot oferece também o modo individual além de contra bots e com amigos

#### Scenario: Truco com amigos

- **WHEN** a pessoa escolhe Truco com amigos
- **THEN** o bot pergunta 2, 4, 6 ou 8 lugares antes de gerar o convite

#### Scenario: Limite de mesas abertas

- **WHEN** a pessoa já tem dez mesas abertas
- **THEN** o bot recusa e orienta encerrar uma antes de criar outra

### Requirement: Renderização textual do estado

O sistema SHALL enviar a cada jogador uma mensagem com sua visão do jogo — mesa, placar, vez e opções de jogada numeradas — sem expor mãos, peças ou respostas de outros jogadores.

#### Scenario: Mão privada

- **WHEN** o bot envia o estado a um jogador de Dominó ou Truco
- **THEN** a mensagem lista apenas as peças ou cartas desse jogador e a contagem das demais

#### Scenario: Mensagem sem ruído

- **WHEN** a mensagem de estado ultrapassa o limite razoável de tamanho
- **THEN** o bot a divide em partes ordenadas ou resume o histórico mais antigo

### Requirement: Jogadas por mensagem

O sistema SHALL traduzir cada resposta do jogador em uma ação do motor de jogo e validar regras, vez e revisão da mesa no servidor.

#### Scenario: Jogada válida na vez

- **WHEN** o jogador da vez envia o número de uma jogada válida
- **THEN** o servidor aplica a ação, avança bots se houver e envia o novo estado a todos

#### Scenario: Jogada fora da vez

- **WHEN** um jogador envia jogada sem ser a sua vez
- **THEN** o bot informa de quem é a vez e não altera o jogo

#### Scenario: Jogada inválida

- **WHEN** a opção enviada não é permitida pelas regras
- **THEN** o bot explica o motivo e repete as opções atuais

#### Scenario: Opção desatualizada

- **WHEN** o jogador responde a uma mensagem anterior à última revisão da mesa
- **THEN** o servidor rejeita a ação e o bot reenvia o estado atual

### Requirement: Notificações de partida

O sistema SHALL avisar cada participante quando for a sua vez, quando alguém entrar ou sair e quando a partida terminar, com o placar final.

#### Scenario: Vez do adversário concluída

- **WHEN** um jogador joga e a vez passa para outro humano
- **THEN** o próximo jogador recebe o estado com a indicação de que é a sua vez

#### Scenario: Fim da partida

- **WHEN** a partida termina
- **THEN** todos recebem o resultado e a opção de pedir revanche

#### Scenario: Revanche consensual

- **WHEN** todos os humanos confirmam a revanche
- **THEN** uma nova partida começa na mesma mesa

### Requirement: Retomada e saída

O sistema SHALL permitir retomar a partida em andamento reenviando o estado e permitir sair da mesa a qualquer momento.

#### Scenario: Retorno após pausa

- **WHEN** a pessoa envia `jogo` ou `estado` com partida ativa
- **THEN** o bot reenvia o estado atual da mesa

#### Scenario: Saída da mesa

- **WHEN** a pessoa confirma `sair`
- **THEN** a mesa é encerrada ou a pessoa é removida conforme o papel, e os demais são avisados

#### Scenario: Mesa expirada

- **WHEN** a pessoa tenta jogar em mesa expirada
- **THEN** o bot informa que ela expirou e oferece o menu

### Requirement: Convivência com o frontend web

O sistema SHALL manter o aplicativo web funcionando sem alterações de comportamento, compartilhando mesas e regras com o canal WhatsApp.

#### Scenario: Regras idênticas nos dois canais

- **WHEN** a mesma jogada é feita pela web ou pelo WhatsApp
- **THEN** o resultado no motor de jogo é idêntico

#### Scenario: Mesa criada na web

- **WHEN** um perfil com telefone vinculado tem mesa criada na web
- **THEN** o WhatsApp consegue listar e retomar a mesa
