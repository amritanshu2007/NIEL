import React from 'react';
import { Route, AlertOctagon, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import type { RoadCorridor, RoadStatus } from '../services/apiTypes';
import { api } from '../services/api';
import { nielStore } from '../store/nielStore';
import { liveConnection } from '../services/liveConnection';

interface RoadsManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  roads: RoadCorridor[];
}

export const RoadsManagerModal: React.FC<RoadsManagerModalProps> = ({
  isOpen,
  onClose,
  roads
}) => {
  if (!isOpen) return null;

  const handleStatusChange = async (corridorId: string, corridorName: string, status: RoadStatus) => {
    try {
      await api.updateRoadStatus(corridorId, status);
      nielStore.updateRoadStatus(corridorId, status);

      // Trigger live socket simulation
      liveConnection.handleIncomingTelemetry({
        type: 'ROAD_STATUS_UPDATED',
        corridorId,
        corridorName,
        status,
        reason: status === 'BLOCKED' ? 'Corridor closed by Northeast Logistics Command' : undefined
      });
    } catch (e) {
      console.error('[NIEL RoadsManager] Error updating road status:', e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 select-none animate-in fade-in duration-200">
      <div className="glass-panel w-full max-w-2xl rounded-3xl p-6 border border-emerald-500/35 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Route className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">GIS & Road Network Corridors (Phase 3)</h2>
              <p className="text-[11px] text-emerald-300 font-mono">PostGIS GEOMETRY(LineString, 4326) · Live Socket Broadcasting</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Road Corridors List */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {roads.map((road) => {
            const isBlocked = road.status === 'BLOCKED';
            const isRisky = road.status === 'RISKY';
            const isOpen = road.status === 'OPEN';

            return (
              <div
                key={road.id}
                className="p-3.5 rounded-2xl glass-panel-subtle border border-white/10 hover:border-cyan-400/30 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-white truncate">{road.name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/10 text-cyan-300 font-mono font-semibold">
                      {road.highwayNumber}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center gap-2">
                    <span>{road.from} ➔ {road.to}</span>
                    <span>·</span>
                    <span>{road.distanceKm} km</span>
                    <span>·</span>
                    <span className="text-slate-500">Updated {road.lastUpdated}</span>
                  </div>
                </div>

                {/* Status Toggle Buttons */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleStatusChange(road.id, road.name, 'OPEN')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                      isOpen
                        ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                        : 'bg-white/5 text-slate-400 hover:text-white hover:bg-emerald-500/10'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> OPEN
                  </button>

                  <button
                    onClick={() => handleStatusChange(road.id, road.name, 'RISKY')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                      isRisky
                        ? 'bg-amber-500/30 text-amber-300 border border-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                        : 'bg-white/5 text-slate-400 hover:text-white hover:bg-amber-500/10'
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" /> RISKY
                  </button>

                  <button
                    onClick={() => handleStatusChange(road.id, road.name, 'BLOCKED')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                      isBlocked
                        ? 'bg-rose-500/30 text-rose-300 border border-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.3)]'
                        : 'bg-white/5 text-slate-400 hover:text-white hover:bg-rose-500/10'
                    }`}
                  >
                    <AlertOctagon className="w-3.5 h-3.5" /> BLOCKED
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="pt-2 border-t border-white/10 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
