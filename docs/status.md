# Estado da entrega

## Implementado

- Aplicação local executável, módulos separados, comandos de desenvolvimento/build e pipeline de validação.
- Perfil simples com nome e foto reduzida, sessão por cookie e persistência SQLite.
- Tela inicial, convite com validade e uso único, compartilhamento pelo WhatsApp e confirmação de novos participantes.
- Contatos autorizados, convites vinculados a contatos, remoção com revogação e controle de novas partidas.
- Motor de dominó completo para duas pessoas, compra, passe, bloqueio, pontuação, histórico mínimo e revanche consensual.
- Truco paulista sempre 2 contra 2 (4 lugares), com equipes alternadas, vira, manilhas, aumentos até doze, empates, mão de onze e placar da partida.
- Palavras cruzadas com duas grades iniciais, validação no servidor, cruzamentos e modos individual e em grupo (cooperativo), sem bots.
- Quebra-cabeça de nove partes por troca de posições, imagem de referência, números de ajuda e opção de usar a foto do perfil.
- Bots de um nível único no dominó (2 a 4 jogadores), no Truco e na Cacheta, executados pelo servidor. Eles completam sozinhos mesas que esperam amigos por mais de 3 minutos (ou quando o dono pede) e assumem o lugar de quem sai; aparecem com a marca 🤖 bot. Palavras cruzadas, quebra-cabeça e caça-palavras não têm bots.
- Menu do WhatsApp: uma imagem (`src/whatsapp/assets/menu-jogos.png`), com resposta pelo número (1 a 6, fixo) ou pelo nome do jogo; se a imagem falhar, o bot manda o mesmo menu em texto.
- Permissões individuais para os quatro jogos no painel do familiar e leitura de perfis/mesas antigos.
- Sincronização SSE com reconexão, presença e estado privado de cada jogador, usando o servidor como fonte de verdade.
- Três tamanhos de fonte, alto contraste, foco visível, controles amplos, operação por teclado e leitura opcional.
- Tutorial textual/visual, regras, orientação de segurança e documentação da operação.
- Testes de regras, autorização, API, eventos, persistência e navegador.
- Canal WhatsApp (change `whatsapp-bot-frontend`): bot com menu conversacional, mesas com amigos por link `wa.me` (entrada automática e contato favorito), partidas contra bots ou sozinho. Com a change `whatsapp-menu-web-games`, o jogo acontece só na web: o bot decide, convida e envia um único link pessoal por mesa, ativo por 24 horas, e só o reenvia quando a pessoa digita _jogo_. Os textos do bot são curtos e sem emojis. Coberto por testes com um WPPConnect simulado.
- Arte própria das cartas e peças (change `game-art-cards-and-tiles`): baralho completo com coringa, verso, 28 peças e mesa em SVG gerado por código, sem imagens externas; manilha, pontas abertas e vez destacadas além da cor; animações curtas das jogadas que respeitam movimento reduzido; cartas e peças acompanham tamanho da letra e alto contraste. Em desenvolvimento, `/arte` mostra tudo para revisão (`?font=large`, `?font=extra`, `&contrast=1`); em produção a rota não existe.

## Validação pendente

- Canal WhatsApp: conectar um número de teste real ao WPPConnect, jogar uma rodada de cada jogo e uma partida solo contra bot, e subir o contêiner de `deploy/wppconnect/docker-compose.yml` (a composição foi validada com `docker compose config`, mas a imagem não foi construída nem executada nesta entrega). Avaliar o risco de bloqueio do número e a migração para a Cloud API oficial (ver `docs/whatsapp.md`).
- Sessões reais com pessoas idosas e familiares, observando cliques, erros, pedidos de ajuda, leitura e conclusão da partida.
- Compatibilidade em dispositivos físicos, incluindo Safari/iPhone, Firefox, tablets e conexão instável de longa duração.
- Avaliação completa de WCAG 2.2 AA com leitores de tela e navegação assistiva.
- Ajuste das dificuldades com jogadores reais e expansão do acervo de palavras/imagens. As estratégias atuais são heurísticas, sem classificação de força aferida.
- Implantação em domínio HTTPS com backup e disco persistente.

## Após a validação do primeiro jogo

- Produzir o vídeo de aproximadamente um minuto com as telas aprovadas por usuários. O tutorial escrito já está disponível; um vídeo final não foi produzido.
- Avaliar modalidades adicionais de baralho com base nas entrevistas. O baralho desta entrega é o Truco solicitado; Cacheta, Buraco e Paciência não foram incluídos.
- Avaliar chamada de vídeo/WebRTC, histórico entre sessões e notificações somente quando houver necessidade validada.

As fases posteriores e a validação com usuários não são consideradas concluídas por esta implementação.
