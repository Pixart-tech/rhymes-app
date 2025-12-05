
import React, { useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import type { SchoolProfile } from '../types/types';
import { loadPersistedAppState } from '../lib/storage';

interface HomePageProps {
  onBackToMode?: () => void;
  school?: SchoolProfile | null;
  onStartBookSelection?: () => void;
}

const HomePage: React.FC<HomePageProps> = ({ onBackToMode, school, onStartBookSelection }) => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const persistedSchool = useMemo<SchoolProfile | null>(() => {
    const persistedState = loadPersistedAppState() as { school?: SchoolProfile | null } | null;
    return persistedState?.school ?? null;
  }, []);
  const handleBackToMenu = () => {
    if (typeof onBackToMode === 'function') {
      onBackToMode();
    }
    navigate('/');
  };
  const handleStartBookSelection = () => {
    if (typeof onStartBookSelection === 'function') {
      console.log('Starting book selection via callback');
      onStartBookSelection();
    } else {
      navigate('/wizard');
    }
  };
  const resolvedSchoolId = school?.school_id ?? persistedSchool?.school_id ?? user?.schoolId ?? null;

  if (loading) {
    return <div className="text-center p-12">Loading...</div>;
  }

  return (
    <div className="container mx-auto max-w-4xl text-center py-16">
      <Button onClick={handleBackToMenu}>Back to  menu </Button>
      <br></br>
      <h1 className="text-4xl md:text-5xl font-extrabold text-primary-800 mb-4">Welcome to the Book Selector</h1>
      <p className="text-lg text-gray-600 mb-8">
        Your one-stop solution for customizing school book packages for Nursery, LKG, and UKG.
      </p>  
      {user ? (
        <div className="bg-white p-8 rounded-lg shadow-md border border-primary-200">
          <h2 className="text-2xl font-bold text-gray-800">Hello, {user.name}!</h2>
          <div className="mt-6 flex flex-col items-center gap-4">
            <Button
              type="button"
              onClick={handleStartBookSelection}
              className="w-full sm:w-auto bg-primary-600 text-white px-8 py-3 font-semibold hover:bg-primary-700 transition-transform hover:scale-105"
            >
              Start Book Selection
            </Button>
          </div>
          
        </div>
      ) : (
        <div className="mt-10">
          <p className="text-gray-700">Please sign in to begin creating your book package.</p>
        </div>
      )}
    </div>
  );
};

export default HomePage;
