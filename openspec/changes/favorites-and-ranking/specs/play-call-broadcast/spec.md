# Spec Delta

## Purpose

Permitir que quem criou uma mesa chame todos os favoritos de uma vez e trate com gentileza quem responde tarde demais.

## ADDED Requirements

### Requirement: Chamar favoritos

O sistema SHALL permitir que o dono de uma mesa aguardando jogadores envie um chamado a todos os favoritos aceitos que não estejam em partida, com as opções Entrar e Agora não.

#### Scenario: Envio do chamado

- **WHEN** o dono escolhe chamar os favoritos
- **THEN** cada favorito aceito e disponível recebe "Ana quer jogar Truco. Entrar?" com os botões

#### Scenario: Quem não recebe

- **WHEN** um favorito está bloqueado, não consentiu ou já está jogando
- **THEN** ele não recebe o chamado

### Requirement: Limites do chamado

O sistema SHALL limitar o chamado a 20 destinatários, a um chamado por mesa a cada 5 minutos e a 3 chamados por hora por pessoa.

#### Scenario: Chamado repetido

- **WHEN** o dono tenta chamar de novo antes de 5 minutos
- **THEN** o bot pede para aguardar e informa o tempo restante

### Requirement: Entrar pelo chamado

O sistema SHALL colocar na mesa quem responder Entrar, pelas mesmas regras do link de convite.

#### Scenario: Há lugar

- **WHEN** um favorito toca em Entrar e a mesa tem lugar
- **THEN** ele entra e a partida começa se a mesa encher

### Requirement: Sala cheia

O sistema SHALL responder "Infelizmente a sala está cheia." quando não houver lugar e oferecer o botão "Criar outra sala".

#### Scenario: Chegou tarde

- **WHEN** um favorito toca em Entrar e a mesa já está cheia
- **THEN** recebe o aviso e o botão "Criar outra sala"

#### Scenario: Criar outra sala

- **WHEN** a pessoa toca em "Criar outra sala"
- **THEN** o bot inicia a criação do mesmo jogo com ela como dona

#### Scenario: Mesa que não existe mais

- **WHEN** a mesa foi cancelada ou encerrada
- **THEN** o bot avisa que ela não existe mais e mostra o menu
