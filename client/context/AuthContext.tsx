import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { 
  User,
  onAuthStateChange,
  signInWithGoogle,
  signInWithGithub,
  signInWithFacebook,
  signInWithEmail,
  signUpWithEmail,
  resetPassword,
  updateUserProfile,
  deleteUserAccount,
  logOut
} from '../lib/firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  
  // Sign in methods
  signInWithGoogle: () => Promise<void>;
  signInWithGithub: () => Promise<void>;
  signInWithFacebook: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  
  // Sign up methods
  signUpWithEmail: (email: string, password: string, displayName?: string) => Promise<void>;
  
  // Account management
  resetPassword: (email: string) => Promise<void>;
  updateProfile: (updates: { displayName?: string; photoURL?: string }) => Promise<void>;
  deleteAccount: () => Promise<void>;
  signOut: () => Promise<void>;
  
  // Utility
  clearError: () => void;
  isAuthenticated: boolean;
  isPremium: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Listen for auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChange((user) => {
      setUser(user);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // Helper function to handle auth errors
  const handleAuthError = (error: any) => {
    console.error('Auth error:', error);
    
    switch (error.code) {
      case 'auth/user-not-found':
        setError('No account found with this email address.');
        break;
      case 'auth/wrong-password':
        setError('Incorrect password.');
        break;
      case 'auth/email-already-in-use':
        setError('An account with this email already exists.');
        break;
      case 'auth/weak-password':
        setError('Password should be at least 6 characters.');
        break;
      case 'auth/invalid-email':
        setError('Invalid email address.');
        break;
      case 'auth/popup-closed-by-user':
        setError('Sign-in popup was closed before completing the sign-in.');
        break;
      case 'auth/account-exists-with-different-credential':
        setError('An account already exists with the same email but different sign-in credentials.');
        break;
      default:
        setError(error.message || 'An authentication error occurred.');
    }
  };

  // Sign in methods
  const handleSignInWithGoogle = async () => {
    try {
      setError(null);
      setLoading(true);
      await signInWithGoogle();
    } catch (error) {
      handleAuthError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignInWithGithub = async () => {
    try {
      setError(null);
      setLoading(true);
      await signInWithGithub();
    } catch (error) {
      handleAuthError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignInWithFacebook = async () => {
    try {
      setError(null);
      setLoading(true);
      await signInWithFacebook();
    } catch (error) {
      handleAuthError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignInWithEmail = async (email: string, password: string) => {
    try {
      setError(null);
      setLoading(true);
      await signInWithEmail(email, password);
    } catch (error) {
      handleAuthError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUpWithEmail = async (email: string, password: string, displayName?: string) => {
    try {
      setError(null);
      setLoading(true);
      
      await signUpWithEmail(email, password);
      
      // Update profile with display name if provided
      if (displayName) {
        await updateUserProfile({ displayName });
      }
    } catch (error) {
      handleAuthError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (email: string) => {
    try {
      setError(null);
      await resetPassword(email);
    } catch (error) {
      handleAuthError(error);
    }
  };

  const handleUpdateProfile = async (updates: { displayName?: string; photoURL?: string }) => {
    try {
      setError(null);
      await updateUserProfile(updates);
    } catch (error) {
      handleAuthError(error);
    }
  };

  const handleDeleteAccount = async () => {
    try {
      setError(null);
      await deleteUserAccount();
    } catch (error) {
      handleAuthError(error);
    }
  };

  const handleSignOut = async () => {
    try {
      setError(null);
      await logOut();
    } catch (error) {
      handleAuthError(error);
    }
  };

  const clearError = () => setError(null);

  // Computed properties
  const isAuthenticated = !!user;
  
  // For now, premium status is based on custom claims or metadata
  // In a real app, you'd check user.customClaims or a database
  const isPremium = false; // TODO: Implement premium checking logic

  const value: AuthContextType = {
    user,
    loading,
    error,
    signInWithGoogle: handleSignInWithGoogle,
    signInWithGithub: handleSignInWithGithub,
    signInWithFacebook: handleSignInWithFacebook,
    signInWithEmail: handleSignInWithEmail,
    signUpWithEmail: handleSignUpWithEmail,
    resetPassword: handleResetPassword,
    updateProfile: handleUpdateProfile,
    deleteAccount: handleDeleteAccount,
    signOut: handleSignOut,
    clearError,
    isAuthenticated,
    isPremium
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
