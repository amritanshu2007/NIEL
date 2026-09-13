import React, { useState } from 'react';
import {
  AlertTriangle,
  CloudRain,
  MinusCircle,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import type { IncidentAlert } from '../services/apiTypes';
import { api } from '../services/api';
import { nielStore } from '../store/nielStore';

interface LiveAlertsPanelProps {
  incidents: IncidentAlert[];
  onSelectAlert: (alert: IncidentAlert) => void;
  onOpenReportIncident?: () => void;
}

export const LiveAlertsPanel: React.FC<LiveAlertsPanelProps> = ({
  incidents,
  onSelectAlert,
  onOpenReportIncident
}) => {
  const [isMinimized, setIsMinimized] = useState(false);

  const getAlertIcon = (type: IncidentAlert['type']) => {
    switch (type) {
      case 'LANDSLIDE':
        return (
          <div className="w-7 h-7 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
            <AlertTriangle className="w-3.5 h-3.5" />
          </div>
        );
      case 'RAIN':
        return (
          <div className="w-7 h-7 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300 shrink-0">
            <CloudRain className="w-3.5 h-3.5" />
          </div>
        );
      case 'ROAD_BLOCK':
        return (
          <div className="w-7 h-7 rounded-xl bg-red-600/25 border border-red-500/50 flex items-center justify-center text-red-400 shrink-0">
            <MinusCircle className="w-3.5 h-3.5" />
          </div>
        );
      case 'BORDER_ADVISORY':
      default:
        return (
          <div className="w-7 h-7 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 shrink-0">
            <AlertCircle className="w-3.5 h-3.5" />
          </div>
        );
    }
  };

  const handleResolve = async (e: React.MouseEvent, incidentId: string) => {
    e.stopPropagation();
    try {
      await api.resolveIncident(incidentId);
      nielStore.removeIncident(incidentId);
    } catch (err) {
      console.error('[NIEL Alerts] Error resolving incident:', err);
    }
  };

  return (
    <div className="absolute right-6 top-20 z-30 w-84 glass-panel rounded-3xl p-3.5 border border-cyan-500/25 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200 select-none">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-white/10">
        <div
          onClick={() => setIsMinimized(!isMinimized)}
          className="flex items-center gap-2 cursor-pointer group"
          title="Click to collapse/expand panel"
        >
          <h3 className="text-xs font-extrabold text-white group-hover:text-cyan-300 transition-colors">
            Live Field Alerts
          </h3>
          <span className="text-[10px] bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded-full border border-rose-500/30 font-mono font-bold">
            {incidents.length} Active
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onOpenReportIncident && (
            <button
              onClick={onOpenReportIncident}
              className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5 font-semibold transition-colors cursor-pointer"
            >
              <span>+ Report</span>
            </button>
          )}
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title={isMinimized ? 'Expand Alerts' : 'Minimize Alerts'}
          >
            {isMinimized ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Alert Feed Items (Collapsible with compact height to avoid obscuring lower map controls) */}
      {!isMinimized && (
        <div className="mt-2.5 space-y-2 max-h-[250px] overflow-y-auto pr-1">
          {incidents.length === 0 ? (
            <div className="p-4 text-center text-slate-400 text-xs glass-panel-subtle rounded-2xl">
              No active spatial alerts. Northeast corridors nominal.
            </div>
          ) : (
            incidents.map((incident) => (
              <div
                key={incident.id}
                onClick={() => onSelectAlert(incident)}
                className="flex items-center gap-2.5 p-2 rounded-2xl glass-panel-subtle hover:bg-cyan-500/15 border border-white/5 hover:border-cyan-400/40 transition-all cursor-pointer group"
              >
                {getAlertIcon(incident.type)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-semibold text-xs text-white group-hover:text-cyan-300 truncate">
                      {incident.title}
                    </span>
                    <span className="text-[10px] text-slate-400 whitespace-nowrap font-mono">
                      {incident.reportedAgo}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 truncate group-hover:text-slate-200">
                    {incident.locationName}
                  </div>
                </div>

                {/* Quick Resolve Checkmark */}
                <button
                  onClick={(e) => handleResolve(e, incident.id)}
                  className="p-1 rounded-lg text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                  title="Mark Resolved"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
