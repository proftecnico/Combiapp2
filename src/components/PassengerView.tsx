import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Navigation,
  Car,
  ShieldCheck,
  Phone,
  Clock,
  CheckCircle2,
  XCircle,
  Sparkles,
  LogOut,
  Mail,
  UserCheck,
  Check
} from 'lucide-react';
import { MapLeaflet } from './MapLeaflet';
import { Driver, GeoLocation, TripRequest, VehicleCategory, VehicleOption, UserProfile } from '../types';
import { getOSRMRoute, formatDistance, formatDuration, haversineDistanceMeters } from '../services/osrm';
import { realtimeDB } from '../services/firebaseRealtime';
import { soundService } from '../services/audio';
import { authService } from '../services/auth';

const VEHICLE_OPTIONS: VehicleOption[] = [
  {
    id: 'lite',
    name: 'Urban Lite',
    description: 'Viajes rápidos y cómodos para el día a día',
    capacity: 4,
    icon: '🚗',
  },
  {
    id: 'black',
    name: 'Executive Black',
    description: 'Sedanes ejecutivos de alta gama con chofer VIP',
    capacity: 4,
    icon: '✨',
  },
  {
    id: 'van',
    name: 'Group Van XL',
    description: 'Espacio amplio para grupos grandes y equipaje',
    capacity: 6,
    icon: '🚐',
  },
];

interface PassengerViewProps {
  drivers: Record<string, Driver>;
  trips: Record<string, TripRequest>;
}

export const PassengerView: React.FC<PassengerViewProps> = ({ drivers, trips }) => {
  // Real Google User Session
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => authService.getCurrentUser());
  const [contactPhone, setContactPhone] = useState<string>('+54 9 11 8844-3321');
  const [isCustomEmailModalOpen, setIsCustomEmailModalOpen] = useState(false);
  const [customEmailInput, setCustomEmailInput] = useState('');
  const [customNameInput, setCustomNameInput] = useState('');

  // Active Trip ID for passenger
  const [currentTripId, setCurrentTripId] = useState<string | null>(() => {
    return localStorage.getItem('urbanride_active_passenger_trip') || null;
  });

  // Pickup location
  const [pickup, setPickup] = useState<GeoLocation>({
    lat: -34.5985,
    lng: -58.3982,
    address: 'Av. Santa Fe 2100, Recoleta',
  });

  const [selectedCategory, setSelectedCategory] = useState<VehicleCategory>('lite');
  const [mapSelectionMode, setMapSelectionMode] = useState<'pickup' | null>(null);
  const [userGpsLocation, setUserGpsLocation] = useState<GeoLocation | null>(null);

  // Dynamic driver tracking for active trip
  const [driverEtaSeconds, setDriverEtaSeconds] = useState<number | null>(null);
  const [driverDistanceMeters, setDriverDistanceMeters] = useState<number | null>(null);
  const [driverRouteCoordinates, setDriverRouteCoordinates] = useState<[number, number][]>([]);

  // Pre-booking estimate: nearest driver to pickup
  const [nearestDriverEstimate, setNearestDriverEstimate] = useState<{
    driver: Driver;
    distanceMeters: number;
    durationSeconds: number;
  } | null>(null);

  // Listen to Google Auth state
  useEffect(() => {
    const unsub = authService.onAuthStateChange((user) => {
      setCurrentUser(user);
      if (user?.phone) {
        setContactPhone(user.phone);
      }
    });
    return () => unsub();
  }, []);

  // Find active trip from realtime trips
  const activeTrip: TripRequest | null = currentTripId && trips[currentTripId] ? trips[currentTripId] : null;

  // Persist trip ID
  useEffect(() => {
    if (currentTripId) {
      localStorage.setItem('urbanride_active_passenger_trip', currentTripId);
    } else {
      localStorage.removeItem('urbanride_active_passenger_trip');
    }
  }, [currentTripId]);

  // Try fetching user's real GPS on mount
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            address: 'Mi Ubicación GPS Actual',
          };
          setUserGpsLocation(loc);
        },
        (err) => {
          console.log('GPS info:', err.message);
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }
  }, []);

  // Calculate nearest driver to pickup before booking
  useEffect(() => {
    if (activeTrip) return;

    const available = Object.values(drivers).filter((d) => d.isOnline && !d.isBusy && d.location);
    if (available.length === 0) {
      setNearestDriverEstimate(null);
      return;
    }

    let closest: Driver = available[0];
    let minDistance = haversineDistanceMeters(
      available[0].location.lat,
      available[0].location.lng,
      pickup.lat,
      pickup.lng
    );

    for (let i = 1; i < available.length; i++) {
      const d = available[i];
      const dist = haversineDistanceMeters(d.location.lat, d.location.lng, pickup.lat, pickup.lng);
      if (dist < minDistance) {
        minDistance = dist;
        closest = d;
      }
    }

    const urbanMeters = minDistance * 1.35;
    const estSeconds = Math.max(30, Math.round(urbanMeters / 8.33));

    setNearestDriverEstimate({
      driver: closest,
      distanceMeters: urbanMeters,
      durationSeconds: estSeconds,
    });
  }, [pickup.lat, pickup.lng, drivers, activeTrip]);

  // Real-time tracking of assigned driver towards the passenger's pickup location
  useEffect(() => {
    if (!activeTrip || !activeTrip.driverId) {
      setDriverEtaSeconds(null);
      setDriverDistanceMeters(null);
      setDriverRouteCoordinates([]);
      return;
    }

    const assignedDriver = drivers[activeTrip.driverId];
    if (!assignedDriver || !assignedDriver.location) return;

    const targetLocation: GeoLocation = activeTrip.origin;

    const directDist = haversineDistanceMeters(
      assignedDriver.location.lat,
      assignedDriver.location.lng,
      targetLocation.lat,
      targetLocation.lng
    );

    const urbanMeters = directDist * 1.35;
    const etaSec = Math.max(20, Math.round(urbanMeters / 8.33));

    setDriverDistanceMeters(urbanMeters);
    setDriverEtaSeconds(etaSec);

    let isMounted = true;
    getOSRMRoute(assignedDriver.location, targetLocation).then((res) => {
      if (isMounted) {
        setDriverRouteCoordinates(res.coordinates);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [activeTrip?.status, activeTrip?.driverId, drivers]);

  // Map click handler for setting pickup point
  const handleMapClick = (lat: number, lng: number) => {
    if (mapSelectionMode === 'pickup') {
      setPickup({
        lat,
        lng,
        address: `Punto de recogida (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
      });
      setMapSelectionMode(null);
    }
  };

  // Google Sign-In handlers
  const handleGoogleSignIn = async () => {
    await authService.signInWithGoogle('jorgeGaravagno@gmail.com', 'Jorge Garavagno');
  };

  const handleCustomGoogleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customEmailInput.trim()) return;
    await authService.signInWithGoogle(customEmailInput.trim(), customNameInput.trim() || undefined);
    setIsCustomEmailModalOpen(false);
  };

  const handleGoogleSignOut = () => {
    authService.signOut();
  };

  // Request Trip Action with Real Authenticated Google User
  const handleRequestTrip = async () => {
    if (!currentUser) {
      alert('Debes iniciar sesión con Google para solicitar un viaje.');
      return;
    }
    if (!pickup) return;

    const newTripId = `trip-${Date.now()}`;
    const newTrip: TripRequest = {
      id: newTripId,
      passengerId: currentUser.uid,
      passengerName: currentUser.name,
      passengerEmail: currentUser.email,
      passengerPhoto: currentUser.photoURL,
      passengerPhone: contactPhone || '+54 9 11 8844-3321',
      origin: pickup,
      category: selectedCategory,
      status: 'solicitado',
      createdAt: Date.now(),
    };

    soundService.playRequestSound();
    await realtimeDB.createTrip(newTrip);
    setCurrentTripId(newTripId);
  };

  // Cancel Trip Action
  const handleCancelTrip = async () => {
    if (!currentTripId) return;

    if (activeTrip?.driverId) {
      await realtimeDB.updateDriver(activeTrip.driverId, {
        isBusy: false,
        currentTripId: null,
      });
    }

    await realtimeDB.updateTrip(currentTripId, {
      status: 'cancelado',
    });

    setCurrentTripId(null);
  };

  const handleNewRide = () => {
    setCurrentTripId(null);
  };

  // Use live GPS location
  const handleUseCurrentGPS = () => {
    if (userGpsLocation) {
      setPickup(userGpsLocation);
    } else if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            address: 'Mi Ubicación GPS Actual',
          };
          setUserGpsLocation(loc);
          setPickup(loc);
        },
        () => {
          alert('No se pudo acceder al GPS del dispositivo. Toca el mapa para fijar tu punto de recogida.');
        },
        { enableHighAccuracy: true }
      );
    }
  };

  const activeDriver = activeTrip?.driverId ? drivers[activeTrip.driverId] : null;

  return (
    <div className="relative h-full w-full flex flex-col md:flex-row overflow-hidden bg-slate-950">
      {/* Map Area */}
      <div className="relative flex-1 h-[50vh] md:h-full">
        <MapLeaflet
          center={[pickup.lat, pickup.lng]}
          pickup={pickup}
          destination={null}
          routeCoordinates={driverRouteCoordinates}
          drivers={Object.values(drivers)}
          activeDriverId={activeTrip?.driverId}
          userLiveLocation={userGpsLocation}
          onMapClick={handleMapClick}
          selectionMode={mapSelectionMode}
          className="h-full w-full"
        />

        {/* Live floating quick status when driver is coming */}
        {activeTrip && activeTrip.status !== 'completado' && activeTrip.status !== 'cancelado' && (
          <div className="absolute top-4 left-4 right-4 md:left-6 md:right-auto md:w-96 z-10">
            <div className="rounded-2xl bg-slate-900/95 backdrop-blur-md p-4 text-white shadow-2xl border border-slate-700/80">
              <div className="flex items-center justify-between mb-2">
                <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-purple-400">
                  <span className="h-2 w-2 rounded-full bg-purple-400 animate-ping"></span>
                  {activeTrip.status === 'solicitado' && 'Buscando chofer...'}
                  {activeTrip.status === 'aceptado' && 'Chofer en camino a tu recogida'}
                  {activeTrip.status === 'en_camino' && 'Llegando a recogida'}
                  {activeTrip.status === 'llegado' && '¡Chofer en tu punto de recogida!'}
                  {activeTrip.status === 'en_viaje' && 'Pasajero a bordo'}
                </span>
                <span className="text-xs font-mono text-slate-400">#{activeTrip.id.slice(-6)}</span>
              </div>

              {/* Countdown / Distance Metric Badge directly to pickup */}
              {activeTrip.status !== 'solicitado' && driverDistanceMeters !== null && (
                <div className="grid grid-cols-2 gap-2 my-2 bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-400">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-[10px] uppercase font-bold text-slate-400">Tiempo de llegada</div>
                      <div className="text-base font-extrabold text-white">
                        {driverEtaSeconds ? formatDuration(driverEtaSeconds) : '--'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
                      <Navigation className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-[10px] uppercase font-bold text-slate-400">Distancia hasta ti</div>
                      <div className="text-base font-extrabold text-white">
                        {driverDistanceMeters ? formatDistance(driverDistanceMeters) : '--'}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Progress Bar */}
              <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-purple-500 to-indigo-500 h-1.5 rounded-full transition-all duration-500"
                  style={{
                    width:
                      activeTrip.status === 'solicitado'
                        ? '25%'
                        : activeTrip.status === 'aceptado'
                        ? '60%'
                        : activeTrip.status === 'en_camino'
                        ? '80%'
                        : activeTrip.status === 'llegado'
                        ? '95%'
                        : '100%',
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Control Panel / Passenger Booking Sheet */}
      <div className="w-full md:w-[420px] lg:w-[460px] bg-slate-900 border-t md:border-t-0 md:border-l border-slate-800 flex flex-col h-[50vh] md:h-full z-10 overflow-y-auto">
        {!activeTrip ? (
          /* TRIP BOOKING FORM (PICKUP ONLY & GOOGLE AUTH REQUIRED) */
          <div className="p-5 flex flex-col gap-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Car className="w-5 h-5 text-purple-400" />
                  Solicitar Vehículo a tu Ubicación
                </h2>
                <p className="text-xs text-slate-400">Seguimiento en vivo en mapa Esri Urbano</p>
              </div>
              <div className="text-right">
                <span className="text-[11px] font-medium text-emerald-400 bg-emerald-950/60 border border-emerald-800/50 px-2 py-0.5 rounded-full">
                  {Object.values(drivers).filter((d) => d.isOnline).length} choferes activos
                </span>
              </div>
            </div>

            {/* GOOGLE AUTHENTICATION SECTION (MANDATORY FOR REAL PASSENGERS) */}
            {!currentUser ? (
              <div className="bg-slate-950/90 p-5 rounded-2xl border-2 border-purple-500/50 shadow-xl flex flex-col items-center text-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-md">
                  {/* Google SVG Icon */}
                  <svg className="w-7 h-7" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                    />
                  </svg>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-white">Identificación Oficial con Google</h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs">
                    Para solicitar un vehículo con datos reales y seguridad en la recogida, inicia sesión con tu cuenta de Google.
                  </p>
                </div>

                {/* Primary Google Login Button */}
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-100 text-slate-900 font-bold py-3 px-4 rounded-xl text-xs transition shadow-lg"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                    />
                  </svg>
                  <span>Continuar como Jorge Garavagno (Google)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsCustomEmailModalOpen(true)}
                  className="text-[11px] text-purple-400 hover:text-purple-300 underline transition"
                >
                  O ingresar con otro correo de Google
                </button>
              </div>
            ) : (
              /* LOGGED IN GOOGLE USER PROFILE CARD */
              <div className="bg-slate-950/80 p-3.5 rounded-2xl border border-purple-500/40 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img
                      src={currentUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.name)}&background=4f46e5&color=fff`}
                      alt={currentUser.name}
                      className="h-10 w-10 rounded-full border-2 border-purple-400 shadow"
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-white">{currentUser.name}</span>
                        <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
                        <Mail className="w-3 h-3 text-slate-500" />
                        {currentUser.email}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleGoogleSignOut}
                    title="Cerrar sesión de Google"
                    className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-rose-400 border border-slate-800 transition"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="pt-2 border-t border-slate-800 flex items-center gap-2">
                  <label className="text-[10px] uppercase font-bold text-slate-400 shrink-0">
                    Teléfono de Contacto:
                  </label>
                  <input
                    type="text"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="+54 9 11 ..."
                    className="flex-1 bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
              </div>
            )}

            {/* Pickup Point Input */}
            <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800 flex flex-col gap-2">
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center mt-1">
                  <div className="h-3 w-3 rounded-full bg-emerald-500 ring-4 ring-emerald-950 animate-pulse"></div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                      Punto de Recogida
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleUseCurrentGPS}
                        className="flex items-center gap-1 text-[11px] font-medium text-purple-300 hover:text-white px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 transition"
                      >
                        <Navigation className="w-3 h-3 text-purple-400" />
                        Mi GPS
                      </button>
                      <button
                        onClick={() => setMapSelectionMode('pickup')}
                        className={`text-[11px] font-medium px-2 py-0.5 rounded transition ${
                          mapSelectionMode === 'pickup'
                            ? 'bg-emerald-600 text-white'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800'
                        }`}
                      >
                        {mapSelectionMode === 'pickup' ? 'Toca el mapa...' : 'Fijar en mapa'}
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={pickup.address || ''}
                    onChange={(e) => setPickup({ ...pickup, address: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-medium focus:outline-none focus:ring-1 focus:ring-purple-500"
                    placeholder="Escribe la dirección donde te encuentras"
                  />
                </div>
              </div>
            </div>

            {/* Nearest Driver Radar Info */}
            {nearestDriverEstimate ? (
              <div className="flex items-center justify-between bg-slate-950/60 p-3 rounded-2xl border border-slate-800 text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                    <Car className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      Vehículo más cercano
                    </span>
                    <strong className="text-white">
                      {nearestDriverEstimate.driver.name} ({nearestDriverEstimate.driver.vehicleModel})
                    </strong>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-black text-emerald-400">
                    {formatDuration(nearestDriverEstimate.durationSeconds)}
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {formatDistance(nearestDriverEstimate.distanceMeters)} de ti
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-2.5 rounded-xl bg-slate-950/40 border border-slate-800 text-xs text-slate-400 text-center">
                Buscando vehículos disponibles en el mapa...
              </div>
            )}

            {/* Vehicle Category Selector */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold text-slate-300">Tipo de vehículo que necesitas</span>
              <div className="grid grid-cols-1 gap-2">
                {VEHICLE_OPTIONS.map((cat) => {
                  const isSelected = selectedCategory === cat.id;

                  return (
                    <div
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`flex items-center justify-between p-3 rounded-2xl cursor-pointer transition border ${
                        isSelected
                          ? 'bg-purple-950/40 border-purple-500 ring-2 ring-purple-500/20'
                          : 'bg-slate-950/40 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{cat.icon}</span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-white">{cat.name}</span>
                            <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400 font-medium">
                              {cat.capacity} pas.
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400">{cat.description}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded-full">
                          Disponible
                        </span>
                        <div className="text-[10px] text-slate-400 mt-1">{cat.capacity} plazas</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Request Button */}
            <button
              onClick={handleRequestTrip}
              disabled={!currentUser}
              className={`mt-2 w-full font-bold py-3.5 px-4 rounded-2xl shadow-xl transition flex items-center justify-center gap-2 text-sm ${
                currentUser
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-purple-600/20'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              {currentUser
                ? `Solicitar ${VEHICLE_OPTIONS.find((v) => v.id === selectedCategory)?.name} a mi Ubicación`
                : 'Inicia sesión con Google para solicitar'}
            </button>
          </div>
        ) : (
          /* ACTIVE TRIP STATUS & TRACKING SHEET (VEHICLE EN ROUTE TO REAL PASSENGER) */
          <div className="p-5 flex flex-col gap-4">
            {/* Status Header */}
            <div className="rounded-2xl bg-slate-950/80 p-4 border border-slate-800 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400">
                    Seguimiento en Vivo
                  </span>
                  <h3 className="text-lg font-extrabold text-white">
                    {activeTrip.status === 'solicitado' && 'Buscando chofer cercano...'}
                    {activeTrip.status === 'aceptado' && '¡Chofer en camino a recogerte!'}
                    {activeTrip.status === 'en_camino' && 'Chofer muy cerca de tu ubicación'}
                    {activeTrip.status === 'llegado' && '¡Tu chofer ha llegado al punto de recogida!'}
                    {activeTrip.status === 'en_viaje' && 'Pasajero a bordo'}
                    {activeTrip.status === 'completado' && '¡Servicio de Recogida Concluido!'}
                    {activeTrip.status === 'cancelado' && 'Solicitud Cancelada'}
                  </h3>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold uppercase tracking-wider text-purple-400 bg-purple-950/60 border border-purple-800/60 px-2.5 py-1 rounded-full">
                    {activeTrip.category.toUpperCase()}
                  </div>
                </div>
              </div>

              {/* Dynamic ETA & Distance Display directly to passenger */}
              {activeTrip.status !== 'solicitado' && activeTrip.status !== 'completado' && activeTrip.status !== 'cancelado' && (
                <div className="bg-gradient-to-r from-purple-900/40 to-indigo-900/40 p-3 rounded-xl border border-purple-500/30 flex items-center justify-around">
                  <div className="text-center">
                    <span className="text-[10px] uppercase font-bold text-purple-300">Tiempo para llegada</span>
                    <div className="text-xl font-black text-white">
                      {driverEtaSeconds ? formatDuration(driverEtaSeconds) : '2 min'}
                    </div>
                  </div>
                  <div className="h-8 w-px bg-purple-500/30"></div>
                  <div className="text-center">
                    <span className="text-[10px] uppercase font-bold text-indigo-300">Distancia hasta ti</span>
                    <div className="text-xl font-black text-white">
                      {driverDistanceMeters ? formatDistance(driverDistanceMeters) : '450 m'}
                    </div>
                  </div>
                </div>
              )}

              {/* Radar pulse while searching */}
              {activeTrip.status === 'solicitado' && (
                <div className="py-6 flex flex-col items-center justify-center text-center">
                  <div className="relative flex items-center justify-center">
                    <span className="absolute inline-flex h-20 w-20 animate-ping rounded-full bg-purple-500 opacity-30"></span>
                    <span className="absolute inline-flex h-12 w-12 animate-ping rounded-full bg-indigo-500 opacity-40"></span>
                    <div className="h-14 w-14 rounded-full bg-purple-600 flex items-center justify-center text-white shadow-xl">
                      <Car className="w-7 h-7 animate-pulse" />
                    </div>
                  </div>
                  <p className="mt-4 text-xs text-slate-300 font-medium">
                    Notificando a los vehículos disponibles en tu zona...
                  </p>
                  <span className="text-[11px] text-slate-500 mt-1">
                    Puedes aceptar esta solicitud desde la pestaña <b>"Chofer"</b> o desde el Centro de Control.
                  </span>
                </div>
              )}
            </div>

            {/* Real Passenger Google Profile Badge on active trip */}
            <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <img
                  src={activeTrip.passengerPhoto || `https://ui-avatars.com/api/?name=${encodeURIComponent(activeTrip.passengerName)}&background=4f46e5&color=fff`}
                  alt={activeTrip.passengerName}
                  className="h-9 w-9 rounded-full border border-purple-400"
                />
                <div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-bold text-white">{activeTrip.passengerName}</span>
                    <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">{activeTrip.passengerEmail}</span>
                </div>
              </div>
              <span className="text-[10px] bg-emerald-950/60 border border-emerald-800 text-emerald-400 px-2 py-0.5 rounded-full font-bold">
                Google Verificado
              </span>
            </div>

            {/* Assigned Driver Card */}
            {activeDriver && (
              <div className="rounded-2xl bg-slate-950/80 p-4 border border-slate-800 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-500 flex items-center justify-center text-white font-bold text-lg shadow-md ring-2 ring-purple-400">
                      {activeDriver.name.charAt(0)}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                        {activeDriver.name}
                        <ShieldCheck className="w-4 h-4 text-blue-400" />
                      </h4>
                      <p className="text-xs text-slate-400">{activeDriver.vehicleModel}</p>
                      <div className="flex items-center gap-1.5 text-xs text-amber-400 mt-0.5">
                        <span>★ {activeDriver.rating.toFixed(2)}</span>
                        <span className="text-slate-500">•</span>
                        <span className="text-slate-400">{activeDriver.totalTrips} viajes</span>
                      </div>
                    </div>
                  </div>

                  {/* Plate Badge */}
                  <div className="text-right">
                    <div className="bg-slate-800 border-2 border-slate-700 px-2.5 py-1 rounded-lg text-xs font-mono font-black text-amber-300 tracking-wider shadow">
                      {activeDriver.licensePlate}
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1 block">Patente</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <Phone className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{activeDriver.phone}</span>
                  </div>
                  <span className="text-[10px] bg-emerald-950/80 border border-emerald-800/80 text-emerald-400 px-2 py-0.5 rounded-full font-medium">
                    Enlace de vehículo activo
                  </span>
                </div>
              </div>
            )}

            {/* Pickup Location details */}
            <div className="rounded-2xl bg-slate-950/60 p-3.5 border border-slate-800 text-xs flex flex-col gap-2">
              <div className="flex items-start gap-2.5">
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 mt-1 shrink-0"></div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    Punto de Recogida Acordado
                  </span>
                  <span className="text-white font-medium">{activeTrip.origin.address}</span>
                </div>
              </div>
            </div>

            {/* Actions: Cancel or New Trip */}
            {activeTrip.status === 'completado' ? (
              <div className="flex flex-col gap-2">
                <div className="bg-emerald-950/40 border border-emerald-800/60 p-4 rounded-2xl text-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                  <h4 className="text-sm font-bold text-emerald-200">¡Servicio Concluido con Éxito!</h4>
                  <p className="text-xs text-emerald-400/80 mt-1">El vehículo ha llegado y completado la recogida</p>
                </div>
                <button
                  onClick={handleNewRide}
                  className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 px-4 rounded-xl text-sm transition"
                >
                  Solicitar otro vehículo
                </button>
              </div>
            ) : activeTrip.status === 'cancelado' ? (
              <div className="flex flex-col gap-2">
                <div className="bg-rose-950/40 border border-rose-800/60 p-4 rounded-2xl text-center">
                  <XCircle className="w-8 h-8 text-rose-400 mx-auto mb-2" />
                  <h4 className="text-sm font-bold text-rose-200">La solicitud ha sido cancelada</h4>
                </div>
                <button
                  onClick={handleNewRide}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 px-4 rounded-xl text-sm transition"
                >
                  Intentar nuevamente
                </button>
              </div>
            ) : (
              <button
                onClick={handleCancelTrip}
                className="w-full bg-slate-800 hover:bg-rose-950/60 hover:text-rose-300 hover:border-rose-800 border border-slate-700 text-slate-400 font-semibold py-2.5 px-4 rounded-xl text-xs transition"
              >
                Cancelar solicitud de vehículo
              </button>
            )}
          </div>
        )}
      </div>

      {/* Modal: Custom Google Email Login */}
      {isCustomEmailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-6 text-white">
            <h3 className="text-base font-bold mb-1">Ingresar con Google</h3>
            <p className="text-xs text-slate-400 mb-4">
              Ingresa el correo de tu cuenta de Google para cargar tus datos reales.
            </p>

            <form onSubmit={handleCustomGoogleSignIn} className="flex flex-col gap-3 text-xs">
              <div>
                <label className="text-slate-300 font-medium block mb-1">Correo de Google:</label>
                <input
                  type="email"
                  value={customEmailInput}
                  onChange={(e) => setCustomEmailInput(e.target.value)}
                  placeholder="tu.nombre@gmail.com"
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">Nombre Completo:</label>
                <input
                  type="text"
                  value={customNameInput}
                  onChange={(e) => setCustomNameInput(e.target.value)}
                  placeholder="Tu Nombre y Apellido"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800 mt-1">
                <button
                  type="button"
                  onClick={() => setIsCustomEmailModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-4 py-2 rounded-xl transition"
                >
                  Iniciar Sesión
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
