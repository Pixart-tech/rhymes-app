
import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Header from './components/Header';
import HomePage from './pages/HomePage';
import QuestionnairePage from './pages/QuestionnairePage';
import AdminUploadPage from './pages/AdminUploadPage';
import PdfViewerPage from './pages/PdfViewerPage';
import GridPage from './pages/GridPage';
import RhymePicker, { RhymesWorkflowApp } from './pages/Rhymepicker';


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
          
          <main className="p-4 sm:p-6 md:p-8">
            <Routes>
              <Route path="/" element={<RhymesWorkflowApp />} />
              <Route path="/sign-in" element={<RhymesWorkflowApp />} />
              <Route path="/sign-up" element={<RhymesWorkflowApp />} />
              <Route path='/Home' element={<HomePage/>}/>
              <Route
                path="/questionnaire"
                element={
                  <ProtectedRoute>
                    <QuestionnairePage />
                  </ProtectedRoute>
                }
              />
              {/* <Route path="/rhymes" element={<RhymesWorkflowApp />} /> */}
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
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>

          </main>
        </div>
      </HashRouter>
    </AuthProvider>
  );
};

export default App;