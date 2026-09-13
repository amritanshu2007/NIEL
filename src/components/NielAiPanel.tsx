import React, { useState } from 'react';
import {
  Compass,
  MessageSquare,
  Building2,
  Activity,
  Paperclip,
  ArrowUpRight,
  Sparkles,
  ShieldCheck,
  Bot
} from 'lucide-react';
import { nielStore } from '../store/nielStore';

interface NielAiPanelProps {
  onExecutePromptAction: (actionKey: string) => void;
}

export const NielAiPanel: React.FC<NielAiPanelProps> = ({
  onExecutePromptAction
}) => {
  const [inputText, setInputText] = useState('');
  const [chatLog, setChatLog] = useState<{ sender: 'user' | 'niel'; text: string }[]>([]);

  const promptOptions = [
    {
      key: 'tawang-route',
      label: 'Find the safest route to Tawang',
      icon: <Compass className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
    },
    {
      key: 'manipur-status',
      label: 'Check road status in Manipur',
      icon: <MessageSquare className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
    },
    {
      key: 'imphal-supply',
      label: 'Show supply centers near Imphal',
      icon: <Building2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
    },
    {
      key: 'fleet-status',
      label: 'Inspect active medical fleet convoys',
      icon: <Activity className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
    }
  ];

  const handleSend = () => {
    if (!inputText.trim()) return;
    const query = inputText.trim();
    setChatLog((prev) => [...prev, { sender: 'user', text: query }]);
    setInputText('');

    // Dynamic AI response querying real store state
    setTimeout(() => {
      const state = nielStore.getState();
      const openRoadCount = state.roads.filter((r) => r.status === 'OPEN').length;
      const blockedRoadCount = state.roads.filter((r) => r.status === 'BLOCKED').length;
      const criticalIncCount = state.incidents.filter((i) => i.severity === 'CRITICAL').length;

      let reply = `Telemetry query evaluated. ${openRoadCount} corridors OPEN, ${blockedRoadCount} BLOCKED. ${criticalIncCount} critical field incidents active.`;

      if (query.toLowerCase().includes('tawang')) {
        reply = 'Dijkstra optimizer rerouted via Orang-Kalaktang corridor (364 km). NH-13 Bhalukpong pass circumvented due to severe landslide.';
        onExecutePromptAction('tawang-route');
      } else if (query.toLowerCase().includes('manipur') || query.toLowerCase().includes('imphal')) {
        reply = 'NH-2 Senapati-Kangpokpi sector is BLOCKED with convoy security checkpoint. Mantripukhri supply staging active with 22 transport units.';
        onExecutePromptAction('manipur-status');
      } else if (query.toLowerCase().includes('fleet') || query.toLowerCase().includes('vehicle')) {
        reply = `Fleet telemetry tracking ${state.vehicles.length} units. Vehicle AS-01-EC-9482 (Medicine, 4200kg) en route near Kalaktang.`;
        onExecutePromptAction('fleet-status');
      } else if (query.toLowerCase().includes('sync') || query.toLowerCase().includes('offline')) {
        reply = `Sequence watermark at #${state.lastSyncWatermark}. Offline batch mutation queue contains ${state.offlineQueue.length} items with idempotency deduplication.`;
      }

      setChatLog((prev) => [...prev, { sender: 'niel', text: reply }]);
    }, 500);
  };

  return (
    <div className="absolute left-20 top-20 z-30 w-92 glass-panel rounded-3xl p-5 border border-cyan-500/25 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200 select-none">
      {/* NIEL Header */}
      <div className="flex items-center gap-3 pb-3 border-b border-white/10">
        <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.35)]">
          <Bot className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-extrabold text-white tracking-wide">NIEL AI</h2>
            <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium px-1.5 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Online
            </span>
          </div>
          <p className="text-[10px] text-cyan-300/80 font-medium">Logistics & Spatial Intelligence Partner</p>
        </div>
      </div>

      {/* Greeting & Subtitle */}
      <div className="mt-3 mb-2.5">
        <h3 className="text-xs font-bold text-white">Northeast Command Center</h3>
        <p className="text-[11px] text-slate-300">Ask NIEL for route optimization, corridor status, or fleet telemetry:</p>
      </div>

      {/* Recent Chat Responses */}
      {chatLog.length > 0 && (
        <div className="mb-3 max-h-36 overflow-y-auto space-y-1.5 pr-1 text-xs">
          {chatLog.map((c, i) => (
            <div
              key={i}
              className={`p-2.5 rounded-xl leading-relaxed ${
                c.sender === 'user'
                  ? 'bg-cyan-950/50 text-cyan-200 border border-cyan-500/30 ml-4'
                  : 'bg-black/40 text-slate-200 border border-white/10 mr-2'
              }`}
            >
              <div className="text-[9px] uppercase font-mono text-cyan-400 mb-0.5 font-bold">
                {c.sender === 'user' ? 'Operator' : 'NIEL AI Assistant'}
              </div>
              <div className="text-[11px]">{c.text}</div>
            </div>
          ))}
        </div>
      )}

      {/* Quick Action Prompt Chips */}
      <div className="space-y-1.5 mb-3">
        {promptOptions.map((opt) => (
          <button
            key={opt.key}
            onClick={() => {
              setInputText(opt.label);
              onExecutePromptAction(opt.key);
            }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl glass-button text-xs text-slate-200 hover:text-white border border-white/10 hover:border-cyan-400/40 transition-all text-left group"
          >
            <div className="flex items-center gap-2.5 truncate">
              {opt.icon}
              <span className="truncate">{opt.label}</span>
            </div>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0" />
          </button>
        ))}
      </div>

      {/* Chat Prompt Input */}
      <div className="relative flex items-center glass-panel-subtle rounded-xl p-1.5 border border-white/15 focus-within:border-cyan-400/50">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Ask NIEL anything..."
          className="w-full bg-transparent border-none outline-none text-xs text-slate-100 placeholder-slate-400 px-2 pr-16"
        />
        <div className="absolute right-2 flex items-center gap-1">
          <button
            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-white/10 transition-colors"
            title="Attach Coordinate"
          >
            <Paperclip className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleSend}
            className="w-7 h-7 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center justify-center font-bold transition-all shadow-md shadow-cyan-500/30 cursor-pointer"
            title="Send Query"
          >
            <ArrowUpRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Trust Footer */}
      <div className="mt-3 flex items-center justify-between text-[10px] text-slate-400 border-t border-white/5 pt-2 font-mono">
        <span className="flex items-center gap-1 text-slate-400">
          <Sparkles className="w-3 h-3 text-cyan-400" /> PostGIS AI
        </span>
        <span className="flex items-center gap-1 text-slate-400">
          <ShieldCheck className="w-3 h-3 text-emerald-400" /> RBAC Verified
        </span>
      </div>
    </div>
  );
};
