
import React from 'react';
import { HashRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import AdminUploadPage from './pages/AdminUploadPage';


import { RhymesWorkflowApp } from './pages/Rhymepicker';
import WizardApp, { ViewState as WizardViewState } from './pages/WizardApp';


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

const WIZARD_VIEW_STATES: readonly WizardViewState[] = ['LANDING', 'WIZARD', 'TITLES', 'SUMMARY', 'FINAL'];

const resolveWizardViewState = (value?: string): WizardViewState => {
  if (!value) {
    return 'LANDING';
  }
  const normalized = value.toUpperCase();
  return (WIZARD_VIEW_STATES as readonly string[]).includes(normalized) ? (normalized as WizardViewState) : 'LANDING';
};

const WizardRouteWithParam: React.FC = () => {
  const { view } = useParams<{ view?: string }>();
  return <WizardApp initialView={resolveWizardViewState(view)} />;
};


const App: React.FC = () => {
  return (
    <AuthProvider>
      <HashRouter>
        <div className="min-h-screen bg-gray-50 text-gray-800">
          
          <main className="p-4 sm:p-6 md:p-8">
            <Routes>
              <Route path="/" element={<RhymesWorkflowApp />} />
              <Route path="/sign-in" element={<Navigate to="/" replace />} />
              <Route path="/sign-up" element={<Navigate to="/" replace />} />
              <Route
                path="/wizard"
                element={
                  <ProtectedRoute>
                    <WizardApp />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/wizard/:view"
                element={
                  <ProtectedRoute>
                    <WizardRouteWithParam />
                  </ProtectedRoute>
                }
              />
             
              {/* <Route path="/rhymes" element={<RhymesWorkflowApp />} /> */}
              
              <Route
                path="/admin/upload"
                element={
                  <ProtectedRoute>
                    <AdminUploadPage />
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
