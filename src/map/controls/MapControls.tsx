import React, { useState } from 'react';
import {
  Compass,
  Plus,
  Minus,
  Crosshair,
  Layers,
  EyeOff,
  Check,
  Cuboid,
  Globe2,
  Orbit,
  Sparkles
} from 'lucide-react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { NORTHEAST_DEFAULT_VIEW } from '../mapConfig';
import { MAP_STYLE_OPTIONS, type MapStyleType } from '../mapStyles';
import type { LayerVisibilityState } from '../../store/nielStore';

interface MapControlsProps {
  map: MapLibreMap | null;
  activeStyle: MapStyleType;
  onStyleChange: (style: MapStyleType) => void;
  layerVisibility: LayerVisibilityState;
  onToggleLayer: (layerKey: keyof LayerVisibilityState) => void;
  is3dMode: boolean;
  onToggle3d: () => void;
  isGlobe: boolean;
  onToggleGlobe: () => void;
  isRotating: boolean;
  onToggleRotate: () => void;
  onFlyToSpace: () => void;
  currentZoom: number;
}

export const MapControls: React.FC<MapControlsProps> = ({
  map,
  activeStyle,
  onStyleChange,
  layerVisibility,
  onToggleLayer,
  is3dMode,
  onToggle3d,
  isGlobe,
  onToggleGlobe,
  isRotating,
  onToggleRotate,
  onFlyToSpace,
  currentZoom
}) => {
  const [showLayerMenu, setShowLayerMenu] = useState(false);

  const handleZoomIn = () => {
    map?.zoomIn({ duration: 300 });
  };

  const handleZoomOut = () => {
    map?.zoomOut({ duration: 300 });
  };

  const handleResetNorth = () => {
    map?.resetNorthPitch({ duration: 800 });
  };

  const handleRecenter = () => {
    map?.flyTo({
      center: NORTHEAST_DEFAULT_VIEW.center,
      zoom: NORTHEAST_DEFAULT_VIEW.zoom,
      pitch: is3dMode ? NORTHEAST_DEFAULT_VIEW.pitch : 0,
      bearing: NORTHEAST_DEFAULT_VIEW.bearing,
      duration: 1400,
      essential: true
    });
  };

  const layerItems: { key: keyof LayerVisibilityState; label: string; iconColor: string }[] = [
    { key: 'roads', label: 'Highway Corridors (NH)', iconColor: '#10b981' },
    { key: 'disasters', label: 'Incident & Landslide Alerts', iconColor: '#ef4444' },
    { key: 'weather', label: 'Precipitation Radar', iconColor: '#0284c7' },
    { key: 'boundaries', label: 'State & Int. Boundaries', iconColor: '#06b6d4' },
    { key: 'supplyCenters', label: 'Logistics Supply Centers', iconColor: '#10b981' },
    { key: 'hospitals', label: 'Trauma Centers & Hospitals', iconColor: '#f43f5e' },
    { key: 'airports', label: 'Strategic Airfields', iconColor: '#a855f7' },
    { key: 'traffic', label: 'Live Traffic Flow Bottlenecks', iconColor: '#f59e0b' }
  ];

  return (
    <div className="absolute right-6 bottom-28 z-30 flex flex-col items-end gap-2 select-none">
      {/* Layer Toggle Dropdown Button */}
      <div className="relative">
        <button
          onClick={() => setShowLayerMenu(!showLayerMenu)}
          className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl text-xs font-medium tracking-wide transition-all shadow-lg ${
            showLayerMenu
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/50 shadow-cyan-500/20'
              : 'glass-panel text-slate-200 hover:text-white border-white/10 hover:border-cyan-500/30'
          }`}
          title="Toggle Map Layers & Basemap"
        >
          <Layers className="w-4 h-4 text-cyan-400" />
          <span>Map Layers</span>
          <span className="text-[10px] text-cyan-300/80 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-500/30">
            {Object.values(layerVisibility).filter(Boolean).length} Active
          </span>
        </button>

        {/* Dropdown Panel */}
        {showLayerMenu && (
          <div className="absolute right-0 bottom-11 w-76 glass-panel rounded-2xl p-3 border border-cyan-500/25 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10 text-xs font-semibold text-slate-300">
              <span className="flex items-center gap-1.5 text-cyan-300">
                <Layers className="w-3.5 h-3.5" /> Intelligence Layers
              </span>
              <span className="text-[10px] text-emerald-400 font-mono">Live Orbit</span>
            </div>

            {/* Individual Layer Toggles */}
            <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
              {layerItems.map((item) => {
                const isActive = layerVisibility[item.key];
                return (
                  <button
                    key={item.key}
                    onClick={() => onToggleLayer(item.key)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                      isActive
                        ? 'bg-cyan-500/15 text-slate-100 hover:bg-cyan-500/25'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: item.iconColor }}
                      />
                      <span className="text-left truncate">{item.label}</span>
                    </div>
                    {isActive ? (
                      <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    ) : (
                      <EyeOff className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Map Style Selector */}
            <div className="mt-3 pt-2.5 border-t border-white/10">
              <div className="text-[11px] font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                <span>Satellite Basemap</span>
                <span className="text-[9px] text-cyan-300 font-mono">3D Sphere</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {MAP_STYLE_OPTIONS.map((style) => (
                  <button
                    key={style.id}
                    onClick={() => onStyleChange(style.id)}
                    className={`px-2 py-1.5 rounded-lg text-[10px] text-center flex flex-col items-center gap-1 border transition-all ${
                      activeStyle === style.id
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-sm'
                        : 'bg-black/30 border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/20'
                    }`}
                  >
                    <span className="text-sm">{style.thumbnail}</span>
                    <span className="truncate w-full font-medium">{style.label.split(' ')[0]}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Floating Vertical Navigation Button Column */}
      <div className="glass-panel rounded-xl p-1 flex flex-col gap-1 border border-white/10 shadow-xl">
        {/* Globe 3D Projection Toggle */}
        <button
          onClick={onToggleGlobe}
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
            isGlobe
              ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-400/40 shadow-sm'
              : 'text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/15'
          }`}
          title={isGlobe ? 'Switch to Flat Mercator' : 'Switch to 3D Globe Projection'}
        >
          <Globe2 className="w-4 h-4" />
        </button>

        {/* Space Globe View Shortcut (Zoom out to Deep Space) */}
        <button
          onClick={onFlyToSpace}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-300 hover:text-cyan-300 hover:bg-cyan-500/15 transition-all"
          title="Zoom out to 3D Earth in Space"
        >
          <Sparkles className="w-4 h-4" />
        </button>

        {/* Auto Orbit Spin Toggle */}
        <button
          onClick={onToggleRotate}
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
            isRotating
              ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/40 shadow-sm'
              : 'text-slate-400 hover:text-emerald-300 hover:bg-emerald-500/15'
          }`}
          title={isRotating ? 'Pause Earth Orbit Spin' : 'Start Earth Orbit Auto-Rotation'}
        >
          <Orbit className={`w-4 h-4 ${isRotating ? 'animate-spin' : ''}`} />
        </button>

        <div className="w-full h-px bg-white/10 my-0.5" />

        {/* Recenter Northeast India */}
        <button
          onClick={handleRecenter}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-300 hover:text-cyan-300 hover:bg-cyan-500/15 transition-all"
          title="Focus Northeast India"
        >
          <Crosshair className="w-4 h-4" />
        </button>

        {/* Compass / Reset North */}
        <button
          onClick={handleResetNorth}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-300 hover:text-cyan-300 hover:bg-cyan-500/15 transition-all"
          title="Reset North Heading"
        >
          <Compass className="w-4 h-4" />
        </button>

        {/* 2D / 3D Tilt */}
        <button
          onClick={onToggle3d}
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
            is3dMode
              ? 'bg-cyan-500/25 text-cyan-300 font-bold text-xs border border-cyan-400/40'
              : 'text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/15 text-xs'
          }`}
          title="Toggle 2D / 3D Pitch View"
        >
          <Cuboid className="w-4 h-4" />
        </button>

        <div className="w-full h-px bg-white/10 my-0.5" />

        {/* Zoom In (+) */}
        <button
          onClick={handleZoomIn}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-300 hover:text-cyan-300 hover:bg-cyan-500/15 transition-all"
          title="Zoom In"
        >
          <Plus className="w-4 h-4" />
        </button>

        {/* Zoom Out (-) */}
        <button
          onClick={handleZoomOut}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-300 hover:text-cyan-300 hover:bg-cyan-500/15 transition-all"
          title="Zoom Out (Zoom to Globe)"
        >
          <Minus className="w-4 h-4" />
        </button>
      </div>

      {/* Mini Current Zoom / Elevation Tag */}
      <div className="glass-panel-subtle px-2 py-0.5 rounded-md text-[10px] font-mono text-slate-400 border border-white/5">
        {currentZoom < 2.5 ? 'Orbit: Deep Space' : currentZoom < 5.0 ? 'Orbit: Sub-orbital' : `Alt: Zoom ${currentZoom.toFixed(1)}`}
      </div>
    </div>
  );
};
