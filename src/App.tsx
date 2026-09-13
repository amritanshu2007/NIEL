import React, { useState, useEffect, useRef, useCallback, Component, type ErrorInfo, type ReactNode } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { NielMap } from './map/NielMap';
import { TopBar } from './components/TopBar';
import { NavigationSidebar, type NavTab } from './components/NavigationSidebar';
import { NielAiPanel } from './components/NielAiPanel';
import { LiveAlertsPanel } from './components/LiveAlertsPanel';
import { BottomMetricsBar } from './components/BottomMetricsBar';
import { LocationPopup } from './components/LocationPopup';
import { AuthModal } from './components/AuthModal';
import { IncidentReportModal } from './components/IncidentReportModal';
import { RoadsManagerModal } from './components/RoadsManagerModal';
import { RoutePlannerPanel } from './components/RoutePlannerPanel';
import { FleetManagerPanel } from './components/FleetManagerPanel';
import { OfflineSyncDrawer } from './components/OfflineSyncDrawer';
import { AlertBroadcastBanner } from './components/AlertBroadcastBanner';
import { nielStore, type NielState, type LayerVisibilityState } from './store/nielStore';
import { liveConnection } from './services/liveConnection';
import { api } from './services/api';
import { NORTHEAST_CITIES } from './map/mapConfig';
import type { IncidentAlert } from './services/apiTypes';
import type { MapStyleType } from './map/mapStyles';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { hasError: false, errorMessage: '' };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMessage: error.message || 'An unexpected rendering fault occurred.' };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[NIEL Critical Fault]', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="w-screen h-screen flex flex-col items-center justify-center bg-[#020617] text-white p-6 select-none">
          <div className="glass-panel max-w-md p-6 rounded-3xl border border-rose-500/30 text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/40 mx-auto flex items-center justify-center text-rose-400">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold">NIEL Telemetry Interface Fault</h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              {this.state.errorMessage}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-400/40 text-xs font-semibold flex items-center justify-center gap-2 mx-auto transition-all cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" /> Reload Command Center
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const NielDashboard: React.FC = () => {
  const [appState, setAppState] = useState<NielState>(nielStore.getState());
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [showAiPanel, setShowAiPanel] = useState<boolean>(true);
  const [showAlertsPanel, setShowAlertsPanel] = useState<boolean>(true);

  // Modals & Panels state
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isRoadsOpen, setIsRoadsOpen] = useState(false);
  const [isOfflineQueueOpen, setIsOfflineQueueOpen] = useState(false);
  const [pickedCoordinates, setPickedCoordinates] = useState<[number, number] | null>(null);

  const mapInstanceRef = useRef<MapLibreMap | null>(null);

  // Synchronize with centralized reactive store
  useEffect(() => {
    const unsubscribe = nielStore.subscribe((state) => {
      setAppState({ ...state });
    });
    // Start live connection service & initial fetch
    liveConnection.initialize();

    return () => {
      unsubscribe();
      liveConnection.disconnect();
    };
  }, []);

  const handleMapReady = useCallback((map: MapLibreMap) => {
    mapInstanceRef.current = map;
  }, []);

  const handleStyleChange = useCallback((style: MapStyleType) => {
    nielStore.setMapStyle(style);
  }, []);

  const handleToggleLayer = useCallback((layerKey: keyof LayerVisibilityState) => {
    nielStore.toggleLayer(layerKey);
  }, []);

  const handleToggle3d = useCallback(() => {
    nielStore.setState((prev) => ({ is3dMode: !prev.is3dMode }));
  }, []);

  const handleSelectFeature = useCallback((feature: any, type: any) => {
    nielStore.selectFeature(feature, type);
  }, []);

  const handleClosePopup = useCallback(() => {
    nielStore.clearSelection();
  }, []);

  // Fly-to helper
  const handleFlyTo = useCallback((coords: [number, number], zoom = 9.5) => {
    mapInstanceRef.current?.flyTo({
      center: coords,
      zoom: zoom,
      pitch: 42,
      duration: 1400,
      essential: true
    });
  }, []);

  // Search result handler
  const handleSearchResult = useCallback((coords: [number, number], item: any, type: string) => {
    handleFlyTo(coords, 10);
    nielStore.selectFeature(item, type as any);
  }, [handleFlyTo]);

  // Handle clicking an alert item
  const handleSelectAlert = useCallback((alert: IncidentAlert) => {
    handleFlyTo(alert.coordinates, 10.5);
    nielStore.selectFeature(alert, 'incident');
  }, [handleFlyTo]);

  // Coordinate picked on map for Field Officer reporting
  const handleCoordinatePicked = useCallback((coords: [number, number]) => {
    setPickedCoordinates(coords);
    nielStore.setIsReportingIncident(false);
    setIsReportOpen(true);
  }, []);

  // AI Prompt actions connected to Dijkstra engine and map
  const handleExecutePromptAction = useCallback(async (actionKey: string) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (actionKey === 'tawang-route') {
      try {
        const route = await api.optimizeRoute({
          origin: 'Guwahati',
          destination: 'Tawang',
          originCoords: [91.7362, 26.1445],
          destinationCoords: [91.8594, 27.5861],
          avoidBlocked: true,
          cargoType: 'Medicine'
        });
        nielStore.setActiveRoute(route);
        map.flyTo({
          center: [92.05, 27.55],
          zoom: 8.8,
          pitch: 48,
          bearing: -15,
          duration: 1600
        });
      } catch (e) {
        console.error('Route optimization failed:', e);
      }
    } else if (actionKey === 'manipur-status') {
      const manipurAlert = appState.incidents.find((i) => i.id === 'inc-03');
      if (manipurAlert) {
        handleSelectAlert(manipurAlert);
      }
    } else if (actionKey === 'imphal-supply') {
      const imphalCity = NORTHEAST_CITIES.find((c) => c.id === 'imphal');
      if (imphalCity) {
        map.flyTo({
          center: [93.94, 24.83],
          zoom: 11,
          pitch: 45,
          duration: 1400
        });
        nielStore.selectFeature(imphalCity, 'city');
      }
    } else if (actionKey === 'fleet-status') {
      const firstVeh = appState.vehicles[0];
      if (firstVeh) {
        handleFlyTo(firstVeh.coordinates, 10);
        nielStore.selectFeature(firstVeh, 'vehicle');
      }
    }
  }, [appState.incidents, appState.vehicles, handleFlyTo, handleSelectAlert]);

  // Emergency action trigger
  const handleTriggerEmergency = useCallback(() => {
    const critical = appState.incidents.find((i) => i.severity === 'CRITICAL');
    if (critical) {
      handleSelectAlert(critical);
    }
  }, [appState.incidents, handleSelectAlert]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#020617]">
      {/* 1. REAL INTERACTIVE 3D GLOBE & POSTGIS MAP ENGINE */}
      <NielMap
        activeStyle={appState.activeMapStyle}
        onStyleChange={handleStyleChange}
        layerVisibility={appState.layerVisibility}
        onToggleLayer={handleToggleLayer}
        is3dMode={appState.is3dMode}
        onToggle3d={handleToggle3d}
        onSelectFeature={handleSelectFeature}
        onMapReady={handleMapReady}
        roads={appState.roads}
        incidents={appState.incidents}
        vehicles={appState.vehicles}
        activeRoute={appState.activeRoute}
        isReportingIncident={appState.isReportingIncident}
        onCoordinatePicked={handleCoordinatePicked}
      />

      {/* 2. FLOATING TOP BAR WITH RBAC & ACTION CONTROLS */}
      <TopBar
        currentUser={appState.currentUser}
        connectionState={appState.connectionState}
        connectionLatency={appState.connectionLatencyMs}
        incidents={appState.incidents}
        vehicles={appState.vehicles}
        roads={appState.roads}
        offlineQueue={appState.offlineQueue}
        onSelectSearchResult={handleSearchResult}
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenReportIncident={() => setIsReportOpen(true)}
        onOpenOfflineQueue={() => setIsOfflineQueueOpen(true)}
        onOpenRoadsManager={() => setIsRoadsOpen(true)}
        onTriggerEmergency={handleTriggerEmergency}
      />

      {/* 3. REAL-TIME BROADCAST ALERT BANNER (PHASE 7) */}
      <AlertBroadcastBanner
        alerts={appState.criticalAlerts}
        onDismiss={(id) => nielStore.dismissBroadcastAlert(id)}
        onFlyTo={handleFlyTo}
      />

      {/* 4. SLIM FLOATING NAVIGATION SIDEBAR */}
      <NavigationSidebar
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          if (tab === 'home') {
            setShowAiPanel(true);
            setShowAlertsPanel(true);
          } else if (tab === 'map') {
            setShowAiPanel(false);
            setShowAlertsPanel(true);
          } else if (tab === 'routes') {
            setShowAiPanel(false);
            setShowAlertsPanel(false);
          } else if (tab === 'analytics') {
            setIsOfflineQueueOpen(true);
          }
        }}
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenOfflineQueue={() => setIsOfflineQueueOpen(true)}
      />

      {/* 5. TAB 1: COMMAND HUB - NIEL AI ASSISTANT & LIVE ALERTS */}
      {activeTab === 'home' && showAiPanel && (
        <div className="transition-all duration-300">
          <NielAiPanel onExecutePromptAction={handleExecutePromptAction} />
        </div>
      )}

      {/* LIVE FIELD ALERTS PANEL (RIGHT) */}
      {(activeTab === 'home' || activeTab === 'map') && showAlertsPanel && (
        <div className="transition-all duration-300">
          <LiveAlertsPanel
            incidents={appState.incidents}
            onSelectAlert={handleSelectAlert}
            onOpenReportIncident={() => setIsReportOpen(true)}
          />
        </div>
      )}

      {/* 6. TAB 3: CORRIDORS & LOGISTICS - ROUTE OPTIMIZER & FLEET MANAGER */}
      {activeTab === 'routes' && (
        <>
          <RoutePlannerPanel onClose={() => setActiveTab('home')} />
          <div className="absolute right-6 top-20 z-30">
            <FleetManagerPanel
              vehicles={appState.vehicles}
              onFlyTo={handleFlyTo}
            />
          </div>
        </>
      )}

      {/* 7. INTERACTIVE FEATURE POPUP */}
      {appState.selectedFeature && (
        <LocationPopup
          feature={appState.selectedFeature}
          featureType={appState.selectedFeatureType}
          onClose={handleClosePopup}
          onFlyTo={handleFlyTo}
        />
      )}

      {/* 8. FLOATING BOTTOM INTELLIGENCE METRICS BAR */}
      <BottomMetricsBar
        activeStyle={appState.activeMapStyle}
        incidentCount={appState.incidents.length}
        roads={appState.roads}
        vehicles={appState.vehicles}
      />

      {/* 9. MODALS: AUTH & RBAC (PHASES 1-2) */}
      <AuthModal
        currentUser={appState.currentUser}
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
      />

      {/* 10. MODALS: FIELD INCIDENT REPORTING (PHASE 4) */}
      <IncidentReportModal
        isOpen={isReportOpen}
        onClose={() => {
          setIsReportOpen(false);
          setPickedCoordinates(null);
        }}
        roads={appState.roads}
        initialCoords={pickedCoordinates}
        onStartCoordinatePick={() => {
          nielStore.setIsReportingIncident(true);
        }}
      />

      {/* 11. MODALS: GIS ROAD NETWORK STATUS MANAGER (PHASE 3) */}
      <RoadsManagerModal
        isOpen={isRoadsOpen}
        onClose={() => setIsRoadsOpen(false)}
        roads={appState.roads}
      />

      {/* 12. MODALS: OFFLINE MUTATION SYNC LEDGER (PHASE 7) */}
      <OfflineSyncDrawer
        isOpen={isOfflineQueueOpen}
        onClose={() => setIsOfflineQueueOpen(false)}
        offlineQueue={appState.offlineQueue}
        watermark={appState.lastSyncWatermark}
        isSyncing={appState.isSyncing}
      />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <NielDashboard />
    </ErrorBoundary>
  );
};
