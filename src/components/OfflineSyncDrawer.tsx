import React, { useState } from 'react';
import { RefreshCw, Database, ShieldCheck, X, Trash2 } from 'lucide-react';
import type { MutationItem } from '../services/apiTypes';
import { offlineSyncService } from '../services/offlineSync';
import { api } from '../services/api';

interface OfflineSyncDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  offlineQueue: MutationItem[];
  watermark: number;
  isSyncing: boolean;
}

export const OfflineSyncDrawer: React.FC<OfflineSyncDrawerProps> = ({
  isOpen,
  onClose,
  offlineQueue,
  watermark,
  isSyncing
}) => {
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const pendingCount = offlineQueue.filter((m) => m.status === 'PENDING').length;
  const syncedCount = offlineQueue.filter((m) => m.status === 'SYNCED').length;

  const handleSyncNow = async () => {
    try {
      const res = await offlineSyncService.syncPendingBatch((req) => api.syncBatchMutations(req));
      setSyncStatusMsg(`Batch sync complete: ${res.processed_count} mutations applied! New watermark: ${res.new_watermark}`);
      setTimeout(() => setSyncStatusMsg(null), 3000);
    } catch (e: any) {
      setSyncStatusMsg(`Sync error: ${e.message || 'Offline queue retained for reconnection'}`);
      setTimeout(() => setSyncStatusMsg(null), 3500);
    }
  };

  const handleClearSynced = () => {
    offlineSyncService.clearSynced();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 select-none animate-in fade-in duration-200">
      <div className="glass-panel w-full max-w-2xl rounded-3xl p-6 border border-cyan-500/35 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Offline Synchronization & Alert Engine (Phase 7)</h2>
              <p className="text-[11px] text-cyan-300 font-mono">
                Sequence Watermark #{watermark} · Deduplication Keys · Per-Item Isolation
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-2.5 font-mono text-center">
          <div className="bg-black/40 p-2.5 rounded-2xl border border-white/5">
            <div className="text-[10px] text-slate-400">Current Watermark</div>
            <div className="text-base font-bold text-cyan-300">#{watermark}</div>
          </div>
          <div className="bg-amber-950/30 p-2.5 rounded-2xl border border-amber-500/30">
            <div className="text-[10px] text-amber-300">Pending Mutations</div>
            <div className="text-base font-bold text-amber-400">{pendingCount}</div>
          </div>
          <div className="bg-emerald-950/30 p-2.5 rounded-2xl border border-emerald-500/30">
            <div className="text-[10px] text-emerald-300">Synced / Acknowledged</div>
            <div className="text-base font-bold text-emerald-400">{syncedCount}</div>
          </div>
        </div>

        {syncStatusMsg && (
          <div className="p-2.5 rounded-xl bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 text-xs font-medium text-center animate-in fade-in">
            {syncStatusMsg}
          </div>
        )}

        {/* Mutation Items List */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          <div className="text-xs font-semibold text-slate-300 flex items-center justify-between">
            <span>Local Batch Mutation Ledger:</span>
            {syncedCount > 0 && (
              <button
                onClick={handleClearSynced}
                className="text-[11px] text-slate-400 hover:text-rose-300 flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3 h-3" /> Clear Synced
              </button>
            )}
          </div>

          {offlineQueue.length === 0 ? (
            <div className="p-8 text-center glass-panel-subtle rounded-2xl border border-dashed border-white/10 text-slate-400 text-xs">
              <ShieldCheck className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-80" />
              <div>Mutation ledger clean. No offline actions pending synchronization.</div>
            </div>
          ) : (
            offlineQueue.map((item) => (
              <div
                key={item.idempotency_key}
                className="p-3 rounded-2xl glass-panel-subtle border border-white/10 text-xs space-y-1.5 font-mono"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-cyan-300 font-bold">Seq #{item.client_seq}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-white font-sans font-semibold">
                      {item.action_type}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      item.status === 'SYNCED'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : item.status === 'FAILED'
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    {item.status}
                  </span>
                </div>

                <div className="text-[11px] text-slate-400 truncate">
                  Idempotency Key: {item.idempotency_key}
                </div>

                <div className="text-[10px] text-slate-500 flex items-center justify-between">
                  <span>Queued: {new Date(item.created_at).toLocaleTimeString()}</span>
                  <span>Retries: {item.retry_count}</span>
                </div>

                {item.error_message && (
                  <div className="text-[10px] text-rose-400 bg-rose-950/40 p-1.5 rounded-lg border border-rose-500/30">
                    Fault: {item.error_message}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer actions */}
        <div className="pt-2 border-t border-white/10 flex gap-2">
          <button
            onClick={handleSyncNow}
            disabled={isSyncing || pendingCount === 0}
            className={`flex-1 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg ${
              pendingCount > 0
                ? 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-500/25 cursor-pointer'
                : 'bg-white/10 text-slate-400 cursor-not-allowed'
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Synchronizing Batch...' : `Sync Batch Now (${pendingCount} Pending)`}</span>
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
