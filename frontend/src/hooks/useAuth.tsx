
import React, { createContext, useState, useContext, useEffect, useCallback, ReactNode } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut, User as FirebaseUser } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';

interface User {
  name: string;
  email: string;
  schoolId: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const buildUserFromFirebase = (firebaseUser: FirebaseUser): User => {
  const fallbackEmail = `${firebaseUser.uid}@no-email.firebaseapp`;
  const email = firebaseUser.email ?? fallbackEmail;

  return {
    name: firebaseUser.displayName || firebaseUser.email || 'School Admin',
    email,
    schoolId: firebaseUser.uid
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
    <AuthContext.Provider value={{ user, loading, signIn, signOut, getIdToken }}>
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
