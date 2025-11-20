import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';

import { useAuth } from '../hooks/useAuth';
import { API_BASE_URL } from '../lib/utils';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Loader2, School } from 'lucide-react';

const API = API_BASE_URL || '/api';

export interface SchoolProfile {
  school_id: string;
  school_name: string;
  [key: string]: unknown;
}

interface AuthPageProps {
  onAuth: (school: SchoolProfile) => void;
}

const AuthPage: React.FC<AuthPageProps> = ({ onAuth }) => {
  const { user, signIn, loading: authLoading } = useAuth();
  const [syncingSchool, setSyncingSchool] = useState(false);
  const syncAttemptRef = useRef(false);

  useEffect(() => {
    if (!user || syncAttemptRef.current) {
      return;
    }

    let isMounted = true;
    syncAttemptRef.current = true;

    const syncSchoolProfile = async () => {
      setSyncingSchool(true);
      try {
        const response = await axios.post(`${API}/auth/login`, {
          school_id: user.schoolId,
          school_name: user.name
        });

        if (isMounted) {
          toast.success('Signed in with Google');
          onAuth(response.data);
        }
      } catch (error) {
        console.error('Auth error:', error);
        if (isMounted) {
          syncAttemptRef.current = false;
          toast.error('Unable to open your workspace. Please try again.');
        }
      } finally {
        if (isMounted) {
          setSyncingSchool(false);
        }
      }
    };

    void syncSchoolProfile();

    return () => {
      isMounted = false;
    };
  }, [user, onAuth]);

  const handleGoogleSignIn = async () => {
    try {
      await signIn();
    } catch (error) {
      console.error('Failed to start Google sign-in', error);
      toast.error('Google sign-in was cancelled or failed. Please try again.');
    }
  };

  const isProcessing = authLoading || syncingSchool;

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-2xl border-0 bg-white/80 backdrop-blur-sm">
        <CardHeader className="text-center pb-8">
          <div className="w-20 h-20 bg-gradient-to-r from-orange-400 to-red-400 rounded-full flex items-center justify-center mx-auto mb-4">
            <School className="w-10 h-10 text-white" />
          </div>
          <CardTitle className="text-2xl font-bold text-gray-800 mb-2">Personalised Circulum generator</CardTitle>
          <p className="text-gray-600 text-sm">Sign in with your Google account to continue</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isProcessing}
              className="w-full h-12 bg-white text-gray-800 border border-gray-200 hover:bg-gray-50 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-70"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin text-primary-600" />
                  Getting your workspace ready...
                </>
              ) : (
                <>
                  <svg className="h-5 w-5" viewBox="0 0 533.5 544.3" xmlns="http://www.w3.org/2000/svg">
                    <path fill="#4285f4" d="M533.5 278.4c0-17.4-1.6-34.1-4.6-50.2H272v95.1h147.3c-6.4 34.7-25.6 64.1-54.6 83.7v68h88.4c51.7-47.6 80.4-117.8 80.4-196.6z" />
                    <path fill="#34a853" d="M272 544.3c73.8 0 135.8-24.5 181.1-66.3l-88.4-68c-24.5 16.4-55.7 26-92.7 26-71.3 0-131.7-48.2-153.4-113.1H28.1v70.9c45 87 137 150.5 243.9 150.5z" />
                    <path fill="#fbbc04" d="M118.6 322.9c-8.6-25.4-8.6-52.6 0-78l.1-70.9H28.1C3.1 208.5-7.5 250.6-7.5 294s10.6 85.4 35.6 120.1l90.5-69.1z" />
                    <path fill="#ea4335" d="M272 107.7c39.9-.6 78.3 14.6 107.5 41.6l80-80C417.6 24.2 346.5-3.5 272 0 165.1 0 73.1 63.5 28.1 150.5l90.5 70.9C140.3 155.9 200.7 107.7 272 107.7z" />
                  </svg>
                  Continue with Google
                </>
              )}
            </Button>
            <p className="text-sm text-gray-600 text-center">
              No manual email entry needed—just choose your Google account and we&apos;ll get your school dashboard ready.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AuthPage;
