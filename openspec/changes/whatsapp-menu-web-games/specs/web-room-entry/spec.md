# Spec Delta

## Purpose

Fazer a web abrir a mesa certa, com o perfil certo, quando a pessoa chega pelo link do WhatsApp.

## ADDED Requirements

### Requirement: Sessão e mesa a partir do link

O sistema SHALL, ao receber um link válido, abrir uma sessão para o perfil ligado a ele e redirecionar para a mesa correspondente, sem pedir cadastro ou senha.

#### Scenario: Link válido

- **WHEN** a pessoa abre um link válido no celular ou no computador
- **THEN** a web abre a mesa com o jogo e a dificuldade escolhidos no WhatsApp

#### Scenario: Prévia de link não gasta o acesso

- **WHEN** um serviço de prévia ou o navegador apenas carrega o link (GET)
- **THEN** o sistema mostra o botão "Abrir minha partida" e o link continua válido até alguém confirmar

#### Scenario: Sessões existentes preservadas

- **WHEN** o perfil já tem sessões abertas em outros aparelhos
- **THEN** elas continuam válidas e o link apenas adiciona a sessão do aparelho atual

### Requirement: Link inválido tratado

O sistema SHALL mostrar página clara em português do Brasil para link inexistente, usado, vencido ou de mesa encerrada, sem revelar se o token existiu.

#### Scenario: Token desconhecido

- **WHEN** o token não existe
- **THEN** a página informa que o link não vale mais e orienta digitar `jogo` no WhatsApp

#### Scenario: Mesa encerrada

- **WHEN** a mesa do link já terminou ou foi cancelada
- **THEN** a página informa isso e orienta voltar ao menu do WhatsApp

### Requirement: Convite visível na mesa

O sistema SHALL mostrar, na mesa que espera jogadores, quantos lugares faltam e orientar a convidar pelo WhatsApp, sem exigir nova decisão na web.

#### Scenario: Mesa esperando amigos

- **WHEN** a mesa aberta ainda tem lugares livres
- **THEN** a web exibe os lugares que faltam e orienta usar o WhatsApp para chamar amigos

### Requirement: Regras do jogo inalteradas

O sistema SHALL manter as regras, a autorização no servidor e a privacidade das mãos exatamente como na web existente.

#### Scenario: Ação inválida

- **WHEN** um cliente envia uma jogada que não é da vez
- **THEN** o servidor a recusa como já faz hoje
