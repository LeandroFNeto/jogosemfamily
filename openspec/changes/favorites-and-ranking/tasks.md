# Tasks

## 1. Favoritos permanentes

- [x] 1.1 Criar a tabela `favorites` e a migração idempotente de `contacts`; verificar com teste que rodar duas vezes não duplica e que os dados persistem após reinício
- [x] 1.2 Manter `contacts` e `favorites` sincronizados na escrita e verificar que o fluxo web de contatos continua passando nos testes atuais
- [x] 1.3 Implementar os comandos `favoritos` e `parar convites` e a remoção no painel; verificar que remover revoga convites direcionados
- [x] 1.4 Documentar a lista de favoritos em `docs/whatsapp.md`

## 2. Consentimento

- [x] 2.1 Guardar o chamado pendente e enviar a pergunta com Sim, Não e Bloquear; verificar com teste que nada é entregue antes do Sim
- [x] 2.2 Tratar Não (espera de 7 dias, sem revelar o motivo) e Bloquear; verificar os dois casos e o envio após o Sim
- [x] 2.3 Marcar entrada pelo link como aceite nos dois sentidos; verificar que não há pergunta extra

## 3. Ranking

- [x] 3.1 Criar `match_results` e gravar na conclusão de cada rodada sem duplicar, ignorando bots; verificar com revanche e com partida cancelada
- [x] 3.2 Implementar a consulta do ranking com ordem, desempate e filtro por jogo; verificar com um conjunto de resultados fixo, incluindo partida com desconhecido
- [x] 3.3 Adicionar o comando `ranking` e a tela do site, sem telefones; verificar o texto no bot e em teste de navegador
- [x] 3.4 Documentar o ranking em `docs/architecture.md`

## 4. Chamado em massa

- [x] 4.1 Implementar `chamar` com os botões Entrar e Agora não para os favoritos elegíveis; verificar que bloqueados, sem consentimento e em partida não recebem
- [x] 4.2 Aplicar os limites (20, 5 min por mesa, 3 por hora) e verificar com relógio simulado
- [x] 4.3 Tratar Entrar com lugar, sala cheia (aviso e botão "Criar outra sala") e mesa inexistente; verificar os três caminhos de ponta a ponta com o servidor simulado
- [x] 4.4 Documentar o chamado em `docs/whatsapp.md`

## 5. Integração

- [x] 5.1 Rodar `npm run format`, `npm run check`, `npm test` e `npm run test:e2e` e confirmar que tudo passa

## Workflow follow-up

- Arquivar depois de `whatsapp-bot-frontend`.
