import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { Loader2, School, Edit3, Eye, Plus, RefreshCw, Trash2, UserRoundPen } from 'lucide-react';

import { useAuth } from '../hooks/useAuth';
import { API_BASE_URL } from '../lib/utils';
import { Button } from './ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from './ui/card';
import {
  AdminSchoolProfile,
  SchoolProfile,
  SchoolFormValues,
  SchoolServiceType,
  WorkspaceUserUpdatePayload
} from '../types/types';
import { SchoolForm, SchoolFormSubmitPayload } from './SchoolProfileForm';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Label } from './ui/label';
import { Input } from './ui/input';

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

const getLogoSrc = (school: SchoolProfile): string | null => school.logo_url ?? null;

const buildSchoolFormData = (values: SchoolFormValues, selectedServices: SchoolServiceType[]): FormData => {
  const formData = new FormData();
  formData.append('school_name', values.school_name);
  formData.append('email', values.email);
  formData.append('phone', values.phone);
  formData.append('address', values.address);
  formData.append('tagline', values.tagline ?? '');
  formData.append('principal_name', values.principal_name);
  formData.append('principal_email', values.principal_email);
  formData.append('principal_phone', values.principal_phone);
  selectedServices.forEach((service) => formData.append('service_type', service));
  if (values.logo_file) {
    formData.append('logo_file', values.logo_file);
  }
  return formData;
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
  const [adminSchools, setAdminSchools] = useState<AdminSchoolProfile[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({ display_name: '', email: '' });
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [deletingSchoolId, setDeletingSchoolId] = useState<string | null>(null);

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
      const nextUser = response.data.user;
      setWorkspaceUser(nextUser);
      setSchools(response.data.schools);
      const shouldStartInCreate = nextUser.role !== 'super-admin' && response.data.schools.length === 0;
      setView(shouldStartInCreate ? 'create' : 'list');
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

  useEffect(() => {
    if (workspaceUser) {
      setProfileForm({
        display_name: workspaceUser.display_name ?? '',
        email: workspaceUser.email ?? ''
      });
    } else {
      setProfileForm({ display_name: '', email: '' });
    }
    setProfileDialogOpen(false);
  }, [workspaceUser]);

  const fetchAdminSchools = useCallback(async () => {
    if (!workspaceUser || workspaceUser.role !== 'super-admin') {
      return;
    }
    setAdminLoading(true);
    setAdminError(null);
    try {
      const token = await getIdToken();
      if (!token) {
        throw new Error('Unable to fetch Firebase token');
      }
      const response = await axios.get<AdminSchoolProfile[]>(`${API}/admin/schools`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAdminSchools(response.data);
    } catch (error) {
      console.error('Failed to load admin schools', error);
      setAdminError('Unable to load the admin school list. Please try again.');
      toast.error('Unable to load the admin school list. Please try again.');
    } finally {
      setAdminLoading(false);
    }
  }, [workspaceUser, getIdToken]);

  useEffect(() => {
    if (workspaceUser?.role === 'super-admin') {
      void fetchAdminSchools();
    } else {
      setAdminSchools([]);
      setAdminError(null);
      setAdminLoading(false);
      setDeletingSchoolId(null);
    }
  }, [workspaceUser, fetchAdminSchools]);

  const buildFormValues = useCallback(
    (school?: SchoolProfile): SchoolFormValues => ({
      school_name: school?.school_name ?? '',
      logo_url: school?.logo_url ?? null,
      logo_file: null,
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

  const handleProfileInputChange = (field: 'display_name' | 'email') =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setProfileForm((prev) => ({ ...prev, [field]: value }));
    };

  const handleProfileSave = useCallback(async () => {
    if (!workspaceUser) {
      return;
    }

    const payload: WorkspaceUserUpdatePayload = {};
    const trimmedName = profileForm.display_name.trim();
    const trimmedEmail = profileForm.email.trim();

    if (trimmedName !== (workspaceUser.display_name ?? '')) {
      payload.display_name = trimmedName;
    }
    if (trimmedEmail !== (workspaceUser.email ?? '')) {
      payload.email = trimmedEmail;
    }

    if (Object.keys(payload).length === 0) {
      setProfileDialogOpen(false);
      return;
    }

    setProfileSubmitting(true);
    try {
      const token = await getIdToken();
      if (!token) {
        throw new Error('Unable to fetch Firebase token');
      }
      const response = await axios.patch<WorkspaceUserProfile>(`${API}/users/me`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setWorkspaceUser(response.data);
      toast.success('Profile updated');
      setProfileDialogOpen(false);
    } catch (error) {
      console.error('Failed to update profile', error);
      toast.error('Unable to update your profile. Please try again.');
    } finally {
      setProfileSubmitting(false);
    }
  }, [workspaceUser, profileForm, getIdToken]);

  const handleSchoolSelect = (school: SchoolProfile) => {
    if (!workspaceUser) {
      return;
    }
    onAuth({ school, user: workspaceUser });
  };

  const handleAdminDelete = useCallback(
    async (schoolId: string) => {
      if (!workspaceUser || workspaceUser.role !== 'super-admin') {
        return;
      }
      const confirmed = window.confirm('Are you sure you want to delete this school? This action cannot be undone.');
      if (!confirmed) {
        return;
      }
      setDeletingSchoolId(schoolId);
      try {
        const token = await getIdToken();
        if (!token) {
          throw new Error('Unable to fetch Firebase token');
        }
        await axios.delete(`${API}/admin/schools/${schoolId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success('School deleted');
        setAdminSchools((prev) => prev.filter((school) => school.school_id !== schoolId));
      } catch (error) {
        console.error('Failed to delete school', error);
        toast.error('Unable to delete school. Please try again.');
      } finally {
        setDeletingSchoolId(null);
      }
    },
    [workspaceUser, getIdToken]
  );

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
      setSubmitting(true);
      try {
        const token = await getIdToken();
        if (!token) {
          throw new Error('Unable to fetch Firebase token');
        }

        const formData = buildSchoolFormData(values, selectedServices);
        const response = await axios.post<SchoolProfile>(`${API}/schools`, formData, {
          headers: { Authorization: `Bearer ${token}` }
        });

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
        if (workspaceUser.role === 'super-admin') {
          void fetchAdminSchools();
        }
        onAuth({ school: createdSchool, user: updatedUser });
      } catch (error) {
        console.error('Failed to create school', error);
        toast.error('Unable to create school. Please try again.');
      } finally {
        setSubmitting(false);
      }
    },
    [workspaceUser, getIdToken, onAuth, fetchAdminSchools]
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
      setSubmitting(true);
      try {
        const token = await getIdToken();
        if (!token) {
          throw new Error('Unable to fetch Firebase token');
        }

        const formData = buildSchoolFormData(values, selectedServices);
        const response = await axios.put<SchoolProfile>(`${API}/schools/${editingSchool.school_id}`, formData, {
          headers: { Authorization: `Bearer ${token}` }
        });

        const updatedSchool = response.data;
        toast.success('School details updated');
        setSchools((prev) =>
          prev.map((school) => (school.school_id === updatedSchool.school_id ? updatedSchool : school))
        );
        if (workspaceUser?.role === 'super-admin') {
          setAdminSchools((prev) =>
            prev.map((school) =>
              school.school_id === updatedSchool.school_id ? { ...school, ...updatedSchool } : school
            )
          );
        }
        setEditingSchool(null);
        setView('list');
      } catch (error) {
        console.error('Failed to update school', error);
        toast.error('Unable to update school. Please try again.');
      } finally {
        setSubmitting(false);
      }
    },
    [editingSchool, getIdToken, workspaceUser]
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
  const isCreateView = view === 'create' || (!isSuperAdmin && schools.length === 0);
  const isEditView = view === 'edit' && Boolean(editingSchool);

  const renderUserDashboard = () => (
    <Card className="w-full max-w-5xl border-0 bg-white/85 backdrop-blur">
      <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-gray-500">Signed in as</p>
          <CardTitle className="text-2xl text-gray-800">
            {workspaceUser?.display_name || user?.name || 'School Admin'}
          </CardTitle>
          <p className="text-gray-600">{workspaceUser?.email}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => setProfileDialogOpen(true)}>
            <UserRoundPen className="h-4 w-4" />
            Edit profile
          </Button>
          <Button
            onClick={() => {
              setEditingSchool(null);
              setView('create');
            }}
          >
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
              const canEdit = school.created_by_user_id === workspaceUser?.uid;
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
                    <Button variant="secondary" className="flex-1" onClick={() => handleSchoolSelect(school)}>
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
  );

  const renderAdminDashboard = () => (
    <Card className="w-full max-w-6xl border-0 bg-white/85 backdrop-blur">
      <CardHeader className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm text-gray-500">Signed in as</p>
            <CardTitle className="text-2xl text-gray-800">
              {workspaceUser?.display_name || user?.name || 'Admin'}
            </CardTitle>
            <p className="text-gray-600">{workspaceUser?.email}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => setProfileDialogOpen(true)}>
              <UserRoundPen className="h-4 w-4" />
              Edit profile
            </Button>
            <Button asChild variant="outline">
              <Link to="/admin/upload">Admin tools</Link>
            </Button>
            <Button
              onClick={() => {
                setEditingSchool(null);
                setView('create');
              }}
            >
              <Plus className="h-4 w-4" />
              Create new school
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="rounded-xl border border-gray-200 bg-white px-6 py-4 text-center shadow-sm">
            <p className="text-sm text-gray-500">Total schools</p>
            <p className="text-3xl font-bold text-gray-900">{adminSchools.length}</p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              void fetchAdminSchools();
            }}
            disabled={adminLoading}
          >
            <RefreshCw className={`h-4 w-4 ${adminLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {adminError && (
          <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{adminError}</div>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">S.No</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Logo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  School Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Unique ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Edit</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Delete</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {adminLoading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-500">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading schools…
                    </div>
                  </td>
                </tr>
              ) : adminSchools.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-500">
                    No schools available yet.
                  </td>
                </tr>
              ) : (
                adminSchools.map((school, index) => {
                  const logoSrc = getLogoSrc(school);
                  const isDeleting = deletingSchoolId === school.school_id;
                  return (
                    <tr key={school.school_id} className="hover:bg-orange-50/40">
                      <td className="px-4 py-4 text-gray-700">{index + 1}</td>
                      <td className="px-4 py-4">
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
                      </td>
                      <td className="px-4 py-4">
                        <div className="font-semibold text-gray-800">{school.school_name}</div>
                        <Button
                          variant="link"
                          className="h-auto p-0 text-xs"
                          onClick={() => handleSchoolSelect(school)}
                        >
                          Open workspace
                        </Button>
                      </td>
                      <td className="px-4 py-4 text-gray-700">{school.school_id}</td>
                      <td className="px-4 py-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingSchool(school);
                            setView('edit');
                          }}
                        >
                          <Edit3 className="h-4 w-4" />
                          Edit
                        </Button>
                      </td>
                      <td className="px-4 py-4">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => void handleAdminDelete(school.school_id)}
                          disabled={isDeleting}
                        >
                          {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          Delete
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );

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
          onCancel={isSuperAdmin || schools.length > 0 ? () => setView('list') : undefined}
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
      ) : isSuperAdmin ? (
        renderAdminDashboard()
      ) : (
        renderUserDashboard()
      )}
      <Dialog
        open={profileDialogOpen}
        onOpenChange={(open) => {
          if (!profileSubmitting) {
            setProfileDialogOpen(open);
          }
        }}
      >
        <DialogContent>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleProfileSave();
            }}
            className="space-y-6"
          >
            <DialogHeader>
              <DialogTitle>Edit profile</DialogTitle>
              <p className="text-sm text-gray-500">Update the name and email associated with your workspace.</p>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="profile_name">Display name</Label>
                <Input
                  id="profile_name"
                  value={profileForm.display_name}
                  onChange={handleProfileInputChange('display_name')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile_email">Email</Label>
                <Input
                  id="profile_email"
                  type="email"
                  required
                  value={profileForm.email}
                  onChange={handleProfileInputChange('email')}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setProfileDialogOpen(false)} disabled={profileSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={profileSubmitting}>
                {profileSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AuthPage;
