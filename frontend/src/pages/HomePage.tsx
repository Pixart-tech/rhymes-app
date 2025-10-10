
import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const HomePage: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="text-center p-12">Loading...</div>;
  }

  return (
    <div className="container mx-auto max-w-4xl text-center py-16">
      <h1 className="text-4xl md:text-5xl font-extrabold text-primary-800 mb-4">Welcome to the Book Selector</h1>
      <p className="text-lg text-gray-600 mb-8">
        Your one-stop solution for customizing school book packages for Nursery, LKG, and UKG.
      </p>
      {user ? (
        <div className="bg-white p-8 rounded-lg shadow-md border border-primary-200">
          <h2 className="text-2xl font-bold text-gray-800">Hello, {user.name}!</h2>
          <p className="mt-2 text-gray-600">Your registered school ID is:</p>
          <p className="text-4xl font-mono font-bold text-primary-600 my-4 tracking-widest bg-primary-50 p-3 rounded-md inline-block">{user.schoolId}</p>
          <div className="mt-6">
            <Link 
              to="/questionnaire" 
              className="bg-primary-600 text-white px-8 py-3 rounded-md font-semibold hover:bg-primary-700 transition-transform transform hover:scale-105"
            >
              Start Your Selection
            </Link>
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