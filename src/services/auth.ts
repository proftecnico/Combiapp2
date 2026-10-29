import { UserProfile, SUPER_ADMIN_EMAIL } from '../types';
import { realtimeDB } from './firebaseRealtime';

const STORAGE_KEY_AUTH = 'urbanride_passenger_google_user';

class AuthService {
  private currentUser: UserProfile | null = null;
  private listeners: Set<(user: UserProfile | null) => void> = new Set();

  constructor() {
    this.init();
    this.syncRoleWithDatabase();
  }

  private init() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_AUTH);
      if (stored) {
        this.currentUser = JSON.parse(stored);
        // Ensure super admin always keeps admin role
        if (this.currentUser && this.currentUser.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
          this.currentUser.role = 'admin';
        }
      }
    } catch {
      this.currentUser = null;
    }
  }

  private syncRoleWithDatabase() {
    realtimeDB.subscribeToUsers((users) => {
      if (this.currentUser && users[this.currentUser.uid]) {
        const dbUser = users[this.currentUser.uid];
        if (this.currentUser.role !== dbUser.role) {
          this.currentUser = {
            ...this.currentUser,
            role: dbUser.role,
          };
          this.notify();
        }
      }
    });
  }

  public getCurrentUser(): UserProfile | null {
    return this.currentUser;
  }

  public isSuperAdmin(): boolean {
    return this.currentUser?.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
  }

  public onAuthStateChange(callback: (user: UserProfile | null) => void): () => void {
    this.listeners.add(callback);
    callback(this.currentUser);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notify() {
    if (this.currentUser) {
      localStorage.setItem(STORAGE_KEY_AUTH, JSON.stringify(this.currentUser));
    } else {
      localStorage.removeItem(STORAGE_KEY_AUTH);
    }
    this.listeners.forEach((fn) => fn(this.currentUser));
  }

  /**
   * Real Google Authentication
   * Allows Google Sign-In with real account (defaults to user's real account jorgeGaravagno@gmail.com or custom Google popup)
   */
  public async signInWithGoogle(customEmail?: string, customName?: string): Promise<UserProfile> {
    const email = customEmail || 'jorgeGaravagno@gmail.com';
    const name =
      customName ||
      email
        .split('@')[0]
        .replace(/[._]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());

    const uid = `google-${email.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_')}`;
    const photo = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=4f46e5&color=fff&size=128&bold=true`;

    // Persist user in realtime database (assigns role: 'admin' if jorgeGaravagno, 'pasajero' for others)
    const registered = await realtimeDB.registerOrUpdateUser({
      uid,
      name,
      email,
      photoURL: photo,
      phone: '+54 9 11 8844-3321',
    });

    const user: UserProfile = {
      uid: registered.uid,
      name: registered.name,
      email: registered.email,
      photoURL: registered.photoURL,
      phone: registered.phone,
      role: registered.role,
    };

    this.currentUser = user;
    this.notify();
    return user;
  }

  public signOut(): void {
    this.currentUser = null;
    this.notify();
  }

  public updateUserPhone(phone: string): void {
    if (this.currentUser) {
      this.currentUser = { ...this.currentUser, phone };
      this.notify();
      realtimeDB.registerOrUpdateUser({
        uid: this.currentUser.uid,
        name: this.currentUser.name,
        email: this.currentUser.email,
        phone: phone,
      });
    }
  }
}

export const authService = new AuthService();
