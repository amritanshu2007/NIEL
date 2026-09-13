import type { StyleSpecification } from 'maplibre-gl';

export type MapStyleType = 'satellite_hybrid' | 'cyber_dark' | 'terrain_dark';

export interface MapStyleOption {
  id: MapStyleType;
  label: string;
  description: string;
  thumbnail: string;
}

export const MAP_STYLE_OPTIONS: MapStyleOption[] = [
  {
    id: 'satellite_hybrid',
    label: 'Satellite Live Globe',
    description: 'High-res orbital imagery with 3D Earth sphere and tactical corridors',
    thumbnail: '🛰️'
  },
  {
    id: 'cyber_dark',
    label: 'Cyber Tactical Globe',
    description: 'Deep contrast tactical vector basemap on 3D globe',
    thumbnail: '🌐'
  },
  {
    id: 'terrain_dark',
    label: 'Topographic Globe',
    description: 'Himalayan mountain terrain & global elevation relief',
    thumbnail: '⛰️'
  }
];

// Open, high-reliability styles with global satellite coverage and 100% v8 spec compliance
export function getMapStyle(styleType: MapStyleType = 'satellite_hybrid'): StyleSpecification | string {
  const customUrl = import.meta.env.VITE_MAP_STYLE_URL;
  if (customUrl && typeof customUrl === 'string' && customUrl.trim().length > 0) {
    return customUrl.trim();
  }

  if (styleType === 'cyber_dark') {
    return {
      version: 8,
      sources: {
        'carto-dark': {
          type: 'raster',
          tiles: [
            'https://a.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png',
            'https://b.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png',
            'https://c.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png'
          ],
          tileSize: 256,
          attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
        }
      },
      layers: [
        {
          id: 'carto-dark-layer',
          type: 'raster',
          source: 'carto-dark',
          minzoom: 0,
          maxzoom: 20
        }
      ]
    } as StyleSpecification;
  }

  if (styleType === 'terrain_dark') {
    return {
      version: 8,
      sources: {
        'topo-tiles': {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}'
          ],
          tileSize: 256,
          attribution: '&copy; Esri &mdash; World Topographic Map'
        }
      },
      layers: [
        {
          id: 'topo-layer',
          type: 'raster',
          source: 'topo-tiles',
          paint: {
            'raster-brightness-min': 0.1,
            'raster-brightness-max': 0.55,
            'raster-contrast': 0.25,
            'raster-saturation': -0.6
          }
        }
      ]
    } as StyleSpecification;
  }

  // Default: Satellite Live with High-Resolution Global Imagery & Tactical Labels
  return {
    version: 8,
    sources: {
      'satellite-tiles': {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
        ],
        tileSize: 256,
        attribution: '&copy; Esri World Imagery &mdash; Earth Orbital Telemetry'
      },
      'carto-labels': {
        type: 'raster',
        tiles: [
          'https://a.basemaps.cartocdn.com/rastertiles/dark_only_labels/{z}/{x}/{y}.png',
          'https://b.basemaps.cartocdn.com/rastertiles/dark_only_labels/{z}/{x}/{y}.png'
        ],
        tileSize: 256,
        attribution: '&copy; CARTO'
      }
    },
    layers: [
      {
        id: 'satellite-layer',
        type: 'raster',
        source: 'satellite-tiles',
        minzoom: 0,
        maxzoom: 20,
        paint: {
          'raster-contrast': 0.15,
          'raster-saturation': 0.1,
          'raster-brightness-max': 0.9
        }
      },
      {
        id: 'labels-layer',
        type: 'raster',
        source: 'carto-labels',
        minzoom: 3,
        maxzoom: 20,
        paint: {
          'raster-opacity': 0.85
        }
      }
    ]
  } as StyleSpecification;
}
