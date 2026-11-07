# Tasks

## 1. Lugares e bot substituto

- [x] 1.1 Criar `seats[]` na sala com leitura de mesas antigas como `present`; verificar que mesas existentes abrem e jogam como antes
- [x] 1.2 Fazer `leave` marcar o lugar como `away` e acionar o bot do lugar em mesa em andamento, e remover a pessoa em mesa aguardando; verificar nos dois casos
- [x] 1.3 Marcar `away` após duas jogadas automáticas seguidas; verificar com relógio simulado
- [x] 1.4 Voltar ao lugar no próximo ponto de decisão com resumo das últimas jogadas, no site e no WhatsApp; verificar que mão e placar se preservam
- [x] 1.5 Mostrar "(ausente)" e o ícone de bot; trocar o botão para "Sair (um bot assume)" e "Encerrar mesa" só para o dono; verificar em teste de navegador
- [x] 1.6 Documentar o novo comportamento de sair em `docs/architecture.md` e `docs/whatsapp.md`

## 2. Dono da mesa

- [x] 2.1 Implementar retirar jogador com confirmação, lista de banidos da mesa e aviso; verificar que o retirado não reentra e entra em outra mesa
- [x] 2.2 Passar a posse por sorteio quando o dono sai; verificar a escolha entre humanos e o caso só com bots
- [x] 2.3 Restringir retirar e encerrar ao dono; verificar a recusa para os demais

## 3. Recuperação de conta

- [x] 3.1 Criar `link_codes` e o vínculo do número a perfil do site, recusando número que já tem perfil; verificar os dois caminhos
- [x] 3.2 Criar `recovery_codes`, o pedido com resposta idêntica e o envio pelo bot; verificar que número desconhecido não envia nada nem revela diferença
- [x] 3.3 Validar código (10 min, uso único, 5 tentativas, 3 pedidos por hora por número e origem) e guardar só o hash; verificar cada limite e que o banco não contém o código
- [x] 3.4 Criar a sessão nova, revogar as antigas e avisar o dono; verificar que cookies antigos deixam de funcionar
- [x] 3.5 Criar as telas "Recuperar acesso" e "Registrar meu número" no site; verificar em teste de navegador
- [x] 3.6 Documentar a recuperação e o risco de número clonado em `docs/architecture.md`

## 4. Integração

- [x] 4.1 Rodar `npm run format`, `npm run check`, `npm test` e `npm run test:e2e` e confirmar que tudo passa

## Workflow follow-up

- Aplicar depois de `timer-buttons-inactivity`.
