import type { Map as MapLibreMap } from 'maplibre-gl';
import { addGeoJSONLayer, toggleMapLayer } from '../geoJsonManager';

export const WEATHER_SOURCE_ID = 'northeast-weather-source';
export const WEATHER_FILL_LAYER_ID = 'northeast-weather-fill';
export const WEATHER_OUTLINE_LAYER_ID = 'northeast-weather-outline';

export const WEATHER_CELLS_GEOJSON: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    // Meghalaya heavy monsoon cell (East Khasi Hills & Mawsynram belt)
    {
      type: 'Feature',
      properties: {
        id: 'wx-cell-meghalaya',
        intensity: 'HEAVY_PRECIPITATION',
        rainfallRate: '58 mm/h',
        name: 'Cherrapunji-Shillong Severe Monsoon Cell'
      },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [91.3, 25.1], [91.9, 25.1], [92.3, 25.4],
          [92.1, 25.7], [91.5, 25.6], [91.3, 25.1]
        ]]
      }
    },
    // Arunachal foothills storm cell near Itanagar/Pasighat
    {
      type: 'Feature',
      properties: {
        id: 'wx-cell-arunachal',
        intensity: 'MODERATE_RAIN',
        rainfallRate: '24 mm/h',
        name: 'Subansiri Valley Cloud Front'
      },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [93.1, 27.0], [93.9, 27.2], [94.3, 27.6],
          [93.8, 27.8], [93.2, 27.4], [93.1, 27.0]
        ]]
      }
    }
  ]
};

export function setupWeatherLayer(map: MapLibreMap): void {
  addGeoJSONLayer(map, WEATHER_SOURCE_ID, WEATHER_CELLS_GEOJSON, [
    {
      id: WEATHER_FILL_LAYER_ID,
      type: 'fill',
      source: WEATHER_SOURCE_ID,
      paint: {
        'fill-color': '#0284c7',
        'fill-opacity': 0.28
      }
    },
    {
      id: WEATHER_OUTLINE_LAYER_ID,
      type: 'line',
      source: WEATHER_SOURCE_ID,
      paint: {
        'line-color': '#38bdf8',
        'line-width': 1.5,
        'line-dasharray': [2, 2],
        'line-opacity': 0.7
      }
    }
  ]);
}

export function toggleWeatherLayer(map: MapLibreMap, visible: boolean): void {
  toggleMapLayer(map, [WEATHER_FILL_LAYER_ID, WEATHER_OUTLINE_LAYER_ID], visible);
}
