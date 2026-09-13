import React from 'react';
import {
  MapPin,
  AlertTriangle,
  CloudRain,
  ShieldCheck,
  X,
  Navigation,
  Truck,
  Route,
  Building2
} from 'lucide-react';
import type { CityFeature } from '../map/mapConfig';
import type { IncidentAlert, Vehicle, RoadCorridor } from '../services/apiTypes';

interface LocationPopupProps {
  feature: CityFeature | IncidentAlert | Vehicle | RoadCorridor | any;
  featureType: 'city' | 'incident' | 'vehicle' | 'corridor' | 'supply' | 'hospital' | 'airport' | 'general' | null;
  onClose: () => void;
  onFlyTo?: (coords: [number, number]) => void;
}

export const LocationPopup: React.FC<LocationPopupProps> = ({
  feature,
  featureType,
  onClose,
  onFlyTo
}) => {
  if (!feature) return null;

  const isVehicle = featureType === 'vehicle' || ('vehicleNumber' in feature);
  const isCorridor = featureType === 'corridor' || ('highwayNumber' in feature && 'from' in feature);
  const isIncident = featureType === 'incident' || ('severity' in feature && 'reportedAgo' in feature);
  const isCity = featureType === 'city' || ('accessibility' in feature && 'weather' in feature);

  const coords = feature.coordinates
    ? Array.isArray(feature.coordinates[0])
      ? feature.coordinates[0] // LineString first node
      : feature.coordinates // Point
    : [0, 0];

  const getHeaderTitle = () => {
    if (isVehicle) return `FLEET VEHICLE [${feature.vehicleNumber}]`;
    if (isCorridor) return `ROAD CORRIDOR [${feature.highwayNumber}]`;
    if (isIncident) return `TACTICAL ALERT [${feature.severity}]`;
    if (isCity) return `NORTHEAST NODE [${feature.state || 'INDIA'}]`;
    return 'SELECTED FEATURE';
  };

  return (
    <div className="absolute top-20 left-20 lg:left-[470px] z-40 w-88 max-w-[calc(100vw-100px)] glass-panel rounded-2xl p-4 border border-cyan-500/30 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200 select-none max-h-[75vh] overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center border shadow-sm ${
              isIncident
                ? 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                : isVehicle
                ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                : isCorridor
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                : 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
            }`}
          >
            {isIncident && <AlertTriangle className="w-4 h-4" />}
            {isVehicle && <Truck className="w-4 h-4" />}
            {isCorridor && <Route className="w-4 h-4" />}
            {isCity && <MapPin className="w-4 h-4" />}
            {!isIncident && !isVehicle && !isCorridor && !isCity && <Building2 className="w-4 h-4" />}
          </div>

          <div>
            <div className="text-[10px] font-mono text-cyan-300 uppercase tracking-wider">
              {getHeaderTitle()}
            </div>
            <h3 className="text-sm font-bold text-white leading-tight truncate max-w-[180px]">
              {feature.name || feature.title || feature.vehicleNumber || 'Selected Entity'}
            </h3>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body Data */}
      <div className="py-3 space-y-2.5 text-xs">
        {/* Coordinates */}
        <div className="flex items-center justify-between bg-black/30 px-2.5 py-1.5 rounded-lg font-mono text-[11px] text-slate-300 border border-white/5">
          <span className="text-slate-400">PostGIS Coordinates</span>
          <span className="text-cyan-300">
            {Number(coords[1]).toFixed(4)}°N, {Number(coords[0]).toFixed(4)}°E
          </span>
        </div>

        {/* 1. Vehicle Details */}
        {isVehicle && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
              <div className="bg-white/5 p-2 rounded-lg border border-white/5">
                <span className="text-slate-400">Cargo Manifest:</span>
                <div className="text-cyan-300 font-bold">{feature.cargoType}</div>
                <div className="text-[10px] text-slate-400">{feature.cargoWeightKg} kg</div>
              </div>
              <div className="bg-white/5 p-2 rounded-lg border border-white/5">
                <span className="text-slate-400">Current Speed:</span>
                <div className="text-white font-bold">{feature.speedKmph} km/h</div>
                <div className="text-[10px] text-emerald-400">Fuel: {feature.fuelPercentage}%</div>
              </div>
            </div>

            <div className="bg-white/5 p-2 rounded-lg border border-white/5 text-[11px]">
              <div className="text-slate-400">Transit Route:</div>
              <div className="text-slate-200 font-medium">{feature.origin} ➔ {feature.destination}</div>
            </div>

            <div className="flex items-center justify-between bg-cyan-950/40 border border-cyan-500/30 p-2 rounded-lg">
              <span className="text-slate-300">Delivery Status:</span>
              <span className="font-bold text-cyan-300 font-mono uppercase">{feature.deliveryStatus}</span>
            </div>
          </div>
        )}

        {/* 2. Road Corridor Details */}
        {isCorridor && (
          <div className="space-y-2">
            <div className="flex items-center justify-between bg-white/5 p-2 rounded-lg border border-white/5 font-mono text-[11px]">
              <span className="text-slate-400">Corridor Status:</span>
              <span
                className={`font-bold ${
                  feature.status === 'OPEN'
                    ? 'text-emerald-400'
                    : feature.status === 'RISKY'
                    ? 'text-amber-400'
                    : 'text-rose-400'
                }`}
              >
                {feature.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center font-mono text-[11px]">
              <div className="bg-black/30 p-2 rounded-lg border border-white/5">
                <div className="text-[10px] text-slate-400">Segment Length</div>
                <div className="text-white font-bold">{feature.distanceKm} km</div>
              </div>
              <div className="bg-black/30 p-2 rounded-lg border border-white/5">
                <div className="text-[10px] text-slate-400">Avg Speed</div>
                <div className="text-white font-bold">{feature.averageSpeedKmph} km/h</div>
              </div>
            </div>

            <div className="text-[11px] text-slate-300 bg-white/5 p-2 rounded-lg border border-white/5">
              <span>Path: </span>
              <span className="font-semibold text-white">{feature.from} ➔ {feature.to}</span>
            </div>
          </div>
        )}

        {/* 3. Field Incident Details */}
        {isIncident && (
          <div className="space-y-2">
            <div className="bg-rose-950/30 border border-rose-500/30 p-2.5 rounded-lg space-y-1">
              <div className="text-[10px] text-rose-400 font-mono flex items-center justify-between">
                <span>{feature.locationName}</span>
                <span>{feature.reportedAgo}</span>
              </div>
              <p className="text-slate-200 text-xs leading-relaxed font-sans">
                {feature.description}
              </p>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-300 px-1">
              <span>Impacted Corridor:</span>
              <span className="font-semibold text-amber-300">{feature.impactedCorridor}</span>
            </div>

            {feature.reportedBy && (
              <div className="text-[10px] text-slate-400 font-mono px-1">
                Reported by: <span className="text-slate-200">{feature.reportedBy}</span>
              </div>
            )}
          </div>
        )}

        {/* 4. City Hub Details */}
        {isCity && (
          <>
            {/* Accessibility */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Accessibility Index
                </span>
                <span className="font-semibold text-emerald-300">{feature.accessibility}%</span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400 rounded-full"
                  style={{ width: `${feature.accessibility}%` }}
                />
              </div>
            </div>

            {/* Weather */}
            <div className="flex items-center justify-between bg-white/5 p-2 rounded-lg border border-white/5">
              <div className="flex items-center gap-2">
                <CloudRain className="w-4 h-4 text-cyan-400" />
                <div>
                  <div className="text-white font-medium">{feature.weather?.condition}</div>
                  <div className="text-[10px] text-slate-400">Rainfall: {feature.weather?.rainfall}</div>
                </div>
              </div>
              <div className="text-right font-mono text-base font-bold text-cyan-200">
                {feature.weather?.temp}°C
              </div>
            </div>

            {/* Road Status */}
            <div className="bg-white/5 p-2 rounded-lg border border-white/5 space-y-1">
              <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Road Status</div>
              <p className="text-slate-200 text-[11px] leading-relaxed">
                {feature.roadStatus}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Action Footer */}
      <div className="pt-2 border-t border-white/10 flex gap-2">
        {onFlyTo && (
          <button
            onClick={() => onFlyTo(coords)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-400/40 text-xs font-medium transition-all cursor-pointer"
          >
            <Navigation className="w-3.5 h-3.5" /> Center Target
          </button>
        )}
        <button
          onClick={onClose}
          className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs transition-colors cursor-pointer"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
};
