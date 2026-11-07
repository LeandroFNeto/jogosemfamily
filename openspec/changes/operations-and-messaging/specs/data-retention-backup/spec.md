# Spec Delta

## Purpose

Limitar o que o sistema guarda e permitir restaurar o banco em caso de perda.

## ADDED Requirements

### Requirement: Retenção de dados

O sistema SHALL apagar diariamente mensagens processadas com mais de 7 dias, fila de saída enviada com mais de 7 dias, códigos expirados e mesas encerradas com mais de 30 dias.

#### Scenario: Limpeza diária

- **WHEN** a rotina de limpeza executa
- **THEN** os registros além do prazo são apagados e os demais permanecem

#### Scenario: Resultados e favoritos

- **WHEN** a limpeza apaga uma mesa antiga
- **THEN** os resultados de partidas e a lista de favoritos permanecem

### Requirement: Backup do banco

O sistema SHALL copiar o banco em um arquivo consistente a cada 24 horas e manter as 7 cópias mais recentes.

#### Scenario: Cópia diária

- **WHEN** passam 24 horas desde a última cópia
- **THEN** uma nova cópia é criada e a mais antiga além de 7 é removida

#### Scenario: Banco em uso

- **WHEN** a cópia ocorre com mesas ativas
- **THEN** o arquivo resultante abre sem erros e está consistente

### Requirement: Restauração documentada

O sistema SHALL documentar o passo a passo de restaurar uma cópia.

#### Scenario: Procedimento

- **WHEN** o administrador segue `docs/architecture.md`
- **THEN** consegue restaurar uma cópia com o servidor parado
