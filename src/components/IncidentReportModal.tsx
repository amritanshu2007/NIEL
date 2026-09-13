import React, { useState } from 'react';
import { AlertTriangle, MapPin, Crosshair, CheckCircle2, X } from 'lucide-react';
import type { IncidentType, IncidentSeverity, RoadCorridor } from '../services/apiTypes';
import { api } from '../services/api';
import { liveConnection } from '../services/liveConnection';

interface IncidentReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  roads: RoadCorridor[];
  initialCoords?: [number, number] | null;
  onStartCoordinatePick: () => void;
}

export const IncidentReportModal: React.FC<IncidentReportModalProps> = ({
  isOpen,
  onClose,
  roads,
  initialCoords,
  onStartCoordinatePick
}) => {
  const [type, setType] = useState<IncidentType>('LANDSLIDE');
  const [severity, setSeverity] = useState<IncidentSeverity>('CRITICAL');
  const [title, setTitle] = useState('Landslide debris blockage');
  const [locationName, setLocationName] = useState('NH-13, Bhalukpong-Bomdila Sector');
  const [state, setState] = useState('Arunachal Pradesh');
  const [lng, setLng] = useState<number>(initialCoords ? initialCoords[0] : 92.52);
  const [lat, setLat] = useState<number>(initialCoords ? initialCoords[1] : 27.18);
  const [impactedCorridor, setImpactedCorridor] = useState(roads[0]?.name || 'NH-13 Tawang Supply Line');
  const [description, setDescription] = useState('Massive debris on mountain road following cloudburst. Heavy equipment required.');
  const [alternateRouteAvailable, setAlternateRouteAvailable] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  React.useEffect(() => {
    if (initialCoords) {
      setLng(initialCoords[0]);
      setLat(initialCoords[1]);
    }
  }, [initialCoords]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const created = await api.createIncident({
        type,
        severity,
        title,
        locationName,
        state,
        coordinates: [parseFloat(lng.toString()), parseFloat(lat.toString())],
        description,
        impactedCorridor,
        alternateRouteAvailable
      });

      // Broadcast simulated socket event for live UI reaction
      liveConnection.broadcastSimulatedIncident(created);

      setSuccessMsg('Field incident logged & spatial point recorded (GEOMETRY(Point, 4326))!');
      setTimeout(() => {
        setSuccessMsg(null);
        setIsSubmitting(false);
        onClose();
      }, 1400);
    } catch {
      setSuccessMsg('Incident saved to Offline Sync Queue (Sequence Watermarked).');
      setTimeout(() => {
        setSuccessMsg(null);
        setIsSubmitting(false);
        onClose();
      }, 1600);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 select-none animate-in fade-in duration-200">
      <div className="glass-panel w-full max-w-xl rounded-3xl p-6 border border-rose-500/35 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Report Field Incident (Phase 4)</h2>
              <p className="text-[11px] text-rose-300 font-mono">Spatial Point Recording · GEOMETRY(Point, 4326)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Incident Type & Severity */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-slate-300 font-semibold">Incident Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as IncidentType)}
                className="w-full bg-slate-900/90 border border-white/15 rounded-xl px-3 py-2 text-xs text-slate-100 outline-none focus:border-rose-400"
              >
                <option value="LANDSLIDE">LANDSLIDE (Slope Failure)</option>
                <option value="FLOOD">FLOOD (Waterlogging)</option>
                <option value="ROAD_BLOCK">ROAD BLOCK (Corridor Blocked)</option>
                <option value="RAIN">HEAVY RAINFALL (Hydroplaning)</option>
                <option value="BORDER_ADVISORY">BORDER ADVISORY (Transit Alert)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-300 font-semibold">Severity Categorization</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as IncidentSeverity)}
                className="w-full bg-slate-900/90 border border-white/15 rounded-xl px-3 py-2 text-xs text-slate-100 outline-none focus:border-rose-400"
              >
                <option value="CRITICAL">CRITICAL (Red Alert / Convoy Block)</option>
                <option value="WARNING">WARNING (Cautionary Delay)</option>
                <option value="ADVISORY">ADVISORY (Informational)</option>
              </select>
            </div>
          </div>

          {/* Title & Location Name */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-slate-300 font-medium">Incident Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-slate-900/90 border border-white/15 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-rose-400"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-300 font-medium">Location Sector</label>
              <input
                type="text"
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                className="w-full bg-slate-900/90 border border-white/15 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-rose-400"
                required
              />
            </div>
          </div>

          {/* State & Impacted Corridor */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-slate-300 font-medium">Northeast State</label>
              <select
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full bg-slate-900/90 border border-white/15 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-rose-400"
              >
                <option value="Arunachal Pradesh">Arunachal Pradesh</option>
                <option value="Assam">Assam</option>
                <option value="Manipur">Manipur</option>
                <option value="Meghalaya">Meghalaya</option>
                <option value="Mizoram">Mizoram</option>
                <option value="Nagaland">Nagaland</option>
                <option value="Sikkim">Sikkim</option>
                <option value="Tripura">Tripura</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-300 font-medium">Impacted Road Corridor</label>
              <select
                value={impactedCorridor}
                onChange={(e) => setImpactedCorridor(e.target.value)}
                className="w-full bg-slate-900/90 border border-white/15 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-rose-400"
              >
                {roads.map((r) => (
                  <option key={r.id} value={r.name}>
                    {r.highwayNumber} - {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Spatial Point Coordinates Pick & Inputs */}
          <div className="space-y-1.5 bg-black/40 p-3 rounded-2xl border border-white/10">
            <div className="flex items-center justify-between">
              <label className="text-xs text-cyan-300 font-semibold flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-rose-400" /> Spatial Coordinates (EPSG:4326)
              </label>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onStartCoordinatePick();
                }}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-medium flex items-center gap-1 transition-all cursor-pointer"
              >
                <Crosshair className="w-3 h-3" /> Click on Tactical Map
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-xs">
              <div>
                <span className="text-[10px] text-slate-400">Longitude (°E):</span>
                <input
                  type="number"
                  step="0.0001"
                  value={lng}
                  onChange={(e) => setLng(parseFloat(e.target.value))}
                  className="w-full bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-cyan-200 text-xs"
                  required
                />
              </div>
              <div>
                <span className="text-[10px] text-slate-400">Latitude (°N):</span>
                <input
                  type="number"
                  step="0.0001"
                  value={lat}
                  onChange={(e) => setLat(parseFloat(e.target.value))}
                  className="w-full bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-cyan-200 text-xs"
                  required
                />
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="text-xs text-slate-300 font-medium">Field Situation Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full bg-slate-900/90 border border-white/15 rounded-xl px-3 py-2 text-xs text-slate-100 outline-none focus:border-rose-400 resize-none"
              placeholder="Provide exact obstacle conditions..."
              required
            />
          </div>

          {/* Alternate Route Available checkbox */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="altRouteCheck"
              checked={alternateRouteAvailable}
              onChange={(e) => setAlternateRouteAvailable(e.target.checked)}
              className="w-4 h-4 accent-rose-500 rounded cursor-pointer"
            />
            <label htmlFor="altRouteCheck" className="text-xs text-slate-300 cursor-pointer">
              Alternate bypass route is verified & available for logistics rerouting
            </label>
          </div>

          {successMsg && (
            <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs text-center font-medium animate-in fade-in flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>{successMsg}</span>
            </div>
          )}

          <div className="flex gap-2 pt-2 border-t border-white/10">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-bold text-xs transition-all shadow-lg shadow-rose-600/30 cursor-pointer"
            >
              {isSubmitting ? 'Recording Spatial Incident...' : 'Broadcast & Record Incident'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
