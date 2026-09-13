import type {
  AuthUser,
  UserRole,
  RoadCorridor,
  RoadStatus,
  IncidentAlert,
  IncidentType,
  IncidentSeverity,
  Vehicle,
  CargoType,
  DeliveryStatus,
  RouteOption,
  RouteSegment
} from './apiTypes';
import type {
  BackendUser,
  BackendRoad,
  BackendIncident,
  BackendVehicle,
  BackendRouteResponse
} from './apiTypes';

const NER_FALLBACK_POINT: [number, number] = [91.7362, 26.1445];
const NER_FALLBACK_LINE: [number, number][] = [
  [91.7362, 26.1445],
  [91.8594, 27.5861]
];

export function parseGeoJsonPoint(json: string): [number, number] {
  try {
    const parsed = JSON.parse(json);
    const geom = parsed && parsed.type === 'Feature' ? parsed.geometry : parsed;
    if (geom && geom.type === 'Point' && Array.isArray(geom.coordinates) && geom.coordinates.length >= 2) {
      return [Number(geom.coordinates[0]), Number(geom.coordinates[1])] as [number, number];
    }
  } catch {
    // ignore malformed GeoJSON
  }
  return NER_FALLBACK_POINT;
}

export function parseGeoJsonLine(json: string): [number, number][] {
  try {
    const parsed = JSON.parse(json);
    const geom = parsed && parsed.type === 'Feature' ? parsed.geometry : parsed;
    if (geom && geom.type === 'LineString' && Array.isArray(geom.coordinates)) {
      const coords: [number, number][] = [];
      for (const c of geom.coordinates) {
        if (Array.isArray(c) && c.length >= 2) {
          coords.push([Number(c[0]), Number(c[1])] as [number, number]);
        }
      }
      if (coords.length >= 2) return coords;
    }
  } catch {
    // ignore malformed GeoJSON
  }
  return NER_FALLBACK_LINE;
}

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const radLat1 = (a[1] * Math.PI) / 180;
  const radLat2 = (b[1] * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(radLat1) * Math.cos(radLat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function approxLineDistanceKm(coords: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i += 1) {
    total += haversineKm(coords[i - 1], coords[i]);
  }
  return total;
}

export function timeAgo(iso: string): string {
  if (!iso) return 'Long ago';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'Just now';
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  return hrs < 24 ? `${hrs} hour${hrs === 1 ? '' : 's'} ago` : `${Math.floor(hrs / 24)} days ago`;
}

function formatCoord(coord: [number, number]): string {
  return `${coord[1].toFixed(2)}, ${coord[0].toFixed(2)}`;
}

// --- Enum mappers (backend snake_case enums <-> frontend display enums) ---

const BACKEND_TYPE_TO_FRONTEND: Record<string, IncidentType> = {
  Landslide: 'LANDSLIDE',
  Flood: 'FLOOD',
  Bridge_Damage: 'ROAD_BLOCK',
  Road_Block: 'ROAD_BLOCK'
};

export function mapBackendIncidentType(type: string): IncidentType {
  return BACKEND_TYPE_TO_FRONTEND[type] || 'ROAD_BLOCK';
}

const FRONTEND_TYPE_TO_BACKEND: Record<IncidentType, string> = {
  BORDER_ADVISORY: 'Road_Block',
  FLOOD: 'Flood',
  LANDSLIDE: 'Landslide',
  RAIN: 'Flood',
  ROAD_BLOCK: 'Road_Block'
};

export function mapFrontendIncidentTypeToBackend(type: IncidentType | undefined): string {
  return (type && FRONTEND_TYPE_TO_BACKEND[type]) || 'Landslide';
}

const BACKEND_SEVERITY_TO_FRONTEND: Record<string, IncidentSeverity> = {
  High: 'CRITICAL',
  Medium: 'WARNING',
  Low: 'ADVISORY'
};

export function mapBackendSeverity(severity: string): IncidentSeverity {
  return BACKEND_SEVERITY_TO_FRONTEND[severity] || 'WARNING';
}

const FRONTEND_SEVERITY_TO_BACKEND: Record<IncidentSeverity, string> = {
  CRITICAL: 'High',
  WARNING: 'Medium',
  ADVISORY: 'Low'
};

export function mapFrontendSeverityToBackend(severity: IncidentSeverity | undefined): string {
  return (severity && FRONTEND_SEVERITY_TO_BACKEND[severity]) || 'Medium';
}

const BACKEND_CARGO_TO_FRONTEND: Record<string, CargoType> = {
  Medicine: 'Medicine',
  Food: 'Food',
  Construction: 'Equipment',
  Agriculture: 'Food'
};

export function mapBackendCargoToFrontend(cargo: string): CargoType {
  return BACKEND_CARGO_TO_FRONTEND[cargo] || 'Medicine';
}

const BACKEND_STATUS_TO_DELIVERY: Record<string, DeliveryStatus> = {
  IN_TRANSIT: 'EN_ROUTE',
  DELIVERED: 'DELIVERED',
  DELAYED: 'DELAYED'
};

export function mapBackendVehicleStatusToDelivery(status: string): DeliveryStatus {
  return BACKEND_STATUS_TO_DELIVERY[status] || 'EN_ROUTE';
}

const DELIVERY_TO_BACKEND: Record<DeliveryStatus, string> = {
  PENDING: 'IN_TRANSIT',
  EN_ROUTE: 'IN_TRANSIT',
  DELIVERED: 'DELIVERED',
  DELAYED: 'DELAYED'
};

export function mapDeliveryStatusToBackend(status: DeliveryStatus | undefined): string {
  return (status && DELIVERY_TO_BACKEND[status]) || 'IN_TRANSIT';
}

// --- Entity mappers ---

export function mapBackendUserToAuthUser(user: BackendUser, token: string): AuthUser {
  const role: UserRole =
    user.role === 'admin' || user.role === 'field_officer' || user.role === 'transporter'
      ? user.role
      : 'admin';
  return {
    id: String(user.id),
    name: user.name,
    email: user.email,
    role,
    token,
    department: user.district || 'Northeast Logistics Command',
    district: user.district
  };
}

const ROAD_STATUSES: RoadStatus[] = ['OPEN', 'RISKY', 'BLOCKED'];

export function mapBackendRoadToRoadCorridor(road: BackendRoad): RoadCorridor {
  const coordinates = parseGeoJsonLine(road.path);
  const status: RoadStatus = ROAD_STATUSES.includes(road.status) ? road.status : 'OPEN';
  const highwayMatch = (road.road_name || '').match(/\b(?:NH|SH|MDR|ODR|SR|AH)\s?[-–]?\s?\d+[A-Za-z]*\b/i);
  return {
    id: String(road.id),
    name: road.road_name || `Road ${road.id}`,
    highwayNumber: highwayMatch ? highwayMatch[0] : road.district || 'NH',
    from: formatCoord(coordinates[0]),
    to: formatCoord(coordinates[coordinates.length - 1]),
    distanceKm: Math.round(approxLineDistanceKm(coordinates)),
    status,
    averageSpeedKmph: status === 'BLOCKED' ? 0 : status === 'RISKY' ? 35 : 65,
    lastUpdated: timeAgo(road.updated_at),
    riskFactor: status === 'BLOCKED' ? Infinity : status === 'RISKY' ? 2.5 : 1.0,
    coordinates,
    district: road.district
  };
}

const INCIDENT_TITLES: Record<IncidentType, string> = {
  LANDSLIDE: 'Landslide reported on corridor',
  FLOOD: 'Flooding / waterlogged corridor',
  ROAD_BLOCK: 'Road corridor blocked',
  BORDER_ADVISORY: 'Border transit advisory in effect',
  RAIN: 'Heavy rainfall hazard reported'
};

const INCIDENT_DESCRIPTIONS: Record<IncidentType, string> = {
  LANDSLIDE: 'Landslide detected on the corridor. Clearance operations may be required.',
  FLOOD: 'Waterlogging reported along the corridor. Reduce convoy speed and proceed with caution.',
  ROAD_BLOCK: 'Corridor reported blocked to through traffic. Seek the nearest alternate route.',
  BORDER_ADVISORY: 'Restrictive transit advisory issued for this border corridor.',
  RAIN: 'Heavy rainfall reducing visibility. Drive with caution and maintain safe distances.'
};

export function mapBackendIncidentToIncidentAlert(incident: BackendIncident): IncidentAlert {
  const coordinates = parseGeoJsonPoint(incident.location);
  const type = mapBackendIncidentType(incident.incident_type);
  return {
    id: String(incident.id),
    type,
    title: INCIDENT_TITLES[type],
    locationName: `GPS Sector ${coordinates[1].toFixed(3)}, ${coordinates[0].toFixed(3)}`,
    state: 'Northeast India',
    coordinates,
    severity: mapBackendSeverity(incident.severity),
    reportedAgo: timeAgo(incident.created_at),
    reportedAt: incident.created_at,
    description: INCIDENT_DESCRIPTIONS[type],
    impactedCorridor: '',
    alternateRouteAvailable: false,
    reportedBy: incident.reported_by_user_id ? `Field User #${String(incident.reported_by_user_id)}` : undefined,
    status: 'ACTIVE'
  };
}

export function mapBackendVehicleToVehicle(vehicle: BackendVehicle): Vehicle {
  const coordinates = parseGeoJsonPoint(vehicle.current_location);
  return {
    id: String(vehicle.id),
    vehicleNumber: vehicle.vehicle_number,
    driverName: vehicle.driver_name,
    driverPhone: vehicle.phone,
    cargoType: mapBackendCargoToFrontend(vehicle.cargo_type),
    cargoWeightKg: 0,
    origin: 'NIEL Logistics Depot',
    destination: vehicle.destination || 'Undefined Destination',
    coordinates,
    headingDeg: 0,
    speedKmph: 0,
    fuelPercentage: 0,
    deliveryStatus: mapBackendVehicleStatusToDelivery(vehicle.status),
    lastPingTimestamp: timeAgo(vehicle.updated_at),
    etaHours: 0
  };
}

export function mapBackendRouteToRouteOption(
  response: BackendRouteResponse,
  originName?: string,
  destinationName?: string
): RouteOption {
  const geometry = response && response.route ? response.route.geometry : null;
  const coordinates: [number, number][] =
    geometry && Array.isArray(geometry.coordinates)
      ? geometry.coordinates.map((c) => [Number(c[0]), Number(c[1])] as [number, number])
      : NER_FALLBACK_LINE;
  const obstacles = (response && response.obstacles) || [];
  const alerts = (response && response.alerts) || [];
  const hasBlocked = obstacles.some((o) => o.status === 'BLOCKED');
  const hasRisky = !hasBlocked && (alerts.length > 0 || obstacles.some((o) => o.status === 'RISKY'));
  const riskScore: RouteOption['riskScore'] = hasBlocked ? 'HIGH' : hasRisky ? 'MEDIUM' : 'LOW';
  const engine = (response && response.routingEngine) || 'road-network';
  const isFallback = engine !== 'road-network';

  const distKm = geometry ? Math.round(Number(response.route.distanceKm) || 0) : 0;
  const durMin = geometry ? Math.round(Number(response.route.durationMin) || 0) : 0;
  const fallbackDist = Math.round(approxLineDistanceKm(coordinates));
  const finalDist = distKm || fallbackDist;
  const durHrs =
    durMin > 0
      ? parseFloat((durMin / 60).toFixed(1))
      : parseFloat(((finalDist || 1) / 55).toFixed(1));

  const name = `${originName || 'Origin'} → ${destinationName || 'Destination'} (${isFallback ? 'Direct Fallback' : 'PostGIS Optimal'})`;
  const riskReasons = obstacles.map((o) => `${o.roadName} (${o.status})`);
  const statusDescription = hasBlocked
    ? `Route computed around obstructions: ${riskReasons.join(', ') || 'named blocked corridors'}.`
    : alerts.length > 0
    ? `Cautionary routing applied: ${riskReasons.join(', ') || alerts.map((a) => `${a.roadName} (${a.type})`).join(', ')}.`
    : 'Corridor network clear; no obstructions detected along the optimized path.';

  const segment: RouteSegment = {
    corridorId: 'backend-route',
    corridorName: name,
    highwayNumber: isFallback ? 'DIRECT' : 'ROAD NETWORK',
    distanceKm: finalDist,
    status: hasBlocked ? 'BLOCKED' : hasRisky ? 'RISKY' : 'OPEN',
    estimatedMinutes: durMin || Math.round((finalDist / 55) * 60),
    coordinates
  };

  return {
    id: `opt-route-${Date.now()}`,
    name,
    distanceKm: finalDist,
    durationHours: durHrs || 1,
    riskScore,
    statusDescription,
    isGreatCircleFallback: isFallback,
    segments: [segment],
    geoJson: {
      type: 'Feature',
      properties: { name },
      geometry: geometry || { type: 'LineString', coordinates: NER_FALLBACK_LINE }
    }
  };
}