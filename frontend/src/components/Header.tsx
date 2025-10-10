
import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const Header: React.FC = () => {
  const { user, signIn, signOut } = useAuth();

  const activeLinkClass = "text-white bg-primary-700";
  const inactiveLinkClass = "text-gray-300 hover:bg-primary-600 hover:text-white";
  const linkBaseClass = "px-3 py-2 rounded-md text-sm font-medium transition-colors";

  return (
    <header className="bg-primary-800 shadow-md">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <div className="flex-shrink-0">
               <NavLink to="/" className="text-white text-xl font-bold">Book Selector</NavLink>
            </div>
            <div className="hidden md:block">
              <div className="ml-10 flex items-baseline space-x-4">
                {user && (
                  <>
                    <NavLink to="/questionnaire" className={({isActive}) => `${linkBaseClass} ${isActive ? activeLinkClass : inactiveLinkClass}`}>Questionnaire</NavLink>
                    <NavLink to="/grid" className={({isActive}) => `${linkBaseClass} ${isActive ? activeLinkClass : inactiveLinkClass}`}>View Grid</NavLink>
                    <NavLink to="/admin/upload" className={({isActive}) => `${linkBaseClass} ${isActive ? activeLinkClass : inactiveLinkClass}`}>Upload PDF</NavLink>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center">
            {user ? (
              <>
                <span className="text-gray-300 text-sm mr-4 hidden sm:inline">School ID: {user.schoolId}</span>
                <button
                  onClick={signOut}
                  className="bg-red-600 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-red-700 transition-colors"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <button
                onClick={signIn}
                className="bg-primary-600 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-primary-700 transition-colors"
              >
                Sign in with Google
              </button>
            )}
          </div>
        </div>
      </nav>
    </header>
  );
};

export default Header;