import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getDatabase,
  ref,
  set,
  update,
  onValue,
  remove,
  Database,
  DataSnapshot,
  Unsubscribe
} from 'firebase/database';
import { Driver, FirebaseSettings, TripRequest, RegisteredUser, UserRole, SUPER_ADMIN_EMAIL } from '../types';

// Default initial coordinates (Buenos Aires center / Recoleta / Palermo as default reference point)
export const DEFAULT_CITY_CENTER = {
  lat: -34.5985,
  lng: -58.3982,
  city: 'Buenos Aires',
};

// Seed drivers
const INITIAL_DRIVERS: Driver[] = [
  {
    id: 'driver-1',
    name: 'Carlos Mendoza',
    phone: '+54 9 11 4589-2140',
    vehicleModel: 'Toyota Corolla 2023 (Blanco)',
    licensePlate: 'AF-382-KZ',
    category: 'lite',
    rating: 4.95,
    totalTrips: 1420,
    isOnline: true,
    isBusy: false,
    location: {
      lat: -34.5925,
      lng: -58.3892,
      heading: 90,
      address: 'Av. Santa Fe y Callao',
    },
    lastUpdated: Date.now(),
  },
  {
    id: 'driver-2',
    name: 'Valentina Ramos',
    phone: '+54 9 11 5912-8831',
    vehicleModel: 'Chevrolet Onix (Gris Plata)',
    licensePlate: 'AC-914-TP',
    category: 'lite',
    rating: 4.88,
    totalTrips: 870,
    isOnline: true,
    isBusy: false,
    location: {
      lat: -34.6037,
      lng: -58.4112,
      heading: 180,
      address: 'Av. Corrientes y Pueyrredón',
    },
    lastUpdated: Date.now(),
  },
  {
    id: 'driver-3',
    name: 'Martín Silva',
    phone: '+54 9 11 3320-7745',
    vehicleModel: 'Ford Mondeo Titanium (Negro)',
    licensePlate: 'AD-551-QR',
    category: 'black',
    rating: 4.98,
    totalTrips: 2150,
    isOnline: true,
    isBusy: false,
    location: {
      lat: -34.5875,
      lng: -58.4042,
      heading: 45,
      address: 'Av. del Libertador y Coronel Díaz',
    },
    lastUpdated: Date.now(),
  },
  {
    id: 'driver-4',
    name: 'Lucía Ferreyra',
    phone: '+54 9 11 6023-1190',
    vehicleModel: 'Renault Kangoo Stepway (Gris)',
    licensePlate: 'AE-720-MK',
    category: 'van',
    rating: 4.92,
    totalTrips: 640,
    isOnline: true,
    isBusy: false,
    location: {
      lat: -34.6105,
      lng: -58.3752,
      heading: 270,
      address: 'San Telmo - Defensa y Chile',
    },
    lastUpdated: Date.now(),
  },
];

// Local storage keys
const STORAGE_KEY_TRIPS = 'urbanride_trips_v1';
const STORAGE_KEY_DRIVERS = 'urbanride_drivers_v1';
const STORAGE_KEY_USERS = 'urbanride_users_v1';
const STORAGE_KEY_CONFIG = 'urbanride_firebase_config_v1';

class RealtimeDatabaseManager {
  private app: FirebaseApp | null = null;
  private db: Database | null = null;
  private isFirebaseConnected: boolean = false;
  private broadcastChannel: BroadcastChannel | null = null;

  // Local mirror state for instant multi-tab sync & offline fallback
  private localTrips: Record<string, TripRequest> = {};
  private localDrivers: Record<string, Driver> = {};
  private localUsers: Record<string, RegisteredUser> = {};

  private listeners: {
    trips: Set<(trips: Record<string, TripRequest>) => void>;
    drivers: Set<(drivers: Record<string, Driver>) => void>;
    users: Set<(users: Record<string, RegisteredUser>) => void>;
  } = {
    trips: new Set(),
    drivers: new Set(),
    users: new Set(),
  };

  constructor() {
    this.initLocalStorage();
    this.initBroadcastChannel();
    this.attemptFirebaseInit();
  }

  private initLocalStorage() {
    try {
      const storedTrips = localStorage.getItem(STORAGE_KEY_TRIPS);
      if (storedTrips) {
        const parsed: Record<string, TripRequest> = JSON.parse(storedTrips);
        // Eliminate fictional passengers as requested
        const cleanTrips: Record<string, TripRequest> = {};
        Object.entries(parsed).forEach(([id, t]) => {
          if (t && t.passengerName !== 'Mariana López' && !t.passengerName?.toLowerCase().includes('ficticio')) {
            cleanTrips[id] = t;
          }
        });
        this.localTrips = cleanTrips;
        localStorage.setItem(STORAGE_KEY_TRIPS, JSON.stringify(cleanTrips));
      }

      const storedDrivers = localStorage.getItem(STORAGE_KEY_DRIVERS);
      if (storedDrivers) {
        this.localDrivers = JSON.parse(storedDrivers);
      } else {
        // Seed initial drivers
        INITIAL_DRIVERS.forEach((d) => {
          this.localDrivers[d.id] = d;
        });
        localStorage.setItem(STORAGE_KEY_DRIVERS, JSON.stringify(this.localDrivers));
      }

      // Load or seed users
      const storedUsers = localStorage.getItem(STORAGE_KEY_USERS);
      if (storedUsers) {
        this.localUsers = JSON.parse(storedUsers);
      }

      // Ensure Super Admin jorgeGaravagno@gmail.com is always present with admin role
      const adminUid = `google-${SUPER_ADMIN_EMAIL.replace(/[^a-zA-Z0-9]/g, '_')}`;
      this.localUsers[adminUid] = {
        uid: adminUid,
        name: 'Jorge Garavagno',
        email: 'jorgeGaravagno@gmail.com',
        photoURL: `https://ui-avatars.com/api/?name=Jorge+Garavagno&background=4f46e5&color=fff&size=128&bold=true`,
        phone: '+54 9 11 8844-3321',
        role: 'admin',
        createdAt: this.localUsers[adminUid]?.createdAt || Date.now() - 86400000 * 5,
        lastLoginAt: Date.now(),
      };
      localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(this.localUsers));
    } catch (e) {
      console.warn('Storage init fallback:', e);
      INITIAL_DRIVERS.forEach((d) => {
        this.localDrivers[d.id] = d;
      });
    }
  }

  private initBroadcastChannel() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.broadcastChannel = new BroadcastChannel('urbanride_realtime_sync');
        this.broadcastChannel.onmessage = (event) => {
          const { type, data } = event.data || {};
          if (type === 'TRIPS_SYNC') {
            this.localTrips = data;
            this.notifyTrips();
          } else if (type === 'DRIVERS_SYNC') {
            this.localDrivers = data;
            this.notifyDrivers();
          } else if (type === 'USERS_SYNC') {
            this.localUsers = data;
            this.notifyUsers();
          }
        };
      } catch (err) {
        console.warn('BroadcastChannel not supported:', err);
      }
    }
  }

  public getSavedFirebaseConfig(): FirebaseSettings | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_CONFIG);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  public saveFirebaseConfig(config: FirebaseSettings) {
    try {
      localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config));
      this.attemptFirebaseInit(config);
    } catch (e) {
      console.error('Error saving config:', e);
    }
  }

  public clearFirebaseConfig() {
    try {
      localStorage.removeItem(STORAGE_KEY_CONFIG);
      this.db = null;
      this.isFirebaseConnected = false;
    } catch (e) {
      console.error(e);
    }
  }

  public isUsingFirebase(): boolean {
    return this.isFirebaseConnected && this.db !== null;
  }

  private attemptFirebaseInit(customConfig?: FirebaseSettings) {
    const config = customConfig || this.getSavedFirebaseConfig();
    if (!config || !config.apiKey || !config.databaseURL) {
      this.isFirebaseConnected = false;
      return;
    }

    try {
      const existingApps = getApps();
      this.app = existingApps.length > 0 ? existingApps[0] : initializeApp(config);
      this.db = getDatabase(this.app);
      this.isFirebaseConnected = true;
      console.log('Firebase Realtime Database initialized successfully.');

      // Listen on Firebase /trips
      const tripsRef = ref(this.db, 'trips');
      onValue(tripsRef, (snapshot: DataSnapshot) => {
        const val = snapshot.val();
        this.localTrips = val || {};
        this.notifyTrips();
      });

      // Listen on Firebase /drivers
      const driversRef = ref(this.db, 'drivers');
      onValue(driversRef, (snapshot: DataSnapshot) => {
        const val = snapshot.val();
        if (val) {
          this.localDrivers = val;
          this.notifyDrivers();
        } else {
          INITIAL_DRIVERS.forEach((d) => {
            set(ref(this.db!, `drivers/${d.id}`), d);
          });
        }
      });

      // Listen on Firebase /users
      const usersRef = ref(this.db, 'users');
      onValue(usersRef, (snapshot: DataSnapshot) => {
        const val = snapshot.val();
        if (val) {
          this.localUsers = val;
          this.notifyUsers();
        } else {
          set(ref(this.db!, 'users'), this.localUsers);
        }
      });
    } catch (err) {
      console.warn('Could not connect to Firebase Realtime Database:', err);
      this.isFirebaseConnected = false;
    }
  }

  // --- Realtime Trips API ---

  public subscribeToTrips(callback: (trips: Record<string, TripRequest>) => void): () => void {
    this.listeners.trips.add(callback);
    // immediately call with current state
    callback(this.localTrips);

    return () => {
      this.listeners.trips.delete(callback);
    };
  }

  public subscribeToDrivers(callback: (drivers: Record<string, Driver>) => void): () => void {
    this.listeners.drivers.add(callback);
    callback(this.localDrivers);

    return () => {
      this.listeners.drivers.delete(callback);
    };
  }

  private notifyTrips() {
    try {
      localStorage.setItem(STORAGE_KEY_TRIPS, JSON.stringify(this.localTrips));
      this.broadcastChannel?.postMessage({
        type: 'TRIPS_SYNC',
        data: this.localTrips,
      });
    } catch {
      // ignore quota errors
    }
    this.listeners.trips.forEach((fn) => fn(this.localTrips));
  }

  private notifyDrivers() {
    try {
      localStorage.setItem(STORAGE_KEY_DRIVERS, JSON.stringify(this.localDrivers));
      this.broadcastChannel?.postMessage({
        type: 'DRIVERS_SYNC',
        data: this.localDrivers,
      });
    } catch {
      // ignore
    }
    this.listeners.drivers.forEach((fn) => fn(this.localDrivers));
  }

  public subscribeToUsers(callback: (users: Record<string, RegisteredUser>) => void): () => void {
    this.listeners.users.add(callback);
    callback(this.localUsers);

    return () => {
      this.listeners.users.delete(callback);
    };
  }

  private notifyUsers() {
    try {
      localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(this.localUsers));
      this.broadcastChannel?.postMessage({
        type: 'USERS_SYNC',
        data: this.localUsers,
      });
    } catch {
      // ignore
    }
    this.listeners.users.forEach((fn) => fn(this.localUsers));
  }

  /**
   * Registers a user or updates their last login.
   * If email is SUPER_ADMIN_EMAIL, role is ALWAYS 'admin'.
   * If new user, default role is 'pasajero'.
   */
  public async registerOrUpdateUser(userData: {
    uid: string;
    email: string;
    name: string;
    photoURL?: string;
    phone?: string;
  }): Promise<RegisteredUser> {
    const isSuperAdmin = userData.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
    const existing = this.localUsers[userData.uid];

    const role: UserRole = isSuperAdmin
      ? 'admin'
      : existing?.role
      ? existing.role
      : 'pasajero'; // Default role for any other user: only passenger!

    const user: RegisteredUser = {
      uid: userData.uid,
      name: userData.name,
      email: userData.email,
      photoURL: userData.photoURL,
      phone: userData.phone || existing?.phone || '+54 9 11 8844-3321',
      role: role,
      createdAt: existing?.createdAt || Date.now(),
      lastLoginAt: Date.now(),
      assignedDriverId: existing?.assignedDriverId,
    };

    this.localUsers[user.uid] = user;
    this.notifyUsers();

    if (this.db) {
      try {
        await set(ref(this.db, `users/${user.uid}`), user);
      } catch (e) {
        console.warn('Firebase set user error:', e);
      }
    }

    return user;
  }

  /**
   * Super Admin updates a user's role and permissions
   */
  public async updateUserRole(uid: string, role: UserRole, assignedDriverId?: string): Promise<void> {
    const user = this.localUsers[uid];
    if (!user) return;

    // Do not downgrade super admin
    if (user.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
      role = 'admin';
    }

    this.localUsers[uid] = {
      ...user,
      role,
      assignedDriverId: assignedDriverId !== undefined ? assignedDriverId : user.assignedDriverId,
    };
    this.notifyUsers();

    if (this.db) {
      try {
        await update(ref(this.db, `users/${uid}`), {
          role,
          assignedDriverId: assignedDriverId || null,
        });
      } catch (e) {
        console.warn('Firebase update user role error:', e);
      }
    }
  }

  /**
   * Super Admin removes a user
   */
  public async deleteUser(uid: string): Promise<void> {
    const user = this.localUsers[uid];
    if (user && user.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
      alert('No se puede eliminar la cuenta del Administrador Principal.');
      return;
    }

    delete this.localUsers[uid];
    this.notifyUsers();

    if (this.db) {
      try {
        await remove(ref(this.db, `users/${uid}`));
      } catch (e) {
        console.warn('Firebase remove user error:', e);
      }
    }
  }

  /**
   * Creates a new trip request
   */
  public async createTrip(trip: TripRequest): Promise<void> {
    this.localTrips[trip.id] = trip;
    this.notifyTrips();

    if (this.db) {
      try {
        const tripRef = ref(this.db, `trips/${trip.id}`);
        await set(tripRef, trip);
      } catch (e) {
        console.warn('Firebase set error:', e);
      }
    }
  }

  /**
   * Updates an existing trip
   */
  public async updateTrip(tripId: string, updates: Partial<TripRequest>): Promise<void> {
    if (this.localTrips[tripId]) {
      this.localTrips[tripId] = {
        ...this.localTrips[tripId],
        ...updates,
      };
      this.notifyTrips();
    }

    if (this.db) {
      try {
        const tripRef = ref(this.db, `trips/${tripId}`);
        await update(tripRef, updates);
      } catch (e) {
        console.warn('Firebase update error:', e);
      }
    }
  }

  /**
   * Updates a driver's state and live GPS position
   */
  public async updateDriver(driverId: string, updates: Partial<Driver>): Promise<void> {
    if (this.localDrivers[driverId]) {
      this.localDrivers[driverId] = {
        ...this.localDrivers[driverId],
        ...updates,
        lastUpdated: Date.now(),
      };
      this.notifyDrivers();
    }

    if (this.db) {
      try {
        const driverRef = ref(this.db, `drivers/${driverId}`);
        await update(driverRef, {
          ...updates,
          lastUpdated: Date.now(),
        });
      } catch (e) {
        console.warn('Firebase driver update error:', e);
      }
    }
  }

  /**
   * Adds or updates a driver
   */
  public async addDriver(driver: Driver): Promise<void> {
    this.localDrivers[driver.id] = driver;
    this.notifyDrivers();

    if (this.db) {
      try {
        await set(ref(this.db, `drivers/${driver.id}`), driver);
      } catch (e) {
        console.warn('Firebase addDriver error:', e);
      }
    }
  }

  /**
   * Deletes a driver from fleet
   */
  public async deleteDriver(driverId: string): Promise<void> {
    delete this.localDrivers[driverId];
    this.notifyDrivers();

    if (this.db) {
      try {
        await remove(ref(this.db, `drivers/${driverId}`));
      } catch (e) {
        console.warn('Firebase deleteDriver error:', e);
      }
    }
  }

  /**
   * Resets demo data (convenience for Control Center)
   */
  public resetToDefaultFleet(): void {
    const freshDrivers: Record<string, Driver> = {};
    INITIAL_DRIVERS.forEach((d) => {
      freshDrivers[d.id] = { ...d, isOnline: true, isBusy: false, currentTripId: null };
    });
    this.localDrivers = freshDrivers;
    this.localTrips = {};
    this.notifyDrivers();
    this.notifyTrips();

    if (this.db) {
      try {
        set(ref(this.db, 'drivers'), freshDrivers);
        set(ref(this.db, 'trips'), {});
      } catch (e) {
        console.warn('Firebase reset error:', e);
      }
    }
  }
}

export const realtimeDB = new RealtimeDatabaseManager();
