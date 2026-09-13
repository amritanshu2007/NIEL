export type UserRole = 'admin' | 'field_officer' | 'transporter';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  token?: string;
  department?: string;
  district?: string;
}

export type RoadStatus = 'OPEN' | 'RISKY' | 'BLOCKED';

export interface RoadCorridor {
  id: string;
  name: string;
  highwayNumber: string;
  from: string;
  to: string;
  distanceKm: number;
  status: RoadStatus;
  averageSpeedKmph: number;
  lastUpdated: string;
  riskFactor: number; // 1.0 = normal, 2.5 = risky, Infinity = blocked
  coordinates: [number, number][]; // LineString coords [lng, lat][]
  district?: string;
}

export type IncidentType = 'LANDSLIDE' | 'RAIN' | 'ROAD_BLOCK' | 'BORDER_ADVISORY' | 'FLOOD';
export type IncidentSeverity = 'CRITICAL' | 'WARNING' | 'ADVISORY';

export interface IncidentAlert {
  id: string;
  type: IncidentType;
  title: string;
  locationName: string;
  state: string;
  coordinates: [number, number]; // [lng, lat]
  severity: IncidentSeverity;
  reportedAgo: string;
  reportedAt: string;
  description: string;
  impactedCorridor: string;
  alternateRouteAvailable: boolean;
  reportedBy?: string;
  status?: 'ACTIVE' | 'INVESTIGATING' | 'RESOLVED';
}

export type CargoType = 'Medicine' | 'Food' | 'Fuel' | 'Relief Supplies' | 'Equipment';
export type DeliveryStatus = 'PENDING' | 'EN_ROUTE' | 'DELIVERED' | 'DELAYED';

export interface Vehicle {
  id: string;
  vehicleNumber: string;
  driverName: string;
  driverPhone: string;
  cargoType: CargoType;
  cargoWeightKg: number;
  origin: string;
  destination: string;
  coordinates: [number, number]; // [lng, lat]
  headingDeg: number;
  speedKmph: number;
  fuelPercentage: number;
  deliveryStatus: DeliveryStatus;
  lastPingTimestamp: string;
  etaHours: number;
  corridorId?: string;
}

export interface OptimizeRouteRequest {
  origin: string; // City or [lng, lat]
  destination: string; // City or [lng, lat]
  originCoords?: [number, number];
  destinationCoords?: [number, number];
  avoidBlocked?: boolean;
  riskyPenaltyMultiplier?: number;
  cargoType?: CargoType;
  isEmergencyConvoy?: boolean;
}

export interface RouteSegment {
  corridorId: string;
  corridorName: string;
  highwayNumber: string;
  distanceKm: number;
  status: RoadStatus;
  estimatedMinutes: number;
  coordinates: [number, number][];
}

export interface RouteOption {
  id: string;
  name: string;
  distanceKm: number;
  durationHours: number;
  riskScore: 'LOW' | 'MEDIUM' | 'HIGH';
  statusDescription: string;
  isGreatCircleFallback?: boolean;
  segments: RouteSegment[];
  geoJson: GeoJSON.Feature<GeoJSON.LineString>;
}

export type MutationActionType = 
  | 'REPORT_INCIDENT'
  | 'UPDATE_ROAD_STATUS'
  | 'PING_VEHICLE_LOCATION'
  | 'UPDATE_DELIVERY_STATUS'
  | 'RESOLVE_INCIDENT';

export interface MutationItem {
  client_seq: number;
  idempotency_key: string;
  action_type: MutationActionType;
  payload: any;
  created_at: string;
  retry_count: number;
  status: 'PENDING' | 'SYNCED' | 'FAILED';
  error_message?: string;
}

export interface BatchSyncRequest {
  client_id: string;
  last_known_watermark: number;
  mutations: MutationItem[];
}

export interface SyncItemResult {
  idempotency_key: string;
  client_seq: number;
  status: 'APPLIED' | 'DEDUPLICATED' | 'REJECTED';
  server_id?: string;
  error?: string;
}

export interface BatchSyncResponse {
  success: boolean;
  new_watermark: number;
  processed_count: number;
  results: SyncItemResult[];
}

export interface BroadcastAlert {
  id: string;
  type: 'ROAD_BLOCK' | 'CRITICAL_INCIDENT' | 'WEATHER_HAZARD' | 'EMERGENCY_DISPATCH';
  title: string;
  message: string;
  severity: IncidentSeverity;
  coordinates?: [number, number];
  timestamp: string;
}

// --- Backend REST API DTOs (Phase 8 bridge to Express/PostGIS backend) ---
// Field names mirror the backend JSON (snake_case) responses verbatim.

export interface BackendUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  district: string;
  created_at?: string;
}

export interface BackendRoad {
  id: string;
  road_name: string;
  district: string;
  status: RoadStatus;
  updated_at: string;
  path: string; // ST_AsGeoJSON(geom) LineString
}

export interface BackendIncident {
  id: string;
  reported_by_user_id: string;
  incident_type: string;
  photo_url: string | null;
  severity: string;
  location: string; // ST_AsGeoJSON(location) Point
  created_at: string;
}

export interface BackendVehicle {
  id: string;
  vehicle_number: string;
  driver_name: string;
  phone: string;
  cargo_type: string;
  current_location: string; // ST_AsGeoJSON(current_location) Point
  destination: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface BackendRouteObstacle {
  roadName: string;
  status: RoadStatus;
}

export interface BackendRouteAlert {
  type: string;
  roadName: string;
}

export interface BackendRouteResponse {
  route: {
    geometry: GeoJSON.LineString;
    distanceKm: number;
    durationMin: number;
  };
  routingEngine: string;
  alerts: BackendRouteAlert[];
  obstacles: BackendRouteObstacle[];
}

export interface BackendSyncItem {
  id: string;
  type: 'incident' | 'vehicle_location' | 'road_status';
  seq?: number;
  payload: any;
}

export interface BackendSyncResult {
  itemId: string;
  type: string;
  status: 'ok' | 'duplicate' | 'conflict' | 'error';
  error?: string;
}

export interface BackendSyncResponse {
  device_id: string | null;
  summary: { ok?: number; duplicate?: number; conflict?: number; error?: number };
  synced: number;
  duplicates: number;
  conflicts: number;
  failed: number;
  results: BackendSyncResult[];
}
