import type { Map as MapLibreMap, GeoJSONSource, LayerSpecification } from 'maplibre-gl';

export type GeoJSONData = GeoJSON.FeatureCollection | GeoJSON.Feature | string;

/**
 * Adds a dynamic GeoJSON source and associated layer(s) to a MapLibre map instance.
 */
export function addGeoJSONLayer(
  map: MapLibreMap,
  sourceId: string,
  data: GeoJSONData,
  layerConfig: LayerSpecification | LayerSpecification[]
): void {
  if (!map) return;

  // 1. Add or retrieve source
  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, {
      type: 'geojson',
      data: data as any
    });
  } else {
    updateGeoJSONLayer(map, sourceId, data);
  }

  // 2. Add layer or multiple layers (e.g. line glow + core line)
  const layers = Array.isArray(layerConfig) ? layerConfig : [layerConfig];
  for (const layer of layers) {
    if (!map.getLayer(layer.id)) {
      map.addLayer(layer);
    }
  }
}

/**
 * Efficiently updates an existing GeoJSON source without recreating or reloading the map.
 * This enables real-time WebSocket telemetry ingestion.
 */
export function updateGeoJSONLayer(
  map: MapLibreMap,
  sourceId: string,
  data: GeoJSONData
): boolean {
  if (!map) return false;
  const source = map.getSource(sourceId) as GeoJSONSource | undefined;
  if (source && typeof source.setData === 'function') {
    source.setData(data as any);
    return true;
  }
  return false;
}

/**
 * Safely removes a map layer and optionally its associated source.
 */
export function removeMapLayer(
  map: MapLibreMap,
  layerId: string,
  sourceIdToRemove?: string
): void {
  if (!map) return;
  if (map.getLayer(layerId)) {
    map.removeLayer(layerId);
  }
  if (sourceIdToRemove && map.getSource(sourceIdToRemove)) {
    map.removeSource(sourceIdToRemove);
  }
}

/**
 * Toggles visibility for one or multiple layers.
 */
export function toggleMapLayer(
  map: MapLibreMap,
  layerIds: string | string[],
  visible: boolean
): void {
  if (!map) return;
  const ids = Array.isArray(layerIds) ? layerIds : [layerIds];
  const visibilityValue = visible ? 'visible' : 'none';

  for (const id of ids) {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, 'visibility', visibilityValue);
    }
  }
}

/**
 * Computes bounding box of GeoJSON and smoothly fits the map camera to it.
 */
export function fitMapToData(
  map: MapLibreMap,
  data: GeoJSON.FeatureCollection | GeoJSON.Feature,
  padding: number = 60
): void {
  if (!map || !data) return;

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  const extractCoords = (coords: any) => {
    if (typeof coords?.[0] === 'number' && typeof coords?.[1] === 'number') {
      const [lng, lat] = coords;
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    } else if (Array.isArray(coords)) {
      for (const item of coords) {
        extractCoords(item);
      }
    }
  };

  const features = data.type === 'FeatureCollection' ? data.features : [data];
  for (const feat of features) {
    if (feat.geometry && 'coordinates' in feat.geometry) {
      extractCoords((feat.geometry as any).coordinates);
    }
  }

  if (minLng !== Infinity && minLat !== Infinity) {
    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat]
      ],
      {
        padding: { top: padding + 80, bottom: padding + 100, left: padding + 350, right: padding + 350 },
        duration: 1500,
        maxZoom: 14
      }
    );
  }
}
