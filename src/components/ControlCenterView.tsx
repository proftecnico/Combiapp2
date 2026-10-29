import React, { useState, useEffect } from 'react';
import {
  Activity,
  Car,
  Users,
  Clock,
  TrendingUp,
  MapPin,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Radio,
  RotateCcw,
  Search,
  Plus,
  Edit2,
  Trash2,
  Check,
  X,
  Compass,
  Sliders,
  Shuffle,
  Shield,
  Crown,
  UserPlus,
  UserCheck,
  CheckCheck
} from 'lucide-react';
import { MapLeaflet } from './MapLeaflet';
import { Driver, TripRequest, TripStatus, VehicleCategory, RegisteredUser, UserRole, UserProfile, SUPER_ADMIN_EMAIL } from '../types';
import { realtimeDB, DEFAULT_CITY_CENTER } from '../services/firebaseRealtime';
import { authService } from '../services/auth';

interface ControlCenterViewProps {
  drivers: Record<string, Driver>;
  trips: Record<string, TripRequest>;
  users?: Record<string, RegisteredUser>;
}

// Sample pool for generating dynamic fleets
const SAMPLE_NAMES = [
  'Carlos Mendoza', 'Valentina Ramos', 'Martín Silva', 'Lucía Ferreyra',
  'Esteban Morales', 'Sofía Castillo', 'Diego Romero', 'Camila Benítez',
  'Joaquín Torres', 'Florencia Herrera', 'Mateo Gómez', 'Agustina Vidal'
];

const SAMPLE_CARS = [
  { model: 'Toyota Corolla 2024 (Blanco)', cat: 'lite' as VehicleCategory },
  { model: 'Chevrolet Onix Plus (Plata)', cat: 'lite' as VehicleCategory },
  { model: 'Ford Mondeo Titanium (Negro)', cat: 'black' as VehicleCategory },
  { model: 'Volkswagen Vento Highline (Gris)', cat: 'black' as VehicleCategory },
  { model: 'Renault Kangoo Stepway (Azul)', cat: 'van' as VehicleCategory },
  { model: 'Peugeot Partner Tepee (Blanco)', cat: 'van' as VehicleCategory },
  { model: 'Nissan Sentra Exclusive (Negro)', cat: 'black' as VehicleCategory },
  { model: 'Toyota Yaris Sedan (Gris Grafito)', cat: 'lite' as VehicleCategory },
];

export const ControlCenterView: React.FC<ControlCenterViewProps> = ({ drivers, trips, users: propUsers }) => {
  const [users, setUsers] = useState<Record<string, RegisteredUser>>(propUsers || {});
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => authService.getCurrentUser());
  const [activeTab, setActiveTab] = useState<'requests' | 'fleet' | 'users'>('requests');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [userSearchTerm, setUserSearchTerm] = useState<string>('');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('all');
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [roleToast, setRoleToast] = useState<string | null>(null);

  // Modal to simulate incoming Google users (for instant testing by Jorge)
  const [isSimulateUserModalOpen, setIsSimulateUserModalOpen] = useState<boolean>(false);
  const [simName, setSimName] = useState('');
  const [simEmail, setSimEmail] = useState('');
  const [simRole, setSimRole] = useState<UserRole>('pasajero');

  // Fleet management states
  const [desiredFleetCount, setDesiredFleetCount] = useState<number>(Object.keys(drivers).length || 4);
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState<boolean>(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);

  // Form fields for Add/Edit
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formVehicle, setFormVehicle] = useState('');
  const [formPlate, setFormPlate] = useState('');
  const [formCategory, setFormCategory] = useState<VehicleCategory>('lite');
  const [formIsOnline, setFormIsOnline] = useState<boolean>(true);

  // Clock 24/7
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('es-ES', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Sync users & auth
  useEffect(() => {
    if (propUsers && Object.keys(propUsers).length > 0) {
      setUsers(propUsers);
    }
  }, [propUsers]);

  useEffect(() => {
    const unsubUsers = realtimeDB.subscribeToUsers((latestUsers) => {
      setUsers({ ...latestUsers });
    });
    const unsubAuth = authService.onAuthStateChange((user) => {
      setCurrentUser(user);
    });
    return () => {
      unsubUsers();
      unsubAuth();
    };
  }, []);

  const isSuperAdmin = currentUser?.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();

  const driversList = Object.values(drivers);
  const tripsList = Object.values(trips).sort((a, b) => b.createdAt - a.createdAt);

  // Users metrics
  const usersList = Object.values(users).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const passengerUsersCount = usersList.filter((u) => u.role === 'pasajero').length;
  const driverUsersCount = usersList.filter((u) => u.role === 'chofer').length;
  const controlUsersCount = usersList.filter((u) => u.role === 'control').length;
  const adminUsersCount = usersList.filter((u) => u.role === 'admin').length;

  const filteredUsers = usersList.filter((user) => {
    const matchesRole = userRoleFilter === 'all' || user.role === userRoleFilter;
    const matchesSearch =
      userSearchTerm === '' ||
      user.name.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(userSearchTerm.toLowerCase());
    return matchesRole && matchesSearch;
  });

  const handleUpdateRole = async (uid: string, newRole: UserRole, assignedDriverId?: string) => {
    const targetUser = users[uid];
    if (!targetUser) return;
    if (targetUser.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
      alert('La cuenta del Administrador Principal Jorge Garavagno no puede modificarse.');
      return;
    }

    await realtimeDB.updateUserRole(uid, newRole, assignedDriverId);
    setRoleToast(`Rol de ${targetUser.name} actualizado a "${newRole.toUpperCase()}".`);
    setTimeout(() => setRoleToast(null), 3500);
  };

  const handleDeleteUser = async (uid: string) => {
    const targetUser = users[uid];
    if (!targetUser) return;
    if (targetUser.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
      alert('No se puede eliminar al Administrador Principal.');
      return;
    }

    if (confirm(`¿Eliminar al usuario ${targetUser.name} (${targetUser.email})?`)) {
      await realtimeDB.deleteUser(uid);
      setRoleToast(`Usuario ${targetUser.name} eliminado del sistema.`);
      setTimeout(() => setRoleToast(null), 3000);
    }
  };

  const handleSimulateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!simEmail.trim() || !simName.trim()) return;

    const email = simEmail.trim();
    const name = simName.trim();
    const uid = `google-${email.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_')}`;
    const photo = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=10b981&color=fff&size=128&bold=true`;

    const newUser = await realtimeDB.registerOrUpdateUser({
      uid,
      name,
      email,
      photoURL: photo,
      phone: `+54 9 11 ${Math.floor(2000 + Math.random() * 7000)}-${Math.floor(1000 + Math.random() * 8999)}`,
    });

    if (simRole !== 'pasajero') {
      await realtimeDB.updateUserRole(newUser.uid, simRole);
    }

    setRoleToast(`Usuario ${name} registrado correctamente con rol "${simRole.toUpperCase()}".`);
    setTimeout(() => setRoleToast(null), 3000);
    setIsSimulateUserModalOpen(false);
    setSimName('');
    setSimEmail('');
    setSimRole('pasajero');
  };

  // Metric stats
  const onlineDrivers = driversList.filter((d) => d.isOnline);
  const availableDrivers = onlineDrivers.filter((d) => !d.isBusy);
  const busyDrivers = onlineDrivers.filter((d) => d.isBusy);
  const activeTrips = tripsList.filter(
    (t) => t.status !== 'completado' && t.status !== 'cancelado'
  );
  const pendingRequests = tripsList.filter((t) => t.status === 'solicitado');
  const completedTrips = tripsList.filter((t) => t.status === 'completado');

  const totalKmCompleted = tripsList
    .filter((t) => t.status === 'completado')
    .reduce((sum, t) => sum + (t.estimatedDistanceKm || 0), 0);

  // Filtered trips
  const filteredTrips = tripsList.filter((trip) => {
    const matchesStatus = statusFilter === 'all' || trip.status === statusFilter;
    const matchesSearch =
      searchTerm === '' ||
      trip.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      trip.passengerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      trip.origin.address?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      trip.driverName?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  // Selected trip for map focus
  const focusedTrip = selectedTripId ? trips[selectedTripId] : null;

  // Manual Dispatch Action
  const handleManualDispatch = async (tripId: string, driverId: string) => {
    const trip = trips[tripId];
    const targetDriver = drivers[driverId];
    if (!trip || !targetDriver) return;

    await realtimeDB.updateTrip(tripId, {
      status: 'aceptado',
      driverId: targetDriver.id,
      driverName: targetDriver.name,
      driverPhone: targetDriver.phone,
      driverVehicle: targetDriver.vehicleModel,
      driverPlate: targetDriver.licensePlate,
      driverRating: targetDriver.rating,
      driverLocation: targetDriver.location,
      acceptedAt: Date.now(),
    });

    await realtimeDB.updateDriver(targetDriver.id, {
      isBusy: true,
      currentTripId: tripId,
    });
  };

  // Cancel trip from admin
  const handleAdminCancelTrip = async (tripId: string) => {
    const trip = trips[tripId];
    if (trip?.driverId) {
      await realtimeDB.updateDriver(trip.driverId, {
        isBusy: false,
        currentTripId: null,
      });
    }
    await realtimeDB.updateTrip(tripId, { status: 'cancelado' });
  };

  // Open modal to Add Driver
  const handleOpenAddModal = () => {
    setEditingDriver(null);
    const randomName = SAMPLE_NAMES[Math.floor(Math.random() * SAMPLE_NAMES.length)];
    const randomCar = SAMPLE_CARS[Math.floor(Math.random() * SAMPLE_CARS.length)];
    const randomPlate = `AF-${Math.floor(100 + Math.random() * 899)}-${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}`;

    setFormName(randomName);
    setFormPhone(`+54 9 11 ${Math.floor(3000 + Math.random() * 6999)}-${Math.floor(1000 + Math.random() * 8999)}`);
    setFormVehicle(randomCar.model);
    setFormPlate(randomPlate);
    setFormCategory(randomCar.cat);
    setFormIsOnline(true);
    setIsAddEditModalOpen(true);
  };

  // Open modal to Edit Driver
  const handleOpenEditModal = (d: Driver) => {
    setEditingDriver(d);
    setFormName(d.name);
    setFormPhone(d.phone);
    setFormVehicle(d.vehicleModel);
    setFormPlate(d.licensePlate);
    setFormCategory(d.category);
    setFormIsOnline(d.isOnline);
    setIsAddEditModalOpen(true);
  };

  // Save Add/Edit Driver
  const handleSaveDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formVehicle.trim()) return;

    if (editingDriver) {
      // Update existing
      await realtimeDB.updateDriver(editingDriver.id, {
        name: formName.trim(),
        phone: formPhone.trim(),
        vehicleModel: formVehicle.trim(),
        licensePlate: formPlate.trim(),
        category: formCategory,
        isOnline: formIsOnline,
      });
    } else {
      // Create new driver with random offset from city center
      const offsetLat = (Math.random() - 0.5) * 0.04;
      const offsetLng = (Math.random() - 0.5) * 0.04;
      const newId = `driver-${Date.now()}`;

      const newDriver: Driver = {
        id: newId,
        name: formName.trim(),
        phone: formPhone.trim(),
        vehicleModel: formVehicle.trim(),
        licensePlate: formPlate.trim(),
        category: formCategory,
        rating: 4.8 + Math.round(Math.random() * 20) / 100,
        totalTrips: Math.floor(100 + Math.random() * 1500),
        isOnline: formIsOnline,
        isBusy: false,
        location: {
          lat: DEFAULT_CITY_CENTER.lat + offsetLat,
          lng: DEFAULT_CITY_CENTER.lng + offsetLng,
          heading: Math.floor(Math.random() * 360),
          address: 'Ubicación de Patrullaje',
        },
        lastUpdated: Date.now(),
      };

      await realtimeDB.addDriver(newDriver);
    }

    setIsAddEditModalOpen(false);
  };

  // Delete Driver
  const handleDeleteDriver = async (driverId: string) => {
    if (confirm('¿Eliminar este chofer de la flota?')) {
      await realtimeDB.deleteDriver(driverId);
    }
  };

  // Reposition driver randomly in the city
  const handleRepositionDriver = async (driverId: string) => {
    const offsetLat = (Math.random() - 0.5) * 0.045;
    const offsetLng = (Math.random() - 0.5) * 0.045;
    await realtimeDB.updateDriver(driverId, {
      location: {
        lat: DEFAULT_CITY_CENTER.lat + offsetLat,
        lng: DEFAULT_CITY_CENTER.lng + offsetLng,
        heading: Math.floor(Math.random() * 360),
        address: 'Ubicación Reasignada',
      },
    });
  };

  // Set exact custom fleet size
  const handleApplyFleetCount = async (targetCount: number) => {
    const currentCount = driversList.length;
    if (targetCount === currentCount) return;

    if (targetCount > currentCount) {
      // Add more drivers
      const toAdd = targetCount - currentCount;
      for (let i = 0; i < toAdd; i++) {
        const nameIdx = (currentCount + i) % SAMPLE_NAMES.length;
        const carIdx = (currentCount + i) % SAMPLE_CARS.length;
        const offsetLat = (Math.random() - 0.5) * 0.05;
        const offsetLng = (Math.random() - 0.5) * 0.05;
        const randomPlate = `AC-${Math.floor(200 + Math.random() * 799)}-${String.fromCharCode(65 + ((i * 3) % 26))}${String.fromCharCode(65 + ((i * 7) % 26))}`;

        const newDriver: Driver = {
          id: `driver-fleet-${Date.now()}-${i}`,
          name: `${SAMPLE_NAMES[nameIdx]} (${i + 1})`,
          phone: `+54 9 11 4000-${1000 + i}`,
          vehicleModel: SAMPLE_CARS[carIdx].model,
          licensePlate: randomPlate,
          category: SAMPLE_CARS[carIdx].cat,
          rating: 4.85 + (i % 3) * 0.05,
          totalTrips: 300 + i * 150,
          isOnline: true,
          isBusy: false,
          location: {
            lat: DEFAULT_CITY_CENTER.lat + offsetLat,
            lng: DEFAULT_CITY_CENTER.lng + offsetLng,
            heading: Math.floor(Math.random() * 360),
            address: 'Flota Desplegada',
          },
          lastUpdated: Date.now(),
        };
        await realtimeDB.addDriver(newDriver);
      }
    } else {
      // Reduce fleet to targetCount
      const toRemove = currentCount - targetCount;
      const driversToRemove = driversList.slice(-toRemove);
      for (const d of driversToRemove) {
        await realtimeDB.deleteDriver(d.id);
      }
    }
  };

  return (
    <div className="h-full w-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      {/* 24/7 Operations Top Command Bar */}
      <div className="bg-slate-900 border-b border-slate-800 px-5 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30">
            <Radio className="w-5 h-5 animate-pulse text-purple-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-extrabold tracking-tight text-white">
                CENTRO DE CONTROL 24/7 • GESTIÓN DE FLOTA Y DESPACHO
              </h1>
              <span className="flex items-center gap-1 bg-emerald-950/80 text-emerald-400 border border-emerald-800/80 text-[10px] font-bold px-2 py-0.5 rounded-full">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                MAPA ESRI URBANO
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono">
              Monitoreo permanente de recogidas, edición de vehículos y asignación personalizada de flota
            </p>
          </div>
        </div>

        {/* Live Clock & Actions */}
        <div className="flex items-center gap-3">
          <div className="bg-slate-950 px-3.5 py-1.5 rounded-xl border border-slate-800 font-mono text-xs flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-slate-400">HORA UTC:</span>
            <span className="text-purple-300 font-bold text-sm tracking-wider">{currentTime || '--:--:--'}</span>
          </div>

          <button
            onClick={handleOpenAddModal}
            className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-3 py-2 rounded-xl shadow transition"
          >
            <Plus className="w-3.5 h-3.5" />
            + Agregar Chofer
          </button>
        </div>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4 bg-slate-900/60 border-b border-slate-800/80">
        <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Recogidas Activas</span>
            <div className="text-xl font-black text-white">{activeTrips.length}</div>
          </div>
          <div className="h-9 w-9 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
            <Activity className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">En Espera (Radar)</span>
            <div className="text-xl font-black text-amber-300">{pendingRequests.length}</div>
          </div>
          <div className="h-9 w-9 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
            <Radio className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Choferes Libres</span>
            <div className="text-xl font-black text-emerald-400">
              {availableDrivers.length} <span className="text-xs text-slate-500">/ {onlineDrivers.length}</span>
            </div>
          </div>
          <div className="h-9 w-9 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
            <Car className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400">Total Flota</span>
            <div className="text-xl font-black text-purple-300">{driversList.length}</div>
          </div>
          <div className="h-9 w-9 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 flex items-center justify-between col-span-2 md:col-span-1">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">Servicios Concluidos</span>
            <div className="text-xl font-black text-cyan-300">{completedTrips.length}</div>
          </div>
          <div className="h-9 w-9 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Content Area: Map + Operations Feed */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Full Interactive Fleet Map */}
        <div className="relative flex-1 h-[45vh] lg:h-full">
          <MapLeaflet
            pickup={focusedTrip ? focusedTrip.origin : null}
            destination={null}
            drivers={driversList}
            activeDriverId={focusedTrip?.driverId}
            className="h-full w-full"
          />

          {/* Map Legend Overlay */}
          <div className="absolute top-4 left-4 z-10 bg-slate-900/90 backdrop-blur-md p-3 rounded-xl border border-slate-700 text-xs shadow-xl hidden sm:block">
            <div className="font-bold text-white mb-2 flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-purple-400" />
              Estado de Flota en Vivo
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-300"></span>
                <span className="text-slate-300">Disponible ({availableDrivers.length})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-amber-300"></span>
                <span className="text-slate-300">En Camino a Pasajero ({busyDrivers.length})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400"></span>
                <span className="text-slate-300">Punto de Recogida Pasajero</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Operations Feed & Fleet Editor */}
        <div className="w-full lg:w-[500px] xl:w-[580px] bg-slate-900 border-t lg:border-t-0 lg:border-l border-slate-800 flex flex-col h-[55vh] lg:h-full overflow-hidden">
          {/* Navigation Tabs */}
          <div className="flex border-b border-slate-800 bg-slate-950/40 p-2 gap-1.5 overflow-x-auto">
            <button
              onClick={() => setActiveTab('requests')}
              className={`flex-1 min-w-[120px] py-2 px-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                activeTab === 'requests'
                  ? 'bg-purple-600 text-white shadow'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Solicitudes ({tripsList.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('fleet')}
              className={`flex-1 min-w-[120px] py-2 px-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                activeTab === 'fleet'
                  ? 'bg-purple-600 text-white shadow'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Car className="w-3.5 h-3.5" />
              <span>Editar Flota ({driversList.length})</span>
            </button>
            {isSuperAdmin && (
              <button
                onClick={() => setActiveTab('users')}
                className={`flex-1 min-w-[140px] py-2 px-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  activeTab === 'users'
                    ? 'bg-amber-600 text-white shadow ring-1 ring-amber-400/40'
                    : 'text-amber-400 hover:text-amber-300 hover:bg-slate-800'
                }`}
              >
                <Crown className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span>Usuarios ({usersList.length})</span>
              </button>
            )}
          </div>

          {/* TAB 1: PASSENGER REQUESTS 24/7 (RECOGIDAS) */}
          {activeTab === 'requests' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Search & Filter bar */}
              <div className="p-3 bg-slate-950/40 border-b border-slate-800 flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar por pasajero, calle de recogida, chofer..."
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-slate-900 border border-slate-700/80 rounded-xl px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none"
                >
                  <option value="all">Todos los estados</option>
                  <option value="solicitado">Solicitado (Radar)</option>
                  <option value="aceptado">Aceptado / En Camino</option>
                  <option value="llegado">Llegado al Punto</option>
                  <option value="completado">Completado</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>

              {/* Trips List */}
              <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5">
                {filteredTrips.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs">
                    No hay solicitudes registradas con estos filtros.
                  </div>
                ) : (
                  filteredTrips.map((trip) => {
                    const isSelected = selectedTripId === trip.id;
                    const statusColors: Record<TripStatus, string> = {
                      solicitado: 'bg-amber-950/80 text-amber-300 border-amber-700/60',
                      aceptado: 'bg-indigo-950/80 text-indigo-300 border-indigo-700/60',
                      en_camino: 'bg-blue-950/80 text-blue-300 border-blue-700/60',
                      llegado: 'bg-teal-950/80 text-teal-300 border-teal-700/60',
                      en_viaje: 'bg-purple-950/80 text-purple-300 border-purple-700/60',
                      completado: 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60',
                      cancelado: 'bg-rose-950/80 text-rose-300 border-rose-700/60',
                    };

                    return (
                      <div
                        key={trip.id}
                        onClick={() => setSelectedTripId(isSelected ? null : trip.id)}
                        className={`p-3 rounded-2xl border transition cursor-pointer ${
                          isSelected
                            ? 'bg-purple-950/30 border-purple-500 ring-2 ring-purple-500/20'
                            : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-white">#{trip.id.slice(-6)}</span>
                            <span
                              className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                                statusColors[trip.status]
                              }`}
                            >
                              {trip.status}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {new Date(trip.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-xs uppercase tracking-wider text-purple-300 bg-purple-950/60 border border-purple-800/60 px-2 py-0.5 rounded-full">
                              {trip.category}
                            </span>
                          </div>
                        </div>

                        {/* Passenger & Driver names */}
                        <div className="text-xs mb-2">
                          <div className="text-white font-semibold flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              {trip.passengerPhoto && (
                                <img src={trip.passengerPhoto} alt="" className="w-4 h-4 rounded-full border border-purple-400" />
                              )}
                              <span>Pasajero: {trip.passengerName}</span>
                              {trip.passengerEmail && (
                                <span className="text-[9px] text-emerald-400 bg-emerald-950/80 border border-emerald-800/80 px-1.5 py-0.2 rounded-full font-bold">
                                  Google
                                </span>
                              )}
                            </div>
                            <span className="text-slate-400 font-mono">{trip.passengerPhone}</span>
                          </div>
                          {trip.passengerEmail && (
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                              {trip.passengerEmail}
                            </div>
                          )}
                          {trip.driverName ? (
                            <div className="text-purple-300 text-[11px] mt-0.5 flex items-center gap-1">
                              <Car className="w-3 h-3" />
                              Chofer asignado: <b>{trip.driverName}</b> ({trip.driverPlate})
                            </div>
                          ) : (
                            <div className="text-amber-400 text-[11px] mt-0.5">
                              Esperando chofer que acepte la recogida...
                            </div>
                          )}
                        </div>

                        {/* Pickup Location Only */}
                        <div className="bg-slate-900/80 p-2 rounded-xl text-[11px] text-slate-300 flex items-start gap-2 border border-slate-800/80">
                          <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                          <div className="truncate">
                            <b className="text-emerald-400">Recogida:</b> {trip.origin.address}
                          </div>
                        </div>

                        {/* Action buttons if pending */}
                        {trip.status === 'solicitado' && (
                          <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
                            <span className="text-[10px] text-slate-400">Despacho Manual:</span>
                            <div className="flex items-center gap-1">
                              {availableDrivers.length > 0 ? (
                                availableDrivers.slice(0, 2).map((d) => (
                                  <button
                                    key={d.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleManualDispatch(trip.id, d.id);
                                    }}
                                    className="bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-bold px-2 py-1 rounded-lg transition"
                                  >
                                    Asignar {d.name.split(' ')[0]}
                                  </button>
                                ))
                              ) : (
                                <span className="text-[10px] text-amber-400 font-medium">No hay choferes libres</span>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAdminCancelTrip(trip.id);
                                }}
                                className="bg-rose-950/60 hover:bg-rose-900 text-rose-300 text-[10px] font-semibold px-2 py-1 rounded-lg border border-rose-800/60 transition"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 2: EDITAR FLOTA & ASIGNAR CANTIDAD DE CHOFERES */}
          {activeTab === 'fleet' && (
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
              {/* Fleet Size Assigner Card */}
              <div className="bg-slate-950/90 p-4 rounded-2xl border border-purple-500/30 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-purple-400" />
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-purple-300">
                      Asignar Cantidad de Choferes en Flota
                    </h3>
                  </div>
                  <span className="text-xs font-mono font-bold text-white bg-purple-900/60 px-2 py-0.5 rounded border border-purple-700/60">
                    Actual: {driversList.length}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={desiredFleetCount}
                    onChange={(e) => setDesiredFleetCount(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-24 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-center text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <button
                    onClick={() => handleApplyFleetCount(desiredFleetCount)}
                    className="flex-1 bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 px-3 rounded-xl text-xs transition shadow"
                  >
                    Establecer Tamaño ({desiredFleetCount} vehículos)
                  </button>
                </div>

                {/* Quick Presets */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-slate-400 font-semibold mr-1">Presets:</span>
                  {[2, 4, 6, 8, 12, 15].map((count) => (
                    <button
                      key={count}
                      onClick={() => {
                        setDesiredFleetCount(count);
                        handleApplyFleetCount(count);
                      }}
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition ${
                        driversList.length === count
                          ? 'bg-purple-600 text-white border-purple-500'
                          : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {count} choferes
                    </button>
                  ))}
                </div>
              </div>

              {/* Drivers Cards List */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300">
                  Lista de Choferes y Vehículos ({driversList.length})
                </span>
                <button
                  onClick={handleOpenAddModal}
                  className="flex items-center gap-1 text-[11px] font-bold text-purple-400 hover:text-purple-300 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Agregar nuevo
                </button>
              </div>

              <div className="flex flex-col gap-2.5">
                {driversList.map((driver) => {
                  const isOnline = driver.isOnline;
                  const isBusy = driver.isBusy;

                  return (
                    <div
                      key={driver.id}
                      className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 flex flex-col gap-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div
                            className={`h-9 w-9 rounded-xl flex items-center justify-center font-bold text-white ${
                              isBusy ? 'bg-amber-600' : isOnline ? 'bg-emerald-600' : 'bg-slate-700'
                            }`}
                          >
                            <Car className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-bold text-white">{driver.name}</h4>
                              <span
                                className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                  isBusy
                                    ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                    : isOnline
                                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                                }`}
                              >
                                {isBusy ? 'En Servicio' : isOnline ? 'Disponible' : 'Desconectado'}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 font-mono">
                              {driver.vehicleModel} • <b className="text-amber-400">{driver.licensePlate}</b> • {driver.category.toUpperCase()}
                            </p>
                          </div>
                        </div>

                        {/* Actions: Edit, Reposition, Delete */}
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleRepositionDriver(driver.id)}
                            title="Reubicar aleatoriamente en la ciudad"
                            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition"
                          >
                            <Shuffle className="w-3.5 h-3.5 text-indigo-400" />
                          </button>
                          <button
                            onClick={() => handleOpenEditModal(driver)}
                            title="Editar datos del vehículo y chofer"
                            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-purple-400 border border-slate-800 transition"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteDriver(driver.id)}
                            title="Eliminar chofer de la flota"
                            className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 border border-slate-800 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Coordinates & Telemetry */}
                      <div className="bg-slate-900/80 p-2 rounded-xl text-[11px] text-slate-400 flex items-center justify-between border border-slate-800">
                        <div>
                          Tel: <span className="text-slate-200">{driver.phone}</span>
                        </div>
                        <div>
                          GPS: <span className="font-mono text-slate-200">{driver.location.lat.toFixed(4)}, {driver.location.lng.toFixed(4)}</span>
                        </div>
                        <div>
                          Calificación: <span className="text-amber-400 font-bold">★ {driver.rating.toFixed(2)}</span>
                        </div>
                      </div>

                      {driver.currentTripId && trips[driver.currentTripId] && (
                        <div className="text-[11px] bg-purple-950/40 border border-purple-800/40 p-2 rounded-xl text-purple-300">
                          Recogiendo a: {trips[driver.currentTripId].passengerName} en {trips[driver.currentTripId].origin.address}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: USERS & PRIVILEGES (EXCLUSIVE FOR JORGE GARAVAGNO) */}
          {activeTab === 'users' && isSuperAdmin && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Header Info Banner for Jorge */}
              <div className="p-3.5 bg-gradient-to-r from-amber-950/40 via-purple-950/30 to-slate-950 border-b border-amber-900/40">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      <Crown className="w-4 h-4 text-amber-400" />
                    </div>
                    <div>
                      <h3 className="text-xs font-black uppercase tracking-wider text-amber-300">
                        Administración de Usuarios Registrados con Google
                      </h3>
                      <p className="text-[10px] text-slate-400">
                        Supervisión exclusiva de Jorge Garavagno (<span className="text-amber-300 font-mono">jorgeGaravagno@gmail.com</span>)
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setSimName('Mariana López');
                      setSimEmail(`mariana.${Math.floor(100 + Math.random() * 899)}@gmail.com`);
                      setSimRole('pasajero');
                      setIsSimulateUserModalOpen(true);
                    }}
                    className="flex items-center gap-1 bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-xl transition shadow"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    + Simular Usuario
                  </button>
                </div>

                {/* Mini Stats Ribbon */}
                <div className="grid grid-cols-4 gap-2 pt-2 border-t border-amber-900/30 text-center">
                  <div className="bg-slate-950/60 p-1.5 rounded-xl border border-slate-800">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">Total Personas</span>
                    <span className="text-sm font-black text-amber-400">{usersList.length}</span>
                  </div>
                  <div className="bg-slate-950/60 p-1.5 rounded-xl border border-slate-800">
                    <span className="text-[9px] uppercase font-bold text-purple-400 block">📱 Pasajeros</span>
                    <span className="text-sm font-black text-white">{passengerUsersCount}</span>
                  </div>
                  <div className="bg-slate-950/60 p-1.5 rounded-xl border border-slate-800">
                    <span className="text-[9px] uppercase font-bold text-emerald-400 block">🚘 Choferes</span>
                    <span className="text-sm font-black text-emerald-300">{driverUsersCount}</span>
                  </div>
                  <div className="bg-slate-950/60 p-1.5 rounded-xl border border-slate-800">
                    <span className="text-[9px] uppercase font-bold text-cyan-400 block">🖥️ Control/Admin</span>
                    <span className="text-sm font-black text-cyan-300">{controlUsersCount + adminUsersCount}</span>
                  </div>
                </div>
              </div>

              {/* Search & Role Filter Bar */}
              <div className="p-3 bg-slate-950/40 border-b border-slate-800 flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={userSearchTerm}
                    onChange={(e) => setUserSearchTerm(e.target.value)}
                    placeholder="Buscar usuario por nombre o correo Gmail..."
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
                <select
                  value={userRoleFilter}
                  onChange={(e) => setUserRoleFilter(e.target.value)}
                  className="bg-slate-900 border border-slate-700/80 rounded-xl px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none"
                >
                  <option value="all">Todos los roles</option>
                  <option value="pasajero">Solo Pasajeros</option>
                  <option value="chofer">Solo Choferes</option>
                  <option value="control">Solo Control 24/7</option>
                  <option value="admin">Solo Administradores</option>
                </select>
              </div>

              {/* Toast notification if role changed */}
              {roleToast && (
                <div className="mx-3 mt-2 p-2 bg-emerald-950/90 border border-emerald-500/50 rounded-xl text-emerald-300 text-xs flex items-center gap-2 animate-fadeIn">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="font-semibold">{roleToast}</span>
                </div>
              )}

              {/* Users List */}
              <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5">
                {filteredUsers.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs">
                    No hay usuarios registrados que coincidan con la búsqueda.
                  </div>
                ) : (
                  filteredUsers.map((user) => {
                    const isUserJorge = user.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();

                    return (
                      <div
                        key={user.uid}
                        className={`p-3.5 rounded-2xl border transition flex flex-col gap-2.5 ${
                          isUserJorge
                            ? 'bg-amber-950/20 border-amber-600/40 ring-1 ring-amber-500/20'
                            : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <img
                                src={user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=4f46e5&color=fff`}
                                alt=""
                                className="w-10 h-10 rounded-full border-2 border-slate-700 object-cover"
                              />
                              {isUserJorge && (
                                <span className="absolute -top-1 -right-1 text-xs">👑</span>
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                                  {user.name}
                                  {isUserJorge && (
                                    <span className="text-[10px] font-extrabold text-amber-400 bg-amber-950/80 border border-amber-800/80 px-2 py-0.2 rounded-full">
                                      SUPER ADMIN
                                    </span>
                                  )}
                                </h4>
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs text-slate-400 font-mono flex items-center gap-1">
                                  <svg className="w-3 h-3 text-red-400 inline" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"/>
                                  </svg>
                                  {user.email}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Role badge */}
                          <span
                            className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full border ${
                              user.role === 'admin'
                                ? 'bg-amber-950 text-amber-300 border-amber-800'
                                : user.role === 'control'
                                ? 'bg-cyan-950 text-cyan-300 border-cyan-800'
                                : user.role === 'chofer'
                                ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                                : 'bg-purple-950 text-purple-300 border-purple-800'
                            }`}
                          >
                            {user.role === 'admin'
                              ? 'Administrador'
                              : user.role === 'control'
                              ? 'Operador 24/7'
                              : user.role === 'chofer'
                              ? 'Chofer'
                              : 'Pasajero'}
                          </span>
                        </div>

                        {/* Privilege Editor Bar */}
                        <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                            <span className="text-[11px] font-semibold text-slate-300 shrink-0">
                              Privilegios de Acceso:
                            </span>
                            {isUserJorge ? (
                              <span className="text-[11px] text-amber-300 font-bold bg-amber-950/60 px-2 py-0.5 rounded-lg border border-amber-800/40">
                                Acceso Total Permanente (Inmutable)
                              </span>
                            ) : (
                              <select
                                value={user.role}
                                onChange={(e) => handleUpdateRole(user.uid, e.target.value as UserRole, user.assignedDriverId)}
                                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:ring-1 focus:ring-amber-500 focus:outline-none"
                              >
                                <option value="pasajero">📱 Pasajero (Solo solicitar viajes)</option>
                                <option value="chofer">🚘 Chofer (Aceptar y realizar viajes)</option>
                                <option value="control">🖥️ Control 24/7 (Monitorear flota y despacho)</option>
                                <option value="admin">👑 Administrador Total (Todas las vistas)</option>
                              </select>
                            )}
                          </div>

                          {/* If role is Chofer, allow vehicle linking */}
                          {user.role === 'chofer' && !isUserJorge && (
                            <div className="flex items-center gap-2 w-full mt-1 pt-2 border-t border-slate-800/60">
                              <span className="text-[11px] text-emerald-400 font-semibold shrink-0">
                                Vehículo de Flota Asignado:
                              </span>
                              <select
                                value={user.assignedDriverId || ''}
                                onChange={(e) => handleUpdateRole(user.uid, 'chofer', e.target.value)}
                                className="bg-slate-950 border border-emerald-700/60 rounded-lg px-2 py-1 text-xs text-emerald-300 flex-1 focus:outline-none"
                              >
                                <option value="">-- Sin vehículo asignado / Propio --</option>
                                {driversList.map((d) => (
                                  <option key={d.id} value={d.id}>
                                    {d.name} • {d.vehicleModel} ({d.licensePlate})
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          {/* Delete / revoke user button (disabled for Jorge) */}
                          {!isUserJorge && (
                            <button
                              onClick={() => handleDeleteUser(user.uid)}
                              title="Eliminar usuario del sistema"
                              className="p-1.5 rounded-lg bg-slate-950 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 border border-slate-800 transition text-xs flex items-center gap-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Eliminar</span>
                            </button>
                          )}
                        </div>

                        {/* Timestamp footer */}
                        <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono px-1">
                          <span>Registrado: {new Date(user.createdAt || Date.now()).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                          <span>Último Acceso: {new Date(user.lastLoginAt || Date.now()).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: ADD / EDIT DRIVER */}
      {isAddEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-6 text-white max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsAddEditModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30">
                <Car className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold">
                  {editingDriver ? 'Editar Vehículo y Chofer' : 'Agregar Nuevo Chofer a la Flota'}
                </h3>
                <p className="text-xs text-slate-400">Se sincronizará en tiempo real con todos los mapas</p>
              </div>
            </div>

            <form onSubmit={handleSaveDriver} className="flex flex-col gap-3 text-xs">
              <div>
                <label className="text-slate-300 font-medium block mb-1">Nombre Completo del Chofer:</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ej: Marcelo Bianchi"
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium block mb-1">Teléfono:</label>
                  <input
                    type="text"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="+54 9 11 ..."
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:ring-2 focus:ring-purple-500 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-medium block mb-1">Patente / Placa:</label>
                  <input
                    type="text"
                    value={formPlate}
                    onChange={(e) => setFormPlate(e.target.value)}
                    placeholder="AF-123-ZZ"
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:ring-2 focus:ring-purple-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">Modelo de Vehículo:</label>
                <input
                  type="text"
                  value={formVehicle}
                  onChange={(e) => setFormVehicle(e.target.value)}
                  placeholder="Ej: Toyota Corolla 2024 (Blanco)"
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium block mb-1">Categoría:</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as VehicleCategory)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none"
                  >
                    <option value="lite">Urban Lite (Estándar)</option>
                    <option value="black">Executive Black (VIP)</option>
                    <option value="van">Group Van XL (Furgón)</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-300 font-medium block mb-1">Estado Conexión:</label>
                  <select
                    value={formIsOnline ? 'online' : 'offline'}
                    onChange={(e) => setFormIsOnline(e.target.value === 'online')}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none"
                  >
                    <option value="online">En Línea (Activo)</option>
                    <option value="offline">Desconectado</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800 mt-2">
                <button
                  type="button"
                  onClick={() => setIsAddEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-5 py-2 rounded-xl transition flex items-center gap-1.5 shadow-lg shadow-purple-600/30"
                >
                  <Check className="w-4 h-4" />
                  {editingDriver ? 'Guardar Cambios' : 'Crear Chofer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SIMULATE NEW GOOGLE USER (TESTING UTILITY FOR JORGE GARAVAGNO) */}
      {isSimulateUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md rounded-2xl bg-slate-900 border border-amber-600/50 shadow-2xl p-6 text-white max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsSimulateUserModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-600/20 text-amber-400 border border-amber-500/30">
                <UserPlus className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Simular Nuevo Usuario con Google</h3>
                <p className="text-xs text-slate-400">
                  Prueba en vivo cómo ingresa un nuevo usuario y cómo se incrementa el contador
                </p>
              </div>
            </div>

            <form onSubmit={handleSimulateUserSubmit} className="flex flex-col gap-3 text-xs">
              <div>
                <label className="text-slate-300 font-medium block mb-1">Nombre Completo del Usuario:</label>
                <input
                  type="text"
                  value={simName}
                  onChange={(e) => setSimName(e.target.value)}
                  placeholder="Ej: Laura Méndez"
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">Correo de Google / Gmail:</label>
                <input
                  type="email"
                  value={simEmail}
                  onChange={(e) => setSimEmail(e.target.value)}
                  placeholder="ejemplo@gmail.com"
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:ring-2 focus:ring-amber-500 focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">Rol Inicial Asignado:</label>
                <select
                  value={simRole}
                  onChange={(e) => setSimRole(e.target.value as UserRole)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none"
                >
                  <option value="pasajero">📱 Pasajero (Predeterminado - Solo viajes)</option>
                  <option value="chofer">🚘 Chofer (Habilitar conducción)</option>
                  <option value="control">🖥️ Control 24/7 (Operador de flota)</option>
                  <option value="admin">👑 Administrador Total</option>
                </select>
                <p className="text-[10px] text-amber-400/80 mt-1">
                  Nota: Cualquier usuario nuevo que entra por Google ingresa automáticamente como "Pasajero".
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800 mt-2">
                <button
                  type="button"
                  onClick={() => setIsSimulateUserModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-amber-600 hover:bg-amber-500 text-white font-bold px-5 py-2 rounded-xl transition flex items-center gap-1.5 shadow-lg shadow-amber-600/30"
                >
                  <Check className="w-4 h-4" />
                  Simular Registro
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
