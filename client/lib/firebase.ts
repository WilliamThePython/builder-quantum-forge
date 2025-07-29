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

// Firebase configuration - you'll need to add your actual config
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "demo-api-key",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "3dtools-demo.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "3dtools-demo",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "3dtools-demo.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:123456789:web:abcdef123456789"
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);

// Configure auth providers
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('profile');
googleProvider.addScope('email');

export const githubProvider = new GithubAuthProvider();
githubProvider.addScope('user:email');

export const facebookProvider = new FacebookAuthProvider();
facebookProvider.addScope('email');

// Auth functions
export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);
export const signInWithGithub = () => signInWithPopup(auth, githubProvider);
export const signInWithFacebook = () => signInWithPopup(auth, facebookProvider);

export const signInWithEmail = (email: string, password: string) => 
  signInWithEmailAndPassword(auth, email, password);

export const signUpWithEmail = (email: string, password: string) => 
  createUserWithEmailAndPassword(auth, email, password);

export const resetPassword = (email: string) => 
  sendPasswordResetEmail(auth, email);

export const updateUserProfile = (updates: { displayName?: string; photoURL?: string }) => 
  updateProfile(auth.currentUser!, updates);

export const deleteUserAccount = () => {
  if (auth.currentUser) {
    return deleteUser(auth.currentUser);
  }
  throw new Error('No user to delete');
};

export const logOut = () => signOut(auth);

export const onAuthStateChange = (callback: (user: User | null) => void) => 
  onAuthStateChanged(auth, callback);

export { User };
