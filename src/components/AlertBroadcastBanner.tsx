import React from 'react';
import { AlertOctagon, Navigation, X } from 'lucide-react';
import type { BroadcastAlert } from '../services/apiTypes';

interface AlertBroadcastBannerProps {
  alerts: BroadcastAlert[];
  onDismiss: (id: string) => void;
  onFlyTo?: (coords: [number, number]) => void;
}

export const AlertBroadcastBanner: React.FC<AlertBroadcastBannerProps> = ({
  alerts,
  onDismiss,
  onFlyTo
}) => {
  if (alerts.length === 0) return null;

  const currentAlert = alerts[0];

  return (
    <div className="absolute top-20 left-1/2 -translate-x-1/2 z-40 max-w-xl w-full px-4 select-none animate-in slide-in-from-top-4 duration-300">
      <div className="glass-panel p-3.5 rounded-2xl border border-red-500/50 shadow-[0_0_25px_rgba(239,68,68,0.35)] bg-gradient-to-r from-red-950/90 via-slate-950/95 to-red-950/90 flex items-center justify-between gap-3 text-white">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-red-600/30 border border-red-500/60 flex items-center justify-center text-red-400 shrink-0">
            <AlertOctagon className="w-5 h-5 animate-pulse" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold bg-red-500 text-slate-950 px-1.5 py-0.5 rounded uppercase">
                EMERGENCY BROADCAST
              </span>
              <span className="text-[11px] text-slate-400 font-mono">{currentAlert.timestamp}</span>
            </div>
            <h4 className="text-xs font-bold text-red-200 truncate">{currentAlert.title}</h4>
            <p className="text-[11px] text-slate-300 truncate">{currentAlert.message}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {currentAlert.coordinates && onFlyTo && (
            <button
              onClick={() => onFlyTo(currentAlert.coordinates!)}
              className="px-2.5 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 text-xs font-semibold flex items-center gap-1 transition-all"
            >
              <Navigation className="w-3.5 h-3.5" /> Focus
            </button>
          )}
          <button
            onClick={() => onDismiss(currentAlert.id)}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
