
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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const getSchoolIdForUser = (email: string): string => {
  const stored = localStorage.getItem('schoolMappings');
  let schoolMappings: Record<string, string> = {};

  if (stored) {
    try {
      schoolMappings = JSON.parse(stored);
    } catch (error) {
      console.warn('Failed to parse school mappings, resetting storage', error);
      schoolMappings = {};
    }
  }

  if (schoolMappings[email]) {
    return schoolMappings[email];
  }

  const existingIds = Object.values(schoolMappings).map((id) => parseInt(id as string, 10)).filter((value) => !Number.isNaN(value));
  const maxId = existingIds.length > 0 ? Math.max(...existingIds) : 1000;
  const newId = (maxId + 1).toString();

  schoolMappings[email] = newId;
  localStorage.setItem('schoolMappings', JSON.stringify(schoolMappings));
  return newId;
};

const buildUserFromFirebase = (firebaseUser: FirebaseUser): User => {
  const fallbackEmail = `${firebaseUser.uid}@no-email.firebaseapp`;
  const email = firebaseUser.email ?? fallbackEmail;
  const schoolId = getSchoolIdForUser(email);

  return {
    name: firebaseUser.displayName || firebaseUser.email || 'School Admin',
    email,
    schoolId
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

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
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
