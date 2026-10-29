export interface GeoLocation {
  lat: number;
  lng: number;
  address?: string;
  heading?: number; // heading in degrees (0 = North)
}

export type TripStatus =
  | 'solicitado'      // Buscando conductor
  | 'aceptado'        // Conductor asignado, yendo a recoger
  | 'en_camino'       // Conductor cerca / en camino
  | 'llegado'         // Conductor esperando en punto de recogida
  | 'en_viaje'        // Pasajero a bordo, hacia destino
  | 'completado'      // Viaje finalizado
  | 'cancelado';      // Cancelado por usuario o chofer

export type VehicleCategory = 'lite' | 'black' | 'van';

export interface VehicleOption {
  id: VehicleCategory;
  name: string;
  description: string;
  capacity: number;
  icon: string;
}

export const SUPER_ADMIN_EMAIL = 'jorgegaravagno@gmail.com';

export type UserRole = 'admin' | 'control' | 'chofer' | 'pasajero';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  photoURL?: string;
  phone?: string;
  role?: UserRole;
}

export interface RegisteredUser {
  uid: string;
  name: string;
  email: string;
  photoURL?: string;
  phone?: string;
  role: UserRole;
  createdAt: number;
  lastLoginAt: number;
  assignedDriverId?: string;
}

export interface TripRequest {
  id: string;
  passengerId: string;
  passengerName: string;
  passengerEmail?: string;
  passengerPhoto?: string;
  passengerPhone: string;
  origin: GeoLocation;
  destination?: GeoLocation;
  category: VehicleCategory;
  estimatedPrice?: number;
  estimatedDistanceKm?: number;
  estimatedDurationMin?: number;
  status: TripStatus;
  createdAt: number;
  acceptedAt?: number;
  pickedUpAt?: number;
  completedAt?: number;
  
  // Asignación de conductor
  driverId?: string;
  driverName?: string;
  driverPhone?: string;
  driverVehicle?: string;
  driverPlate?: string;
  driverRating?: number;
  driverLocation?: GeoLocation;

  // Distancia y tiempo dinámicos hacia el pasajero o destino
  driverDistanceToPickupMeters?: number;
  driverTimeToPickupSeconds?: number;
}

export interface Driver {
  id: string;
  name: string;
  phone: string;
  vehicleModel: string;
  licensePlate: string;
  category: VehicleCategory;
  rating: number;
  totalTrips: number;
  isOnline: boolean;
  isBusy: boolean;
  currentTripId?: string | null;
  location: GeoLocation;
  lastUpdated: number;
  simulatingMovement?: boolean;
}

export interface OSRMRouteResult {
  coordinates: [number, number][]; // [lat, lng] array for Leaflet
  distanceMeters: number;
  durationSeconds: number;
  summary?: string;
}

export interface FirebaseSettings {
  apiKey: string;
  authDomain: string;
  databaseURL: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}
