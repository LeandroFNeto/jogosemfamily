# Spec Delta

## Purpose

Dar ao administrador visibilidade sobre o estado do servidor e do bot, e avisá-lo quando algo para de funcionar.

## ADDED Requirements

### Requirement: Verificação de saúde

O sistema SHALL expor `/healthz` respondendo 200 quando o banco responde e informando o estado do provedor de mensagens, sem dados pessoais.

#### Scenario: Tudo certo

- **WHEN** o banco e o provedor estão funcionando
- **THEN** `/healthz` responde 200 com o estado de cada parte

#### Scenario: Banco indisponível

- **WHEN** o banco não responde
- **THEN** `/healthz` responde 503

### Requirement: Métricas

O sistema SHALL expor `/metrics` protegida pelo token administrativo, com contadores de mensagens enviadas, pendentes e descartadas, mesas ativas e erros do provedor.

#### Scenario: Sem token

- **WHEN** `/metrics` é pedida sem o token
- **THEN** o sistema responde 401

#### Scenario: Com token

- **WHEN** `/metrics` é pedida com o token
- **THEN** os contadores são devolvidos em texto simples

### Requirement: Alerta de bot fora do ar

O sistema SHALL avisar o administrador, uma vez por ocorrência, quando o provedor fica desconectado por mais de 5 minutos, e avisar de novo quando voltar.

#### Scenario: Queda prolongada

- **WHEN** o provedor fica desconectado por 5 minutos
- **THEN** o administrador recebe um aviso pelo canal configurado

#### Scenario: Retorno

- **WHEN** o provedor volta
- **THEN** o administrador recebe um aviso de que voltou

### Requirement: Registros sem dados pessoais

O sistema SHALL registrar eventos operacionais sem números de telefone nem conteúdo de mensagens.

#### Scenario: Erro de envio

- **WHEN** um envio falha
- **THEN** o registro contém o código do erro e um identificador interno, nunca o número
