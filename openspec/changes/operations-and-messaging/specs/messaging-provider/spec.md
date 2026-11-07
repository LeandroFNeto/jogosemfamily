# Spec Delta

## Purpose

Isolar o envio de mensagens atrás de uma interface e garantir que nenhuma mensagem se perca quando o provedor está fora do ar.

## ADDED Requirements

### Requirement: Interface de provedor

O sistema SHALL enviar todas as mensagens por uma interface única de provedor com `send(to, message)` e `status()`, tendo o WPPConnect como implementação inicial.

#### Scenario: Troca de provedor

- **WHEN** outra implementação da interface é configurada
- **THEN** nenhum módulo de jogo ou de conversa precisa mudar

### Requirement: Fila de saída durável

O sistema SHALL gravar cada mensagem de saída no banco antes de enviá-la e SHALL marcá-la como enviada somente após a confirmação do provedor.

#### Scenario: Reinício durante o envio

- **WHEN** o servidor reinicia com mensagens pendentes
- **THEN** elas são enviadas ao voltar, sem duplicar as já confirmadas

#### Scenario: Provedor fora do ar

- **WHEN** o provedor responde com erro
- **THEN** a mensagem permanece pendente e é reenviada com espera crescente

### Requirement: Descarte por prazo

O sistema SHALL descartar mensagens pendentes com mais de 10 minutos e registrar o descarte.

#### Scenario: Mensagem velha

- **WHEN** uma mensagem pendente passa de 10 minutos
- **THEN** ela é descartada e o descarte é contado nas métricas

### Requirement: Ordem por destinatário

O sistema SHALL enviar as mensagens de um mesmo destinatário na ordem em que foram criadas.

#### Scenario: Duas mensagens seguidas

- **WHEN** duas mensagens para a mesma pessoa estão pendentes
- **THEN** a mais antiga é enviada primeiro, e a falha dela retém a seguinte
