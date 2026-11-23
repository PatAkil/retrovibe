export type RuntimeMessageType = 'gameOver' | 'scoreChanged' | 'stateChanged';

export interface RuntimeMessage {
  source: 'retrovibe';
  type: RuntimeMessageType;
  payload: unknown;
}

export interface Runtime {
  readonly embedded: boolean;
  gameOver(payload?: { score?: number; won?: boolean }): void;
  scoreChanged(score: number): void;
  stateChanged(state: string): void;
  send(type: RuntimeMessageType, payload: unknown): void;
}

export interface RuntimeOptions {
  targetOrigin?: string;
  onStandalone?: (message: RuntimeMessage) => void;
}

function announce(message: RuntimeMessage): void {
  window.dispatchEvent(new CustomEvent('retrovibe', { detail: message }));
}

export function createRuntime(opts: RuntimeOptions = {}): Runtime {
  const embedded = window.parent !== window;
  const targetOrigin = opts.targetOrigin ?? '*';
  const standalone = opts.onStandalone ?? announce;

  function send(type: RuntimeMessageType, payload: unknown): void {
    const message: RuntimeMessage = { source: 'retrovibe', type, payload };
    if (embedded) {
      window.parent.postMessage(message, targetOrigin);
    } else {
      standalone(message);
    }
  }

  return {
    embedded,
    send,
    gameOver(payload = {}) {
      send('gameOver', payload);
    },
    scoreChanged(score) {
      send('scoreChanged', { score });
    },
    stateChanged(state) {
      send('stateChanged', { state });
    },
  };
}
