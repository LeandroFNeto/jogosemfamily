# Proposal

## Why

Hoje o jogo só roda no navegador, com cookie de sessão e link de convite aberto numa página web. Para o público-alvo (familiares e pessoas idosas) o WhatsApp já é o aplicativo do dia a dia: não exige instalar nada, abrir navegador ou entender cookies. Transformar um número de WhatsApp em "frontend" do jogo remove essa barreira: quem cria a mesa recebe um link, manda para os amigos no próprio WhatsApp, e a partida começa quando eles tocam no link.

O projeto Tech-Saas-Micro_servico já resolve a parte difícil da conexão (WPPConnect server, geração de token, QR Code, webhook, filtros de ruído e eco). Reaproveitar essa base evita reinventar a integração.

## What Changes

- Novo canal **WhatsApp** que conversa com um número dedicado ao bot (número que será criado e conectado por QR Code), usando o WPPConnect server como no Tech-Saas.
- A pessoa abre conversa com o bot, escolhe o jogo e o modo: **jogar com amigos** ou **jogar sozinha contra bots** (fácil, médio, difícil).
- No modo com amigos o bot devolve um **link de convite** (`wa.me/<número-do-bot>?text=...`) para a pessoa encaminhar aos amigos. Quem toca no link abre a conversa com o bot já com o código preenchido, entra na mesa **sem aprovação manual**, é **salva automaticamente como contato autorizado** de quem convidou ("já favoritada") e a partida **começa assim que a mesa enche**.
- Partidas de Dominó, Truco, Palavras cruzadas e Quebra-cabeça jogáveis por mensagens de texto com opções numeradas, com a mão/estado privado enviado só ao dono.
- O bot avisa cada participante quando é a vez dele e quando a partida termina, com opção de revanche.
- Perfis passam a poder ser identificados pelo telefone do WhatsApp (além do cookie), sem alterar o fluxo web existente.
- Configuração por variáveis de ambiente para o WPPConnect, número do bot e segredo do webhook.

## Capabilities

### New Capabilities

- `whatsapp-gateway`: conexão do número do bot via WPPConnect, recebimento seguro de webhook, filtros (grupos, status, mensagens antigas, eco, duplicadas), limite de taxa e vínculo entre telefone e perfil de jogador.
- `whatsapp-invite-links`: geração e resgate de links de convite `wa.me`, entrada automática na mesa, inclusão automática no contato autorizado e início da partida quando a mesa lota.
- `whatsapp-game-chat`: menu conversacional, criação de partida com amigos ou contra bots, renderização textual dos quatro jogos, entrada de jogadas por mensagem e notificações de vez, fim de partida e revanche.

### Modified Capabilities

<!-- Nenhuma: ainda não existem specs principais em openspec/specs/. O comportamento web atual permanece inalterado. -->

## Impact

- Código novo: `src/whatsapp/` (cliente WPPConnect, webhook, máquina de conversa, renderizadores de texto por jogo).
- `src/backend/server.mjs`: nova rota de webhook e extração das operações de mesa (criar, entrar, agir, revanche) para uso sem cookie.
- `src/backend/store.mjs` e perfil: vínculo telefone → perfil, ids de mensagens processadas e estado de conversa.
- `src/invitations/service.mjs`: convites com código curto para WhatsApp e suporte a mesas com mais de dois lugares.
- Infraestrutura: WPPConnect server como serviço separado (derivado do `wppconnect-server` do Tech-Saas) e novas variáveis de ambiente; produção continua com instância única do servidor Node.
- Documentação: `docs/architecture.md`, `docs/status.md` e README.
- Dependência operacional externa não oficial (WPPConnect), com risco de bloqueio do número pelo WhatsApp (ver design.md).
