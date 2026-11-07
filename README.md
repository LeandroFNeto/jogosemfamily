# Mesa em Família

Jogos web para familiares jogarem à distância, sem instalar aplicativo. Interface em português, sem anúncios e com tempo generoso (e configurável) para cada jogada, seguindo o [roadmap](roadmap_mvp_jogos_familiares.md).

## Jogos disponíveis

| Jogo              | Com familiares                           | Contra bot                                                   | Individual |
| ----------------- | ---------------------------------------- | ------------------------------------------------------------ | ---------- |
| Dominó            | 2 pessoas                                | Fácil, médio e difícil                                       | —          |
| Truco paulista    | 2, 4, 6 ou 8 pessoas, em duas equipes    | Fácil, médio e difícil; bots completam os lugares escolhidos | —          |
| Palavras cruzadas | 2 pessoas, cooperativo                   | Fácil, médio e difícil, com grades independentes             | Sim        |
| Cacheta           | 2 a 4 pessoas ou bots                    | Fácil, médio e difícil                                       | Não        |
| Caça-palavras     | 1 a 2 pessoas, cooperativo ou contra bot | Fácil (8×8), média (12×12) e difícil (15×15)                 | Sim        |
| Quebra-cabeça     | 2 pessoas, cooperativo                   | Fácil, médio e difícil, com montagens independentes          | Sim        |

Escolha o modo no cartão do jogo. No Truco e na Cacheta, escolha também o total de participantes. No modo contra bot há uma pessoa e os demais lugares são preenchidos por bots. Os bots jogam depois das ações humanas, sem serviço externo de inteligência artificial. As dificuldades alteram as estratégias; não são classificações competitivas calibradas com jogadores reais.

## Executar localmente

Requer **Node.js 24.14 ou superior**. A aplicação usa HTTP, criptografia e SQLite do próprio Node; não precisa de banco externo. O Node 24 pode mostrar um aviso de recurso experimental para SQLite.

```sh
npm ci
npm start
```

Abra **http://localhost:3000**. No PowerShell com scripts bloqueados, use `npm.cmd` no lugar de `npm`. Para desenvolvimento com reinício do servidor: `npm run dev`. Atualize a página após editar a interface.

Para jogar em dois aparelhos na mesma rede, abra `http://IP-DO-COMPUTADOR:3000` nos dois. Use esse endereço ao copiar o convite, e permita a porta 3000 no firewall se necessário. `localhost` só funciona no próprio aparelho. Para simular duas pessoas no computador, use navegadores ou perfis diferentes; abas do mesmo perfil compartilham a identidade.

## Fluxo principal

1. Informe nome e, opcionalmente, foto. Escolha o jogo e o modo. No dominó, toque em **Jogar agora**.
2. Copie o convite ou envie pelo WhatsApp. O link expira em até duas horas e aceita um participante.
3. O familiar abre o link, informa seu nome e toca em **Entrar na partida**.
4. Quem convidou confere nome e foto e confirma **Sim, conheço. Começar**. A pessoa passa a constar como contato autorizado. Contatos já autorizados entram diretamente; ao selecionar um contato na criação do dominó, só aquele perfil pode usar o convite. Em mesas de Truco com mais lugares, gere um convite por participante após confirmar o anterior. A partida começa quando todos os lugares estiverem ocupados.
5. No dominó, joguem até alguém ficar sem peças ou os dois passarem. No Truco, avancem entre mãos até uma equipe chegar a 12 pontos. Nos desafios cooperativos, concluam a grade ou a imagem. Todos os participantes humanos precisam pedir **Jogar novamente** para reiniciar; bots aceitam automaticamente e o placar é preservado.

**Acessibilidade** oferece letra normal, grande ou extra grande, alto contraste e leitura em voz alta. O **Painel do familiar** permite editar nome/foto, habilitar cada jogo separadamente e remover contatos. Fotos são recortadas e reduzidas no navegador antes de serem enviadas. No quebra-cabeça, você pode usar a foto do perfil ou a ilustração da casa com jardim. Preferências e partidas ficam salvas no servidor.

O tutorial visual e as regras estão em **Como jogar** e em [docs/tutorial.md](docs/tutorial.md).

## Jogar pelo WhatsApp

Com um número de bot conectado, o WhatsApp é só o **menu**: a pessoa escolhe o jogo, a dificuldade e convida amigos (link `wa.me`, favoritos). Quem entra vira contato autorizado e todos recebem um **link pessoal** para jogar **na web**; a partida começa quando a mesa enche. Defina `WEB_BASE_URL` (ou `PUBLIC_ORIGIN`) com um endereço que o celular alcance. O canal é opcional e fica desligado sem as variáveis `WPP_URL`, `WPP_SECRET_KEY` e `WHATSAPP_WEBHOOK_SECRET`. Configuração, conexão do número e riscos (o WPPConnect não é oficial): [docs/whatsapp.md](docs/whatsapp.md).

## Responsividade e regras de mesa

Todas as telas foram desenhadas para funcionar de 320 px a monitores largos, em pé ou deitado. O teste `src/tests/browser/responsive.spec.mjs` percorre sete tamanhos de tela (de 320 px a 1920 px) e falha se a página rolar para o lado ou se a mesa sair da tela.

- **Mesa grande.** A mesa ocupa o espaço que sobra na tela. No Truco, em celular deitado, tablet deitado, notebook e monitor, a mesa fica à esquerda e as cartas num painel à direita. No dominó, a mesa cresce com a altura da tela, as peças quebram em várias fileiras e o cabeçalho e a mão ficam compactos no celular.
- **Regra da cruz.** Em todo jogo de mesa com vários jogadores, quem vê a tela fica embaixo e os outros ficam à esquerda, no topo e à direita, com a vez seguindo o sentido horário (padrão ocidental). Parceiros do Truco ficam frente a frente. Detalhes no `AGENTS.md`.
- **Jogador da vez.** O círculo do jogador da vez cresce, fica amarelo e mostra os segundos restantes. O relógio da jogada aparece para todos da mesa.
- **Truco mais humano.** Cada pedido de aumento mostra um letreiro grande (TRUCO, SEIS, NOVE ou DOZE). O bot hesita mais para responder a um pedido, com um balão de dúvida e uma pausa maior. O bot que joga na mesma equipe de uma pessoa é medroso: não pede truco por conta própria, não devolve aumento e às vezes corre com mão fraca, para a pessoa ser a protagonista.
- **Palavras cruzadas.** A grade é o campo de digitação: toque num quadrado e digite. Letras que cruzam outra palavra valem para as duas, então uma palavra fácil descoberta ajuda a resolver as difíceis. Antes de conferir, qualquer letra pode ser apagada ou trocada; Enter (ou o botão) confere a palavra. As dicas ficam numa lista de horizontais e verticais.
- **Caça-palavras.** A grade quadrada fica em cima e, embaixo, a lista de palavras: as que faltam no começo e as encontradas no fim.
- **Uma mesa por pessoa.** Criar ou entrar em uma mesa encerra as outras abertas da pessoa. Se ainda há outras pessoas jogando, ela só sai, um bot assume o lugar e o placar dela é zerado. Ao subir o servidor e a cada minuto, mesas acumuladas são limpas.
- **Um link por pessoa no WhatsApp.** Cada pessoa tem um único link da web ativo, enviado em uma só mensagem; gerar outro invalida o anterior, e envios automáticos repetidos em 30 segundos não geram um novo link.

## Comandos e validação

| Comando                | Finalidade                                                 |
| ---------------------- | ---------------------------------------------------------- |
| `npm start`            | Iniciar API, interface e eventos em tempo real             |
| `npm run dev`          | Reiniciar o servidor quando arquivos mudam                 |
| `npm run check`        | Verificar sintaxe dos módulos e JSON                       |
| `npm run format`       | Formatar código e documentos com Prettier                  |
| `npm run format:check` | Conferir a formatação                                      |
| `npm test`             | Testes de regras, API, autorização, persistência e SSE     |
| `npm run test:e2e`     | Fluxos reais em Chrome, incluindo celular e acessibilidade |
| `npm run build`        | Validar sintaxe e preparar interface em `dist/`            |

Os testes de navegador usam Chrome instalado. Em uma máquina sem Chrome, instale-o ou use `npx playwright install chromium` e execute com `BROWSER_CHANNEL=chromium` (no PowerShell: `$env:BROWSER_CHANNEL='chromium'`). Os testes isolam os dados da aplicação e não alteram `data/mesa.sqlite`. O pipeline em `.github/workflows/ci.yml` executa formatação, testes, build e testes de navegador.

## Estrutura e arquitetura

```text
src/frontend/       telas, componentes HTML e estilos
src/backend/        servidor HTTP, API e repositório SQLite
src/games/core/     registro, rodadas e estratégias de bots
src/games/domino/   regras, distribuição, turnos e pontuação
src/games/cards/    Truco paulista, equipes, manilhas e aumentos
src/games/crossword/ grades, pistas e validação de respostas
src/games/cacheta/  Cacheta (jogos, bater) e bots
src/games/wordsearch/ caça-palavras (grade, listas temáticas)
src/games/puzzle/   montagem de imagens por troca de partes (3×3, 4×4 e 5×5) e banco de imagens
src/invitations/    convites aleatórios, hash, expiração e uso único
src/whatsapp/       bot do WhatsApp: webhook, identidade, conversa e menu e convites (o jogo é na web)
deploy/wppconnect/  composição do WPPConnect server para o bot
src/accessibility/  preferências e leitura em voz alta
src/family-panel/   validação e configuração do jogador
src/shared/         erros e validação compartilhados
src/tests/          testes unitários, integração e navegador
docs/               tutorial, arquitetura e estado da entrega
```

O servidor é a fonte de verdade. Jogadas seguem por HTTP e atualizações por **Server-Sent Events (SSE)**. A reconexão envia o estado atual privado de cada participante. Mãos adversárias e peças do monte não são transmitidas. No Truco, a equipe com onze pontos pode ver as mãos dos próprios parceiros enquanto decide jogar, conforme a regra da mesa. A revisão impede que cliques repetidos apliquem a mesma jogada duas vezes. Perfis e mesas de dominó do formato anterior continuam sendo lidos.

## Dados e publicação

O banco fica em `data/mesa.sqlite` e é ignorado pelo Git. Faça backup consistente com o servidor parado (inclua arquivos `-wal` e `-shm` se existirem). As mesas expiram em 24 horas; sessões, em 30 dias. A identidade pertence ao cookie do navegador, sem senha: limpar cookies perde acesso ao perfil e aos contatos. Não há recuperação de conta nesta versão.

Variáveis: `PORT` (3000), `HOST` (0.0.0.0), `DATABASE_PATH` e `PUBLIC_ORIGIN`. O arquivo `.env.example` serve de referência; variáveis devem ser exportadas no ambiente ou carregadas com `node --env-file=.env src/backend/server.mjs`. Nunca versione `.env` ou o banco.

Para publicar, execute `npm run build`, use **uma instância** Node com disco persistente atrás de proxy HTTPS, configure `NODE_ENV=production` e `PUBLIC_ORIGIN=https://seu-dominio`. Encaminhe o Host original, desative buffering de `/api/rooms/*/events` e permita conexões longas. Em produção, cookies usam `Secure` e os arquivos públicos vêm de `dist/`; no desenvolvimento, são servidos diretamente de `src/`. Não exponha o modo HTTP de desenvolvimento diretamente à internet. Veja os limites de operação em [docs/architecture.md](docs/architecture.md).

## Estado do roadmap

Os seis jogos estão implementados, com convite, autorização, reconexão, placar, revanche, bots em três dificuldades, painel do familiar e acessibilidade. O Truco segue uma regra de mesa paulista, com adaptação para equipes de até quatro pessoas e mão de ferro aberta. As palavras cruzadas possuem duas grades iniciais; o quebra-cabeça usa nove partes. A expansão de conteúdo, o vídeo tutorial, chamadas de vídeo e a validação com pessoas idosas continuam pendentes. A avaliação completa de WCAG AA também precisa acontecer. Consulte [docs/status.md](docs/status.md).
