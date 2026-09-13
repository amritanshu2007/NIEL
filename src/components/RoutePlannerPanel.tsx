import React, { useState } from 'react';
import { Compass, Zap } from 'lucide-react';
import type { CargoType, RouteOption } from '../services/apiTypes';
import { api } from '../services/api';
import { nielStore } from '../store/nielStore';

const NORTHEAST_HUBS = [
  { name: 'Guwahati', coords: [91.7362, 26.1445] as [number, number] },
  { name: 'Shillong', coords: [91.8933, 25.5788] as [number, number] },
  { name: 'Itanagar', coords: [93.6053, 27.0844] as [number, number] },
  { name: 'Tawang', coords: [91.8594, 27.5861] as [number, number] },
  { name: 'Dibrugarh', coords: [94.9120, 27.4728] as [number, number] },
  { name: 'Kohima', coords: [94.1086, 25.6751] as [number, number] },
  { name: 'Imphal', coords: [93.9368, 24.8170] as [number, number] },
  { name: 'Silchar', coords: [92.7926, 24.8333] as [number, number] },
  { name: 'Aizawl', coords: [92.7176, 23.7271] as [number, number] },
  { name: 'Agartala', coords: [91.2868, 23.8315] as [number, number] }
];

interface RoutePlannerPanelProps {
  onClose?: () => void;
}

export const RoutePlannerPanel: React.FC<RoutePlannerPanelProps> = ({ onClose }) => {
  const [origin, setOrigin] = useState('Guwahati');
  const [destination, setDestination] = useState('Tawang');
  const [cargoType, setCargoType] = useState<CargoType>('Medicine');
  const [avoidBlocked, setAvoidBlocked] = useState(true);
  const [isEmergencyConvoy, setIsEmergencyConvoy] = useState(true);
  const [isCalculating, setIsCalculating] = useState(false);
  const [computedRoute, setComputedRoute] = useState<RouteOption | null>(nielStore.getState().activeRoute);

  const handleCalculateRoute = async () => {
    setIsCalculating(true);
    const originObj = NORTHEAST_HUBS.find((h) => h.name === origin);
    const destObj = NORTHEAST_HUBS.find((h) => h.name === destination);

    try {
      const route = await api.optimizeRoute({
        origin,
        destination,
        originCoords: originObj?.coords,
        destinationCoords: destObj?.coords,
        avoidBlocked,
        cargoType,
        isEmergencyConvoy,
        riskyPenaltyMultiplier: 2.5
      });

      setComputedRoute(route);
      nielStore.setActiveRoute(route);
    } catch (e) {
      console.error('[NIEL RoutePlanner] Optimization failed:', e);
    } finally {
      setIsCalculating(false);
    }
  };

  const handleClearRoute = () => {
    setComputedRoute(null);
    nielStore.setActiveRoute(null);
  };

  return (
    <div className="absolute left-20 top-20 z-30 w-96 glass-panel rounded-3xl p-5 border border-cyan-500/30 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200 select-none max-h-[85vh] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">AI Dijkstra Route Optimizer</h3>
            <p className="text-[10px] text-cyan-300/80 font-mono">Phase 6 Engine · PostGIS Road Network</p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded-lg hover:bg-white/10 cursor-pointer"
          >
            ✕
          </button>
        )}
      </div>

      <div className="mt-3.5 space-y-3 flex-1 overflow-y-auto pr-1">
        {/* Origin & Destination Selectors */}
        <div className="space-y-2">
          <div className="space-y-1">
            <label className="text-[11px] text-slate-300 font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Origin Hub
            </label>
            <select
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              className="w-full bg-slate-900/90 border border-white/15 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-cyan-400"
            >
              {NORTHEAST_HUBS.map((h) => (
                <option key={h.name} value={h.name}>
                  {h.name} Logistics Center
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-slate-300 font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-400"></span> Destination Target
            </label>
            <select
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              className="w-full bg-slate-900/90 border border-white/15 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-cyan-400"
            >
              {NORTHEAST_HUBS.map((h) => (
                <option key={h.name} value={h.name}>
                  {h.name} Relief Base
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Cargo Priority */}
        <div className="space-y-1">
          <label className="text-[11px] text-slate-300 font-semibold">Priority Cargo Manifest</label>
          <select
            value={cargoType}
            onChange={(e) => setCargoType(e.target.value as CargoType)}
            className="w-full bg-slate-900/90 border border-white/15 rounded-xl px-3 py-2 text-xs text-cyan-200 outline-none focus:border-cyan-400 font-medium"
          >
            <option value="Medicine">Medicine & Critical Vaccines (High Speed)</option>
            <option value="Food">Food & Grain Relief Consignments</option>
            <option value="Fuel">Fuel Tankers & Hydrocarbons</option>
            <option value="Relief Supplies">Disaster Relief Supplies & Tents</option>
            <option value="Equipment">Heavy Earthmoving Equipment</option>
          </select>
        </div>

        {/* Constraints */}
        <div className="space-y-2 pt-1 border-t border-white/5">
          <div className="flex items-center justify-between text-xs text-slate-300">
            <label htmlFor="avoidBlockedCb" className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                id="avoidBlockedCb"
                checked={avoidBlocked}
                onChange={(e) => setAvoidBlocked(e.target.checked)}
                className="w-4 h-4 accent-cyan-500 rounded cursor-pointer"
              />
              <span>Avoid BLOCKED road corridors</span>
            </label>
            <span className="text-[10px] text-emerald-400 font-mono">Dijkstra Avoid</span>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-300">
            <label htmlFor="emergencyConvoyCb" className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                id="emergencyConvoyCb"
                checked={isEmergencyConvoy}
                onChange={(e) => setIsEmergencyConvoy(e.target.checked)}
                className="w-4 h-4 accent-cyan-500 rounded cursor-pointer"
              />
              <span>Armed / Escort Convoy Priority</span>
            </label>
            <span className="text-[10px] text-cyan-400 font-mono">Priority Pass</span>
          </div>
        </div>

        {/* Calculate Button */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleCalculateRoute}
            disabled={isCalculating}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs transition-all shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {isCalculating ? (
              <span>Running Dijkstra Engine...</span>
            ) : (
              <>
                <Zap className="w-4 h-4 fill-current" />
                <span>Optimize Safest Route</span>
              </>
            )}
          </button>

          {computedRoute && (
            <button
              onClick={handleClearRoute}
              className="px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold cursor-pointer"
              title="Clear Route"
            >
              Clear
            </button>
          )}
        </div>

        {/* Computed Route Results */}
        {computedRoute && (
          <div className="space-y-2.5 p-3 rounded-2xl bg-cyan-950/40 border border-cyan-500/30 text-xs animate-in fade-in duration-150">
            <div className="flex items-center justify-between font-bold text-white">
              <span className="truncate pr-2">{computedRoute.name}</span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-md font-mono ${
                  computedRoute.riskScore === 'LOW'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : computedRoute.riskScore === 'MEDIUM'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                }`}
              >
                {computedRoute.riskScore} RISK
              </span>
            </div>

            {/* Metrics pills */}
            <div className="grid grid-cols-2 gap-2 text-center font-mono">
              <div className="p-2 rounded-xl bg-black/40 border border-white/5">
                <div className="text-[10px] text-slate-400">Total Distance</div>
                <div className="text-sm font-extrabold text-cyan-300">{computedRoute.distanceKm} km</div>
              </div>
              <div className="p-2 rounded-xl bg-black/40 border border-white/5">
                <div className="text-[10px] text-slate-400">Transit Duration</div>
                <div className="text-sm font-extrabold text-cyan-300">{computedRoute.durationHours} hrs</div>
              </div>
            </div>

            <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
              {computedRoute.statusDescription}
            </p>

            {/* Turn by turn segments */}
            {computedRoute.segments && computedRoute.segments.length > 0 && (
              <div className="space-y-1 pt-1 border-t border-white/10">
                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  Corridor Breakdown ({computedRoute.segments.length} Segments):
                </div>
                <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                  {computedRoute.segments.map((seg, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-1.5 rounded-lg bg-black/30 text-[10px] border border-white/5"
                    >
                      <span className="font-semibold text-slate-200 truncate">{seg.highwayNumber} · {seg.corridorName}</span>
                      <span className="text-cyan-300 font-mono">{seg.distanceKm}km ({seg.estimatedMinutes}m)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
