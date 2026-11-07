# Spec Delta

## Purpose

Permitir que quem cria uma mesa convide amigos por um link do WhatsApp, com entrada automática, contato já autorizado e início imediato da partida quando a mesa enche.

## ADDED Requirements

### Requirement: Link de convite do WhatsApp

O sistema SHALL gerar, ao criar uma mesa com amigos, um link `https://wa.me/<número-do-bot>?text=<código>` que abre a conversa com o bot com o código de convite preenchido.

#### Scenario: Criação de mesa com amigos

- **WHEN** a pessoa cria uma mesa com amigos pelo WhatsApp
- **THEN** o bot envia uma mensagem de convite pronta para encaminhar, contendo o link, o nome do jogo e a validade

#### Scenario: Código de uso restrito

- **WHEN** o código é gerado
- **THEN** ele é aleatório, curto o bastante para digitar, vinculado a uma única mesa e válido por no máximo 24 horas

### Requirement: Entrada automática pelo link

O sistema SHALL colocar na mesa, sem aprovação manual, quem enviar ao bot um código de convite válido, desde que tenha informado o nome e o jogo esteja habilitado para ela.

#### Scenario: Amigo toca no link e já tem perfil

- **WHEN** um amigo envia ao bot o código válido e há lugar livre
- **THEN** o sistema o inclui na mesa e avisa quem convidou e o próprio amigo

#### Scenario: Amigo sem perfil

- **WHEN** o telefone é novo ao enviar um código válido
- **THEN** o bot pergunta o nome e, ao receber, conclui a entrada na mesa guardada

#### Scenario: Código expirado ou inexistente

- **WHEN** o código expirou, foi revogado ou não existe
- **THEN** o sistema responde que o convite não é mais válido e orienta a pedir um novo link

#### Scenario: Mesa já cheia

- **WHEN** o código é usado e não há mais lugar
- **THEN** o sistema informa que a mesa já está completa

### Requirement: Contato autorizado automático

O sistema SHALL adicionar quem entrou pelo link à lista de contatos autorizados de quem convidou, equivalente a "favoritar", sem pedir confirmação adicional.

#### Scenario: Primeiro convite aceito

- **WHEN** um amigo entra pelo link de uma pessoa que ainda não o tinha como contato
- **THEN** o amigo passa a constar nos contatos autorizados do convidador

#### Scenario: Amigo já é contato

- **WHEN** o amigo já está nos contatos
- **THEN** a lista não é alterada nem duplicada

#### Scenario: Remoção posterior

- **WHEN** o familiar remove o contato no painel
- **THEN** convites direcionados a ele deixam de funcionar, como no fluxo web

### Requirement: Início automático da partida

O sistema SHALL iniciar a partida e distribuir o estado inicial assim que a quantidade de lugares da mesa for preenchida.

#### Scenario: Mesa de dois lugares

- **WHEN** o segundo jogador entra
- **THEN** a partida começa e ambos recebem sua visão inicial e quem joga primeiro

#### Scenario: Truco com seis lugares

- **WHEN** entram jogadores até completar os seis lugares
- **THEN** a partida só começa no último a entrar e cada novo participante é avisado de quantos faltam

#### Scenario: Dono sai antes de começar

- **WHEN** quem criou a mesa a encerra enquanto aguarda
- **THEN** os códigos pendentes deixam de funcionar e os já presentes são avisados

### Requirement: Restrições de segurança do convite

O sistema SHALL NOT permitir que um dono use o próprio código para ocupar um segundo lugar, nem que um telefone entre duas vezes na mesma mesa.

#### Scenario: Dono abre o próprio link

- **WHEN** o dono envia ao bot o código da sua mesa
- **THEN** o bot informa que ele já está na mesa e reenvia o estado atual

#### Scenario: Telefone repetido

- **WHEN** um telefone já presente envia novamente o código
- **THEN** o sistema não cria jogador duplicado e reenvia o estado atual
