import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { Loader2, School, Edit3, Eye, Plus } from 'lucide-react';

import { useAuth } from '../hooks/useAuth';
import { API_BASE_URL } from '../lib/utils';
import { Button } from './ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from './ui/card';
import { SchoolProfile, SchoolFormValues, SchoolServiceType } from '../types/types';
import { SchoolForm, SchoolFormSubmitPayload } from './SchoolProfileForm';

const API = API_BASE_URL || '/api';

const SERVICE_KEYS: SchoolServiceType[] = ['id_cards', 'report_cards', 'certificates'];

const createEmptyServiceSelection = (): Record<SchoolServiceType, boolean> => ({
  id_cards: false,
  report_cards: false,
  certificates: false
});

const servicesArrayFromSelection = (selection: Record<SchoolServiceType, boolean>): SchoolServiceType[] => {
  return SERVICE_KEYS.filter((key) => Boolean(selection?.[key]));
};

const selectionFromServicesArray = (
  services?: SchoolServiceType[] | null
): Record<SchoolServiceType, boolean> => {
  const selection = createEmptyServiceSelection();
  if (!services) {
    return selection;
  }
  services.forEach((service) => {
    if (SERVICE_KEYS.includes(service)) {
      selection[service] = true;
    }
  });
  return selection;
};

const getLogoSrc = (school: SchoolProfile): string | null => {
  if (school.logo_blob_base64) {
    return `data:image/jpeg;base64,${school.logo_blob_base64}`;
  }
  return school.logo_url ?? null;
};


export interface WorkspaceUserProfile {
  uid: string;
  email?: string | null;
  display_name?: string | null;
  role: 'super-admin' | 'user';
  school_ids: string[];
}

interface WorkspaceSession {
  user: WorkspaceUserProfile;
  schools: SchoolProfile[];
}

interface AuthPageProps {
  onAuth: (selection: { school: SchoolProfile; user: WorkspaceUserProfile }) => void;
}

const AuthPage: React.FC<AuthPageProps> = ({ onAuth }) => {
  const { user, signInWithGoogle, loading: authLoading, getIdToken } = useAuth();
  const [workspaceUser, setWorkspaceUser] = useState<WorkspaceUserProfile | null>(null);
  const [schools, setSchools] = useState<SchoolProfile[]>([]);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'create' | 'edit'>('list');
  const [editingSchool, setEditingSchool] = useState<SchoolProfile | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchWorkspace = useCallback(async () => {
    if (!user) {
      return;
    }
    setWorkspaceLoading(true);
    setWorkspaceError(null);

    try {
      const token = await getIdToken();
      if (!token) {
        throw new Error('Unable to fetch Firebase token');
      }

      const response = await axios.get<WorkspaceSession>(`${API}/users/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setWorkspaceUser(response.data.user);
      setSchools(response.data.schools);
      setView(response.data.schools.length === 0 ? 'create' : 'list');
    } catch (error) {
      console.error('Failed to load workspace', error);
      setWorkspaceError('Unable to load your workspace. Please try again.');
      toast.error('Unable to load your workspace. Please try again.');
    } finally {
      setWorkspaceLoading(false);
    }
  }, [user, getIdToken]);

  useEffect(() => {
    if (!user) {
      setWorkspaceUser(null);
      setSchools([]);
      setView('list');
      setEditingSchool(null);
      return;
    }
    void fetchWorkspace();
  }, [user, fetchWorkspace]);

  const buildFormValues = useCallback(
    (school?: SchoolProfile): SchoolFormValues => ({
      school_name: school?.school_name ?? '',
      logo_blob_base64: school?.logo_blob_base64 ?? null,
      email: school?.email ?? workspaceUser?.email ?? user?.email ?? '',
      phone: school?.phone ?? '',
      address: school?.address ?? '',
      tagline: school?.tagline ?? '',
      principal_name: school?.principal_name ?? '',
      principal_email: school?.principal_email ?? school?.email ?? workspaceUser?.email ?? user?.email ?? '',
      principal_phone: school?.principal_phone ?? school?.phone ?? '',
      service_type: selectionFromServicesArray(school?.service_type)
    }),
    [workspaceUser, user]
  );

  const currentFormValues = useMemo(() => {
    if (view === 'edit' && editingSchool) {
      return buildFormValues(editingSchool);
    }
    return buildFormValues();
  }, [view, editingSchool, buildFormValues]);

  const handleSchoolSelect = (school: SchoolProfile) => {
    if (!workspaceUser) {
      return;
    }
    onAuth({ school, user: workspaceUser });
  };

  const handleCreateSubmit = useCallback(
    async ({ values }: SchoolFormSubmitPayload) => {
      if (!workspaceUser) {
        return;
      }
      const selectedServices = servicesArrayFromSelection(values.service_type);
      if (selectedServices.length === 0) {
        toast.error('Please let us know whether you are taking ID cards, report cards, or certificates.');
        return;
      }
      const { service_type: _ignored, ...restValues } = values;
      setSubmitting(true);
      try {
        const token = await getIdToken();
        if (!token) {
          throw new Error('Unable to fetch Firebase token');
        }

        const response = await axios.post<SchoolProfile>(
          `${API}/schools`,
          {
            ...restValues,
            service_type: selectedServices,
            logo_blob_base64: values.logo_blob_base64 ?? null,
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const createdSchool = response.data;
        toast.success('School created successfully');
        setSchools((prev) => [...prev, createdSchool]);
        const updatedUser = {
          ...workspaceUser,
          school_ids: workspaceUser.school_ids.includes(createdSchool.school_id)
            ? workspaceUser.school_ids
            : [...workspaceUser.school_ids, createdSchool.school_id]
        };
        setWorkspaceUser(updatedUser);
        onAuth({ school: createdSchool, user: updatedUser });
      } catch (error) {
        console.error('Failed to create school', error);
        toast.error('Unable to create school. Please try again.');
      } finally {
        setSubmitting(false);
      }
    },
    [workspaceUser, getIdToken, onAuth]
  );

  const handleEditSubmit = useCallback(
    async ({ values }: SchoolFormSubmitPayload) => {
      if (!editingSchool) {
        return;
      }
      const selectedServices = servicesArrayFromSelection(values.service_type);
      if (selectedServices.length === 0) {
        toast.error('Please let us know whether you are taking ID cards, report cards, or certificates.');
        return;
      }
      const { service_type: _ignored, ...restValues } = values;
      setSubmitting(true);
      try {
        const token = await getIdToken();
        if (!token) {
          throw new Error('Unable to fetch Firebase token');
        }

        const response = await axios.put<SchoolProfile>(
          `${API}/schools/${editingSchool.school_id}`,
          {
            ...restValues,
            service_type: selectedServices,
            logo_blob_base64: values.logo_blob_base64 ?? editingSchool.logo_blob_base64 ?? null,
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const updatedSchool = response.data;
        toast.success('School details updated');
        setSchools((prev) =>
          prev.map((school) => (school.school_id === updatedSchool.school_id ? updatedSchool : school))
        );
        setEditingSchool(null);
        setView('list');
      } catch (error) {
        console.error('Failed to update school', error);
        toast.error('Unable to update school. Please try again.');
      } finally {
        setSubmitting(false);
      }
    },
    [editingSchool, getIdToken]
  );

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error('Failed to start Google sign-in', error);
      toast.error('Google sign-in was cancelled or failed. Please try again.');
    }
  };

  const isSuperAdmin = workspaceUser?.role === 'super-admin';
  const isCreateView = view === 'create' || schools.length === 0;
  const isEditView = view === 'edit' && Boolean(editingSchool);

  if (authLoading) {
    return <div className="flex min-h-screen items-center justify-center text-lg">Loading session...</div>;
  }

  if (!user) {
    const isProcessing = authLoading;
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-2xl border-0 bg-white/80 backdrop-blur-sm">
          <CardHeader className="text-center pb-8">
            <div className="w-20 h-20 bg-gradient-to-r from-orange-400 to-red-400 rounded-full flex items-center justify-center mx-auto mb-4">
              <School className="w-10 h-10 text-white" />
            </div>
            <CardTitle className="text-2xl font-bold text-gray-800 mb-2">Personalised Curriculum Generator</CardTitle>
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
                Choose your Google account to access your workspace. Roles are detected automatically—no manual email
                entry needed.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (workspaceLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-red-50">
        <div className="flex items-center gap-3 rounded-xl bg-white/90 px-6 py-4 shadow-lg">
          <Loader2 className="h-5 w-5 animate-spin text-primary-600" />
          <p className="text-gray-700">Loading your workspace…</p>
        </div>
      </div>
    );
  }

  if (workspaceError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-0 bg-white/90">
          <CardHeader>
            <CardTitle className="text-xl text-gray-800">Something went wrong</CardTitle>
            <p className="text-gray-600 text-sm">{workspaceError}</p>
          </CardHeader>
          <CardFooter>
            <Button onClick={() => fetchWorkspace()}>Try again</Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (!workspaceUser) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 flex items-center justify-center p-4">
      {isCreateView ? (
        <SchoolForm
          mode="create"
          initialValues={currentFormValues}
          submitting={submitting}
          onSubmit={handleCreateSubmit}
          onCancel={schools.length > 0 ? () => setView('list') : undefined}
        />
      ) : isEditView && editingSchool ? (
        <SchoolForm
          mode="edit"
          initialValues={currentFormValues}
          submitting={submitting}
          onSubmit={handleEditSubmit}
          onCancel={() => {
            setEditingSchool(null);
            setView('list');
          }}
        />
      ) : (
        <Card className="w-full max-w-5xl border-0 bg-white/85 backdrop-blur">
          <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm text-gray-500">Signed in as</p>
              <CardTitle className="text-2xl text-gray-800">
                {workspaceUser.display_name || user.name || 'School Admin'}
              </CardTitle>
              <p className="text-gray-600">{workspaceUser.email}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              {isSuperAdmin && (
                <Button asChild variant="outline">
                  <Link to="/admin/upload">Admin dashboard</Link>
                </Button>
              )}
              <Button onClick={() => { setEditingSchool(null); setView('create'); }}>
                <Plus className="h-4 w-4" />
                Create new school
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {schools.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-gray-600">
                <p>No schools found yet.</p>
                <Button className="mt-4" onClick={() => setView('create')}>
                  Create your first school
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {schools.map((school) => {
                  const logoSrc = getLogoSrc(school);
                  const canEdit = school.created_by_user_id === workspaceUser.uid;
                  return (
                    <Card key={school.school_id} className="border border-orange-100 shadow-sm">
                      <CardHeader className="space-y-2">
                        <div className="flex items-center gap-3">
                          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 text-orange-600">
                            {logoSrc ? (
                              <img
                                src={logoSrc}
                                alt={school.school_name}
                                className="h-12 w-12 rounded-full object-cover"
                              />
                            ) : (
                              <School className="h-6 w-6" />
                            )}
                          </div>
                          <div>
                            <CardTitle className="text-lg text-gray-800">{school.school_name}</CardTitle>
                            <p className="text-xs uppercase tracking-wide text-gray-500">ID: {school.school_id}</p>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm text-gray-600">
                        {school.email && <p>Email: {school.email}</p>}
                        {school.phone && <p>Phone: {school.phone}</p>}
                        {school.address && <p className="line-clamp-2">Address: {school.address}</p>}
                        {school.tagline && <p className="italic text-gray-500">{school.tagline}</p>}
                      </CardContent>
                      <CardFooter className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          className="flex-1"
                          onClick={() => handleSchoolSelect(school)}
                        >
                          <Eye className="h-4 w-4" />
                          View
                        </Button>
                        {canEdit && (
                          <Button
                            variant="outline"
                            className="flex-1"
                            onClick={() => {
                              setEditingSchool(school);
                              setView('edit');
                            }}
                          >
                            <Edit3 className="h-4 w-4" />
                            Edit
                          </Button>
                        )}
                      </CardFooter>
                    </Card>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AuthPage;
