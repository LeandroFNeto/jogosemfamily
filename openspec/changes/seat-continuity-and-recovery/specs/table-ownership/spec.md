# Spec Delta

## Purpose

Dar ao dono da mesa o controle de quem joga e garantir que a mesa nunca fique sem dono enquanto houver pessoas nela.

## ADDED Requirements

### Requirement: Retirar jogador

O sistema SHALL permitir que o dono retire um jogador da mesa, passando o lugar a um bot e impedindo a pessoa de voltar àquela mesa.

#### Scenario: Dono retira alguém

- **WHEN** o dono confirma retirar Maria
- **THEN** o lugar vira bot, Maria é avisada e não consegue entrar de novo nessa mesa

#### Scenario: Retirar a si mesmo

- **WHEN** o dono tenta retirar a si mesmo
- **THEN** o sistema recusa e sugere sair da mesa

#### Scenario: Quem não é dono

- **WHEN** outro jogador tenta retirar alguém
- **THEN** o sistema recusa

### Requirement: Retirada não é bloqueio

O sistema SHALL manter a pessoa retirada nos favoritos e livre para outras mesas do dono.

#### Scenario: Outra mesa

- **WHEN** o dono cria outra mesa e chama Maria
- **THEN** Maria pode entrar normalmente

### Requirement: Posse passa ao sair

O sistema SHALL passar a posse da mesa a outro jogador humano sorteado quando o dono sai, e avisar a todos.

#### Scenario: Dono sai com humanos restantes

- **WHEN** o dono sai e há outros humanos
- **THEN** um deles, escolhido ao acaso, torna-se dono e todos são avisados

#### Scenario: Dono sai e não há humanos

- **WHEN** o dono sai e só restam bots
- **THEN** a mesa segue a regra de cancelamento por inatividade
