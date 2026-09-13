import type { MutationItem, BatchSyncRequest, BatchSyncResponse, MutationActionType } from './apiTypes';
import { nielStore } from '../store/nielStore';

const STORAGE_KEY_MUTATIONS = 'niel_offline_mutations_v1';
const STORAGE_KEY_WATERMARK = 'niel_last_sync_watermark_v1';
const STORAGE_KEY_CLIENT_ID = 'niel_client_device_id_v1';

export class OfflineSyncService {
  private watermark: number = 0;
  private clientId: string = '';
  private isSyncing: boolean = false;
  private mutations: MutationItem[] = [];

  constructor() {
    this.initStorage();
  }

  private initStorage(): void {
    try {
      let id = localStorage.getItem(STORAGE_KEY_CLIENT_ID);
      if (!id) {
        id = 'client-' + Math.random().toString(36).substring(2, 11) + '-' + Date.now().toString(36);
        localStorage.setItem(STORAGE_KEY_CLIENT_ID, id);
      }
      this.clientId = id;

      const wm = localStorage.getItem(STORAGE_KEY_WATERMARK);
      this.watermark = wm ? parseInt(wm, 10) : 0;

      const storedMutations = localStorage.getItem(STORAGE_KEY_MUTATIONS);
      if (storedMutations) {
        this.mutations = JSON.parse(storedMutations);
      }
    } catch (e) {
      console.warn('[NIEL OfflineSync] Storage init error:', e);
    }
  }

  public getPendingMutations(): MutationItem[] {
    return this.mutations.filter((m) => m.status === 'PENDING');
  }

  public getAllMutations(): MutationItem[] {
    return [...this.mutations];
  }

  public getWatermark(): number {
    return this.watermark;
  }

  public getClientId(): string {
    return this.clientId;
  }

  /**
   * Enqueues a local mutation with a sequence watermark and unique idempotency key.
   */
  public enqueueMutation(actionType: MutationActionType, payload: any): MutationItem {
    this.watermark += 1;
    const idempotencyKey = 'idem-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);

    const mutation: MutationItem = {
      client_seq: this.watermark,
      idempotency_key: idempotencyKey,
      action_type: actionType,
      payload: payload,
      created_at: new Date().toISOString(),
      retry_count: 0,
      status: 'PENDING'
    };

    this.mutations.push(mutation);
    this.saveToStorage();
    nielStore.updateOfflineQueue(this.getAllMutations(), this.watermark);

    return mutation;
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY_MUTATIONS, JSON.stringify(this.mutations));
      localStorage.setItem(STORAGE_KEY_WATERMARK, this.watermark.toString());
    } catch (e) {
      console.error('[NIEL OfflineSync] Save failure:', e);
    }
  }

  /**
   * Processes the batch synchronization with backend API.
   * Isolates item errors and updates deduplication acknowledgments.
   */
  public async syncPendingBatch(
    apiBatchPoster: (req: BatchSyncRequest) => Promise<BatchSyncResponse>
  ): Promise<BatchSyncResponse> {
    const pending = this.getPendingMutations();
    if (pending.length === 0) {
      return {
        success: true,
        new_watermark: this.watermark,
        processed_count: 0,
        results: []
      };
    }

    if (this.isSyncing) {
      throw new Error('Sync already in progress');
    }

    this.isSyncing = true;
    nielStore.setIsSyncing(true);

    try {
      const payload: BatchSyncRequest = {
        client_id: this.clientId,
        last_known_watermark: this.watermark,
        mutations: pending
      };

      const response = await apiBatchPoster(payload);

      // Apply individual item acknowledgements
      if (response && Array.isArray(response.results)) {
        for (const res of response.results) {
          const item = this.mutations.find((m) => m.idempotency_key === res.idempotency_key);
          if (item) {
            if (res.status === 'APPLIED' || res.status === 'DEDUPLICATED') {
              item.status = 'SYNCED';
            } else {
              item.status = 'FAILED';
              item.error_message = res.error || 'Server rejected mutation';
              item.retry_count += 1;
            }
          }
        }
      }

      if (response.new_watermark) {
        this.watermark = Math.max(this.watermark, response.new_watermark);
      }

      this.saveToStorage();
      nielStore.updateOfflineQueue(this.getAllMutations(), this.watermark);

      return response;
    } catch (err: any) {
      console.warn('[NIEL OfflineSync] Batch sync error, keeping items queued:', err);
      // Increment retry count
      for (const item of pending) {
        item.retry_count += 1;
        item.error_message = err?.message || 'Network unreachable';
      }
      this.saveToStorage();
      nielStore.updateOfflineQueue(this.getAllMutations(), this.watermark);
      throw err;
    } finally {
      this.isSyncing = false;
      nielStore.setIsSyncing(false);
    }
  }

  public clearSynced(): void {
    this.mutations = this.mutations.filter((m) => m.status !== 'SYNCED');
    this.saveToStorage();
    nielStore.updateOfflineQueue(this.getAllMutations(), this.watermark);
  }
}

export const offlineSyncService = new OfflineSyncService();
