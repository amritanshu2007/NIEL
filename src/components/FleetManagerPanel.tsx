import React, { useState } from 'react';
import { Truck, Navigation } from 'lucide-react';
import type { Vehicle, DeliveryStatus } from '../services/apiTypes';
import { api } from '../services/api';
import { nielStore } from '../store/nielStore';

interface FleetManagerPanelProps {
  vehicles: Vehicle[];
  onFlyTo?: (coords: [number, number]) => void;
  onClose?: () => void;
}

export const FleetManagerPanel: React.FC<FleetManagerPanelProps> = ({
  vehicles,
  onFlyTo,
  onClose
}) => {
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(vehicles[0]?.id || null);
  const [isPinging, setIsPinging] = useState(false);

  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId) || vehicles[0];

  const handleStatusChange = async (vehicleId: string, status: DeliveryStatus) => {
    try {
      await api.updateDeliveryStatus(vehicleId, status);
      nielStore.updateVehicle(vehicleId, { deliveryStatus: status });
    } catch (e) {
      console.error('[NIEL Fleet] Error updating status:', e);
    }
  };

  const handleSimulateGpsPing = async (vehicle: Vehicle) => {
    setIsPinging(true);
    const jitterLng = (Math.random() - 0.5) * 0.008;
    const jitterLat = (Math.random() - 0.5) * 0.008;
    const newCoords: [number, number] = [
      parseFloat((vehicle.coordinates[0] + jitterLng).toFixed(5)),
      parseFloat((vehicle.coordinates[1] + jitterLat).toFixed(5))
    ];
    const newSpeed = Math.floor(40 + Math.random() * 25);

    try {
      await api.pingVehicleLocation(vehicle.id, newCoords, newSpeed, (vehicle.headingDeg + 15) % 360);
      nielStore.updateVehicle(vehicle.id, {
        coordinates: newCoords,
        speedKmph: newSpeed,
        lastPingTimestamp: 'Just now'
      });
      if (onFlyTo) {
        onFlyTo(newCoords);
      }
    } catch (e) {
      console.error('[NIEL Fleet] GPS ping error:', e);
    } finally {
      setTimeout(() => setIsPinging(false), 500);
    }
  };

  const getStatusBadge = (status: DeliveryStatus) => {
    switch (status) {
      case 'EN_ROUTE':
        return (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-mono font-semibold">
            EN ROUTE
          </span>
        );
      case 'DELIVERED':
        return (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono font-semibold">
            DELIVERED
          </span>
        );
      case 'DELAYED':
        return (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono font-semibold">
            DELAYED
          </span>
        );
      case 'PENDING':
      default:
        return (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-300 border border-slate-500/40 font-mono font-semibold">
            PENDING
          </span>
        );
    }
  };

  return (
    <div className="absolute left-20 top-20 z-30 w-96 glass-panel rounded-3xl p-5 border border-cyan-500/30 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200 select-none max-h-[85vh] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Vehicle Fleet Tracking</h3>
            <p className="text-[10px] text-cyan-300/80 font-mono">Phase 5 Engine · Real-time GPS & Cargo</p>
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

      {/* Fleet Vehicles List */}
      <div className="mt-3 space-y-2 flex-1 overflow-y-auto pr-1">
        {vehicles.map((veh) => {
          const isSelected = selectedVehicle?.id === veh.id;
          return (
            <div
              key={veh.id}
              onClick={() => {
                setSelectedVehicleId(veh.id);
                if (onFlyTo) onFlyTo(veh.coordinates);
              }}
              className={`p-3 rounded-2xl border transition-all cursor-pointer space-y-1.5 ${
                isSelected
                  ? 'bg-cyan-950/50 border-cyan-400/60 shadow-[0_0_12px_rgba(6,182,212,0.25)]'
                  : 'glass-panel-subtle border-white/10 hover:border-cyan-400/30'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-white">{veh.vehicleNumber}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-cyan-200 font-mono font-medium">
                    {veh.cargoType}
                  </span>
                </div>
                {getStatusBadge(veh.deliveryStatus)}
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="truncate">{veh.origin} ➔ {veh.destination}</span>
                <span className="font-mono text-cyan-300 whitespace-nowrap">{veh.speedKmph} km/h</span>
              </div>

              {/* Expanded details when selected */}
              {isSelected && (
                <div className="pt-2 border-t border-white/10 space-y-2 text-xs animate-in fade-in duration-150">
                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                    <div className="bg-black/30 p-2 rounded-xl border border-white/5">
                      <span className="text-slate-400">Driver:</span>
                      <div className="text-white font-sans font-semibold">{veh.driverName}</div>
                      <div className="text-[10px] text-slate-400">{veh.driverPhone}</div>
                    </div>
                    <div className="bg-black/30 p-2 rounded-xl border border-white/5">
                      <span className="text-slate-400">Cargo Weight:</span>
                      <div className="text-cyan-300 font-bold">{veh.cargoWeightKg} kg</div>
                      <div className="text-[10px] text-emerald-400">Fuel: {veh.fuelPercentage}%</div>
                    </div>
                  </div>

                  {/* Transporter actions */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] text-slate-300 font-semibold">Update Delivery Status:</label>
                      <select
                        value={veh.deliveryStatus}
                        onChange={(e) => handleStatusChange(veh.id, e.target.value as DeliveryStatus)}
                        className="bg-slate-900 border border-white/20 rounded-lg px-2 py-1 text-[11px] text-white outline-none"
                      >
                        <option value="EN_ROUTE">EN_ROUTE</option>
                        <option value="DELIVERED">DELIVERED</option>
                        <option value="DELAYED">DELAYED</option>
                        <option value="PENDING">PENDING</option>
                      </select>
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSimulateGpsPing(veh);
                        }}
                        disabled={isPinging}
                        className="flex-1 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-400/40 font-medium text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Navigation className={`w-3.5 h-3.5 ${isPinging ? 'animate-spin' : ''}`} />
                        <span>{isPinging ? 'Pinging GPS...' : 'Ping GPS Movement'}</span>
                      </button>

                      {onFlyTo && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onFlyTo(veh.coordinates);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold cursor-pointer"
                        >
                          Focus
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
