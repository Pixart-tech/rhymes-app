import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { getDownloadURL, ref } from 'firebase/storage';
import {
  Loader2,
  School,
  Edit3,
  Eye,
  Plus,
  RefreshCw,
  Trash2,
  UserRoundPen,
  Search,
  Filter,
  Clock,
  TrendingUp
} from 'lucide-react';

import { useAuth } from '../hooks/useAuth';
import { storage } from '../lib/firebase';
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
import {
  SchoolForm,
  SchoolFormSubmitPayload,
  buildSchoolFormData,
  buildSchoolFormValuesFromProfile
} from './SchoolProfileForm';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Label } from './ui/label';
import { Input } from './ui/input';

const API = API_BASE_URL || '/api';

const SERVICE_KEYS: SchoolServiceType[] = ['id_cards', 'report_cards', 'certificates'];
const SERVICE_LABELS: Record<SchoolServiceType, string> = {
  id_cards: 'ID cards',
  report_cards: 'Report cards',
  certificates: 'Certificates'
};
type AdminServiceFilter = 'all' | SchoolServiceType;

const getLogoSrc = (school: SchoolProfile, resolvedLogos?: Record<string, string>): string | null => {
  if (resolvedLogos?.[school.school_id]) {
    return resolvedLogos[school.school_id];
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

interface PaginatedAdminSchoolsResponse {
  schools: AdminSchoolProfile[];
  totalCount: number;
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
  const [currentPage, setCurrentPage] = useState(1);
  const [schoolsPerPage] = useState(10);
  const [totalAdminSchoolsCount, setTotalAdminSchoolsCount] = useState(0);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({ display_name: '', email: '' });
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [deletingSchoolId, setDeletingSchoolId] = useState<string | null>(null);
  const [logoMap, setLogoMap] = useState<Record<string, string>>({});
  const [adminSearch, setAdminSearch] = useState('');
  const [serviceFilter, setServiceFilter] = useState<AdminServiceFilter>('all');
  const allSchoolsForLogos = useMemo(() => {
    const deduped: Record<string, SchoolProfile> = {};
    [...schools, ...adminSchools].forEach((school) => {
      if (school?.school_id) {
        deduped[school.school_id] = school;
      }
    });
    return Object.values(deduped);
  }, [schools, adminSchools]);
  const resolveDirectLogoUrl = useCallback((value?: string | null) => {
    if (!value) {
      return null;
    }
    if (/^data:/i.test(value) || /^https?:\/\//i.test(value)) {
      return value;
    }
    if (value.startsWith('/')) {
      if (API_BASE_URL && /^https?:\/\//i.test(API_BASE_URL)) {
        try {
          return new URL(value, API_BASE_URL).toString();
        } catch (error) {
          console.warn('Unable to build absolute logo url', error);
        }
      }
      return value;
    }
    return null;
  }, []);

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

  const fetchAdminSchools = useCallback(async (page: number, limit: number) => {
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
      const response = await axios.get<PaginatedAdminSchoolsResponse>(
        `${API}/admin/schools?page=${page}&limit=${limit}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      setAdminSchools(response.data.schools);
      setTotalAdminSchoolsCount(response.data.totalCount);
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
      void fetchAdminSchools(currentPage, schoolsPerPage);
    } else {
      setAdminSchools([]);
      setAdminError(null);
      setAdminLoading(false);
      setDeletingSchoolId(null);
    }
  }, [workspaceUser, fetchAdminSchools, currentPage, schoolsPerPage]);

  useEffect(() => {
    if (allSchoolsForLogos.length === 0) {
      return;
    }

    const directUpdates: Record<string, string> = {};
    const firebaseTargets: SchoolProfile[] = [];

    allSchoolsForLogos.forEach((school) => {
      if (!school.logo_url || logoMap[school.school_id]) {
        return;
      }
      const directUrl = resolveDirectLogoUrl(school.logo_url);
      if (directUrl) {
        directUpdates[school.school_id] = directUrl;
      } else {
        firebaseTargets.push(school);
      }
    });

    if (Object.keys(directUpdates).length > 0) {
      setLogoMap((prev) => ({ ...prev, ...directUpdates }));
    }

    if (firebaseTargets.length === 0) {
      return;
    }

    let cancelled = false;
    const fetchFirebaseLogos = async () => {
      const entries = await Promise.all(
        firebaseTargets.map(async (school) => {
          if (!school.logo_url) {
            return null;
          }
          try {
            const storageRef = ref(storage, school.logo_url);
            const downloadUrl = await getDownloadURL(storageRef);
            return [school.school_id, downloadUrl] as const;
          } catch (error) {
            console.warn('Failed to fetch logo from Firebase storage', { schoolId: school.school_id, error });
            return null;
          }
        })
      );

      const updates: Record<string, string> = {};
      entries.forEach((entry) => {
        if (!entry) {
          return;
        }
        const [schoolId, downloadUrl] = entry;
        updates[schoolId] = downloadUrl;
      });

      if (!cancelled && Object.keys(updates).length > 0) {
        setLogoMap((prev) => ({ ...prev, ...updates }));
      }
    };

    void fetchFirebaseLogos();
    return () => {
      cancelled = true;
    };
  }, [allSchoolsForLogos, logoMap, resolveDirectLogoUrl]);

  const buildFormValues = useCallback(
    (school?: SchoolProfile): SchoolFormValues => {
      const baseValues = buildSchoolFormValuesFromProfile(school);
      return {
        ...baseValues,
        email: school?.email ?? workspaceUser?.email ?? user?.email ?? baseValues.email,
        principal_email:
          school?.principal_email ??
          school?.email ??
          workspaceUser?.email ??
          user?.email ??
          baseValues.principal_email,
        principal_phone: school?.principal_phone ?? school?.phone ?? baseValues.principal_phone
      };
    },
    [workspaceUser, user]
  );

  const currentFormValues = useMemo(() => {
    if (view === 'edit' && editingSchool) {
      return buildFormValues(editingSchool);
    }
    return buildFormValues();
  }, [view, editingSchool, buildFormValues]);
  const filteredAdminSchools = useMemo(() => {
    if (adminSchools.length === 0) {
      return [];
    }
    const normalizedSearch = adminSearch.trim().toLowerCase();
    return adminSchools.filter((school) => {
      const matchesSearch = normalizedSearch
        ? Boolean(
            school.school_name?.toLowerCase().includes(normalizedSearch) ||
              school.school_id?.toLowerCase().includes(normalizedSearch) ||
              school.email?.toLowerCase().includes(normalizedSearch)
          )
        : true;
      const matchesService =
        serviceFilter === 'all' ||
        Boolean(school.service_type && school.service_type.includes(serviceFilter));
      return matchesSearch && matchesService;
    });
  }, [adminSchools, adminSearch, serviceFilter]);
  const adminStats = useMemo(() => {
    const totalSelections = adminSchools.reduce((sum, school) => sum + (school.total_selections || 0), 0);
    const lastUpdated = adminSchools.reduce<Date | null>((latest, school) => {
      const timestamp = school.last_updated ?? school.timestamp;
      if (!timestamp) {
        return latest;
      }
      const nextDate = new Date(timestamp);
      if (!latest || nextDate > latest) {
        return nextDate;
      }
      return latest;
    }, null);
    return {
      totalSelections,
      lastUpdated
    };
  }, [adminSchools]);
  const formatDate = useCallback((value?: string | Date | null) => {
    if (!value) {
      return 'No activity yet';
    }
    const dateValue = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(dateValue.getTime())) {
      return 'No activity yet';
    }
    return dateValue.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }, []);

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
      const hasSelectedService = Object.values(values.service_status).some(
        (status) => status === 'yes'
      );
      if (!hasSelectedService) {
        toast.error('Please let us know whether you are taking ID cards, report cards, or certificates.');
        return;
      }
      setSubmitting(true);
      try {
        const token = await getIdToken();
        if (!token) {
          throw new Error('Unable to fetch Firebase token');
        }

        const formData = buildSchoolFormData(values);
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
      const hasSelectedService = Object.values(values.service_status).some(
        (status) => status === 'yes'
      );
      if (!hasSelectedService) {
        toast.error('Please let us know whether you are taking ID cards, report cards, or certificates.');
        return;
      }
      setSubmitting(true);
      try {
        const token = await getIdToken();
        if (!token) {
          throw new Error('Unable to fetch Firebase token');
        }

        const formData = buildSchoolFormData(values);
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
              const logoSrc = getLogoSrc(school, logoMap);
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

  const renderAdminDashboard = () => {
    const serviceFilterOptions: { label: string; value: AdminServiceFilter }[] = [
      { label: 'All services', value: 'all' },
      ...SERVICE_KEYS.map((key) => ({ value: key, label: SERVICE_LABELS[key] }))
    ];
    const schoolsToRender = filteredAdminSchools;
    const emptyStateMessage =
      adminSchools.length === 0 ? 'No schools available yet.' : 'No schools match the current filters.';

    return (
      <div className="flex w-full max-w-6xl flex-col gap-6">
        <Card className="border-0 bg-gradient-to-br from-orange-500 via-red-500 to-rose-500 text-white shadow-2xl">
          <CardHeader className="space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm uppercase tracking-wide text-white/80">Super admin</p>
                <CardTitle className="text-3xl font-semibold">
                  {workspaceUser?.display_name || user?.name || 'Admin'}
                </CardTitle>
                <p className="text-sm text-white/80">{workspaceUser?.email}</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  className="border-white/40 text-white hover:bg-white/10"
                  onClick={() => setProfileDialogOpen(true)}
                >
                  <UserRoundPen className="h-4 w-4" />
                  Edit profile
                </Button>
                <Button asChild variant="outline" className="border-white/40 text-white hover:bg-white/10">
                  <Link to="/admin/upload">Admin tools</Link>
                </Button>
                <Button
                  className="bg-white text-orange-600 hover:bg-white/90"
                  onClick={() => {
                    setEditingSchool(null);
                    setView('create');
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Create school
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl bg-white/20 p-4 backdrop-blur">
              <p className="text-sm text-white/80">Total selections</p>
              <p className="text-3xl font-semibold">{adminStats.totalSelections}</p>
              <span className="mt-2 inline-flex items-center gap-1 text-xs text-white/80">
                <TrendingUp className="h-3.5 w-3.5" />
                Last update {formatDate(adminStats.lastUpdated)}
              </span>
            </div>
            <div className="rounded-2xl bg-white/20 p-4 backdrop-blur">
              <p className="text-sm text-white/80">Total schools</p>
              <p className="text-3xl font-semibold">{totalAdminSchoolsCount}</p>
              <span className="mt-2 inline-flex items-center gap-1 text-xs text-white/80">
                <School className="h-3.5 w-3.5" />
                All schools currently listed
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 bg-white/95 shadow-2xl backdrop-blur">
          <CardHeader className="space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative w-full flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Search by school name, email, or ID"
                  className="pl-10"
                  value={adminSearch}
                  onChange={(event) => setAdminSearch(event.target.value)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {serviceFilterOptions.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    size="sm"
                    variant={serviceFilter === option.value ? 'default' : 'outline'}
                    className={serviceFilter === option.value ? 'bg-orange-500 hover:bg-orange-500/90' : ''}
                    onClick={() => setServiceFilter(option.value)}
                  >
                    {option.value === 'all' ? (
                      <>
                        <Filter className="h-4 w-4" />
                        {option.label}
                      </>
                    ) : (
                      option.label
                    )}
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void fetchAdminSchools(currentPage, schoolsPerPage);
                  }}
                  disabled={adminLoading}
                >
                  <RefreshCw className={`h-4 w-4 ${adminLoading ? 'animate-spin' : ''}`} />
                  Sync now
                </Button>
              </div>
            </div>
            {adminError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{adminError}</div>
            )}
          </CardHeader>
          <CardContent className="space-y-5">
            {adminLoading ? (
              <div className="flex items-center justify-center gap-3 rounded-xl border border-dashed border-gray-200 px-6 py-10 text-gray-600">
                <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
                Fetching the latest schools…
              </div>
            ) : schoolsToRender.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 px-6 py-12 text-center text-gray-500">
                {emptyStateMessage}
              </div>
            ) : (
              <><div className="overflow-x-auto rounded-2xl border border-gray-100">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                            School
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                            Services
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                            Selections
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                            Grades
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                            Last updated
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {schoolsToRender.map((school) => {
                          const logoSrc = getLogoSrc(school, logoMap);
                          const gradeCount = Object.values(school.grades || {}).filter(
                            (grade) => grade.enabled
                          ).length;
                          const isDeleting = deletingSchoolId === school.school_id;
                          const services = school.service_type ?? [];

                          return (
                            <tr key={school.school_id} className="hover:bg-orange-50/40">
                              <td className="px-4 py-4">
                                <div className="flex items-center gap-3">
                                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-50 text-orange-500">
                                    {logoSrc ? (
                                      <img
                                        src={logoSrc}
                                        alt={school.school_name}
                                        className="h-11 w-11 rounded-full object-cover" />
                                    ) : (
                                      <School className="h-5 w-5" />
                                    )}
                                  </div>
                                  <div>
                                    <div className="font-semibold text-gray-800">{school.school_name}</div>
                                    <p className="text-xs text-gray-500">ID: {school.school_id}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-4">
                                <div className="flex flex-wrap gap-1">
                                  {services.length === 0
                                    ? '—'
                                    : services.map((service) => (
                                      <span key={service} className="rounded-full bg-orange-50 px-2 py-0.5 text-xs text-orange-700">
                                        {SERVICE_LABELS[service]}
                                      </span>
                                    ))}
                                </div>
                              </td>
                              <td className="px-4 py-4 text-gray-700">{school.total_selections ?? 0}</td>
                              <td className="px-4 py-4 text-gray-700">{gradeCount}</td>
                              <td className="px-4 py-4 text-gray-700">{formatDate(school.last_updated ?? school.timestamp ?? null)}</td>
                              <td className="px-4 py-4">
                                <div className="flex flex-wrap gap-2">
                                  <Button variant="secondary" size="sm" onClick={() => handleSchoolSelect(school)}>
                                    <Eye className="h-4 w-4" />
                                    Open
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setEditingSchool(school);
                                      setView('edit');
                                    } }
                                  >
                                    <Edit3 className="h-4 w-4" />
                                    Edit
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => void handleAdminDelete(school.school_id)}
                                    disabled={isDeleting}
                                  >
                                    {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                    Delete
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div><div className="flex items-center justify-between space-x-2 py-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                      >
                        Previous
                      </Button>
                      <div className="text-sm font-medium">
                        Page {currentPage} of {Math.ceil(totalAdminSchoolsCount / schoolsPerPage)}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((prev) => Math.min(Math.ceil(totalAdminSchoolsCount / schoolsPerPage), prev + 1))}
                        disabled={currentPage === Math.ceil(totalAdminSchoolsCount / schoolsPerPage)}
                      >
                        Next
                      </Button>
                    </div></>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

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