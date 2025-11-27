
import React, { createContext, useState, useContext, useEffect, useCallback, ReactNode } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  User as FirebaseUser
} from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';

interface User {
  name: string;
  email: string;
  schoolId: string;
  role: UserRole;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, displayName?: string) => Promise<void>;
  signOut: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
  /**
   * @deprecated Use signInWithGoogle instead. Kept for compatibility.
   */
  signIn: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export type UserRole = 'super-admin' | 'user';

const SUPER_ADMIN_EMAIL = 'unplugstories2@gmail.com';

const deriveRoleFromEmail = (email: string | null | undefined): UserRole => {
  if (!email) {
    return 'user';
  }

  return email.toLowerCase() === SUPER_ADMIN_EMAIL ? 'super-admin' : 'user';
};

const buildUserFromFirebase = (firebaseUser: FirebaseUser): User => {
  const fallbackEmail = `${firebaseUser.uid}@no-email.firebaseapp`;
  const email = firebaseUser.email ?? fallbackEmail;

  return {
    name: firebaseUser.displayName || firebaseUser.email || 'School Admin',
    email,
    schoolId: firebaseUser.uid,
    role: deriveRoleFromEmail(email)
  };
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        const nextUser = buildUserFromFirebase(firebaseUser);
        localStorage.setItem('user', JSON.stringify(nextUser));
        setUser(nextUser);
      } else {
        localStorage.removeItem('user');
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signIn = useCallback(async () => {
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (error) {
      console.error('Google sign-in failed', error);
      throw error;
    }
  }, []);

  const signInWithGoogle = signIn;

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (error) {
      console.error('Email/password sign-in failed', error);
      throw error;
    }
  }, []);

  const signUpWithEmail = useCallback(
    async (email: string, password: string, displayName?: string) => {
      try {
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);

        if (displayName) {
          await updateProfile(credential.user, { displayName });
        }
      } catch (error) {
        console.error('Email/password sign-up failed', error);
        throw error;
      }
    },
    []
  );

  const signOut = useCallback(async () => {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error('Google sign-out failed', error);
      throw error;
    } finally {
      localStorage.removeItem('user');
      setUser(null);
    }
  }, []);

  const getIdToken = useCallback(async () => {
    if (!auth.currentUser) {
      return null;
    }

    return auth.currentUser.getIdToken();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signIn,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        signOut,
        getIdToken
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
