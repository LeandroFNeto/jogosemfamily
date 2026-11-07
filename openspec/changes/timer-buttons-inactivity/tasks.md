# Tasks

## 1. Prazo da vez e jogada automática

- [x] 1.1 Guardar `turn` na sala, expor `turn` e `serverNow` no estado e permitir escolher 30, 60, 90 ou desligado no painel; verificar com testes que só jogos com vez recebem prazo
- [x] 1.2 Criar a varredura de 1 s com índice de prazos reconstruído do banco e verificar com relógio simulado que o prazo vencido dispara a jogada
- [x] 1.3 Executar a jogada automática com a estratégia fácil, registrar `auto` no histórico, avisar a mesa e recusar ações tardias; verificar em teste dos quatro jogos
- [x] 1.4 Documentar o tempo por jogada em `docs/architecture.md` e conferir que a frase "sem limite de tempo" foi ajustada

## 2. Barra de tempo no site

- [x] 2.1 Criar a barra com cores por faixa e o relógio na ponta, medindo o desvio do relógio do servidor; verificar em teste de navegador as três cores
- [x] 2.2 Fazer o relógio balançar mais rápido ao fim e desligar o balanço com menos movimento ou alto contraste; verificar em teste de navegador e com a mesa em letra extra grande
- [x] 2.3 Mostrar segundos em texto e anunciar aos 10 s para leitores de tela; verificar com inspeção do `role="timer"` e do texto anunciado

## 3. Cronômetro no WhatsApp

- [x] 3.1 Gerar a barra em texto na mensagem de vez e verificar com teste os 10 quadrados nas três cores
- [x] 3.2 Agendar os dois lembretes e cancelá-los quando a revisão muda; verificar com relógio simulado que jogar antes não gera lembrete

## 4. Inatividade

- [x] 4.1 Registrar `lastSeenAt` por jogador (conexão, ação, mensagem) e verificar em teste que cada fonte conta como presença
- [x] 4.2 Cancelar partida `PLAYING` sem humano presente por 5 min com `closedReason = 'inactive'` e revogar convites; verificar que mesa aguardando amigos não é cancelada
- [x] 4.3 Tratar retorno no site e no WhatsApp: mesa ativa reabre no estado atual; mesa cancelada mostra aviso, menu e exige nova partida; verificar nos dois canais
- [x] 4.4 Documentar as regras em `docs/whatsapp.md` e conferir o texto das mensagens

## 5. Botões

- [x] 5.1 Redesenhar as ações do site como botões grandes com estado desativado e confirmação; verificar em teste de navegador, incluindo teclado e celular
- [x] 5.2 Implementar `presentOptions` (botões, lista ou texto) e o envio no cliente do provedor; verificar com servidor simulado cada faixa de quantidade
- [x] 5.3 Ler respostas de toque, validar a revisão e recusar botões antigos; verificar que o número digitado continua valendo
- [x] 5.4 Criar o disjuntor de 30 min e a chave `WHATSAPP_INTERACTIVE`; verificar que a falha de envio cai para texto e não tenta de novo
- [x] 5.5 Documentar os botões em `docs/whatsapp.md`

## 6. Integração

- [x] 6.1 Rodar `npm run format`, `npm run check`, `npm test` e `npm run test:e2e` e confirmar que tudo passa

## Workflow follow-up

- Arquivar esta change depois de `whatsapp-bot-frontend`.
