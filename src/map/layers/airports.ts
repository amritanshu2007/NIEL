import type { Map as MapLibreMap } from 'maplibre-gl';
import { addGeoJSONLayer, toggleMapLayer } from '../geoJsonManager';

export const AIRPORTS_SOURCE_ID = 'northeast-airports-source';
export const AIRPORTS_POINT_LAYER_ID = 'northeast-airports-point';

export interface AirportFacility {
  id: string;
  name: string;
  iataCode: string;
  city: string;
  state: string;
  coordinates: [number, number];
  runwayStatus: 'OPEN' | 'LIMITED_VISIBILITY' | 'CLOSED';
  cargoCapacityTonsPerDay: number;
}

export const AIRPORTS_DATA: AirportFacility[] = [
  {
    id: 'air-01',
    name: 'Lokpriya Gopinath Bordoloi International Airport',
    iataCode: 'GAU',
    city: 'Guwahati',
    state: 'Assam',
    coordinates: [91.5859, 26.1061],
    runwayStatus: 'OPEN',
    cargoCapacityTonsPerDay: 450
  },
  {
    id: 'air-02',
    name: 'Bir Tikendrajit International Airport',
    iataCode: 'IMF',
    city: 'Imphal',
    state: 'Manipur',
    coordinates: [93.8967, 24.7600],
    runwayStatus: 'OPEN',
    cargoCapacityTonsPerDay: 120
  },
  {
    id: 'air-03',
    name: 'Dibrugarh Airport (Mohanbari)',
    iataCode: 'DIB',
    city: 'Dibrugarh',
    state: 'Assam',
    coordinates: [95.0180, 27.4839],
    runwayStatus: 'OPEN',
    cargoCapacityTonsPerDay: 180
  },
  {
    id: 'air-04',
    name: 'Maharaja Bir Bikram Airport',
    iataCode: 'IXA',
    city: 'Agartala',
    state: 'Tripura',
    coordinates: [91.2405, 23.8870],
    runwayStatus: 'OPEN',
    cargoCapacityTonsPerDay: 150
  },
  {
    id: 'air-05',
    name: 'Umroi Shillong Airport',
    iataCode: 'SHL',
    city: 'Shillong / Ri-Bhoi',
    state: 'Meghalaya',
    coordinates: [91.9790, 25.7036],
    runwayStatus: 'LIMITED_VISIBILITY',
    cargoCapacityTonsPerDay: 40
  }
];

export const AIRPORTS_GEOJSON: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: AIRPORTS_DATA.map((a) => ({
    type: 'Feature',
    properties: {
      id: a.id,
      name: a.name,
      iata: a.iataCode,
      status: a.runwayStatus
    },
    geometry: {
      type: 'Point',
      coordinates: a.coordinates
    }
  }))
};

export function setupAirportsLayer(map: MapLibreMap): void {
  addGeoJSONLayer(map, AIRPORTS_SOURCE_ID, AIRPORTS_GEOJSON, [
    {
      id: AIRPORTS_POINT_LAYER_ID,
      type: 'circle',
      source: AIRPORTS_SOURCE_ID,
      paint: {
        'circle-radius': 6,
        'circle-color': '#a855f7',
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#ffffff'
      }
    }
  ]);
}

export function toggleAirportsLayer(map: MapLibreMap, visible: boolean): void {
  toggleMapLayer(map, [AIRPORTS_POINT_LAYER_ID], visible);
}
