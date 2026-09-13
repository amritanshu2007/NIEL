import type { CityFeature } from '../map/mapConfig';
import type { MapStyleType } from '../map/mapStyles';
import type {
  AuthUser,
  UserRole,
  RoadCorridor,
  RoadStatus,
  IncidentAlert,
  Vehicle,
  RouteOption,
  MutationItem,
  BroadcastAlert
} from '../services/apiTypes';
import {
  DEFAULT_USERS,
  INITIAL_ROAD_CORRIDORS,
  INITIAL_INCIDENTS_DATA,
  INITIAL_VEHICLES_DATA
} from '../services/apiDefaults';

export type ConnectionState = 'CONNECTED' | 'CONNECTING' | 'OFFLINE' | 'ERROR';

export interface LayerVisibilityState {
  boundaries: boolean;
  roads: boolean;
  weather: boolean;
  disasters: boolean;
  vehicles: boolean;
  supplyCenters: boolean;
  hospitals: boolean;
  airports: boolean;
  traffic: boolean;
}

export interface NielState {
  currentUser: AuthUser;
  connectionState: ConnectionState;
  connectionLatencyMs: number;
  lastTelemetryTimestamp: string;
  selectedFeature: (CityFeature | IncidentAlert | Vehicle | RoadCorridor | any) | null;
  selectedFeatureType: 'city' | 'incident' | 'vehicle' | 'corridor' | 'supply' | 'hospital' | 'airport' | 'general' | null;
  activeMapStyle: MapStyleType;
  layerVisibility: LayerVisibilityState;
  roads: RoadCorridor[];
  incidents: IncidentAlert[];
  vehicles: Vehicle[];
  activeRoute: RouteOption | null;
  offlineQueue: MutationItem[];
  lastSyncWatermark: number;
  isSyncing: boolean;
  criticalAlerts: BroadcastAlert[];
  is3dMode: boolean;
  searchQuery: string;
  isReportingIncident: boolean;
}

export const initialNielState: NielState = {
  currentUser: DEFAULT_USERS['admin'],
  connectionState: 'CONNECTED',
  connectionLatencyMs: 28,
  lastTelemetryTimestamp: new Date().toLocaleTimeString(),
  selectedFeature: null,
  selectedFeatureType: null,
  activeMapStyle: 'satellite_hybrid',
  layerVisibility: {
    boundaries: true,
    roads: true,
    weather: true,
    disasters: true,
    vehicles: true,
    supplyCenters: true,
    hospitals: true,
    airports: true,
    traffic: false
  },
  roads: [...INITIAL_ROAD_CORRIDORS],
  incidents: [...INITIAL_INCIDENTS_DATA],
  vehicles: [...INITIAL_VEHICLES_DATA],
  activeRoute: null,
  offlineQueue: [],
  lastSyncWatermark: 0,
  isSyncing: false,
  criticalAlerts: [],
  is3dMode: true,
  searchQuery: '',
  isReportingIncident: false
};

type Listener = (state: NielState) => void;

class NielStore {
  private state: NielState = { ...initialNielState };
  private listeners: Set<Listener> = new Set();

  public getState(): NielState {
    return this.state;
  }

  public setState(updater: Partial<NielState> | ((prev: NielState) => Partial<NielState>)): void {
    const changes = typeof updater === 'function' ? updater(this.state) : updater;
    this.state = { ...this.state, ...changes };
    this.notify();
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  // --- Auth & RBAC Actions ---
  public setCurrentUser(user: AuthUser): void {
    this.setState({ currentUser: user });
  }

  public switchUserRole(role: UserRole): void {
    const user = DEFAULT_USERS[role] || DEFAULT_USERS['admin'];
    this.setState({ currentUser: user });
  }

  // --- Layer Controls ---
  public toggleLayer(layerKey: keyof LayerVisibilityState): void {
    this.setState((prev) => ({
      layerVisibility: {
        ...prev.layerVisibility,
        [layerKey]: !prev.layerVisibility[layerKey]
      }
    }));
  }

  public setMapStyle(style: MapStyleType): void {
    this.setState({ activeMapStyle: style });
  }

  // --- Feature Selection ---
  public selectFeature(feature: any, type: NielState['selectedFeatureType']): void {
    this.setState({
      selectedFeature: feature,
      selectedFeatureType: type
    });
  }

  public clearSelection(): void {
    this.setState({
      selectedFeature: null,
      selectedFeatureType: null
    });
  }

  public setConnectionState(status: ConnectionState, latency: number = 28): void {
    this.setState({
      connectionState: status,
      connectionLatencyMs: latency,
      lastTelemetryTimestamp: new Date().toLocaleTimeString()
    });
  }

  // --- Roads Management (Phase 3) ---
  public setRoads(roads: RoadCorridor[]): void {
    this.setState({ roads });
  }

  public updateRoadStatus(corridorId: string, status: RoadStatus): void {
    this.setState((prev) => ({
      roads: prev.roads.map((r) =>
        r.id === corridorId
          ? {
              ...r,
              status,
              riskFactor: status === 'BLOCKED' ? Infinity : status === 'RISKY' ? 2.5 : 1.0,
              averageSpeedKmph: status === 'BLOCKED' ? 0 : status === 'RISKY' ? 35 : 65,
              lastUpdated: 'Just now'
            }
          : r
      )
    }));
  }

  // --- Field Incidents (Phase 4) ---
  public setIncidents(incidents: IncidentAlert[]): void {
    this.setState({ incidents });
  }

  public addIncident(incident: IncidentAlert): void {
    this.setState((prev) => ({
      incidents: [incident, ...prev.incidents.filter((i) => i.id !== incident.id)]
    }));
  }

  public removeIncident(incidentId: string): void {
    this.setState((prev) => ({
      incidents: prev.incidents.filter((i) => i.id !== incidentId)
    }));
  }

  public setIsReportingIncident(isReporting: boolean): void {
    this.setState({ isReportingIncident: isReporting });
  }

  // --- Vehicle Fleet Tracking (Phase 5) ---
  public setVehicles(vehicles: Vehicle[]): void {
    this.setState({ vehicles });
  }

  public updateVehicle(vehicleId: string, updates: Partial<Vehicle>): void {
    this.setState((prev) => ({
      vehicles: prev.vehicles.map((v) =>
        v.id === vehicleId
          ? { ...v, ...updates, lastPingTimestamp: 'Just now' }
          : v
      )
    }));
  }

  // --- Route Optimization (Phase 6) ---
  public setActiveRoute(route: RouteOption | null): void {
    this.setState({ activeRoute: route });
  }

  // --- Offline Synchronization (Phase 7) ---
  public updateOfflineQueue(queue: MutationItem[], watermark: number): void {
    this.setState({
      offlineQueue: queue,
      lastSyncWatermark: watermark
    });
  }

  public setIsSyncing(isSyncing: boolean): void {
    this.setState({ isSyncing });
  }

  // --- Alert Engine (Phase 7) ---
  public pushBroadcastAlert(alert: BroadcastAlert): void {
    this.setState((prev) => ({
      criticalAlerts: [alert, ...prev.criticalAlerts.slice(0, 4)]
    }));
  }

  public dismissBroadcastAlert(alertId: string): void {
    this.setState((prev) => ({
      criticalAlerts: prev.criticalAlerts.filter((a) => a.id !== alertId)
    }));
  }
}

export const nielStore = new NielStore();
