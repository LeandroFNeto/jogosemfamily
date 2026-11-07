# Roadmap Técnico e Especificação de Engenharia de Software — MVP

> A primeira entrega executável está descrita no [README](README.md), com decisões técnicas em [docs/architecture.md](docs/architecture.md) e o que foi implementado ou ainda precisa de validação em [docs/status.md](docs/status.md).

## 1. Objetivo do Projeto

Este documento transforma os requisitos definidos na **Sprint 4 — Ideação e Priorização da Solução Tecnológica** em um plano técnico de construção do MVP.

O sistema deverá permitir que pessoas idosas joguem, à distância, jogos já conhecidos e familiares, com o mínimo possível de fricção tecnológica. O acesso deverá ocorrer por link, preferencialmente recebido pelo WhatsApp, sem instalação, com interface simples, segura, acessível e visualmente limpa.

A solução deve preservar os princípios identificados nas entrevistas:

- facilidade de acesso;
- ausência de instalação;
- sensação de segurança;
- uso de contatos conhecidos;
- letras e controles grandes;
- ausência de pressão por tempo;
- interface intuitiva;
- apoio de familiares;
- possibilidade de jogar com outras pessoas;
- preferência por jogos já conhecidos;
- redução de propagandas, links e distrações;
- experiência próxima à ideia de “sentar à mesa e jogar”.

---

# 2. Escopo do MVP

O MVP deverá concentrar-se em entregar uma experiência funcional e validável, evitando complexidade desnecessária.

A prioridade não é implementar grande quantidade de funcionalidades, mas garantir que a experiência principal seja:

> **Receber um convite → abrir o jogo → reconhecer com quem está jogando → entender o que fazer → jogar sem dificuldade → finalizar → jogar novamente.**

## 2.1. Fluxo principal do usuário

```text
WhatsApp
   ↓
Link de convite
   ↓
Tela inicial simplificada
   ↓
Identificação da partida
   ↓
Mesa de jogo
   ↓
Partida
   ↓
Resultado / placar
   ↓
Jogar novamente
```

O usuário não deverá ser obrigado a navegar por múltiplos menus antes de entrar em uma partida.

---

# 3. Arquitetura Recomendada

## 3.1. Modelo arquitetural

Para o MVP, recomenda-se a utilização de uma arquitetura web baseada em:

```text
WhatsApp / Link de Convite
            ↓
        Front-end Web
            ↓
      API / Back-end
            ↓
 Banco de Dados / Sessões
            ↓
 Serviços de Partida em Tempo Real
```

O sistema deverá ser dividido, no mínimo, nos seguintes módulos:

```text
src/
├── frontend/
├── backend/
├── games/
├── accessibility/
├── invitations/
├── family-panel/
├── shared/
└── tests/
```

A separação lógica deve impedir que regras específicas de um jogo fiquem misturadas com autenticação, interface, acessibilidade ou comunicação entre usuários.

---

# 4. Princípios de Engenharia de Software

## 4.1. SOLID

O projeto deverá seguir os princípios SOLID sempre que aplicáveis.

### S — Single Responsibility Principle

Cada módulo, classe, componente ou serviço deve possuir uma responsabilidade principal bem definida.

Exemplo:

```text
GameSessionService
Responsabilidade: administrar estado da sessão da partida.

InviteService
Responsabilidade: criar e validar convites.

AccessibilityService
Responsabilidade: administrar preferências de acessibilidade.

DominoGameEngine
Responsabilidade: implementar exclusivamente as regras de dominó.
```

Não deverá existir um único componente responsável simultaneamente por:

- interface;
- validação de usuário;
- lógica de jogo;
- armazenamento;
- comunicação com outros jogadores.

---

### O — Open/Closed Principle

A arquitetura deve permitir adicionar novos jogos sem alterar profundamente os jogos já existentes.

Exemplo de contrato:

```ts
interface GameEngine {
    initialize(): void;
    start(): void;
    processAction(action: GameAction): GameState;
    validateAction(action: GameAction): boolean;
    finish(): GameResult;
}
```

Cada jogo deverá implementar esse contrato.

Exemplos:

```text
DominoGameEngine
CardGameEngine
CrosswordGameEngine
PuzzleGameEngine
```

---

### L — Liskov Substitution Principle

Todo jogo registrado no sistema deverá poder ser utilizado pelo controlador principal da plataforma sem exigir tratamento especial indevido.

O controlador deverá trabalhar com a abstração `GameEngine`, e não com implementações específicas.

---

### I — Interface Segregation Principle

Interfaces deverão ser pequenas e específicas.

Evitar:

```text
GameService
- criar partida
- autenticar
- enviar convite
- alterar contraste
- calcular pontuação
- reproduzir áudio
```

Preferir:

```text
GameEngine
InvitationService
PlayerService
AccessibilityService
ScoreService
SpeechService
```

---

### D — Dependency Inversion Principle

Os módulos principais não deverão depender diretamente de detalhes de infraestrutura.

Exemplo:

```text
GameSessionService
    ↓
SessionRepository
    ↓
PostgresSessionRepository
```

O serviço deverá depender da interface `SessionRepository`, e não diretamente do banco de dados escolhido.

---

# 5. Outros Princípios Obrigatórios

## 5.1. KISS — Keep It Simple, Stupid

A solução deve ser simples tanto para o usuário quanto para a manutenção técnica.

Evitar:

- menus profundos;
- fluxos longos;
- excesso de estados;
- múltiplas confirmações;
- animações desnecessárias;
- excesso de ícones sem texto;
- opções técnicas expostas ao usuário.

---

## 5.2. YAGNI — You Aren't Gonna Need It

Não deverão ser implementadas funcionalidades sem evidência de necessidade no MVP.

Exemplos de funcionalidades que podem ficar fora da primeira versão:

- ranking global;
- sistema de moedas;
- marketplace;
- avatar 3D;
- loja virtual;
- conquistas complexas;
- chat público;
- feed social;
- sistema de amigos desconhecidos;
- publicidade;
- integração com múltiplas redes sociais.

---

## 5.3. DRY — Don't Repeat Yourself

Regras compartilhadas entre jogos e telas devem ser reutilizadas.

Exemplos:

- componente de botão;
- modal de confirmação;
- configuração de fonte;
- controle de contraste;
- card de jogador;
- componente de placar;
- serviço de áudio;
- gerenciamento de sessão.

---

## 5.4. Separation of Concerns

A aplicação deverá separar claramente:

- interface;
- lógica de negócio;
- regras dos jogos;
- persistência;
- comunicação em tempo real;
- acessibilidade;
- gerenciamento de usuários;
- convites.

---

## 5.5. Clean Code

O código deverá priorizar:

- nomes descritivos;
- funções pequenas;
- métodos com uma responsabilidade;
- ausência de números mágicos;
- constantes nomeadas;
- tratamento explícito de erros;
- comentários apenas quando necessários;
- testes automatizados para regras críticas.

---

# 6. Estrutura Técnica Recomendada

```text
src/
│
├── frontend/
│   ├── components/
│   ├── pages/
│   ├── layouts/
│   ├── accessibility/
│   ├── games/
│   └── services/
│
├── backend/
│   ├── controllers/
│   ├── services/
│   ├── repositories/
│   ├── entities/
│   ├── dto/
│   ├── validators/
│   └── websocket/
│
├── games/
│   ├── core/
│   │   ├── GameEngine
│   │   ├── GameState
│   │   ├── Player
│   │   └── GameAction
│   │
│   ├── domino/
│   ├── cards/
│   ├── crossword/
│   └── puzzle/
│
├── shared/
│   ├── types/
│   ├── constants/
│   └── utils/
│
└── tests/
```

---

# 7. Estratégia para Implementação dos Jogos

A plataforma deverá ser preparada para receber múltiplos jogos, porém o MVP deve começar com **um jogo principal completamente funcional**, validado com usuários reais.

Depois da validação, outros jogos poderão ser incorporados utilizando a mesma infraestrutura.

## 7.1. Ordem recomendada

### Jogo 1 — Dominó

Prioridade alta por apresentar:

- regras conhecidas;
- peças grandes;
- forte familiaridade com o público;
- interface simples;
- baixa dependência de texto;
- boa adaptação para turnos sem cronômetro.

### Jogo 2 — Baralho

O módulo de baralho deverá ser projetado para permitir múltiplas modalidades posteriormente.

Exemplos:

- cacheta;
- truco;
- buraco;
- paciência.

Não é recomendável implementar todas as modalidades simultaneamente no primeiro ciclo.

A arquitetura deverá possuir:

```text
CardGameEngine
    ↓
CachetaRules
TrucoRules
BuracoRules
SolitaireRules
```

### Jogo 3 — Palavras cruzadas

Pode ser utilizado como alternativa individual ou cooperativa.

### Jogo 4 — Quebra-cabeça

Pode trabalhar com imagens familiares e interação simplificada.

---

# 8. Requisitos do Motor de Jogos

Todo jogo deverá possuir:

- identificação única;
- estado da partida;
- lista de jogadores;
- jogador da vez;
- regras de movimentação;
- validação da jogada;
- histórico mínimo de ações;
- detecção de fim da partida;
- resultado;
- opção de reiniciar;
- persistência temporária da sessão.

Exemplo:

```ts
interface GameState {
    gameId: string;
    sessionId: string;
    players: Player[];
    currentPlayerId: string;
    status: "WAITING" | "PLAYING" | "FINISHED";
    score: Score;
}
```

---

# 9. Comunicação em Tempo Real

Jogos multiplayer deverão utilizar comunicação em tempo real.

Tecnologias possíveis:

- WebSocket;
- Socket.IO;
- serviço equivalente.

Eventos esperados:

```text
PLAYER_JOINED
PLAYER_LEFT
GAME_STARTED
PLAYER_ACTION
GAME_STATE_UPDATED
GAME_FINISHED
PLAY_AGAIN_REQUESTED
```

O servidor deverá ser a fonte principal de verdade do estado da partida, evitando que cada navegador mantenha uma versão independente das regras.

---

# 10. Convites

O sistema deverá permitir gerar links de convite simples.

Exemplo conceitual:

```text
https://jogo.exemplo.com/entrar/ABCD1234
```

O link deve identificar:

- partida;
- remetente;
- jogo;
- validade;
- permissões.

Evitar incluir dados pessoais diretamente na URL.

---

# 11. Segurança

## 11.1. Princípios

A segurança deverá ser proporcional ao contexto do MVP, sem criar fricção excessiva.

O sistema deverá:

- utilizar HTTPS;
- validar convites;
- impedir acesso a partidas por usuários não autorizados;
- impedir entrada de desconhecidos;
- evitar exposição de dados pessoais;
- limitar tempo de validade de convites;
- proteger endpoints;
- validar dados enviados pelo cliente;
- impedir alteração de pontuação diretamente pelo navegador.

## 11.2. Ambiente sem links externos

Durante a partida:

- não exibir publicidade;
- não exibir banners;
- não exibir pop-ups promocionais;
- não utilizar links externos;
- não solicitar dados bancários;
- não solicitar pagamento;
- não redirecionar o usuário para páginas externas.

---

# 12. Front-end — Diretriz Visual

## 12.1. Estilo

O front-end deverá seguir **minimalismo funcional**.

Princípios:

- poucos elementos por tela;
- foco em uma única ação principal;
- fundo limpo;
- alto contraste;
- tipografia legível;
- botões grandes;
- textos objetivos;
- ausência de elementos decorativos que disputem atenção com a jogabilidade;
- uso consistente de espaçamento;
- ícones acompanhados de texto sempre que possível.

---

# 13. Design System

Criar um pequeno Design System desde o início.

Componentes mínimos:

```text
Button
LargeButton
PlayerCard
GameCard
Modal
ConfirmationDialog
ScorePanel
AccessibilityPanel
InviteCard
TopBar
GameBoard
```

Cada componente deverá possuir versões acessíveis.

Exemplo:

```text
Button
├── normal
├── large
├── high-contrast
├── disabled
└── focus-visible
```

---

# 14. Acessibilidade

O sistema deverá seguir como referência a **WCAG 2.2**, buscando pelo menos conformidade AA nos componentes principais.

## 14.1. Fonte

Disponibilizar:

```text
Normal
Grande
Extra grande
```

A alteração deverá ocorrer sem quebrar o layout.

Evitar tamanhos fixos em pixels quando isso prejudicar escalabilidade.

Preferir:

```css
rem
em
%
```

---

## 14.2. Contraste

Disponibilizar modo de alto contraste.

Elementos essenciais não deverão depender apenas de cor.

Exemplo incorreto:

```text
Verde = pode jogar
Vermelho = não pode jogar
```

Exemplo recomendado:

```text
✓ Jogada permitida
✕ Jogada não permitida
```

---

## 14.3. Tamanho dos controles

Botões deverão possuir área de toque confortável.

Preferencialmente, controles principais devem possuir dimensões próximas ou superiores a:

```text
44 x 44 px
```

---

## 14.4. Navegação

A interface deverá permitir:

- mouse;
- touchscreen;
- teclado.

O foco do teclado deverá ser visível.

---

## 14.5. Tempo

Nenhuma jogada deverá possuir tempo obrigatório por padrão.

Se houver cronômetro:

- deverá ser opcional;
- deverá poder ser desativado;
- não deverá impedir participação do usuário.

---

## 14.6. Texto para voz

O sistema deverá prever funcionalidade opcional de leitura em voz alta de:

- cartas;
- peças;
- mensagens;
- instruções;
- resultado da partida.

---

# 15. Painel do Familiar

O painel do familiar deverá possuir configuração simples.

Configurações previstas:

```text
Nome do jogador
Foto
Tamanho da fonte
Alto contraste
Leitura em voz alta
Contatos autorizados
Jogos disponíveis
```

O painel não deverá aparecer constantemente para o usuário idoso.

A configuração deverá ser realizada preferencialmente uma única vez.

---

# 16. Tela Inicial

A tela inicial deverá possuir o mínimo de opções.

Exemplo:

```text
Olá, Maria.

[ JOGAR AGORA ]

Jogos disponíveis:
[ Dominó ]
[ Baralho ]
[ Palavras Cruzadas ]
```

Evitar:

```text
Dashboard
Configurações avançadas
Central de recompensas
Perfil detalhado
Marketplace
Notícias
Feed
```

---

# 17. Tela de Convite

Exemplo:

```text
João convidou você para jogar Dominó.

Foto de João

[ ENTRAR NA PARTIDA ]

Você está entrando em uma partida com alguém da sua família.
```

O usuário deverá saber claramente:

- quem enviou;
- qual jogo será aberto;
- qual ação deverá realizar.

---

# 18. Mesa do Jogo

Durante a partida, manter sempre visível:

```text
Você está jogando com João
```

Elementos recomendados:

```text
Foto
Nome
Estado da partida
Mesa
Placar
Botão de ajuda
Botão de sair
```

Evitar excesso de informações simultâneas.

---

# 19. Chamada de Vídeo

A chamada de vídeo é importante para aproximar a experiência digital da experiência presencial.

Entretanto, pode ser implementada em uma fase posterior do MVP caso aumente excessivamente a complexidade inicial.

A arquitetura deverá permitir integração futura com tecnologias como WebRTC.

Prioridade:

```text
P1 — Partida funcional
P2 — Multiplayer
P3 — Convite
P4 — Acessibilidade
P5 — Vídeo
```

---

# 20. Roadmap de Desenvolvimento

## Fase 0 — Preparação

Objetivo: estabelecer a base do projeto.

### Entregas

- definição da stack;
- criação do repositório;
- convenções de código;
- ambiente de desenvolvimento;
- configuração de lint;
- formatação automática;
- testes;
- pipeline de build;
- definição da arquitetura;
- criação do Design System inicial.

### Resultado esperado

Projeto executando localmente com front-end e back-end conectados.

---

## Fase 1 — Protótipo Funcional de Interface

Objetivo: validar a experiência de navegação antes de investir na lógica completa.

### Implementar

- tela inicial;
- tela de convite;
- tela de jogo;
- placar;
- botão jogar novamente;
- painel de acessibilidade;
- fonte ampliada;
- alto contraste.

### Critério de conclusão

Uma pessoa deve conseguir abrir o protótipo e compreender onde clicar sem receber instruções verbais.

---

## Fase 2 — Infraestrutura de Usuários e Sessões

### Implementar

- perfil simplificado;
- sessão;
- identificação do usuário;
- geração de link;
- validação de convite;
- identificação do jogador;
- lista de jogadores autorizados.

### Critério de conclusão

Dois usuários conseguem abrir a mesma sessão utilizando links válidos.

---

## Fase 3 — Framework de Jogos

Objetivo: criar a base reutilizável.

### Implementar

```text
GameEngine
GameState
GameAction
GameResult
GameSession
GameRegistry
```

### Critério de conclusão

Um jogo de demonstração simples consegue utilizar o framework sem código específico no controlador principal.

---

## Fase 4 — Implementação do Primeiro Jogo

### Jogo recomendado

**Dominó**

### Implementar

- criação das peças;
- distribuição;
- tabuleiro;
- turnos;
- validação de jogada;
- pontuação;
- vitória;
- reinício;
- sincronização multiplayer.

### Critério de conclusão

Uma partida completa deve poder ser realizada por duas pessoas.

---

## Fase 5 — Multiplayer em Tempo Real

### Implementar

- WebSocket;
- entrada na sala;
- sincronização de estado;
- atualização de jogada;
- reconexão;
- tratamento de queda de conexão;
- encerramento da partida.

### Critério de conclusão

Dois dispositivos diferentes visualizam o mesmo estado da partida.

---

## Fase 6 — Acessibilidade Completa

### Implementar

- três tamanhos de fonte;
- alto contraste;
- navegação por teclado;
- feedback de foco;
- controles grandes;
- leitura em voz alta;
- mensagens simplificadas;
- ausência de cronômetro obrigatório.

### Critério de conclusão

Todos os fluxos críticos devem continuar utilizáveis com fonte extra grande e alto contraste.

---

## Fase 7 — Painel do Familiar

### Implementar

- cadastro simplificado;
- foto;
- preferências;
- contatos autorizados;
- jogos permitidos;
- configurações de acessibilidade.

---

## Fase 8 — Integração com WhatsApp

Objetivo: facilitar o compartilhamento do convite.

### MVP

Gerar um botão:

```text
[ Enviar convite pelo WhatsApp ]
```

Ao clicar, o sistema deverá abrir o WhatsApp com mensagem pronta contendo o link.

Exemplo:

```text
Oi! Vamos jogar dominó?
É só clicar aqui:
https://...
```

Não é necessário, inicialmente, desenvolver um bot complexo dentro do WhatsApp.

---

## Fase 9 — Tutorial e Material de Apoio

### Produzir

- vídeo curto de aproximadamente 1 minuto;
- tutorial visual;
- orientações de segurança;
- explicação sobre como identificar um convite legítimo.

Conteúdo sugerido:

```text
1. Receba o convite.
2. Confira quem enviou.
3. Toque no link.
4. Toque em Jogar.
5. Pronto.
```

---

## Fase 10 — Segundo Jogo

Após validação do primeiro jogo:

### Opções

```text
Baralho
Palavras cruzadas
Quebra-cabeça
```

A escolha deverá considerar feedback dos usuários.

---

# 21. Priorização MoSCoW

## MUST HAVE

- acesso por link;
- ausência de instalação;
- tela simples;
- primeiro jogo funcional;
- multiplayer;
- nome e foto do jogador;
- convite;
- fonte grande;
- alto contraste;
- sem propaganda;
- botão jogar novamente;
- placar;
- segurança básica;
- painel do familiar.

## SHOULD HAVE

- texto para voz;
- tutorial em vídeo;
- integração para envio pelo WhatsApp;
- reconexão automática;
- histórico simples de partidas.

## COULD HAVE

- chamada de vídeo;
- emojis;
- reações rápidas;
- mais jogos;
- notificações.

## WON'T HAVE NO MVP

- ranking global;
- compras;
- anúncios;
- cassino;
- apostas;
- chat público;
- usuários desconhecidos;
- marketplace;
- feed social.

---

# 22. Testes

## 22.1. Testes unitários

Obrigatórios para:

- regras dos jogos;
- cálculo de pontuação;
- validação de jogadas;
- geração de convite;
- autorização.

---

## 22.2. Testes de integração

Validar:

```text
Front-end → API
API → Banco
API → WebSocket
GameEngine → Session
Invitation → Session
```

---

## 22.3. Testes End-to-End

Fluxos obrigatórios:

```text
Receber convite
↓
Abrir link
↓
Entrar na partida
↓
Realizar jogada
↓
Finalizar
↓
Jogar novamente
```

---

## 22.4. Testes com usuários

Os testes deverão utilizar participantes próximos ao perfil das personas entrevistadas.

Observar:

- se encontram o botão correto;
- se entendem quem está jogando;
- se sabem quando é sua vez;
- se conseguem ler;
- se conseguem tocar nos controles;
- se percebem segurança;
- se sentem necessidade de ajuda;
- se conseguem iniciar outra partida.

---

# 23. Métricas de Usabilidade

Registrar:

```text
Tempo até entrar em uma partida
Quantidade de cliques até jogar
Quantidade de erros
Quantidade de pedidos de ajuda
Taxa de conclusão da partida
Taxa de jogar novamente
```

Meta conceitual:

```text
Receber link → começar partida
com o menor número possível de decisões.
```

---

# 24. Critérios de Aceitação do MVP

O MVP será considerado funcional quando:

- um familiar conseguir criar uma partida;
- gerar um convite;
- enviar o convite;
- o outro usuário conseguir abrir sem instalar aplicativo;
- o usuário identificar com quem está jogando;
- dois jogadores conseguirem realizar uma partida completa;
- o sistema funcionar sem cronômetro obrigatório;
- fontes puderem ser aumentadas;
- o modo de alto contraste funcionar;
- nenhum anúncio ou link externo aparecer;
- o placar for atualizado;
- o botão “jogar novamente” funcionar.

---

# 25. Definição de Pronto — Definition of Done

Uma funcionalidade só deverá ser considerada concluída quando:

```text
[ ] Implementada
[ ] Revisada
[ ] Testada
[ ] Responsiva
[ ] Acessível
[ ] Sem erros de console
[ ] Com tratamento de erro
[ ] Documentada
[ ] Integrada ao restante do sistema
[ ] Validada no fluxo do usuário
```

---

# 26. Convenções de Desenvolvimento

## Branches

```text
main
develop
feature/*
fix/*
refactor/*
```

## Commits

Preferir padrão como:

```text
feat: adiciona criação de partida
fix: corrige validação de convite
refactor: separa regras do jogo
test: adiciona testes do dominó
docs: atualiza documentação
```

---

# 27. Requisitos Não Funcionais

## Desempenho

- carregamento inicial rápido;
- interface leve;
- evitar bibliotecas desnecessárias;
- reduzir quantidade de imagens pesadas;
- feedback imediato ao toque.

## Responsividade

Prioridade:

```text
1. Smartphone
2. Tablet
3. Desktop
```

## Compatibilidade

Priorizar navegadores modernos:

- Chrome;
- Edge;
- Safari;
- Firefox.

---

# 28. Diretriz de Experiência

Toda decisão de interface deverá responder à seguinte pergunta:

> **Isso facilita ou dificulta uma pessoa idosa iniciar e continuar a partida?**

Se uma funcionalidade aumentar significativamente a complexidade sem melhorar diretamente a experiência principal, deverá ser adiada.

---

# 29. Regra Principal do MVP

A plataforma não deve tentar ser uma rede social completa.

O produto deverá ser concebido como:

> **uma mesa de jogos digital simples para familiares jogarem juntos à distância.**

A prioridade deve ser:

```text
Simplicidade
↓
Segurança percebida
↓
Acessibilidade
↓
Jogabilidade
↓
Comunicação familiar
```

---

# 30. Entrega Técnica Inicial Recomendada

Primeira entrega funcional:

```text
WebApp
+
Link compartilhável
+
Perfil simplificado
+
Dominó multiplayer
+
Fonte ampliada
+
Alto contraste
+
Placar
+
Jogar novamente
+
Painel básico do familiar
```

Após validação:

```text
WhatsApp facilitado
+
Texto para voz
+
Baralho
+
Palavras cruzadas
+
Quebra-cabeça
+
Chamada de vídeo
```

---

# 31. Resultado Esperado

Ao final do MVP, a solução deverá demonstrar tecnicamente que é possível oferecer uma experiência de jogo remoto entre familiares com baixa barreira tecnológica, reduzindo a necessidade de instalação, menus complexos e interações difíceis.

O sucesso do projeto não deverá ser medido pela quantidade de funcionalidades implementadas, mas pela capacidade de permitir que o público-alvo consiga:

> **abrir, compreender, jogar e repetir a experiência com autonomia e segurança.**
