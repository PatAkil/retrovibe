// runtime.ts — the host contract with a PINNED wire format.
//
// Every message is exactly:
//   { source: 'retrovibe', type: 'gameOver' | 'scoreChanged' | 'stateChanged', payload }
//
// Embed detection is window.parent !== window. When embedded, messages are
// posted to the parent with an explicit targetOrigin (default '*' for MVP —
// tighten at deploy). Standalone, they log to the console. The messaging-game-over
// skill decides WHEN to send; this module enforces the shape.

export type RuntimeMessageType = 'gameOver' | 'scoreChanged' | 'stateChanged';

export interface RuntimeMessage {
  source: 'retrovibe';
  type: RuntimeMessageType;
  payload: unknown;
}

export interface Runtime {
  /** True when running inside a parent frame (host embed). */
  readonly embedded: boolean;
  /** Game reached a terminal state. payload conventionally { score, won }. */
  gameOver(payload?: { score?: number; won?: boolean }): void;
  /** Score changed to a new value. */
  scoreChanged(score: number): void;
  /** Scene/state transition, e.g. 'TITLE' | 'PLAYING' | 'PAUSED' | 'WIN'. */
  stateChanged(state: string): void;
  /** Low-level send — prefer the typed helpers above. */
  send(type: RuntimeMessageType, payload: unknown): void;
}

export interface RuntimeOptions {
  /** postMessage targetOrigin when embedded (default '*'). */
  targetOrigin?: string;
}

export function createRuntime(opts: RuntimeOptions = {}): Runtime {
  const embedded = window.parent !== window;
  const targetOrigin = opts.targetOrigin ?? '*';

  function send(type: RuntimeMessageType, payload: unknown): void {
    const message: RuntimeMessage = { source: 'retrovibe', type, payload };
    if (embedded) {
      window.parent.postMessage(message, targetOrigin);
    } else {
      console.log('[retrovibe]', message);
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
