import type {
  AuthUser,
  UserRole,
  RoadCorridor,
  RoadStatus,
  IncidentAlert,
  IncidentType,
  Vehicle,
  DeliveryStatus,
  OptimizeRouteRequest,
  RouteOption,
  MutationItem,
  BatchSyncRequest,
  BatchSyncResponse,
  SyncItemResult
} from './apiTypes';
import type { BackendSyncItem, BackendSyncResponse } from './apiTypes';
import {
  DEFAULT_USERS,
  INITIAL_ROAD_CORRIDORS,
  INITIAL_INCIDENTS_DATA,
  INITIAL_VEHICLES_DATA
} from './apiDefaults';
import { offlineSyncService } from './offlineSync';
import { solveDijkstraRoute } from './dijkstraSolver';
import {
  mapBackendUserToAuthUser,
  mapBackendRoadToRoadCorridor,
  mapBackendIncidentToIncidentAlert,
  mapBackendVehicleToVehicle,
  mapBackendRouteToRouteOption,
  mapFrontendIncidentTypeToBackend,
  mapFrontendSeverityToBackend,
  mapDeliveryStatusToBackend
} from './backendMappers';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/$/, '');
const MAX_SYNC_BATCH = 500;

interface SyncTranslation {
  items: BackendSyncItem[];
  carried: SyncItemResult[];
}

function translateMutations(mutations: MutationItem[], vehiclesCache: Vehicle[]): SyncTranslation {
  const items: BackendSyncItem[] = [];
  const carried: SyncItemResult[] = [];
  const findVehicle = (vehicleId: string): Vehicle | undefined =>
    vehiclesCache.find((v) => v.id === vehicleId);

  for (const m of mutations) {
    const reject = (error: string): void => {
      carried.push({
        idempotency_key: m.idempotency_key,
        client_seq: m.client_seq,
        status: 'REJECTED',
        error
      });
    };

    switch (m.action_type) {
      case 'REPORT_INCIDENT':
        (() => {
          const p = m.payload || {};
          const coordinates: [number, number] | undefined = p.coordinates;
          items.push({
            id: m.idempotency_key,
            type: 'incident',
            seq: m.client_seq,
            payload: {
              location: coordinates
                ? { lat: coordinates[1], lng: coordinates[0] }
                : { lat: 0, lng: 0 },
              incident_type: mapFrontendIncidentTypeToBackend(p.type as IncidentType | undefined),
              severity: mapFrontendSeverityToBackend(p.severity)
            }
          });
        })();
        break;

      case 'UPDATE_ROAD_STATUS':
        (() => {
          const p = m.payload || {};
          if (p.corridorId && p.status) {
            items.push({
              id: m.idempotency_key,
              type: 'road_status',
              seq: m.client_seq,
              payload: { id: String(p.corridorId), status: p.status }
            });
          } else {
            reject('Missing corridorId/status in payload');
          }
        })();
        break;

      case 'PING_VEHICLE_LOCATION':
        (() => {
          const p = m.payload || {};
          const veh = p.vehicleId ? findVehicle(p.vehicleId) : undefined;
          const coords: [number, number] | undefined = p.coords;
          if (veh && coords) {
            items.push({
              id: m.idempotency_key,
              type: 'vehicle_location',
              seq: m.client_seq,
              payload: {
                vehicle_number: veh.vehicleNumber,
                location: { lat: coords[1], lng: coords[0] }
              }
            });
          } else if (!veh) {
            reject('Vehicle not found locally for GPS ping');
          } else {
            reject('GPS coordinates missing');
          }
        })();
        break;

      case 'UPDATE_DELIVERY_STATUS':
        (() => {
          const p = m.payload || {};
          const veh = p.vehicleId ? findVehicle(p.vehicleId) : undefined;
          if (veh) {
            items.push({
              id: m.idempotency_key,
              type: 'vehicle_location',
              seq: m.client_seq,
              payload: {
                vehicle_number: veh.vehicleNumber,
                location: { lat: veh.coordinates[1], lng: veh.coordinates[0] },
                status: mapDeliveryStatusToBackend(p.deliveryStatus as DeliveryStatus | undefined)
              }
            });
          } else {
            reject('Vehicle not found locally for status update');
          }
        })();
        break;

      case 'RESOLVE_INCIDENT':
      default:
        reject('Server does not support this mutation type');
        break;
    }
  }

  return { items, carried };
}

export class ApiClient {
  private token: string | null = null;
  private currentUser: AuthUser = DEFAULT_USERS['admin'];

  // In-memory runtime caching matching backend state
  private roadsCache: RoadCorridor[] = [...INITIAL_ROAD_CORRIDORS];
  private incidentsCache: IncidentAlert[] = [...INITIAL_INCIDENTS_DATA];
  private vehiclesCache: Vehicle[] = [...INITIAL_VEHICLES_DATA];

  constructor() {
    this.token = this.currentUser.token || null;
  }

  public setAuthUser(user: AuthUser): void {
    this.currentUser = user;
    this.token = user.token || null;
  }

  public getAuthUser(): AuthUser {
    return this.currentUser;
  }

  private getHeaders(): HeadersInit {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  // --- 1. AUTH & RBAC (Phases 1-2) ---
  public async login(email: string, role: UserRole = 'admin', password?: string): Promise<AuthUser> {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      if (res.ok) {
        const data = await res.json();
        const user = mapBackendUserToAuthUser(data.user, data.token);
        this.setAuthUser(user);
        return user;
      }
    } catch {
      // Fallback for local / offline demo
    }

    const matched = DEFAULT_USERS[role] || DEFAULT_USERS['admin'];
    const user: AuthUser = {
      ...matched,
      email: email || matched.email
    };
    this.setAuthUser(user);
    return user;
  }

  public switchRole(role: UserRole): AuthUser {
    const user = DEFAULT_USERS[role] || DEFAULT_USERS['admin'];
    this.setAuthUser(user);
    return user;
  }

  // --- 2. GIS & ROAD NETWORKS (Phase 3) ---
  public async getRoads(): Promise<RoadCorridor[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/roads`, {
        method: 'GET',
        headers: this.getHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.roads || [];
        this.roadsCache = list.map(mapBackendRoadToRoadCorridor);
        return this.roadsCache;
      }
    } catch {
      // Fall through to memory cache
    }
    return this.roadsCache;
  }

  public async updateRoadStatus(corridorId: string, status: RoadStatus): Promise<RoadCorridor> {
    const patchPayload = { corridorId, status, updated_at: new Date().toISOString() };

    // Try online API
    try {
      const res = await fetch(`${API_BASE_URL}/roads/${corridorId}/status`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        const data = await res.json();
        const updated = mapBackendRoadToRoadCorridor(data);
        const idx = this.roadsCache.findIndex((r) => r.id === updated.id);
        if (idx !== -1) {
          this.roadsCache[idx] = updated;
        } else {
          this.roadsCache.unshift(updated);
        }
        return updated;
      }
    } catch {
      // Offline fallback: enqueue into mutation sync queue
      offlineSyncService.enqueueMutation('UPDATE_ROAD_STATUS', patchPayload);
    }

    return this.updateRoadsInMemory(corridorId, status);
  }

  private updateRoadsInMemory(corridorId: string, status: RoadStatus): RoadCorridor {
    const idx = this.roadsCache.findIndex((r) => r.id === corridorId);
    if (idx !== -1) {
      this.roadsCache[idx] = {
        ...this.roadsCache[idx],
        status,
        riskFactor: status === 'BLOCKED' ? Infinity : status === 'RISKY' ? 2.5 : 1.0,
        averageSpeedKmph: status === 'BLOCKED' ? 0 : status === 'RISKY' ? 35 : 65,
        lastUpdated: 'Just now'
      };
      return this.roadsCache[idx];
    }
    throw new Error(`Road corridor ${corridorId} not found`);
  }

  // --- 3. FIELD INCIDENT REPORTING (Phase 4) ---
  public async getIncidents(): Promise<IncidentAlert[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/incidents`, {
        method: 'GET',
        headers: this.getHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.incidents || [];
        this.incidentsCache = list.map(mapBackendIncidentToIncidentAlert);
        return this.incidentsCache;
      }
    } catch {
      // Fall through
    }
    return this.incidentsCache;
  }

  public async createIncident(incidentData: Omit<IncidentAlert, 'id' | 'reportedAgo' | 'reportedAt'>): Promise<IncidentAlert> {
    const newIncident: IncidentAlert = {
      ...incidentData,
      id: 'inc-' + Date.now().toString(36),
      reportedAgo: 'Just now',
      reportedAt: new Date().toISOString(),
      reportedBy: incidentData.reportedBy || this.currentUser.name,
      status: 'ACTIVE'
    };

    // Try online API
    try {
      const res = await fetch(`${API_BASE_URL}/incidents`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          location: { lat: newIncident.coordinates[1], lng: newIncident.coordinates[0] },
          incident_type: mapFrontendIncidentTypeToBackend(newIncident.type),
          severity: mapFrontendSeverityToBackend(newIncident.severity)
        })
      });
      if (res.ok) {
        const data = await res.json();
        const saved = mapBackendIncidentToIncidentAlert(data);
        this.incidentsCache.unshift(saved);
        return saved;
      }
    } catch {
      // Offline fallback: enqueue into mutation queue
      offlineSyncService.enqueueMutation('REPORT_INCIDENT', newIncident);
    }

    this.incidentsCache.unshift(newIncident);
    return newIncident;
  }

  public async resolveIncident(incidentId: string): Promise<void> {
    // The backend exposes no resolve-endpoint; clear locally.
    console.warn('[NIEL API] No resolve-incident endpoint on backend; removed locally.');
    this.incidentsCache = this.incidentsCache.filter((i) => i.id !== incidentId);
  }

  // --- 4. VEHICLE FLEET TRACKING (Phase 5) ---
  public async getVehicles(): Promise<Vehicle[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/vehicles`, {
        method: 'GET',
        headers: this.getHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.vehicles || [];
        this.vehiclesCache = list.map(mapBackendVehicleToVehicle);
        return this.vehiclesCache;
      }
    } catch {
      // Fall through
    }
    return this.vehiclesCache;
  }

  public async pingVehicleLocation(
    vehicleId: string,
    coords: [number, number],
    speedKmph?: number,
    headingDeg?: number
  ): Promise<Vehicle> {
    const pingPayload = { vehicleId, coords, speedKmph, headingDeg, timestamp: new Date().toISOString() };

    try {
      const veh = this.vehiclesCache.find((v) => v.id === vehicleId);
      if (veh) {
        const res = await fetch(`${API_BASE_URL}/vehicles/location`, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({
            vehicle_number: veh.vehicleNumber,
            location: { lat: coords[1], lng: coords[0] }
          })
        });
        if (res.ok) {
          const data = await res.json();
          const updated = mapBackendVehicleToVehicle(data);
          const idx = this.vehiclesCache.findIndex((v) => v.id === updated.id);
          if (idx !== -1) {
            this.vehiclesCache[idx] = updated;
          } else {
            this.vehiclesCache.unshift(updated);
          }
          return updated;
        }
      }
    } catch {
      offlineSyncService.enqueueMutation('PING_VEHICLE_LOCATION', pingPayload);
    }

    return this.updateVehicleInMemory(vehicleId, { coordinates: coords, speedKmph, headingDeg });
  }

  public async updateDeliveryStatus(vehicleId: string, status: DeliveryStatus): Promise<Vehicle> {
    const payload = { vehicleId, deliveryStatus: status, timestamp: new Date().toISOString() };

    try {
      const veh = this.vehiclesCache.find((v) => v.id === vehicleId);
      if (veh) {
        const res = await fetch(`${API_BASE_URL}/vehicles/location`, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({
            vehicle_number: veh.vehicleNumber,
            location: { lat: veh.coordinates[1], lng: veh.coordinates[0] },
            status: mapDeliveryStatusToBackend(status)
          })
        });
        if (res.ok) {
          const data = await res.json();
          const updated = mapBackendVehicleToVehicle(data);
          const idx = this.vehiclesCache.findIndex((v) => v.id === updated.id);
          if (idx !== -1) {
            this.vehiclesCache[idx] = updated;
          } else {
            this.vehiclesCache.unshift(updated);
          }
          return updated;
        }
      }
    } catch {
      offlineSyncService.enqueueMutation('UPDATE_DELIVERY_STATUS', payload);
    }

    return this.updateVehicleInMemory(vehicleId, { deliveryStatus: status });
  }

  private updateVehicleInMemory(vehicleId: string, updates: Partial<Vehicle>): Vehicle {
    const idx = this.vehiclesCache.findIndex((v) => v.id === vehicleId);
    if (idx !== -1) {
      this.vehiclesCache[idx] = {
        ...this.vehiclesCache[idx],
        ...updates,
        lastPingTimestamp: 'Just now'
      };
      return this.vehiclesCache[idx];
    }
    throw new Error(`Vehicle ${vehicleId} not found`);
  }

  // --- 5. AI ROUTE OPTIMIZATION (Phase 6) ---
  public async optimizeRoute(req: OptimizeRouteRequest): Promise<RouteOption> {
    try {
      const originCoords = req.originCoords || [91.7362, 26.1445];
      const destinationCoords = req.destinationCoords || [91.8594, 27.5861];
      const res = await fetch(`${API_BASE_URL}/route/optimize`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          start: { lat: originCoords[1], lng: originCoords[0] },
          end: { lat: destinationCoords[1], lng: destinationCoords[0] }
        })
      });
      if (res.ok) {
        const data = await res.json();
        return mapBackendRouteToRouteOption(data, req.origin, req.destination);
      }
    } catch {
      // Fall through to client Dijkstra solver
    }

    // Client-side Dijkstra engine over PostGIS road corridors
    return solveDijkstraRoute(this.roadsCache, req);
  }

  // --- 6. OFFLINE BATCH MUTATION SYNC (Phase 7) ---
  public async syncBatchMutations(req: BatchSyncRequest): Promise<BatchSyncResponse> {
    try {
      const { items, carried } = translateMutations(req.mutations, this.vehiclesCache);
      const itemMutation = new Map<string, MutationItem>();
      for (const it of items) {
        itemMutation.set(it.id, req.mutations.find((m) => m.idempotency_key === it.id)!);
      }

      const results: SyncItemResult[] = [...carried];
      let acceptedCount = 0;

      for (let i = 0; i < items.length; i += MAX_SYNC_BATCH) {
        const chunk = items.slice(i, i + MAX_SYNC_BATCH);
        const res = await fetch(`${API_BASE_URL}/sync/batch`, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({ device_id: req.client_id, items: chunk })
        });
        if (!res.ok) {
          throw new Error(`Backend batch sync failed (HTTP ${res.status})`);
        }
        const data: BackendSyncResponse = await res.json();
        for (const r of data.results || []) {
          const mut = itemMutation.get(r.itemId);
          if (r.status === 'ok' || r.status === 'duplicate') {
            acceptedCount += 1;
          }
          results.push({
            idempotency_key: r.itemId,
            client_seq: mut ? mut.client_seq : 0,
            status: r.status === 'ok' ? 'APPLIED' : r.status === 'duplicate' ? 'DEDUPLICATED' : 'REJECTED',
            server_id: r.status === 'ok' ? `srv-${r.itemId}` : undefined,
            error: r.error
          });
        }
      }

      return {
        success: acceptedCount === req.mutations.length,
        new_watermark: req.last_known_watermark + acceptedCount,
        processed_count: req.mutations.length,
        results
      };
    } catch {
      // Offline fallback simulator
    }

    // Process local acknowledgments
    const results = req.mutations.map((m) => ({
      idempotency_key: m.idempotency_key,
      client_seq: m.client_seq,
      status: 'APPLIED' as const,
      server_id: `srv-${m.idempotency_key}`
    }));

    return {
      success: true,
      new_watermark: req.last_known_watermark + req.mutations.length,
      processed_count: req.mutations.length,
      results
    };
  }
}

export const api = new ApiClient();
