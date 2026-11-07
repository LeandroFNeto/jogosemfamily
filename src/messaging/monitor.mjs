import { createEventLog } from '../shared/log.mjs';

const DAY = 86400000;

/**
 * Vigia o provedor de mensagens. A cada 30 s consulta o estado; se ficar
 * desconectado por mais de 5 minutos avisa o administrador uma única vez por
 * ocorrência, e avisa de novo quando voltar. Os avisos passam pela fila de
 * saída: se o provedor está fora, eles saem assim que ele volta.
 */
export function createMonitor({
  provider,
  outbox,
  adminAddress = '',
  now = () => Date.now(),
  intervalMs = 30000,
  alertAfterMs = 5 * 60000,
  log = createEventLog(),
}) {
  const state = {
    provider: provider ? 'unknown' : 'not-configured',
    checkedAt: 0,
    downSince: null,
    alerted: false,
  };
  let checking = null;

  const warn = (text) => {
    if (adminAddress && outbox)
      outbox.enqueue(adminAddress, [{ body: text }], { ttl: DAY });
  };

  async function check() {
    if (!provider) return state;
    let status = 'disconnected';
    try {
      status = await provider.status();
    } catch {
      status = 'disconnected';
    }
    state.checkedAt = now();
    state.provider = status;
    if (status === 'connected') {
      if (state.downSince !== null && state.alerted) {
        warn('✅ O bot do WhatsApp voltou a funcionar.');
        log.info('monitor.provider_recovered', {});
      }
      state.downSince = null;
      state.alerted = false;
    } else {
      state.downSince ??= now();
      if (!state.alerted && now() - state.downSince >= alertAfterMs) {
        state.alerted = true;
        warn(
          '⚠️ O bot do WhatsApp está desconectado há mais de 5 minutos. Confira o servidor do WPPConnect e a leitura do QR Code.'
        );
        log.warn('monitor.provider_down', { minutes: 5 });
      }
    }
    return state;
  }

  return {
    state,
    check,
    // Chamado a cada segundo; só consulta o provedor a cada `intervalMs`.
    tick() {
      if (!provider || checking || now() - state.checkedAt < intervalMs) return;
      checking = check().finally(() => {
        checking = null;
      });
    },
    async idle() {
      await checking;
    },
    snapshot() {
      return {
        provider: state.provider,
        downSince: state.downSince,
        alerted: state.alerted,
      };
    },
  };
}
