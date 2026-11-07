# Spec Delta

## Purpose

Define como o servidor se conecta a um número de WhatsApp dedicado ao bot, recebe mensagens de forma segura e associa cada telefone a um perfil de jogador.

## ADDED Requirements

### Requirement: Conexão do número do bot

O sistema SHALL permitir conectar um número de WhatsApp dedicado por QR Code e informar se a sessão está conectada, aguardando QR Code ou desconectada.

#### Scenario: Sessão ainda não conectada

- **WHEN** o operador consulta o status e a sessão não está conectada
- **THEN** o sistema informa `QRCODE` e devolve o QR Code para leitura

#### Scenario: Sessão conectada

- **WHEN** o número do bot já está conectado
- **THEN** o sistema informa `CONNECTED` e não gera novo QR Code

#### Scenario: Servidor WPPConnect indisponível

- **WHEN** o WPPConnect não responde
- **THEN** o sistema informa `DISCONNECTED` sem derrubar o servidor do jogo

### Requirement: Autenticação do webhook

O sistema SHALL aceitar eventos do WPPConnect somente quando acompanhados do segredo configurado e SHALL recusar os demais.

#### Scenario: Segredo ausente ou incorreto

- **WHEN** chega um webhook sem o segredo correto
- **THEN** o sistema responde com erro de autorização e não processa a mensagem

#### Scenario: Segredo correto

- **WHEN** chega um webhook com o segredo correto
- **THEN** o sistema responde 200 e processa o evento

### Requirement: Filtro de mensagens irrelevantes

O sistema SHALL ignorar mensagens de grupos, status, tipos que não sejam texto, enviadas pelo próprio número do bot, com mais de 120 segundos de atraso ou com identificador já processado.

#### Scenario: Mensagem de grupo

- **WHEN** o bot recebe mensagem de um grupo
- **THEN** o sistema responde 200 ao WPPConnect e não envia resposta

#### Scenario: Eco do próprio bot

- **WHEN** o evento indica que a mensagem foi enviada pelo número do bot
- **THEN** o sistema a ignora para não responder a si mesmo

#### Scenario: Mensagem reenviada pelo WPPConnect

- **WHEN** chega duas vezes o mesmo identificador de mensagem
- **THEN** a jogada ou o comando é executado uma única vez

### Requirement: Perfil vinculado ao telefone

O sistema SHALL associar cada telefone a um único perfil de jogador, criando-o na primeira conversa e pedindo o nome de exibição antes de permitir jogar.

#### Scenario: Primeira mensagem de um telefone novo

- **WHEN** um telefone desconhecido escreve ao bot
- **THEN** o sistema cria um perfil vinculado a esse telefone e pergunta o nome da pessoa

#### Scenario: Telefone já conhecido

- **WHEN** um telefone com perfil escreve ao bot
- **THEN** o sistema reutiliza o mesmo perfil, contatos e permissões de jogos

#### Scenario: Jogo desabilitado no painel do familiar

- **WHEN** a pessoa tenta iniciar um jogo desabilitado no seu perfil
- **THEN** o sistema recusa e informa que o jogo está desativado

### Requirement: Limite de taxa e privacidade

O sistema SHALL limitar a quantidade de mensagens processadas por telefone por minuto e SHALL NOT registrar o número completo nem o conteúdo das mensagens em logs.

#### Scenario: Excesso de mensagens

- **WHEN** um telefone ultrapassa o limite por minuto
- **THEN** o sistema responde uma vez pedindo para aguardar e descarta as demais até o limite liberar

#### Scenario: Registro de eventos

- **WHEN** o sistema registra um evento do webhook
- **THEN** o telefone aparece mascarado e o texto é omitido

### Requirement: Ordem e atomicidade por telefone

O sistema SHALL processar as mensagens de um mesmo telefone em ordem de chegada, uma por vez.

#### Scenario: Duas jogadas em sequência rápida

- **WHEN** a mesma pessoa envia duas mensagens em menos de um segundo
- **THEN** a segunda é avaliada somente após a primeira concluir e usa o estado atualizado da mesa
