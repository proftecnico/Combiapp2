import React, { useState, useEffect, useRef } from 'react';
import {
  Car,
  Power,
  Navigation,
  Compass,
  CheckCircle,
  MapPin,
  Clock,
  Phone,
  Play,
  Pause,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Shield,
  Send
} from 'lucide-react';
import { MapLeaflet } from './MapLeaflet';
import { Driver, GeoLocation, TripRequest } from '../types';
import { realtimeDB } from '../services/firebaseRealtime';
import { getOSRMRoute, formatDistance, formatDuration, haversineDistanceMeters, calculateBearing } from '../services/osrm';
import { soundService } from '../services/audio';

interface DriverViewProps {
  drivers: Record<string, Driver>;
  trips: Record<string, TripRequest>;
}

export const DriverView: React.FC<DriverViewProps> = ({ drivers, trips }) => {
  // Selected driver ID
  const [selectedDriverId, setSelectedDriverId] = useState<string>(() => {
    return localStorage.getItem('urbanride_active_driver_id') || 'driver-1';
  });

  const driver = drivers[selectedDriverId] || Object.values(drivers)[0];

  // GPS watch state
  const [isGpsActive, setIsGpsActive] = useState<boolean>(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);

  // Simulation mode along OSRM route (crucial for testing & live preview without physical driving)
  const [isSimulatingDrive, setIsSimulatingDrive] = useState<boolean>(false);
  const simulationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const simulationStepRef = useRef<number>(0);
  const currentNavRouteRef = useRef<[number, number][]>([]);

  // Navigation route coordinates
  const [navRoute, setNavRoute] = useState<[number, number][]>([]);
  const [distToTargetMeters, setDistToTargetMeters] = useState<number | null>(null);
  const [etaToTargetSeconds, setEtaToTargetSeconds] = useState<number | null>(null);

  // Find if this driver currently has an assigned trip
  const activeTrip: TripRequest | null = Object.values(trips).find(
    (t) =>
      t.driverId === selectedDriverId &&
      t.status !== 'completado' &&
      t.status !== 'cancelado'
  ) || null;

  // Find any pending trip requests waiting for drivers
  const pendingRequests = Object.values(trips).filter((t) => t.status === 'solicitado');

  // Persist selected driver ID
  useEffect(() => {
    if (selectedDriverId) {
      localStorage.setItem('urbanride_active_driver_id', selectedDriverId);
    }
  }, [selectedDriverId]);

  // Audio chime when a new ride request appears while driver is online & free
  useEffect(() => {
    if (driver?.isOnline && !activeTrip && pendingRequests.length > 0) {
      soundService.playDriverAlertSound();
    }
  }, [pendingRequests.length, driver?.isOnline, activeTrip]);

  // GPS Watch Position implementation with enableHighAccuracy: true
  const startRealGpsWatch = () => {
    if (!('geolocation' in navigator)) {
      setGpsError('La geolocalización no es compatible con este navegador.');
      return;
    }

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    setIsGpsActive(true);
    setGpsError(null);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, heading } = position.coords;
        if (driver) {
          const prevLoc = driver.location;
          const calculatedHeading =
            heading !== null && !isNaN(heading)
              ? heading
              : prevLoc
              ? calculateBearing(prevLoc.lat, prevLoc.lng, latitude, longitude)
              : 0;

          realtimeDB.updateDriver(selectedDriverId, {
            location: {
              lat: latitude,
              lng: longitude,
              heading: calculatedHeading,
              address: 'GPS En Vivo',
            },
            lastUpdated: Date.now(),
          });
        }
      },
      (error) => {
        console.warn('GPS error in driver view:', error.message);
        setGpsError(`Error GPS: ${error.message}. Puedes usar la simulación en ruta.`);
        setIsGpsActive(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 1000,
      }
    );
  };

  const stopRealGpsWatch = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsGpsActive(false);
  };

  // Clean up GPS on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
      }
    };
  }, []);

  // Compute navigation route and ETA towards target (pickup or destination)
  useEffect(() => {
    if (!activeTrip || !driver?.location) {
      setNavRoute([]);
      setDistToTargetMeters(null);
      setEtaToTargetSeconds(null);
      return;
    }

    // Target is ALWAYS the passenger pickup location
    const target = activeTrip.origin;

    let isMounted = true;
    getOSRMRoute(driver.location, target).then((routeRes) => {
      if (isMounted) {
        setNavRoute(routeRes.coordinates);
        currentNavRouteRef.current = routeRes.coordinates;
        setDistToTargetMeters(routeRes.distanceMeters);
        setEtaToTargetSeconds(routeRes.durationSeconds);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [activeTrip?.status, activeTrip?.id, driver?.location?.lat, driver?.location?.lng]);

  // Simulation mode: moves vehicle step-by-step along the route!
  useEffect(() => {
    if (simulationIntervalRef.current) {
      clearInterval(simulationIntervalRef.current);
      simulationIntervalRef.current = null;
    }

    if (!isSimulatingDrive || !activeTrip || !navRoute.length) {
      return;
    }

    simulationStepRef.current = 0;

    simulationIntervalRef.current = setInterval(() => {
      const coords = currentNavRouteRef.current;
      if (!coords || coords.length === 0) return;

      const step = simulationStepRef.current;
      if (step < coords.length) {
        const nextPoint = coords[step];
        const nextNextPoint = coords[Math.min(step + 1, coords.length - 1)];

        const heading = calculateBearing(
          nextPoint[0],
          nextPoint[1],
          nextNextPoint[0],
          nextNextPoint[1]
        );

        realtimeDB.updateDriver(selectedDriverId, {
          location: {
            lat: nextPoint[0],
            lng: nextPoint[1],
            heading: heading || 0,
            address: 'Simulación en Calle',
          },
        });

        simulationStepRef.current += 1;
      } else {
        // Reached end of leg!
        setIsSimulatingDrive(false);
        if (simulationIntervalRef.current) {
          clearInterval(simulationIntervalRef.current);
        }
      }
    }, 1200);

    return () => {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
      }
    };
  }, [isSimulatingDrive, activeTrip?.status]);

  // Toggle online/offline
  const handleToggleOnline = () => {
    if (!driver) return;
    const newStatus = !driver.isOnline;
    realtimeDB.updateDriver(selectedDriverId, { isOnline: newStatus });
    if (!newStatus) {
      stopRealGpsWatch();
      setIsSimulatingDrive(false);
    }
  };

  // Accept a pending ride
  const handleAcceptTrip = async (trip: TripRequest) => {
    if (!driver) return;

    soundService.playSuccessSound();

    // 1. Assign driver to trip
    await realtimeDB.updateTrip(trip.id, {
      status: 'aceptado',
      driverId: driver.id,
      driverName: driver.name,
      driverPhone: driver.phone,
      driverVehicle: driver.vehicleModel,
      driverPlate: driver.licensePlate,
      driverRating: driver.rating,
      driverLocation: driver.location,
      acceptedAt: Date.now(),
    });

    // 2. Mark driver as busy
    await realtimeDB.updateDriver(driver.id, {
      isBusy: true,
      currentTripId: trip.id,
    });

    // Auto start route simulation so user can immediately see movement if desired
    setIsSimulatingDrive(true);
  };

  // Advance Trip Status
  const handleUpdateTripStatus = async (newStatus: TripRequest['status']) => {
    if (!activeTrip || !driver) return;

    soundService.playSuccessSound();

    const updates: Partial<TripRequest> = { status: newStatus };

    if (newStatus === 'llegado') {
      updates.status = 'llegado';
    } else if (newStatus === 'en_viaje') {
      updates.pickedUpAt = Date.now();
      // Restart simulation towards destination
      simulationStepRef.current = 0;
      setIsSimulatingDrive(true);
    } else if (newStatus === 'completado') {
      updates.completedAt = Date.now();
      // Free driver
      await realtimeDB.updateDriver(driver.id, {
        isBusy: false,
        currentTripId: null,
        totalTrips: (driver.totalTrips || 0) + 1,
      });
      setIsSimulatingDrive(false);
    }

    await realtimeDB.updateTrip(activeTrip.id, updates);
  };

  if (!driver) {
    return <div className="p-8 text-center text-white">Cargando perfil de conductor...</div>;
  }

  return (
    <div className="relative h-full w-full flex flex-col md:flex-row overflow-hidden bg-slate-950">
      {/* Map Area */}
      <div className="relative flex-1 h-[50vh] md:h-full">
        <MapLeaflet
          center={[driver.location.lat, driver.location.lng]}
          zoom={15}
          pickup={activeTrip ? activeTrip.origin : null}
          destination={null}
          routeCoordinates={navRoute}
          drivers={[driver]}
          activeDriverId={driver.id}
          className="h-full w-full"
        />

        {/* Top HUD: Driver Status Badge & Telemetry */}
        <div className="absolute top-4 left-4 right-4 md:right-auto md:w-96 z-10">
          <div className="rounded-2xl bg-slate-900/95 backdrop-blur-md p-3.5 text-white shadow-2xl border border-slate-700/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl font-black text-white ${
                  driver.isOnline ? 'bg-emerald-600 shadow-lg shadow-emerald-600/30' : 'bg-slate-700'
                }`}
              >
                <Car className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white">{driver.name}</h3>
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      driver.isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                    }`}
                  />
                </div>
                <div className="text-[11px] text-slate-400 font-mono">
                  {driver.vehicleModel} • <b className="text-amber-400">{driver.licensePlate}</b>
                </div>
              </div>
            </div>

            <button
              onClick={handleToggleOnline}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition shadow ${
                driver.isOnline
                  ? 'bg-rose-600/20 text-rose-300 border border-rose-500/40 hover:bg-rose-600 hover:text-white'
                  : 'bg-emerald-600 text-white hover:bg-emerald-500'
              }`}
            >
              <Power className="w-3.5 h-3.5" />
              {driver.isOnline ? 'Desconectar' : 'Conectarse'}
            </button>
          </div>
        </div>

        {/* Floating Simulation & GPS Floating Bar */}
        <div className="absolute bottom-4 left-4 right-4 md:left-6 md:right-auto z-10 flex gap-2">
          {/* Real GPS Button */}
          <button
            onClick={isGpsActive ? stopRealGpsWatch : startRealGpsWatch}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold backdrop-blur-md transition shadow-lg ${
              isGpsActive
                ? 'bg-blue-600 text-white ring-2 ring-blue-400 animate-pulse'
                : 'bg-slate-900/90 text-slate-300 hover:text-white border border-slate-700'
            }`}
          >
            <Compass className="w-4 h-4 text-blue-400" />
            {isGpsActive ? 'GPS Activo (watchPosition)' : 'Activar GPS Real'}
          </button>

          {/* Drive Simulation Button */}
          {activeTrip && (
            <button
              onClick={() => setIsSimulatingDrive(!isSimulatingDrive)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold backdrop-blur-md transition shadow-lg ${
                isSimulatingDrive
                  ? 'bg-purple-600 text-white ring-2 ring-purple-400'
                  : 'bg-slate-900/90 text-slate-300 hover:text-white border border-slate-700'
              }`}
            >
              {isSimulatingDrive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 text-purple-400" />}
              {isSimulatingDrive ? 'Pausar Simulación de Manejo' : 'Simular Avance por Calles'}
            </button>
          )}
        </div>
      </div>

      {/* Driver Controls & Trip Sheet */}
      <div className="w-full md:w-[420px] lg:w-[460px] bg-slate-900 border-t md:border-t-0 md:border-l border-slate-800 flex flex-col h-[50vh] md:h-full z-10 overflow-y-auto">
        <div className="p-4 flex flex-col gap-4">
          {/* Driver Profile Switcher (convenient for testing multi-cars) */}
          <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Cambiar de Chofer / Vehículo
              </span>
              <span className="text-xs text-amber-400 font-bold">★ {driver.rating.toFixed(2)}</span>
            </div>
            <select
              value={selectedDriverId}
              onChange={(e) => setSelectedDriverId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              {Object.values(drivers).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} — {d.vehicleModel} ({d.licensePlate}) [{d.category.toUpperCase()}]
                </option>
              ))}
            </select>
          </div>

          {gpsError && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-300 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{gpsError}</span>
            </div>
          )}

          {/* ACTIVE TRIP IN PROGRESS */}
          {activeTrip ? (
            <div className="flex flex-col gap-3">
              {/* Active Trip Header */}
              <div className="rounded-2xl bg-gradient-to-br from-purple-950/60 to-slate-950 p-4 border border-purple-500/40 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-purple-400 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-purple-400 animate-ping"></span>
                    Misión de Viaje #{activeTrip.id.slice(-6)}
                  </span>
                  <div className="text-right font-bold text-xs uppercase tracking-wider text-purple-300 bg-purple-900/40 px-2 py-0.5 rounded-full border border-purple-700/50">
                    {activeTrip.category}
                  </div>
                </div>

                {/* Turn-by-Turn Telemetry */}
                <div className="grid grid-cols-2 gap-2 bg-slate-900/90 p-3 rounded-xl border border-slate-800">
                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-400">
                      Ruta Hacia el Pasajero
                    </div>
                    <div className="text-lg font-black text-white">
                      {distToTargetMeters ? formatDistance(distToTargetMeters) : '--'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-400">ETA Estimado</div>
                    <div className="text-lg font-black text-purple-300">
                      {etaToTargetSeconds ? formatDuration(etaToTargetSeconds) : '--'}
                    </div>
                  </div>
                </div>

                {/* Passenger Info */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">
                      {activeTrip.passengerName.charAt(0)}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">{activeTrip.passengerName}</div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Phone className="w-3 h-3 text-emerald-400" />
                        {activeTrip.passengerPhone}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] bg-purple-900/50 border border-purple-700/50 text-purple-200 px-2 py-0.5 rounded-full font-bold uppercase">
                    {activeTrip.category}
                  </span>
                </div>
              </div>

              {/* Pickup Itinerary */}
              <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800 text-xs flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 mt-1 shrink-0"></div>
                  <div>
                    <span className="text-[10px] font-bold uppercase text-emerald-400">Punto de Recogida:</span>
                    <p className="text-white font-medium">{activeTrip.origin.address}</p>
                  </div>
                </div>
              </div>

              {/* Step Navigation Actions */}
              <div className="flex flex-col gap-2 mt-1">
                {activeTrip.status === 'aceptado' && (
                  <button
                    onClick={() => handleUpdateTripStatus('llegado')}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 px-4 rounded-xl text-sm transition shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Marcar Llegada al Punto de Recogida
                  </button>
                )}

                {(activeTrip.status === 'llegado' || activeTrip.status === 'en_viaje') && (
                  <button
                    onClick={() => handleUpdateTripStatus('completado')}
                    className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black py-4 px-4 rounded-xl text-sm transition shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="w-5 h-5" />
                    Pasajero a Bordo / Finalizar Servicio
                  </button>
                )}
              </div>
            </div>
          ) : !driver.isOnline ? (
            /* OFFLINE STATE */
            <div className="rounded-2xl bg-slate-950/60 p-8 border border-slate-800 text-center flex flex-col items-center">
              <div className="h-16 w-16 rounded-full bg-slate-800 flex items-center justify-center text-slate-500 mb-3">
                <Power className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-white mb-1">Estás en modo Desconectado</h3>
              <p className="text-xs text-slate-400 mb-4 max-w-xs">
                Conéctate para recibir solicitudes de pasajeros en tiempo real en tu zona.
              </p>
              <button
                onClick={handleToggleOnline}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-6 py-2.5 rounded-xl text-xs transition shadow-lg shadow-emerald-600/20"
              >
                Conectarme Ahora
              </button>
            </div>
          ) : (
            /* ONLINE & WAITING / PENDING REQUESTS RADAR */
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping"></span>
                  <span className="text-xs font-bold text-emerald-400">En línea buscando pasajeros</span>
                </div>
                <span className="text-[11px] text-slate-400">
                  {pendingRequests.length} solicitud{pendingRequests.length === 1 ? '' : 'es'} activa{pendingRequests.length === 1 ? '' : 's'}
                </span>
              </div>

              {pendingRequests.length === 0 ? (
                <div className="rounded-2xl bg-slate-950/60 p-6 border border-slate-800 text-center flex flex-col items-center">
                  <div className="h-12 w-12 rounded-full bg-purple-950/60 border border-purple-500/30 flex items-center justify-center text-purple-400 mb-2 animate-pulse">
                    <Navigation className="w-6 h-6" />
                  </div>
                  <h4 className="text-xs font-bold text-slate-200">Radar de Solicitudes Activo</h4>
                  <p className="text-[11px] text-slate-400 mt-1 max-w-xs">
                    Cuando un usuario solicite un viaje desde la app de pasajero, sonará una alerta y aparecerá aquí.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {pendingRequests.map((req) => {
                    const distToPickup = haversineDistanceMeters(
                      driver.location.lat,
                      driver.location.lng,
                      req.origin.lat,
                      req.origin.lng
                    );

                    return (
                      <div
                        key={req.id}
                        className="rounded-2xl bg-slate-950 p-4 border-2 border-purple-500/60 shadow-xl flex flex-col gap-3"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-purple-500/20 text-purple-300 border border-purple-500/40">
                              {req.category}
                            </span>
                            <span className="text-xs text-slate-400">hace {Math.round((Date.now() - req.createdAt) / 1000)}s</span>
                          </div>
                          <div className="text-xs font-semibold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60">
                            {req.estimatedDistanceKm} km de ruta
                          </div>
                        </div>

                        <div className="flex flex-col gap-1.5 text-xs">
                          <div className="flex items-start gap-2">
                            <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                            <div>
                              <strong className="text-slate-300">Punto de Recogida: </strong>
                              <span className="text-white font-medium">{req.origin.address}</span>
                              <span className="text-[10px] text-purple-400 block">
                                A {formatDistance(distToPickup)} de tu ubicación actual
                              </span>
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => handleAcceptTrip(req)}
                          className="w-full bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-black py-3 px-4 rounded-xl text-xs transition shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Aceptar y Atender Viaje
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
