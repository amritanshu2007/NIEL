import type { Map as MapLibreMap } from 'maplibre-gl';
import { addGeoJSONLayer, toggleMapLayer } from '../geoJsonManager';

export const HOSPITALS_SOURCE_ID = 'northeast-hospitals-source';
export const HOSPITALS_POINT_LAYER_ID = 'northeast-hospitals-point';

export interface HospitalFacility {
  id: string;
  name: string;
  city: string;
  state: string;
  coordinates: [number, number];
  traumaBedsAvailable: number;
  oxygenSupplyDays: number;
  helipadOperational: boolean;
}

export const HOSPITALS_DATA: HospitalFacility[] = [
  {
    id: 'hosp-01',
    name: 'Gauhati Medical College & Hospital (GMCH)',
    city: 'Guwahati',
    state: 'Assam',
    coordinates: [91.7762, 26.1550],
    traumaBedsAvailable: 42,
    oxygenSupplyDays: 14,
    helipadOperational: true
  },
  {
    id: 'hosp-02',
    name: 'NEIGRIHMS Super Specialty Institute',
    city: 'Shillong',
    state: 'Meghalaya',
    coordinates: [91.9350, 25.5920],
    traumaBedsAvailable: 28,
    oxygenSupplyDays: 20,
    helipadOperational: true
  },
  {
    id: 'hosp-03',
    name: 'Tomo Riba Institute of Health (TRIHMS)',
    city: 'Naharlagun / Itanagar',
    state: 'Arunachal Pradesh',
    coordinates: [93.6950, 27.1080],
    traumaBedsAvailable: 16,
    oxygenSupplyDays: 10,
    helipadOperational: false
  },
  {
    id: 'hosp-04',
    name: 'Regional Institute of Medical Sciences (RIMS)',
    city: 'Imphal',
    state: 'Manipur',
    coordinates: [93.9180, 24.8210],
    traumaBedsAvailable: 19,
    oxygenSupplyDays: 8,
    helipadOperational: true
  },
  {
    id: 'hosp-05',
    name: 'Naga Hospital Authority Kohima',
    city: 'Kohima',
    state: 'Nagaland',
    coordinates: [94.1020, 25.6680],
    traumaBedsAvailable: 12,
    oxygenSupplyDays: 12,
    helipadOperational: false
  }
];

export const HOSPITALS_GEOJSON: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: HOSPITALS_DATA.map((h) => ({
    type: 'Feature',
    properties: {
      id: h.id,
      name: h.name,
      city: h.city,
      state: h.state,
      beds: h.traumaBedsAvailable
    },
    geometry: {
      type: 'Point',
      coordinates: h.coordinates
    }
  }))
};

export function setupHospitalsLayer(map: MapLibreMap): void {
  addGeoJSONLayer(map, HOSPITALS_SOURCE_ID, HOSPITALS_GEOJSON, [
    {
      id: HOSPITALS_POINT_LAYER_ID,
      type: 'circle',
      source: HOSPITALS_SOURCE_ID,
      paint: {
        'circle-radius': 5.5,
        'circle-color': '#f43f5e',
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#ffffff'
      }
    }
  ]);
}

export function toggleHospitalsLayer(map: MapLibreMap, visible: boolean): void {
  toggleMapLayer(map, [HOSPITALS_POINT_LAYER_ID], visible);
}
