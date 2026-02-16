import type { StoreApi } from "zustand/vanilla";
import type { ExtensionStoreState } from "./extensionStore";
import type { SliceBinding } from "./slices";

/**
 * Abstraction over the transport layer. Webviews use postMessage,
 * MCP servers could use JSON-RPC, CLI tools could use stdout.
 */
export interface MessageConsumer {
  send(message: { type: string; [key: string]: unknown }): void;
  isReady(): boolean;
}

/**
 * Concrete consumer for VS Code webviews.
 * Wraps postMessage with readiness tracking and message queuing.
 */
export class WebviewMessageConsumer implements MessageConsumer {
  private _isReady = false;
  private _queue: Array<{ type: string; [key: string]: unknown }> = [];

  constructor(private readonly _postMessage: (message: unknown) => Thenable<boolean>) {}

  send(message: { type: string; [key: string]: unknown }): void {
    if (this._isReady) {
      this._postMessage(message);
    } else {
      this._queue.push(message);
    }
  }

  isReady(): boolean {
    return this._isReady;
  }

  setReady(): void {
    this._isReady = true;
  }

  flush(): void {
    const queued = this._queue.splice(0);
    for (const msg of queued) {
      this._postMessage(msg);
    }
  }

  dispose(): void {
    this._queue.length = 0;
    this._isReady = false;
  }
}

/**
 * Options for creating a SyncBridge.
 */
export interface SyncBridgeOptions {
  store: StoreApi<ExtensionStoreState>;
  consumer: MessageConsumer;
  bindings: SliceBinding[];
}

/**
 * SyncBridge connects a Zustand vanilla store to a consumer via
 * selective subscriptions. Only slices that have changed produce messages.
 *
 * Supports pause/resume for webview visibility changes — when paused,
 * store changes are tracked and the latest value per-slice is queued.
 * On resume, only the most recent value for each changed slice is flushed.
 */
export class SyncBridge {
  private _store: StoreApi<ExtensionStoreState>;
  private _consumer: MessageConsumer;
  private _bindings: SliceBinding[];
  private _unsubscribers: Array<() => void> = [];
  private _paused = false;
  private _pausedQueue = new Map<string, { type: string; [key: string]: unknown }>();
  private _disposed = false;

  constructor(options: SyncBridgeOptions) {
    this._store = options.store;
    this._consumer = options.consumer;
    this._bindings = options.bindings;
  }

  /**
   * Register subscriptions for all bindings. Each binding watches its
   * selector and sends a message when the selected value changes.
   */
  connect(): void {
    if (this._disposed) {
      return;
    }

    for (const binding of this._bindings) {
      let previousValue = binding.selector(this._store.getState());

      const unsubscribe = this._store.subscribe((state) => {
        const currentValue = binding.selector(state);

        if (!shallowEqual(previousValue, currentValue)) {
          previousValue = currentValue;

          const message = {
            ...(currentValue as Record<string, unknown>),
            type: binding.command,
            timestamp: new Date().toISOString(),
          } as { type: string; [key: string]: unknown };

          if (this._paused) {
            // Coalesce: latest value per-slice wins
            this._pausedQueue.set(binding.name, message);
          } else {
            this._consumer.send(message);
          }
        }
      });

      this._unsubscribers.push(unsubscribe);
    }
  }

  /**
   * Send current state for all slices to the consumer.
   * Used for initial sync (replaces FULL_STATE_UPDATE).
   */
  syncAll(): void {
    if (this._disposed) {
      return;
    }

    const state = this._store.getState();

    for (const binding of this._bindings) {
      const sliceValue = binding.selector(state);
      const message = {
        ...(sliceValue as Record<string, unknown>),
        type: binding.command,
        timestamp: new Date().toISOString(),
      } as { type: string; [key: string]: unknown };

      this._consumer.send(message);
    }
  }

  /**
   * Pause message delivery. Store subscriptions still fire but messages
   * are queued per-slice (latest wins). Call resume() to flush.
   */
  pause(): void {
    this._paused = true;
  }

  /**
   * Resume message delivery and flush the coalesced queue.
   * Only the most recent value for each changed slice is sent.
   */
  resume(): void {
    this._paused = false;

    // Flush coalesced queue
    for (const message of this._pausedQueue.values()) {
      this._consumer.send(message);
    }
    this._pausedQueue.clear();
  }

  /**
   * Unsubscribe all watchers and clean up resources.
   */
  dispose(): void {
    this._disposed = true;
    this._paused = false;
    this._pausedQueue.clear();

    for (const unsub of this._unsubscribers) {
      unsub();
    }
    this._unsubscribers.length = 0;
  }
}

/**
 * Factory function to create a SyncBridge.
 */
export function createSyncBridge(options: SyncBridgeOptions): SyncBridge {
  return new SyncBridge(options);
}

/**
 * Shallow equality check for slice values.
 * Compares own enumerable properties one level deep.
 */
function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }

  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) {
    return false;
  }

  const keysA = Object.keys(a as Record<string, unknown>);
  const keysB = Object.keys(b as Record<string, unknown>);

  if (keysA.length !== keysB.length) {
    return false;
  }

  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;

  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(objB, key) || !Object.is(objA[key], objB[key])) {
      return false;
    }
  }

  return true;
}
