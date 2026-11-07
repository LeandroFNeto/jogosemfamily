# Spec Delta

## Purpose

Levar a pessoa da conversa no WhatsApp para a partida na web com um link pessoal, seguro e sem senha.

## ADDED Requirements

### Requirement: Link pessoal de uso único

O sistema SHALL gerar, para um perfil e uma mesa, um link web com token aleatório de pelo menos 256 bits, guardado apenas como hash, de uso único e válido por no máximo 30 minutos.

#### Scenario: Link gerado ao criar a mesa

- **WHEN** a pessoa conclui a criação de uma mesa no WhatsApp
- **THEN** o bot envia um link da forma `<origem-web>/m/<token>` ligado ao perfil dela e à mesa criada

#### Scenario: Link já usado

- **WHEN** o mesmo link é aberto uma segunda vez
- **THEN** o sistema recusa o acesso e orienta a pedir um novo link pelo WhatsApp

#### Scenario: Link vencido

- **WHEN** o link é aberto depois de 30 minutos
- **THEN** o sistema recusa o acesso e orienta a digitar `jogo` no WhatsApp

### Requirement: Novo link sob demanda

O sistema SHALL emitir um novo link para a mesa ativa da pessoa quando ela digitar `jogo`, invalidando os links anteriores ainda não usados daquela pessoa e mesa.

#### Scenario: Recuperar o acesso à partida

- **WHEN** a pessoa digita `jogo` com uma mesa em andamento ou esperando jogadores
- **THEN** o bot envia um link novo e os anteriores deixam de funcionar

#### Scenario: Sem mesa ativa

- **WHEN** a pessoa digita `jogo` sem mesa ativa
- **THEN** o bot mostra o menu em vez de um link

### Requirement: Link pessoal não se transfere

O sistema SHALL ligar cada link a um único perfil e SHALL NOT permitir que o link de uma pessoa entre na mesa em nome de outra.

#### Scenario: Convidados recebem links próprios

- **WHEN** um amigo entra na mesa pelo convite do WhatsApp
- **THEN** o bot envia a esse amigo um link ligado ao perfil dele, e o link do dono não é reaproveitado

#### Scenario: Aviso de privacidade

- **WHEN** o bot envia um link pessoal
- **THEN** a mensagem avisa que o link é pessoal, vale uma vez e não deve ser encaminhado

### Requirement: Origem web alcançável

O sistema SHALL montar o link com a origem web configurada e SHALL NOT enviar link quando ela não estiver configurada.

#### Scenario: Origem não configurada

- **WHEN** a pessoa cria uma mesa e nenhuma origem web está configurada
- **THEN** o bot informa que a partida na web não está disponível neste servidor e não envia link

#### Scenario: Origem local

- **WHEN** a origem configurada é um endereço de rede local sem HTTPS, fora de produção
- **THEN** o bot envia o link e a documentação informa que só aparelhos na mesma rede conseguem abri-lo
