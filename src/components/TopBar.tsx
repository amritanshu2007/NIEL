import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Mic,
  AlertOctagon,
  Clock,
  Navigation,
  MapPin,
  Building2,
  Truck,
  Shield,
  Database,
  PlusCircle,
  Route
} from 'lucide-react';
import { NORTHEAST_CITIES } from '../map/mapConfig';
import { SUPPLY_CENTERS_DATA } from '../map/layers/supplyCenters';
import type { ConnectionState } from '../store/nielStore';
import type { AuthUser, IncidentAlert, Vehicle, RoadCorridor, MutationItem } from '../services/apiTypes';

interface TopBarProps {
  currentUser: AuthUser;
  connectionState: ConnectionState;
  connectionLatency: number;
  incidents: IncidentAlert[];
  vehicles: Vehicle[];
  roads: RoadCorridor[];
  offlineQueue: MutationItem[];
  onSelectSearchResult: (coords: [number, number], item: any, type: string) => void;
  onOpenAuth: () => void;
  onOpenReportIncident: () => void;
  onOpenOfflineQueue: () => void;
  onOpenRoadsManager: () => void;
  onTriggerEmergency?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  currentUser,
  connectionState,
  connectionLatency,
  incidents,
  vehicles,
  roads,
  offlineQueue,
  onSelectSearchResult,
  onOpenAuth,
  onOpenReportIncident,
  onOpenOfflineQueue,
  onOpenRoadsManager,
  onTriggerEmergency
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const searchContainerRef = useRef<HTMLDivElement | null>(null);

  const pendingMutationCount = offlineQueue.filter((m) => m.status === 'PENDING').length;

  // Live real-time clock ticker
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Real searchable index: Cities, Roads, Vehicles, Supply Centers, Incidents
  const filteredResults = React.useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase().trim();

    const results: { title: string; subtitle: string; type: string; coords: [number, number]; raw: any }[] = [];

    // Search Cities
    for (const city of NORTHEAST_CITIES) {
      if (city.name.toLowerCase().includes(query) || city.state.toLowerCase().includes(query)) {
        results.push({
          title: city.name,
          subtitle: `${city.state} · ${city.status} Accessibility`,
          type: 'city',
          coords: city.coordinates,
          raw: city
        });
      }
    }

    // Search Live Incidents
    for (const inc of incidents) {
      if (inc.title.toLowerCase().includes(query) || inc.locationName.toLowerCase().includes(query)) {
        results.push({
          title: inc.title,
          subtitle: `${inc.locationName} · ${inc.severity}`,
          type: 'incident',
          coords: inc.coordinates,
          raw: inc
        });
      }
    }

    // Search Vehicles
    for (const veh of vehicles) {
      if (veh.vehicleNumber.toLowerCase().includes(query) || veh.cargoType.toLowerCase().includes(query) || veh.driverName.toLowerCase().includes(query)) {
        results.push({
          title: `${veh.vehicleNumber} (${veh.cargoType})`,
          subtitle: `Driver: ${veh.driverName} · ${veh.deliveryStatus}`,
          type: 'vehicle',
          coords: veh.coordinates,
          raw: veh
        });
      }
    }

    // Search Road Corridors
    for (const road of roads) {
      if (road.name.toLowerCase().includes(query) || road.highwayNumber.toLowerCase().includes(query)) {
        results.push({
          title: `${road.highwayNumber} - ${road.name}`,
          subtitle: `${road.from} ➔ ${road.to} · ${road.status}`,
          type: 'corridor',
          coords: road.coordinates[0],
          raw: road
        });
      }
    }

    // Search Supply Centers
    for (const sc of SUPPLY_CENTERS_DATA) {
      if (sc.name.toLowerCase().includes(query) || sc.location.toLowerCase().includes(query)) {
        results.push({
          title: sc.name,
          subtitle: `${sc.location} · ${sc.trucksAvailable} Trucks Available`,
          type: 'supply',
          coords: sc.coordinates,
          raw: sc
        });
      }
    }

    return results.slice(0, 6);
  }, [searchQuery, incidents, vehicles, roads]);

  const handleSelect = (item: (typeof filteredResults)[0]) => {
    onSelectSearchResult(item.coords, item.raw, item.type);
    setIsDropdownOpen(false);
    setSearchQuery(item.title);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && filteredResults.length > 0) {
      handleSelect(filteredResults[0]);
    }
  };

  const formatHeaderDate = (d: Date) => {
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatHeaderTime = (d: Date) => {
    return d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  return (
    <header className="absolute top-4 left-4 right-4 z-40 flex items-center justify-between gap-3 pointer-events-none select-none">
      {/* Left: ASTRA Logo & RBAC Role Pill */}
      <div className="flex items-center gap-3 pointer-events-auto">
        <div
          onClick={onOpenAuth}
          className="w-10 h-10 rounded-2xl bg-cyan-500/15 border border-cyan-400/40 flex items-center justify-center shadow-[0_0_18px_rgba(6,182,212,0.35)] backdrop-blur-md cursor-pointer hover:scale-105 transition-transform"
          title="Click to Switch Role / View RBAC Profile"
        >
          <svg className="w-6 h-6 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <polygon points="12 2 2 22 22 22" />
            <polygon points="12 8 6 19 18 19" fill="rgba(6,182,212,0.3)" />
          </svg>
        </div>

        <div>
          <h1 className="text-base font-black tracking-wider text-white flex items-center gap-1.5">
            NIEL PLATFORM
          </h1>
          {/* RBAC Role Pill */}
          <button
            onClick={onOpenAuth}
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1 transition-all cursor-pointer ${
              currentUser.role === 'admin'
                ? 'bg-cyan-950/80 text-cyan-300 border-cyan-500/40 hover:bg-cyan-900/80'
                : currentUser.role === 'field_officer'
                ? 'bg-rose-950/80 text-rose-300 border-rose-500/40 hover:bg-rose-900/80'
                : 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40 hover:bg-emerald-900/80'
            }`}
            title="Click to switch operating role"
          >
            <Shield className="w-3 h-3" />
            <span className="uppercase font-mono">{currentUser.role.replace('_', ' ')}</span>
            <span className="text-slate-400">· {currentUser.name.split(' ')[0]}</span>
          </button>
        </div>
      </div>

      {/* Center: Search Bar with Autocomplete & Spatial Indexing */}
      <div ref={searchContainerRef} className="relative w-full max-w-lg pointer-events-auto">
        <div className="relative flex items-center glass-panel rounded-2xl px-3.5 py-2 border border-white/15 focus-within:border-cyan-400/60 focus-within:shadow-[0_0_20px_rgba(6,182,212,0.25)] transition-all">
          <Search className="w-4 h-4 text-cyan-400 shrink-0 mr-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsDropdownOpen(true);
            }}
            onFocus={() => setIsDropdownOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder="Search corridors, incidents, vehicles, supply hubs..."
            className="w-full bg-transparent border-none outline-none text-xs text-slate-100 placeholder-slate-400 font-normal pr-7"
          />
          <button
            title="Voice Command"
            className="absolute right-3 p-1 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/10 transition-colors"
          >
            <Mic className="w-4 h-4" />
          </button>
        </div>

        {/* Search Autocomplete Dropdown */}
        {isDropdownOpen && filteredResults.length > 0 && (
          <div className="absolute top-12 left-0 right-0 glass-panel rounded-xl p-1.5 border border-cyan-500/30 shadow-2xl backdrop-blur-xl animate-in fade-in duration-150 space-y-0.5">
            {filteredResults.map((item, idx) => (
              <button
                key={idx}
                onClick={() => handleSelect(item)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-cyan-500/15 transition-all text-xs group cursor-pointer"
              >
                <div className="w-6 h-6 rounded-md bg-white/5 border border-white/10 flex items-center justify-center text-cyan-300 shrink-0 group-hover:border-cyan-400">
                  {item.type === 'city' && <MapPin className="w-3.5 h-3.5" />}
                  {item.type === 'vehicle' && <Truck className="w-3.5 h-3.5 text-cyan-400" />}
                  {item.type === 'corridor' && <Route className="w-3.5 h-3.5 text-emerald-400" />}
                  {item.type === 'supply' && <Building2 className="w-3.5 h-3.5" />}
                  {item.type === 'incident' && <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-100 truncate group-hover:text-cyan-200">
                    {item.title}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">
                    {item.subtitle}
                  </div>
                </div>
                <Navigation className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right Controls: Quick Actions, Offline Queue, Clock, Live Indicator, Emergency */}
      <div className="flex items-center gap-2 pointer-events-auto">
        {/* Quick Action: Report Field Incident */}
        <button
          onClick={onOpenReportIncident}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-semibold shadow-md transition-all cursor-pointer"
          title="Report Field Incident (Phase 4)"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Report Incident</span>
        </button>

        {/* Quick Action: Road Conditions Manager */}
        <button
          onClick={onOpenRoadsManager}
          className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-semibold shadow-md transition-all cursor-pointer"
          title="GIS Road Corridor Status Manager (Phase 3)"
        >
          <Route className="w-3.5 h-3.5" />
          <span>Roads</span>
        </button>

        {/* Offline Queue Badge (Phase 7) */}
        <button
          onClick={onOpenOfflineQueue}
          className={`glass-panel rounded-xl px-2.5 py-1.5 flex items-center gap-1.5 border text-xs font-mono transition-all cursor-pointer ${
            pendingMutationCount > 0
              ? 'border-amber-500/40 text-amber-300 bg-amber-950/30'
              : 'border-white/10 text-slate-400 hover:text-cyan-300'
          }`}
          title="Offline Mutation Sync Queue"
        >
          <Database className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-[11px] font-semibold">{pendingMutationCount} Queue</span>
        </button>

        {/* Date & Time Pill (Local IST) */}
        <div className="hidden xl:flex glass-panel rounded-xl px-3 py-1.5 items-center gap-2 border border-white/10 text-xs font-mono">
          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <div className="text-right leading-tight">
            <div className="text-[10px] text-slate-300 font-sans">{formatHeaderDate(currentTime)}</div>
            <div className="text-[11px] font-bold text-cyan-300">{formatHeaderTime(currentTime)}</div>
          </div>
        </div>

        {/* Real Live Indicator Pill */}
        <div
          className={`glass-panel rounded-xl px-3 py-1.5 flex items-center gap-2 border text-xs font-semibold tracking-wide ${
            connectionState === 'CONNECTED'
              ? 'border-emerald-500/30 text-emerald-300'
              : connectionState === 'CONNECTING'
              ? 'border-amber-500/30 text-amber-300'
              : 'border-rose-500/30 text-rose-300'
          }`}
          title={`Status: ${connectionState} (${connectionLatency}ms)`}
        >
          <span className="relative flex h-2 w-2">
            {connectionState === 'CONNECTED' && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            )}
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                connectionState === 'CONNECTED'
                  ? 'bg-emerald-500'
                  : connectionState === 'CONNECTING'
                  ? 'bg-amber-400'
                  : 'bg-rose-500'
              }`}
            ></span>
          </span>
          <span className="text-[11px] font-mono">
            {connectionState === 'CONNECTED' ? 'Live' : connectionState}
          </span>
        </div>

        {/* Emergency Alert Button */}
        <button
          onClick={onTriggerEmergency}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white font-bold text-xs shadow-[0_0_16px_rgba(239,68,68,0.4)] border border-red-400/50 transition-all cursor-pointer"
        >
          <AlertOctagon className="w-3.5 h-3.5 animate-pulse" />
          <span className="hidden sm:inline">Emergency</span>
        </button>
      </div>
    </header>
  );
};
