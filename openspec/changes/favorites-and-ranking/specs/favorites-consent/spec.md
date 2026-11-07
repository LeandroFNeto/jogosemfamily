# Spec Delta

## Purpose

Guardar no servidor a lista permanente de favoritos de cada pessoa e garantir que ninguém receba chamados sem ter consentido.

## ADDED Requirements

### Requirement: Lista permanente de favoritos

O sistema SHALL guardar no banco, para cada pessoa, a lista de favoritos com o estado de cada um (pendente, aceito, recusado ou bloqueado) e as datas.

#### Scenario: Persistência

- **WHEN** o servidor reinicia
- **THEN** a lista de favoritos continua igual

#### Scenario: Migração dos contatos atuais

- **WHEN** o servidor sobe com perfis que têm `contacts`
- **THEN** cada contato vira um favorito aceito, sem duplicar se a migração rodar de novo

### Requirement: Consentimento no primeiro chamado

O sistema SHALL pedir consentimento antes do primeiro chamado direto, perguntando se a pessoa aceita receber convites de quem chamou e tê-lo nos favoritos, com as respostas Sim, Não e Bloquear.

#### Scenario: Primeiro chamado

- **WHEN** Ana chama pela primeira vez alguém que ainda não a aceitou
- **THEN** a pessoa recebe "Ana quer chamar você para jogar. Aceita receber convites da Ana e colocá-la nos favoritos?" e o chamado só é entregue depois do Sim

#### Scenario: Já aceitou

- **WHEN** a pessoa já aceitou Ana
- **THEN** o chamado chega sem nova pergunta

### Requirement: Entrar pelo link vale como consentimento

O sistema SHALL tratar a entrada pelo link de convite como aceite de quem convidou, sem nova pergunta.

#### Scenario: Entrada pelo link

- **WHEN** um amigo entra na mesa pelo link da Ana
- **THEN** a Ana passa a ser favorita aceita desse amigo e o amigo, favorito aceito da Ana

### Requirement: Recusar e bloquear

O sistema SHALL respeitar a recusa e o bloqueio e SHALL permitir parar de receber convites a qualquer momento.

#### Scenario: Responder Não

- **WHEN** a pessoa responde Não
- **THEN** nada é entregue, quem chamou vê apenas que a pessoa não está disponível e só pode tentar de novo após 7 dias

#### Scenario: Responder Bloquear ou digitar "parar convites"

- **WHEN** a pessoa bloqueia ou digita `parar convites`
- **THEN** nenhum chamado dessa pessoa chega novamente

### Requirement: Ver e remover favoritos

O sistema SHALL permitir ver e remover favoritos pelo WhatsApp (`favoritos`) e pelo painel do site.

#### Scenario: Remover favorito

- **WHEN** a pessoa remove um favorito
- **THEN** convites direcionados a ele deixam de funcionar, como no fluxo atual
