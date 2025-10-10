
import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Header from './components/Header';
import HomePage from './pages/HomePage';
import QuestionnairePage from './pages/QuestionnairePage';
import AdminUploadPage from './pages/AdminUploadPage';
import PdfViewerPage from './pages/PdfViewerPage';
import GridPage from './pages/GridPage';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="text-center p-12">Loading session...</div>;
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};


const App: React.FC = () => {
  return (
    <AuthProvider>
      <HashRouter>
        <div className="min-h-screen bg-gray-50 text-gray-800">
          <Header />
          <main className="p-4 sm:p-6 md:p-8">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route
                path="/questionnaire"
                element={
                  <ProtectedRoute>
                    <QuestionnairePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/grid"
                element={
                  <ProtectedRoute>
                    <GridPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/upload"
                element={
                  <ProtectedRoute>
                    <AdminUploadPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/pdf/:id"
                element={
                  <ProtectedRoute>
                    <PdfViewerPage />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </main>
        </div>
      </HashRouter>
    </AuthProvider>
  );
};

export default App;