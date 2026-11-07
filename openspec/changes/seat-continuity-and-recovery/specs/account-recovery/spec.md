# Spec Delta

## Purpose

Permitir recuperar o acesso a um perfil pelo número de WhatsApp registrado, com um código aleatório enviado a esse número.

## ADDED Requirements

### Requirement: Número registrado

O sistema SHALL associar cada perfil a, no máximo, um número de WhatsApp registrado, que perfis criados no WhatsApp já têm e que perfis do site registram enviando ao bot um código mostrado no site.

#### Scenario: Perfil criado no WhatsApp

- **WHEN** uma pessoa começa a jogar pelo WhatsApp
- **THEN** o número dela fica registrado no perfil

#### Scenario: Perfil do site registra o número

- **WHEN** a pessoa envia ao bot o código mostrado no site em até 10 minutos
- **THEN** o número dela é registrado no perfil do site

### Requirement: Pedir o código

O sistema SHALL receber o número na tela de recuperação e enviar um código aleatório de 6 dígitos por WhatsApp apenas quando houver perfil para aquele número, respondendo da mesma forma nos dois casos.

#### Scenario: Número com perfil

- **WHEN** a pessoa informa um número registrado
- **THEN** recebe o código no WhatsApp e a tela pede o código

#### Scenario: Número sem perfil

- **WHEN** a pessoa informa um número desconhecido
- **THEN** a tela mostra a mesma mensagem e nada é enviado

### Requirement: Validar o código

O sistema SHALL aceitar o código por 10 minutos, uma única vez, com no máximo 5 tentativas, 3 pedidos por hora por número e por endereço de origem, e SHALL guardar apenas o hash.

#### Scenario: Código correto

- **WHEN** a pessoa digita o código correto no prazo
- **THEN** o navegador recebe acesso ao perfil

#### Scenario: Tentativas esgotadas

- **WHEN** ocorrem 5 tentativas erradas
- **THEN** o código é invalidado e é preciso pedir outro

#### Scenario: Excesso de pedidos

- **WHEN** o número ou o endereço passa de 3 pedidos na hora
- **THEN** o sistema recusa novos pedidos até a hora seguinte

### Requirement: Efeito da recuperação

O sistema SHALL revogar as sessões anteriores do perfil ao recuperar e avisar o dono pelo WhatsApp.

#### Scenario: Recuperação concluída

- **WHEN** o código é aceito
- **THEN** as sessões antigas são revogadas e o bot avisa "Sua conta foi acessada em outro aparelho"

### Requirement: Sem número, sem recuperação

O sistema SHALL informar que perfis sem número registrado não podem ser recuperados e orientar a registrar o número.

#### Scenario: Perfil sem número

- **WHEN** a pessoa tenta recuperar um perfil que nunca registrou número
- **THEN** a tela explica que a recuperação não é possível
