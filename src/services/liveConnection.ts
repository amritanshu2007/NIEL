import { io, type Socket } from 'socket.io-client';
import { nielStore } from '../store/nielStore';
import type { IncidentAlert, RoadStatus, BroadcastAlert } from './apiTypes';
import type { BackendRoad, BackendIncident, BackendVehicle } from './apiTypes';
import {
  mapBackendRoadToRoadCorridor,
  mapBackendIncidentToIncidentAlert,
  mapBackendVehicleToVehicle
} from './backendMappers';
import { api } from './api';

const DEFAULT_SERVER = 'http://localhost:5000';

export class LiveConnectionService {
  private socket: Socket | null = null;
  private latencyInterval: any = null;
  private simulationInterval: any = null;
  private vehicleSimulationInterval: any = null;
  private simulationStarted = false;

  public initialize(): void {
    let serverUrl = import.meta.env.VITE_LIVE_WS_URL || '';
    if (typeof serverUrl !== 'string' || serverUrl.length === 0) {
      serverUrl = DEFAULT_SERVER;
    }
    if (serverUrl.startsWith('ws://')) serverUrl = serverUrl.replace('ws://', 'http://');
    if (serverUrl.startsWith('wss://')) serverUrl = serverUrl.replace('wss://', 'https://');

    // Load initial data from REST API client
    this.fetchInitialData();
    this.connect(serverUrl);
  }

  private async fetchInitialData(): Promise<void> {
    try {
      const [roads, incidents, vehicles] = await Promise.all([
        api.getRoads(),
        api.getIncidents(),
        api.getVehicles()
      ]);
      nielStore.setRoads(roads);
      nielStore.setIncidents(incidents);
      nielStore.setVehicles(vehicles);
      this.joinKnownDistricts();
    } catch (e) {
      console.warn('[NIEL Live] Error fetching initial state:', e);
    }
  }

  private connect(url: string): void {
    nielStore.setConnectionState('CONNECTING');

    try {
      const user = api.getAuthUser();
      this.socket = io(url, {
        auth: user && user.token ? { token: user.token } : undefined,
        transports: ['websocket', 'polling'],
        reconnectionDelay: 3000,
        timeout: 8000
      });

      this.socket.on('connect', () => {
        nielStore.setConnectionState('CONNECTED', 26);
        this.joinKnownDistricts();
        this.startLatencyHeartbeat();
        this.stopFallbackSimulation();
      });

      this.socket.on('disconnect', () => {
        nielStore.setConnectionState('OFFLINE');
        this.stopLatencyHeartbeat();
      });

      this.socket.on('connect_error', () => {
        nielStore.setConnectionState('OFFLINE');
        this.startFallbackSimulation();
      });

      this.bindEvents();
    } catch {
      nielStore.setConnectionState('OFFLINE');
      this.startFallbackSimulation();
    }
  }

  private joinKnownDistricts(): void {
    if (!this.socket || !this.socket.connected) return;
    const districts = new Set<string>();

    const user = api.getAuthUser();
    if (user && user.district) {
      districts.add(user.district);
    }
    for (const road of nielStore.getState().roads) {
      if (road.district) {
        districts.add(road.district);
      }
    }

    for (const district of districts) {
      this.socket.emit('join-district', { district });
    }
  }

  private bindEvents(): void {
    if (!this.socket) return;

    this.socket.on('road:status', (road: BackendRoad) => this.handleRoadEvent(road));

    this.socket.on('incident:new', (incident: BackendIncident) => {
      if (incident && incident.id) {
        this.handleIncidentEvent(incident);
      }
    });

    this.socket.on('vehicle:location', (vehicle: BackendVehicle) => {
      if (vehicle && vehicle.id) {
        this.handleVehicleEvent(vehicle);
      }
    });

    this.socket.on('alert:blocked', (road: BackendRoad) => {
      if (road && road.id) {
        this.handleRoadEvent(road);
        nielStore.pushBroadcastAlert({
          id: `alert-road-${road.id}`,
          type: 'ROAD_BLOCK',
          title: `Road Corridor Blocked: ${road.road_name || road.id}`,
          message: `${road.road_name || 'Road'} in ${road.district || 'the sector'} is closed due to hazardous conditions.`,
          severity: 'CRITICAL',
          timestamp: new Date().toLocaleTimeString()
        });
      }
    });

    this.socket.on('alert:incident', (incident: BackendIncident) => {
      if (incident && incident.id) {
        const mapped = this.handleIncidentEvent(incident);
        if (mapped && mapped.severity === 'CRITICAL') {
          nielStore.pushBroadcastAlert(this.incidentAlertPayload(mapped));
        }
      }
    });

    this.socket.on('alert', (data: { type?: string; road?: BackendRoad; incident?: BackendIncident }) => {
      if (!data) return;
      if (data.type === 'blocked' && data.road && data.road.id) {
        this.handleRoadEvent(data.road);
        nielStore.pushBroadcastAlert({
          id: `alert-road-${data.road.id}`,
          type: 'ROAD_BLOCK',
          title: `Road Corridor Blocked: ${data.road.road_name || data.road.id}`,
          message: `${data.road.road_name || 'Road'} in ${data.road.district || 'the sector'} is closed due to hazardous conditions.`,
          severity: 'CRITICAL',
          timestamp: new Date().toLocaleTimeString()
        });
      } else if (data.type === 'incident' && data.incident && data.incident.id) {
        const mapped = this.handleIncidentEvent(data.incident);
        if (mapped && mapped.severity === 'CRITICAL') {
          nielStore.pushBroadcastAlert(this.incidentAlertPayload(mapped));
        }
      }
    });
  }

  private handleRoadEvent(road: BackendRoad): void {
    if (!road || road.id === undefined || road.id === null) return;
    const mappedRoad = mapBackendRoadToRoadCorridor(road);
    nielStore.setState((prev) => {
      const idx = prev.roads.findIndex((r) => r.id === mappedRoad.id);
      const roads =
        idx !== -1
          ? prev.roads.map((r, i) => (i === idx ? mappedRoad : r))
          : [mappedRoad, ...prev.roads];
      return { roads };
    });
  }

  private handleIncidentEvent(incident: BackendIncident): IncidentAlert | null {
    if (!incident || incident.id === undefined || incident.id === null) return null;
    const mapped = mapBackendIncidentToIncidentAlert(incident);
    nielStore.addIncident(mapped);
    return mapped;
  }

  private handleVehicleEvent(vehicle: BackendVehicle): void {
    if (!vehicle || vehicle.id === undefined || vehicle.id === null) return;
    const mapped = mapBackendVehicleToVehicle(vehicle);
    nielStore.setState((prev) => {
      const idx = prev.vehicles.findIndex((v) => v.id === mapped.id);
      const vehicles =
        idx !== -1
          ? prev.vehicles.map((v, i) => (i === idx ? mapped : v))
          : [mapped, ...prev.vehicles];
      return { vehicles };
    });
  }

  private incidentAlertPayload(incident: IncidentAlert): BroadcastAlert {
    return {
      id: `alert-inc-${incident.id}`,
      type: 'CRITICAL_INCIDENT',
      title: incident.title,
      message: `${incident.locationName} - ${incident.description}`,
      severity: 'CRITICAL',
      coordinates: incident.coordinates,
      timestamp: new Date().toLocaleTimeString()
    };
  }

  private startLatencyHeartbeat(): void {
    if (this.latencyInterval) return;
    this.latencyInterval = setInterval(() => {
      const ping = Math.floor(18 + Math.random() * 15);
      nielStore.setState(() => ({
        connectionLatencyMs: ping,
        lastTelemetryTimestamp: new Date().toLocaleTimeString()
      }));
    }, 4000);
  }

  private stopLatencyHeartbeat(): void {
    if (this.latencyInterval) {
      clearInterval(this.latencyInterval);
      this.latencyInterval = null;
    }
  }

  /**
   * Offline fallback telemetry simulator when the backend is unreachable,
   * so the command center remains demoable without a running server.
   */
  private startFallbackSimulation(): void {
    if (this.simulationStarted) return;
    this.simulationStarted = true;

    this.simulationInterval = setInterval(() => {
      const ping = Math.floor(18 + Math.random() * 15);
      nielStore.setState(() => ({
        connectionLatencyMs: ping,
        lastTelemetryTimestamp: new Date().toLocaleTimeString()
      }));
    }, 4000);

    this.vehicleSimulationInterval = setInterval(() => {
      const state = nielStore.getState();
      const enRouteVehicles = state.vehicles.filter((v) => v.deliveryStatus === 'EN_ROUTE');
      if (enRouteVehicles.length === 0) return;

      const targetVeh = enRouteVehicles[Math.floor(Math.random() * enRouteVehicles.length)];
      const jitterLng = (Math.random() - 0.5) * 0.004;
      const jitterLat = (Math.random() - 0.5) * 0.004;

      nielStore.updateVehicle(targetVeh.id, {
        coordinates: [
          targetVeh.coordinates[0] + jitterLng,
          targetVeh.coordinates[1] + jitterLat
        ],
        speedKmph: Math.max(25, Math.min(75, targetVeh.speedKmph + Math.floor((Math.random() - 0.5) * 6)))
      });
    }, 3500);
  }

  private stopFallbackSimulation(): void {
    if (!this.simulationStarted) return;
    this.simulationStarted = false;
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
    if (this.vehicleSimulationInterval) {
      clearInterval(this.vehicleSimulationInterval);
      this.vehicleSimulationInterval = null;
    }
  }

  public handleIncomingTelemetry(message: any): void {
    if (!message || !message.type) return;

    switch (message.type) {
      case 'ROAD_STATUS_UPDATED':
        if (message.corridorId && message.status) {
          nielStore.updateRoadStatus(message.corridorId, message.status as RoadStatus);
          if (message.status === 'BLOCKED') {
            nielStore.pushBroadcastAlert({
              id: `alert-road-${Date.now()}`,
              type: 'ROAD_BLOCK',
              title: `Road Corridor Blockage: ${message.corridorName || message.corridorId}`,
              message: message.reason || 'Corridor closed due to hazardous conditions.',
              severity: 'CRITICAL',
              timestamp: new Date().toLocaleTimeString()
            });
          }
        }
        break;

      case 'INCIDENT_REPORTED':
        if (message.incident) {
          nielStore.addIncident(message.incident);
          if (message.incident.severity === 'CRITICAL') {
            nielStore.pushBroadcastAlert({
              id: `alert-inc-${Date.now()}`,
              type: 'CRITICAL_INCIDENT',
              title: message.incident.title,
              message: `${message.incident.locationName} - ${message.incident.description}`,
              severity: 'CRITICAL',
              coordinates: message.incident.coordinates,
              timestamp: new Date().toLocaleTimeString()
            });
          }
        }
        break;

      case 'INCIDENT_RESOLVED':
        if (message.incidentId) {
          nielStore.removeIncident(message.incidentId);
        }
        break;

      case 'VEHICLE_PING':
        if (message.vehicleId && message.coordinates) {
          nielStore.updateVehicle(message.vehicleId, {
            coordinates: message.coordinates,
            speedKmph: message.speedKmph,
            headingDeg: message.headingDeg
          });
        }
        break;

      case 'CRITICAL_ALERT':
        if (message.alert) {
          nielStore.pushBroadcastAlert(message.alert);
        }
        break;
    }
  }

  public broadcastSimulatedIncident(incident: IncidentAlert): void {
    nielStore.addIncident(incident);
    nielStore.pushBroadcastAlert({
      id: `alert-${Date.now()}`,
      type: 'CRITICAL_INCIDENT',
      title: incident.title,
      message: `${incident.locationName}: ${incident.description}`,
      severity: incident.severity,
      coordinates: incident.coordinates,
      timestamp: new Date().toLocaleTimeString()
    });
  }

  public disconnect(): void {
    this.stopLatencyHeartbeat();
    this.stopFallbackSimulation();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    nielStore.setConnectionState('OFFLINE');
  }
}

export const liveConnection = new LiveConnectionService();