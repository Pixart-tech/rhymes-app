
import React, { createContext, useState, useContext, useEffect, useCallback, ReactNode } from 'react';

interface User {
  name: string;
  email: string;
  schoolId: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: () => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Mock function to simulate creating/fetching a school ID
const getSchoolIdForUser = (email: string): string => {
  let schoolMappings = JSON.parse(localStorage.getItem('schoolMappings') || '{}');
  if (schoolMappings[email]) {
    return schoolMappings[email];
  }
  
  const existingIds = Object.values(schoolMappings).map(id => parseInt(id as string, 10));
  const maxId = existingIds.length > 0 ? Math.max(...existingIds) : 1000;
  const newId = (maxId + 1).toString();
  
  schoolMappings[email] = newId;
  localStorage.setItem('schoolMappings', JSON.stringify(schoolMappings));
  return newId;
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        setUser(JSON.parse(storedUser));
      }
    } catch (error) {
      console.error("Failed to parse user from localStorage", error);
      localStorage.removeItem('user');
    } finally {
      setLoading(false);
    }
  }, []);

  const signIn = useCallback(() => {
    // Mock Google Sign-In
    const mockEmail = "test.school@example.com";
    const schoolId = getSchoolIdForUser(mockEmail);
    const newUser: User = { name: "Test School Admin", email: mockEmail, schoolId };
    localStorage.setItem('user', JSON.stringify(newUser));
    setUser(newUser);
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem('user');
    setUser(null);
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