import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { Driver, GeoLocation } from '../types';

interface MapLeafletProps {
  center?: [number, number];
  zoom?: number;
  pickup?: GeoLocation | null;
  destination?: GeoLocation | null;
  routeCoordinates?: [number, number][];
  drivers?: Driver[];
  activeDriverId?: string | null;
  userLiveLocation?: GeoLocation | null;
  onMapClick?: (lat: number, lng: number) => void;
  selectionMode?: 'pickup' | 'destination' | null;
  className?: string;
  autoFitBounds?: boolean;
}

export const MapLeaflet: React.FC<MapLeafletProps> = ({
  center = [-34.5985, -58.3982],
  zoom = 14,
  pickup,
  destination,
  routeCoordinates,
  drivers = [],
  activeDriverId,
  userLiveLocation,
  onMapClick,
  selectionMode,
  className = 'h-full w-full',
  autoFitBounds = true,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  // Layer groups to manage markers dynamically
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.Polyline | null>(null);
  const routeBackingLayerRef = useRef<L.Polyline | null>(null);

  const [tileType, setTileType] = React.useState<'esri' | 'osm' | 'voyager'>('esri');
  const currentTileLayerRef = useRef<L.TileLayer | null>(null);

  // Initialize Map with Esri Urbano (World Street Map) tiles (free, no API key needed)
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: center,
      zoom: zoom,
      zoomControl: false,
      attributionControl: true,
    });

    // Default: Esri Urbano (World Street Map)
    const esriLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
      {
        attribution:
          'Tiles &copy; Esri &mdash; Esri Urbano | &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }
    ).addTo(map);
    currentTileLayerRef.current = esriLayer;

    // Zoom control at bottom-right
    L.control
      .zoom({
        position: 'bottomright',
      })
      .addTo(map);

    // Marker layers
    markersLayerRef.current = L.layerGroup().addTo(map);

    // Map click event
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (onMapClick) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    });

    mapInstanceRef.current = map;

    // Resize observer to ensure full rendering if container size alters
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Tile Layer dynamically when switching provider (Esri Urbano vs OSM)
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    if (currentTileLayerRef.current) {
      map.removeLayer(currentTileLayerRef.current);
      currentTileLayerRef.current = null;
    }

    if (tileType === 'esri') {
      currentTileLayerRef.current = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
        {
          attribution:
            'Tiles &copy; Esri &mdash; Esri Urbano | &copy; OpenStreetMap',
          maxZoom: 19,
        }
      ).addTo(map);
    } else if (tileType === 'osm') {
      currentTileLayerRef.current = L.tileLayer(
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }
      ).addTo(map);
    } else {
      currentTileLayerRef.current = L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; CARTO',
          subdomains: 'abcd',
          maxZoom: 19,
        }
      ).addTo(map);
    }
  }, [tileType]);

  // Update map click handler dynamically
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    map.off('click');
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (onMapClick) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    });
  }, [onMapClick]);

  // Update route polyline
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    // Remove previous route layers
    if (routeLayerRef.current) {
      map.removeLayer(routeLayerRef.current);
      routeLayerRef.current = null;
    }
    if (routeBackingLayerRef.current) {
      map.removeLayer(routeBackingLayerRef.current);
      routeBackingLayerRef.current = null;
    }

    if (routeCoordinates && routeCoordinates.length > 1) {
      // Background glow line
      routeBackingLayerRef.current = L.polyline(routeCoordinates, {
        color: '#4338ca',
        weight: 8,
        opacity: 0.35,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map);

      // Primary crisp route line
      routeLayerRef.current = L.polyline(routeCoordinates, {
        color: '#6366f1',
        weight: 5,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map);
    }
  }, [routeCoordinates]);

  // Update all markers (pickup, destination, drivers, live GPS)
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current) return;
    const map = mapInstanceRef.current;
    const layer = markersLayerRef.current;
    layer.clearLayers();

    const boundsPoints: L.LatLngExpression[] = [];

    // 1. Pickup Marker
    if (pickup) {
      const pickupIcon = L.divIcon({
        className: 'custom-leaflet-pin',
        html: `
          <div class="relative flex items-center justify-center -translate-x-1/2 -translate-y-1/2">
            <span class="absolute inline-flex h-8 w-8 animate-ping rounded-full bg-emerald-400 opacity-75"></span>
            <div class="relative flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xl ring-4 ring-emerald-200">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="3" fill="currentColor"/>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 2v3m0 14v3M2 12h3m14 0h3"/>
              </svg>
            </div>
            <div class="absolute -top-7 whitespace-nowrap rounded-md bg-emerald-800 px-2 py-0.5 text-[10px] font-bold text-white shadow-md border border-emerald-400">
              Punto de Recogida
            </div>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const marker = L.marker([pickup.lat, pickup.lng], { icon: pickupIcon }).addTo(layer);
      marker.bindPopup(`<b>Punto de Recogida</b><br>${pickup.address || 'Ubicación seleccionada'}`);
      boundsPoints.push([pickup.lat, pickup.lng]);
    }

    // 2. Destination Marker
    if (destination) {
      const destIcon = L.divIcon({
        className: 'custom-leaflet-pin',
        html: `
          <div class="relative flex items-center justify-center -translate-x-1/2 -translate-y-1/2">
            <div class="relative flex h-8 w-8 items-center justify-center rounded-full bg-rose-600 text-white shadow-xl ring-4 ring-rose-200">
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
              </svg>
            </div>
            <div class="absolute -top-7 whitespace-nowrap rounded-md bg-rose-800 px-2 py-0.5 text-[10px] font-bold text-white shadow-md border border-rose-400">
              Destino
            </div>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const marker = L.marker([destination.lat, destination.lng], { icon: destIcon }).addTo(layer);
      marker.bindPopup(`<b>Destino</b><br>${destination.address || 'Destino seleccionado'}`);
      boundsPoints.push([destination.lat, destination.lng]);
    }

    // 3. User Live Location Marker (if distinct from pickup)
    if (userLiveLocation && (!pickup || Math.abs(userLiveLocation.lat - pickup.lat) > 0.0001)) {
      const userGpsIcon = L.divIcon({
        className: 'custom-leaflet-pin',
        html: `
          <div class="relative flex items-center justify-center -translate-x-1/2 -translate-y-1/2">
            <span class="absolute inline-flex h-6 w-6 animate-ping rounded-full bg-blue-400 opacity-60"></span>
            <div class="h-4 w-4 rounded-full bg-blue-600 border-2 border-white shadow-md"></div>
          </div>
        `,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      L.marker([userLiveLocation.lat, userLiveLocation.lng], { icon: userGpsIcon })
        .addTo(layer)
        .bindPopup('Tu ubicación GPS actual');
    }

    // 4. Drivers Markers
    drivers.forEach((driver) => {
      if (!driver.location || !driver.isOnline) return;

      const isAssigned = activeDriverId === driver.id;
      const heading = driver.location.heading || 0;
      const carColor = isAssigned
        ? 'bg-purple-600 ring-4 ring-purple-300'
        : driver.isBusy
        ? 'bg-amber-600 ring-2 ring-amber-200'
        : 'bg-emerald-600 ring-2 ring-emerald-200';

      const carIcon = L.divIcon({
        className: 'custom-car-pin',
        html: `
          <div class="relative flex flex-col items-center justify-center -translate-x-1/2 -translate-y-1/2 cursor-pointer group">
            <div class="transition-transform duration-500 ease-out" style="transform: rotate(${heading}deg);">
              <div class="flex h-9 w-9 items-center justify-center rounded-full text-white shadow-xl ${carColor}">
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.85 7h10.29l1.04 3H5.81l1.04-3zM7.5 15.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
                </svg>
              </div>
            </div>
            <div class="mt-1 whitespace-nowrap rounded bg-slate-900/90 backdrop-blur px-1.5 py-0.5 text-[9px] font-semibold text-slate-100 shadow border border-slate-700 pointer-events-none">
              ${driver.name.split(' ')[0]} • ${driver.licensePlate}
            </div>
          </div>
        `,
        iconSize: [36, 48],
        iconAnchor: [18, 24],
      });

      const marker = L.marker([driver.location.lat, driver.location.lng], { icon: carIcon }).addTo(layer);
      marker.bindPopup(`
        <div style="font-family: sans-serif; font-size: 12px;">
          <strong style="font-size: 13px;">${driver.name}</strong><br/>
          <span>${driver.vehicleModel}</span><br/>
          <span>Patente: <b>${driver.licensePlate}</b></span><br/>
          <span>Calificación: <b>★ ${driver.rating.toFixed(2)}</b></span><br/>
          <span style="color: ${driver.isBusy ? '#d97706' : '#059669'}; font-weight: bold;">
            ${driver.isBusy ? '● Ocupado / En viaje' : '● Libre / Disponible'}
          </span>
        </div>
      `);

      if (isAssigned) {
        boundsPoints.push([driver.location.lat, driver.location.lng]);
      }
    });

    // Fit bounds automatically if needed
    if (autoFitBounds && boundsPoints.length > 0) {
      if (boundsPoints.length === 1) {
        map.panTo(boundsPoints[0] as L.LatLngExpression);
      } else {
        const bounds = L.latLngBounds(boundsPoints);
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
      }
    }
  }, [pickup, destination, drivers, activeDriverId, userLiveLocation, autoFitBounds]);

  return (
    <div className={`relative ${className}`}>
      <div ref={mapContainerRef} className="h-full w-full z-0" />

      {/* Free Map Tile Selector (Esri Urbano vs OSM - No API / Free) */}
      <div className="absolute bottom-3 left-3 z-10 flex items-center bg-slate-900/90 backdrop-blur-md p-1 rounded-xl border border-slate-700/80 shadow-lg text-[10px] font-semibold text-slate-300">
        <button
          type="button"
          onClick={() => setTileType('esri')}
          className={`px-2 py-1 rounded-lg transition ${
            tileType === 'esri'
              ? 'bg-purple-600 text-white font-bold shadow'
              : 'hover:text-white hover:bg-slate-800'
          }`}
          title="Esri World Street Map (Urbano) - 100% gratuito sin API key"
        >
          Esri Urbano
        </button>
        <button
          type="button"
          onClick={() => setTileType('osm')}
          className={`px-2 py-1 rounded-lg transition ${
            tileType === 'osm'
              ? 'bg-purple-600 text-white font-bold shadow'
              : 'hover:text-white hover:bg-slate-800'
          }`}
          title="OpenStreetMap Estándar - 100% gratuito sin API key"
        >
          OSM Libre
        </button>
      </div>

      {selectionMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <div className="flex items-center gap-2 rounded-full bg-slate-950/90 backdrop-blur-md px-4 py-2 text-xs font-semibold text-emerald-400 border border-emerald-500/40 shadow-xl animate-bounce">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping"></span>
            Haz clic en el mapa para fijar {selectionMode === 'pickup' ? 'el Punto de Recogida' : 'el Destino'}
          </div>
        </div>
      )}
    </div>
  );
};
