import React, { useState, useEffect } from 'react';
import { Navbar, AppMode } from './components/Navbar';
import { PassengerView } from './components/PassengerView';
import { DriverView } from './components/DriverView';
import { ControlCenterView } from './components/ControlCenterView';
import { FirebaseConfigModal } from './components/FirebaseConfigModal';
import { Driver, TripRequest, RegisteredUser, UserProfile, SUPER_ADMIN_EMAIL } from './types';
import { realtimeDB } from './services/firebaseRealtime';
import { authService } from './services/auth';

export default function App() {
  const [mode, setMode] = useState<AppMode>('passenger');
  const [drivers, setDrivers] = useState<Record<string, Driver>>({});
  const [trips, setTrips] = useState<Record<string, TripRequest>>({});
  const [users, setUsers] = useState<Record<string, RegisteredUser>>({});
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => authService.getCurrentUser());
  const [isFirebaseModalOpen, setIsFirebaseModalOpen] = useState<boolean>(false);

  // Subscribe to real-time synchronization (Firebase Realtime Database / BroadcastChannel fallback)
  useEffect(() => {
    const unsubDrivers = realtimeDB.subscribeToDrivers((latestDrivers) => {
      setDrivers({ ...latestDrivers });
    });

    const unsubTrips = realtimeDB.subscribeToTrips((latestTrips) => {
      setTrips({ ...latestTrips });
    });

    const unsubUsers = realtimeDB.subscribeToUsers((latestUsers) => {
      setUsers({ ...latestUsers });
    });

    const unsubAuth = authService.onAuthStateChange((user) => {
      setCurrentUser(user);
    });

    return () => {
      unsubDrivers();
      unsubTrips();
      unsubUsers();
      unsubAuth();
    };
  }, []);

  // Strict role guard: only jorgeGaravagno@gmail.com has access to all modes by default.
  // Other Gmail users default to passenger unless assigned driver/control by Jorge.
  useEffect(() => {
    const isSuperAdmin = currentUser?.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
    const userRole = isSuperAdmin ? 'admin' : (currentUser?.role || 'pasajero');

    if (mode === 'driver' && userRole !== 'admin' && userRole !== 'chofer') {
      setMode('passenger');
    } else if (mode === 'control' && userRole !== 'admin' && userRole !== 'control') {
      setMode('passenger');
    } else if (mode === 'split' && userRole !== 'admin') {
      setMode('passenger');
    }
  }, [currentUser, mode]);

  const pendingRequestsCount = Object.values(trips).filter((t) => t.status === 'solicitado').length;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 font-sans">
      {/* Top Navbar */}
      <Navbar
        currentMode={mode}
        onModeChange={(newMode) => setMode(newMode)}
        onOpenFirebaseModal={() => setIsFirebaseModalOpen(true)}
        pendingRequestsCount={pendingRequestsCount}
      />

      {/* Main View Area */}
      <main className="flex-1 relative overflow-hidden">
        {mode === 'passenger' && (
          <PassengerView drivers={drivers} trips={trips} />
        )}

        {mode === 'driver' && (
          <DriverView drivers={drivers} trips={trips} />
        )}

        {mode === 'control' && (
          <ControlCenterView drivers={drivers} trips={trips} users={users} />
        )}

        {mode === 'split' && (
          <div className="h-full w-full grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-800">
            {/* Left: Passenger Interface */}
            <div className="h-full flex flex-col relative overflow-hidden">
              <div className="bg-purple-950/80 px-4 py-1.5 border-b border-purple-900/60 text-xs font-bold text-purple-200 flex items-center justify-between z-20">
                <span>📱 Vista Pasajero (Pide tu viaje)</span>
                <span className="text-[10px] text-purple-300 font-normal">Simulador en tiempo real</span>
              </div>
              <div className="flex-1 overflow-hidden">
                <PassengerView drivers={drivers} trips={trips} />
              </div>
            </div>

            {/* Right: Driver Interface */}
            <div className="h-full flex flex-col relative overflow-hidden">
              <div className="bg-indigo-950/80 px-4 py-1.5 border-b border-indigo-900/60 text-xs font-bold text-indigo-200 flex items-center justify-between z-20">
                <span>🚘 Vista Chofer (Acepta y conduce)</span>
                <span className="text-[10px] text-indigo-300 font-normal">Seguimiento GPS y simulación</span>
              </div>
              <div className="flex-1 overflow-hidden">
                <DriverView drivers={drivers} trips={trips} />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Firebase Realtime Database Configuration Modal */}
      <FirebaseConfigModal
        isOpen={isFirebaseModalOpen}
        onClose={() => setIsFirebaseModalOpen(false)}
      />
    </div>
  );
}
