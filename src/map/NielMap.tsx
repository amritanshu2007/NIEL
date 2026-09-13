import React, { useEffect, useRef, useCallback, useState } from 'react';
import maplibregl, { Map as MapLibreMap, Marker } from 'maplibre-gl';
import { NORTHEAST_DEFAULT_VIEW, GLOBE_SPACE_VIEW, NORTHEAST_CITIES } from './mapConfig';
import { getMapStyle, type MapStyleType } from './mapStyles';
import { setupBoundariesLayer, toggleBoundariesLayer } from './layers/boundaries';
import { setupRoadsLayer, updateRoadsLayer, toggleRoadsLayer } from './layers/roads';
import { setupActiveRouteLayer, setActiveRoute } from './layers/routes';
import { setupWeatherLayer, toggleWeatherLayer } from './layers/weather';
import { setupDisastersLayer, updateDisastersLayer, toggleDisastersLayer } from './layers/disasters';
import { setupVehiclesLayer, updateVehiclesLayer, toggleVehiclesLayer } from './layers/vehicles';
import { setupSupplyCentersLayer, toggleSupplyCentersLayer } from './layers/supplyCenters';
import { setupHospitalsLayer, toggleHospitalsLayer } from './layers/hospitals';
import { setupAirportsLayer, toggleAirportsLayer } from './layers/airports';
import { setupTrafficLayer, toggleTrafficLayer } from './layers/traffic';
import { MapControls } from './controls/MapControls';
import { nielStore, type LayerVisibilityState } from '../store/nielStore';
import type { RoadCorridor, IncidentAlert, Vehicle, RouteOption } from '../services/apiTypes';

interface NielMapProps {
  activeStyle: MapStyleType;
  onStyleChange: (style: MapStyleType) => void;
  layerVisibility: LayerVisibilityState;
  onToggleLayer: (layerKey: keyof LayerVisibilityState) => void;
  is3dMode: boolean;
  onToggle3d: () => void;
  onSelectFeature: (feature: any, type: any) => void;
  onMapReady?: (map: MapLibreMap) => void;
  roads: RoadCorridor[];
  incidents: IncidentAlert[];
  vehicles: Vehicle[];
  activeRoute: RouteOption | null;
  isReportingIncident?: boolean;
  onCoordinatePicked?: (coords: [number, number]) => void;
}

export const NielMap: React.FC<NielMapProps> = ({
  activeStyle,
  onStyleChange,
  layerVisibility,
  onToggleLayer,
  is3dMode,
  onToggle3d,
  onSelectFeature,
  onMapReady,
  roads,
  incidents,
  vehicles,
  activeRoute,
  isReportingIncident,
  onCoordinatePicked
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const cityMarkersRef = useRef<Marker[]>([]);
  const isLoadedRef = useRef<boolean>(false);
  const rotationAnimRef = useRef<number | null>(null);

  const [isGlobeProjection, setIsGlobeProjection] = useState<boolean>(true);
  const [isRotating, setIsRotating] = useState<boolean>(false);
  const [currentZoom, setCurrentZoom] = useState<number>(NORTHEAST_DEFAULT_VIEW.zoom);

  // Helper: Initialize all geospatial vector & GeoJSON intelligence layers safely
  const initMapLayers = useCallback((map: MapLibreMap) => {
    try {
      setupBoundariesLayer(map);
      setupRoadsLayer(map, roads);
      setupActiveRouteLayer(map);
      setupWeatherLayer(map);
      setupDisastersLayer(map, incidents);
      setupVehiclesLayer(map, vehicles);
      setupSupplyCentersLayer(map);
      setupHospitalsLayer(map);
      setupAirportsLayer(map);
      setupTrafficLayer(map);
    } catch (err) {
      console.warn('[NIEL Map] Layer setup notice:', err);
    }
  }, [incidents, roads, vehicles]);

  // Helper: Create interactive HTML markers for Northeast cities with pulsing nodes
  const initCityMarkers = useCallback((map: MapLibreMap) => {
    for (const marker of cityMarkersRef.current) {
      marker.remove();
    }
    cityMarkersRef.current = [];

    NORTHEAST_CITIES.forEach((city) => {
      const el = document.createElement('div');
      el.className = 'city-marker-node group flex items-center gap-1.5 cursor-pointer select-none transition-all duration-300 hover:scale-110';

      const isHub = city.name === 'Guwahati';
      const isRestricted = city.status === 'RESTRICTED';

      el.innerHTML = `
        <div class="relative flex items-center justify-center">
          <div class="w-3.5 h-3.5 rounded-full ${
            isHub
              ? 'bg-cyan-400 pulse-marker-safe border-2 border-white'
              : isRestricted
              ? 'bg-rose-500 pulse-marker-alert border border-white'
              : 'bg-sky-400 border border-white shadow-sm'
          }"></div>
        </div>
        <div class="px-2 py-0.5 rounded-md glass-panel-subtle text-[11px] font-semibold tracking-wide ${
          isHub
            ? 'text-cyan-300 border border-cyan-400/40 shadow-sm'
            : 'text-slate-100 hover:text-cyan-300'
        } whitespace-nowrap shadow-md">
          ${city.name}
        </div>
      `;

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onSelectFeature(city, 'city');
        map.flyTo({
          center: city.coordinates,
          zoom: Math.max(map.getZoom(), 8.5),
          duration: 900
        });
      });

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat(city.coordinates)
        .addTo(map);

      cityMarkersRef.current.push(marker);
    });
  }, [onSelectFeature]);

  // Update marker visibility based on zoom
  const updateMarkersForZoom = useCallback((zoom: number) => {
    const showMarkers = zoom >= 4.5;
    for (const marker of cityMarkersRef.current) {
      const el = marker.getElement();
      if (el) {
        el.style.opacity = showMarkers ? '1' : '0';
        el.style.pointerEvents = showMarkers ? 'auto' : 'none';
      }
    }
  }, []);

  // Earth Orbit Auto-Rotation
  const stopAutoRotation = useCallback(() => {
    if (rotationAnimRef.current) {
      cancelAnimationFrame(rotationAnimRef.current);
      rotationAnimRef.current = null;
    }
    setIsRotating(false);
  }, []);

  const startAutoRotation = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    stopAutoRotation();
    setIsRotating(true);

    const spinEarth = () => {
      const center = map.getCenter();
      center.lng = (center.lng + 0.15) % 360;
      map.setCenter(center);
      rotationAnimRef.current = requestAnimationFrame(spinEarth);
    };

    rotationAnimRef.current = requestAnimationFrame(spinEarth);
  }, [stopAutoRotation]);

  const toggleAutoRotation = useCallback(() => {
    if (isRotating) {
      stopAutoRotation();
    } else {
      startAutoRotation();
    }
  }, [isRotating, startAutoRotation, stopAutoRotation]);

  // Stable MapLibre instance initialization
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: getMapStyle(activeStyle),
      center: NORTHEAST_DEFAULT_VIEW.center,
      zoom: NORTHEAST_DEFAULT_VIEW.zoom,
      minZoom: NORTHEAST_DEFAULT_VIEW.minZoom,
      maxZoom: NORTHEAST_DEFAULT_VIEW.maxZoom,
      pitch: NORTHEAST_DEFAULT_VIEW.pitch,
      bearing: NORTHEAST_DEFAULT_VIEW.bearing,
      attributionControl: false,
      dragRotate: true,
      touchPitch: true
    });

    mapRef.current = map;

    map.on('load', () => {
      isLoadedRef.current = true;

      try {
        if (typeof (map as any).setProjection === 'function') {
          (map as any).setProjection({ type: 'globe' });
        }
      } catch (e) {
        console.info('[NIEL Map] Projection initialized with fallback:', e);
      }

      initMapLayers(map);
      initCityMarkers(map);
      updateMarkersForZoom(map.getZoom());
      onMapReady?.(map);
    });

    map.on('zoom', () => {
      const z = map.getZoom();
      setCurrentZoom(z);
      updateMarkersForZoom(z);
    });

    map.on('mousedown', () => {
      if (rotationAnimRef.current) stopAutoRotation();
    });
    map.on('touchstart', () => {
      if (rotationAnimRef.current) stopAutoRotation();
    });

    // Interactive click handler
    map.on('click', (e) => {
      const coords: [number, number] = [parseFloat(e.lngLat.lng.toFixed(5)), parseFloat(e.lngLat.lat.toFixed(5))];

      // Coordinate picking mode for Field Officer incident reporting
      if (isReportingIncident && onCoordinatePicked) {
        onCoordinatePicked(coords);
        return;
      }

      try {
        const features = map.queryRenderedFeatures(e.point, {
          layers: [
            'northeast-disasters-circle',
            'northeast-vehicles-point',
            'northeast-roads-core',
            'northeast-supply-centers-point',
            'northeast-hospitals-point'
          ]
        });

        if (features && features.length > 0) {
          const clicked = features[0];
          const layerId = clicked.layer?.id;
          const featId = clicked.properties?.id;

          // 1. Vehicle Click
          if (layerId === 'northeast-vehicles-point') {
            const v = nielStore.getState().vehicles.find((item) => item.id === featId);
            if (v) {
              onSelectFeature(v, 'vehicle');
              return;
            }
          }

          // 2. Incident Click
          if (layerId === 'northeast-disasters-circle') {
            const inc = nielStore.getState().incidents.find((item) => item.id === featId);
            if (inc) {
              onSelectFeature(inc, 'incident');
              return;
            }
          }

          // 3. Road Corridor Click
          if (layerId === 'northeast-roads-core') {
            const road = nielStore.getState().roads.find((item) => item.id === featId);
            if (road) {
              onSelectFeature(road, 'corridor');
              return;
            }
          }
        }
      } catch {
        // Fall through
      }

      onSelectFeature({
        name: 'Tactical Coordinate',
        state: 'Earth Orbit Telemetry',
        coordinates: coords,
        accessibility: 88,
        weather: { temp: 24, condition: 'Clear Telemetry', rainfall: '0 mm/h', windSpeed: '12 km/h' },
        roadStatus: 'Regional coordinates locked. PostGIS spatial node verified.'
      }, 'general');
    });

    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      stopAutoRotation();
      resizeObserver.disconnect();
      for (const marker of cityMarkersRef.current) {
        marker.remove();
      }
      map.remove();
      mapRef.current = null;
      isLoadedRef.current = false;
    };
  }, []);

  // Update Road Corridors dynamically
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current) return;
    updateRoadsLayer(map, roads);
  }, [roads]);

  // Update Incidents dynamically
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current) return;
    updateDisastersLayer(map, incidents);
  }, [incidents]);

  // Update Vehicles dynamically
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current) return;
    updateVehiclesLayer(map, vehicles);
  }, [vehicles]);

  // Update Active AI Route dynamically
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current) return;
    setActiveRoute(map, activeRoute);
  }, [activeRoute]);

  // Handle Basemap Style Changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current) return;

    map.setStyle(getMapStyle(activeStyle));

    map.once('style.load', () => {
      try {
        if (typeof (map as any).setProjection === 'function') {
          (map as any).setProjection({ type: isGlobeProjection ? 'globe' : 'mercator' });
        }
      } catch (err) {
        console.info('[NIEL Map] Projection updated with fallback:', err);
      }

      initMapLayers(map);
      toggleBoundariesLayer(map, layerVisibility.boundaries);
      toggleRoadsLayer(map, layerVisibility.roads);
      toggleWeatherLayer(map, layerVisibility.weather);
      toggleDisastersLayer(map, layerVisibility.disasters);
      toggleVehiclesLayer(map, layerVisibility.vehicles);
      toggleSupplyCentersLayer(map, layerVisibility.supplyCenters);
      toggleHospitalsLayer(map, layerVisibility.hospitals);
      toggleAirportsLayer(map, layerVisibility.airports);
      toggleTrafficLayer(map, layerVisibility.traffic);
      if (activeRoute) setActiveRoute(map, activeRoute);
    });
  }, [activeStyle, activeRoute, initMapLayers, isGlobeProjection, layerVisibility]);

  // Handle Layer Visibility changes dynamically
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current) return;

    toggleBoundariesLayer(map, layerVisibility.boundaries);
    toggleRoadsLayer(map, layerVisibility.roads);
    toggleWeatherLayer(map, layerVisibility.weather);
    toggleDisastersLayer(map, layerVisibility.disasters);
    toggleVehiclesLayer(map, layerVisibility.vehicles);
    toggleSupplyCentersLayer(map, layerVisibility.supplyCenters);
    toggleHospitalsLayer(map, layerVisibility.hospitals);
    toggleAirportsLayer(map, layerVisibility.airports);
    toggleTrafficLayer(map, layerVisibility.traffic);
  }, [layerVisibility]);

  // Handle 2D / 3D Tilt toggle
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({
      pitch: is3dMode ? 42 : 0,
      duration: 600
    });
  }, [is3dMode]);

  // Toggle Globe vs Mercator projection
  const handleToggleGlobeProjection = useCallback(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current) return;

    const nextIsGlobe = !isGlobeProjection;
    setIsGlobeProjection(nextIsGlobe);
    try {
      if (typeof (map as any).setProjection === 'function') {
        (map as any).setProjection({ type: nextIsGlobe ? 'globe' : 'mercator' });
      }
    } catch (e) {
      console.warn('[NIEL Map] Projection change notice:', e);
    }
  }, [isGlobeProjection]);

  // Fly to Deep Space View
  const handleFlyToSpace = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({
      center: GLOBE_SPACE_VIEW.center,
      zoom: GLOBE_SPACE_VIEW.zoom,
      pitch: GLOBE_SPACE_VIEW.pitch,
      bearing: GLOBE_SPACE_VIEW.bearing,
      duration: 2200,
      essential: true
    });
  }, []);

  return (
    <div className={`absolute inset-0 w-full h-full z-0 overflow-hidden bg-[#020617] ${
      isReportingIncident ? 'cursor-crosshair' : ''
    }`}>
      {/* Real Map Canvas Container */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Crosshair Banner when picking coordinates */}
      {isReportingIncident && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
          <div className="glass-panel px-4 py-2 rounded-2xl border border-rose-500/40 text-rose-300 text-xs font-semibold flex items-center gap-2 shadow-2xl animate-pulse">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping"></span>
            <span>Click any location on the map to set incident coordinates (Point, 4326)</span>
          </div>
        </div>
      )}

      {/* Floating Map Controls with Globe & Orbit Features */}
      <MapControls
        map={mapRef.current}
        activeStyle={activeStyle}
        onStyleChange={onStyleChange}
        layerVisibility={layerVisibility}
        onToggleLayer={onToggleLayer}
        is3dMode={is3dMode}
        onToggle3d={onToggle3d}
        isGlobe={isGlobeProjection}
        onToggleGlobe={handleToggleGlobeProjection}
        isRotating={isRotating}
        onToggleRotate={toggleAutoRotation}
        onFlyToSpace={handleFlyToSpace}
        currentZoom={currentZoom}
      />
    </div>
  );
};
