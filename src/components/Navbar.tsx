import React from 'react';
import {
  Car,
  User,
  LayoutDashboard,
  Columns,
  Volume2,
  VolumeX,
  Flame,
  Shield,
  Crown
} from 'lucide-react';
import { soundService } from '../services/audio';
import { realtimeDB } from '../services/firebaseRealtime';
import { authService } from '../services/auth';
import { UserProfile, SUPER_ADMIN_EMAIL } from '../types';

export type AppMode = 'passenger' | 'driver' | 'control' | 'split';

interface NavbarProps {
  currentMode: AppMode;
  onModeChange: (mode: AppMode) => void;
  onOpenFirebaseModal: () => void;
  pendingRequestsCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentMode,
  onModeChange,
  onOpenFirebaseModal,
  pendingRequestsCount,
}) => {
  const [soundEnabled, setSoundEnabled] = React.useState(soundService.enabled);
  const [user, setUser] = React.useState<UserProfile | null>(() => authService.getCurrentUser());
  const isFirebase = realtimeDB.isUsingFirebase();

  React.useEffect(() => {
    const unsub = authService.onAuthStateChange(setUser);
    return () => unsub();
  }, []);

  const toggleSound = () => {
    soundService.enabled = !soundService.enabled;
    setSoundEnabled(soundService.enabled);
  };

  // Role permissions
  const isSuperAdmin = user?.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
  const userRole = isSuperAdmin ? 'admin' : (user?.role || 'pasajero');

  const canAccessDriver = isSuperAdmin || userRole === 'admin' || userRole === 'chofer';
  const canAccessControl = isSuperAdmin || userRole === 'admin' || userRole === 'control';
  const canAccessSplit = isSuperAdmin || userRole === 'admin';

  const hasMultipleModes = canAccessDriver || canAccessControl || canAccessSplit;

  return (
    <header className="bg-slate-950 border-b border-slate-800 text-white px-3 md:px-5 py-2.5 flex items-center justify-between shrink-0 select-none z-30 shadow-md">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-600/30">
          <Car className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-extrabold text-base tracking-tight bg-gradient-to-r from-white via-slate-100 to-purple-300 bg-clip-text text-transparent">
              UrbanRide
            </span>
            <span className="text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-800 px-1.5 py-0.2 rounded">
              PRO
            </span>
          </div>
          <span className="hidden sm:inline-block text-[10px] text-slate-400 font-medium">
            Seguimiento en Vivo • Esri Urbano & OSRM (100% Libre)
          </span>
        </div>
      </div>

      {/* Role / Mode Switcher Buttons */}
      {/* jorgeGaravagno@gmail.com is the ONLY one who sees all tabs by default; other gmail users only see Passenger unless granted permissions */}
      {hasMultipleModes ? (
        <nav className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-2xl border border-slate-800">
          <button
            onClick={() => onModeChange('passenger')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              currentMode === 'passenger'
                ? 'bg-purple-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Pasajero</span>
          </button>

          {canAccessDriver && (
            <button
              onClick={() => onModeChange('driver')}
              className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                currentMode === 'driver'
                  ? 'bg-purple-600 text-white shadow'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Car className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Chofer</span>
              {pendingRequestsCount > 0 && (
                <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping"></span>
              )}
            </button>
          )}

          {canAccessControl && (
            <button
              onClick={() => onModeChange('control')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                currentMode === 'control'
                  ? 'bg-purple-600 text-white shadow'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Control 24/7</span>
            </button>
          )}

          {canAccessSplit && (
            <button
              onClick={() => onModeChange('split')}
              title="Modo Doble Pantalla para probar Pasajero y Chofer simultáneamente"
              className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition ${
                currentMode === 'split'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-indigo-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Columns className="w-3.5 h-3.5" />
              <span>Simulador Dual</span>
            </button>
          )}
        </nav>
      ) : (
        /* Regular passenger indicator */
        <div className="flex items-center gap-1.5 bg-slate-900/60 border border-slate-800 px-3 py-1 rounded-xl text-xs text-purple-300 font-semibold">
          <User className="w-3.5 h-3.5 text-purple-400" />
          <span>Modo Pasajero</span>
        </div>
      )}

      {/* Right Tools (Sound, Firebase config, Google User Profile) */}
      <div className="flex items-center gap-2">
        <button
          onClick={toggleSound}
          title={soundEnabled ? 'Silenciar sonidos de alerta' : 'Activar sonidos'}
          className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition"
        >
          {soundEnabled ? <Volume2 className="w-4 h-4 text-purple-400" /> : <VolumeX className="w-4 h-4" />}
        </button>

        {isSuperAdmin && (
          <button
            onClick={onOpenFirebaseModal}
            className="hidden md:flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs px-2.5 py-1.5 rounded-xl text-slate-300 hover:text-white transition"
          >
            <Flame className={`w-3.5 h-3.5 ${isFirebase ? 'text-amber-500' : 'text-slate-500'}`} />
            <span className="text-[11px] font-semibold">
              {isFirebase ? 'Firebase Activo' : 'Firebase RTDB'}
            </span>
          </button>
        )}

        {user ? (
          <div className="flex items-center gap-1.5 bg-slate-900/90 border border-purple-500/40 px-2.5 py-1 rounded-xl text-xs">
            <img
              src={user.photoURL}
              alt=""
              className="w-5 h-5 rounded-full border border-purple-400"
            />
            <div className="flex flex-col text-left">
              <span className="text-white font-semibold text-[11px] truncate max-w-[110px] leading-tight">
                {user.name.split(' ')[0]}
              </span>
              <span className="text-[9px] font-bold text-amber-400 leading-tight">
                {isSuperAdmin ? '👑 Super Admin' : userRole === 'chofer' ? '🚘 Chofer' : userRole === 'control' ? '🖥️ Control' : '📱 Pasajero'}
              </span>
            </div>
          </div>
        ) : (
          <div className="text-[11px] text-slate-400 bg-slate-900 px-2 py-1 rounded-lg border border-slate-800">
            Invitado
          </div>
        )}
      </div>
    </header>
  );
};
