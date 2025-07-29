import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  GithubAuthProvider,
  FacebookAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile,
  deleteUser,
  type User
} from 'firebase/auth';

// Check if we have real Firebase credentials
const hasRealFirebaseConfig = import.meta.env.VITE_FIREBASE_API_KEY &&
  import.meta.env.VITE_FIREBASE_API_KEY !== "demo-api-key";

// Firebase configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "demo-api-key",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "3dtools-demo.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "3dtools-demo",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "3dtools-demo.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:123456789:web:abcdef123456789"
};

// Initialize Firebase only if we have real config
let app: any = null;
let auth: any = null;

if (hasRealFirebaseConfig) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    auth = getAuth(app);
  } catch (error) {
    console.warn('Firebase initialization failed, using mock auth:', error);
  }
}

export { auth };

// Mock User interface for demo mode
interface MockUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

// Mock authentication state for demo mode
let mockUser: MockUser | null = null;
let mockAuthCallbacks: ((user: MockUser | null) => void)[] = [];

// Configure auth providers (only if Firebase is available)
let googleProvider: GoogleAuthProvider | null = null;
let githubProvider: GithubAuthProvider | null = null;
let facebookProvider: FacebookAuthProvider | null = null;

if (hasRealFirebaseConfig && auth) {
  googleProvider = new GoogleAuthProvider();
  googleProvider.addScope('profile');
  googleProvider.addScope('email');

  githubProvider = new GithubAuthProvider();
  githubProvider.addScope('user:email');

  facebookProvider = new FacebookAuthProvider();
  facebookProvider.addScope('email');
}

// Mock auth functions for demo mode
const createMockUser = (email: string, displayName?: string): MockUser => ({
  uid: Date.now().toString(),
  email,
  displayName: displayName || email.split('@')[0],
  photoURL: `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`
});

const setMockUser = (user: MockUser | null) => {
  mockUser = user;
  mockAuthCallbacks.forEach(callback => callback(user));
};

// Auth functions with fallback to mock
export const signInWithGoogle = async () => {
  if (hasRealFirebaseConfig && auth && googleProvider) {
    return signInWithPopup(auth, googleProvider);
  } else {
    // Mock Google sign in
    const mockGoogleUser = createMockUser('demo@gmail.com', 'Demo User');
    setMockUser(mockGoogleUser);
    return Promise.resolve();
  }
};

export const signInWithGithub = async () => {
  if (hasRealFirebaseConfig && auth && githubProvider) {
    return signInWithPopup(auth, githubProvider);
  } else {
    // Mock GitHub sign in
    const mockGithubUser = createMockUser('demo@github.com', 'GitHub Demo');
    setMockUser(mockGithubUser);
    return Promise.resolve();
  }
};

export const signInWithFacebook = async () => {
  if (hasRealFirebaseConfig && auth && facebookProvider) {
    return signInWithPopup(auth, facebookProvider);
  } else {
    // Mock Facebook sign in
    const mockFacebookUser = createMockUser('demo@facebook.com', 'Facebook Demo');
    setMockUser(mockFacebookUser);
    return Promise.resolve();
  }
};

export const signInWithEmail = async (email: string, password: string) => {
  if (hasRealFirebaseConfig && auth) {
    return signInWithEmailAndPassword(auth, email, password);
  } else {
    // Mock email sign in
    const mockEmailUser = createMockUser(email);
    setMockUser(mockEmailUser);
    return Promise.resolve();
  }
};

export const signUpWithEmail = async (email: string, password: string) => {
  if (hasRealFirebaseConfig && auth) {
    return createUserWithEmailAndPassword(auth, email, password);
  } else {
    // Mock email sign up
    const mockEmailUser = createMockUser(email);
    setMockUser(mockEmailUser);
    return Promise.resolve();
  }
};

export const resetPassword = async (email: string) => {
  if (hasRealFirebaseConfig && auth) {
    return sendPasswordResetEmail(auth, email);
  } else {
    // Mock password reset
    console.log('Mock password reset sent to:', email);
    return Promise.resolve();
  }
};

export const updateUserProfile = async (updates: { displayName?: string; photoURL?: string }) => {
  if (hasRealFirebaseConfig && auth && auth.currentUser) {
    return updateProfile(auth.currentUser, updates);
  } else {
    // Mock profile update
    if (mockUser) {
      mockUser = { ...mockUser, ...updates };
      setMockUser(mockUser);
    }
    return Promise.resolve();
  }
};

export const deleteUserAccount = async () => {
  if (hasRealFirebaseConfig && auth && auth.currentUser) {
    return deleteUser(auth.currentUser);
  } else {
    // Mock account deletion
    setMockUser(null);
    return Promise.resolve();
  }
};

export const logOut = async () => {
  if (hasRealFirebaseConfig && auth) {
    return signOut(auth);
  } else {
    // Mock sign out
    setMockUser(null);
    return Promise.resolve();
  }
};

export const onAuthStateChange = (callback: (user: any) => void) => {
  if (hasRealFirebaseConfig && auth) {
    return onAuthStateChanged(auth, callback);
  } else {
    // Mock auth state change
    mockAuthCallbacks.push(callback);
    // Immediately call with current mock user
    callback(mockUser);

    // Return unsubscribe function
    return () => {
      const index = mockAuthCallbacks.indexOf(callback);
      if (index > -1) {
        mockAuthCallbacks.splice(index, 1);
      }
    };
  }
};

export type { User };
