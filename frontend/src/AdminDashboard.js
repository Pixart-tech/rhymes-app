import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';

import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Badge } from './components/ui/badge';
import { Separator } from './components/ui/separator';
import { Skeleton } from './components/ui/skeleton';

import { ArrowLeft, RefreshCcw, Trash2 } from 'lucide-react';

import { API_BASE_URL as API } from './config';

const GRADE_LABELS = {
  nursery: 'Nursery',
  lkg: 'LKG',
  ukg: 'UKG',
  playgroup: 'Playgroup',
};

const formatDate = (value) => {
  if (!value) return '—';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '—';
    }
    return date.toLocaleString();
  } catch (error) {
    return '—';
  }
};

const derivePositionLabel = (selection) => {
  if (!selection) return '—';
  const pages = Number(selection.pages ?? 0);

  if (pages >= 1) {
    return 'Full Page';
  }

  const normalized = (selection.position || 'top').toString().toLowerCase();
  return normalized === 'bottom' ? 'Bottom Half' : 'Top Half';
};

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const totalSchools = useMemo(() => schools.length, [schools]);
  const totalSelections = useMemo(
    () => schools.reduce((sum, school) => sum + (school.total_selections || 0), 0),
    [schools]
  );

  const fetchSchools = async () => {
    setRefreshing(true);
    try {
      const response = await axios.get(`${API}/admin/schools`);
      setSchools(response.data || []);
    } catch (error) {
      console.error('Failed to load schools:', error);
      toast.error('Unable to load schools. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchSchools();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDeleteSchool = async (schoolId, schoolName) => {
    if (!schoolId) return;

    const confirmed = window.confirm(
      `Are you sure you want to remove ${schoolName || 'this school'} and all of its rhyme selections?`
    );

    if (!confirmed) return;

    try {
      await axios.delete(`${API}/admin/schools/${schoolId}`);
      toast.success('School removed successfully');
      await fetchSchools();
    } catch (error) {
      console.error('Failed to delete school:', error);
      const detail = error?.response?.data?.detail;
      toast.error(detail || 'Unable to delete the school');
    }
  };

  const renderGradeSection = (gradeKey, selections) => {
    const displayName = GRADE_LABELS[gradeKey] || gradeKey;
    const hasSelections = Array.isArray(selections) && selections.length > 0;

    return (
      <div key={gradeKey} className="rounded-xl border border-orange-100 bg-white/70 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h4 className="text-lg font-semibold text-gray-800">{displayName}</h4>
          <Badge variant="secondary" className="w-max">
            {hasSelections ? `${selections.length} rhymes` : 'No rhymes selected'}
          </Badge>
        </div>
        <Separator className="my-3" />
        {hasSelections ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-orange-50/80 text-xs uppercase tracking-wide text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left">Page</th>
                  <th className="px-3 py-2 text-left">Position</th>
                  <th className="px-3 py-2 text-left">Rhyme</th>
                  <th className="px-3 py-2 text-left">Code</th>
                  <th className="px-3 py-2 text-left">Pages</th>
                  <th className="px-3 py-2 text-left">Selected On</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {selections.map((selection) => (
                  <tr key={selection.id || `${selection.rhyme_code}-${selection.page_index}-${selection.position}`}>
                    <td className="px-3 py-2 font-medium text-gray-700">
                      Page {Number(selection.page_index) + 1}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{derivePositionLabel(selection)}</td>
                    <td className="px-3 py-2 text-gray-800">{selection.rhyme_name}</td>
                    <td className="px-3 py-2 text-gray-500">{selection.rhyme_code}</td>
                    <td className="px-3 py-2 text-gray-600">{Number(selection.pages)}</td>
                    <td className="px-3 py-2 text-gray-500">{formatDate(selection.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No rhymes have been assigned to this grade yet.</p>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 flex items-center justify-center p-6">
        <div className="w-full max-w-3xl space-y-4">
          <Skeleton className="h-12 w-3/4 rounded-xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Admin Dashboard</h1>
            <p className="text-gray-600">
              Manage schools and review rhyme selections across grades.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="bg-white/80 hover:bg-white"
              onClick={() => fetchSchools()}
              disabled={refreshing}
            >
              <RefreshCcw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              variant="outline"
              className="bg-white/80 hover:bg-white"
              onClick={() => navigate('/')}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to App
            </Button>
          </div>
        </div>

        <Card className="border-0 bg-white/70 backdrop-blur-sm shadow-xl">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-gray-800">Summary</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-orange-100 bg-orange-50/60 p-4 text-center">
              <p className="text-sm font-medium text-orange-700">Total Schools</p>
              <p className="mt-2 text-2xl font-bold text-orange-900">{totalSchools}</p>
            </div>
            <div className="rounded-xl border border-red-100 bg-red-50/60 p-4 text-center">
              <p className="text-sm font-medium text-red-700">Total Rhyme Selections</p>
              <p className="mt-2 text-2xl font-bold text-red-900">{totalSelections}</p>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 text-center">
              <p className="text-sm font-medium text-emerald-700">Last Updated</p>
              <p className="mt-2 text-base font-semibold text-emerald-900">
                {schools.length > 0 ? formatDate(schools[0]?.last_updated) : '—'}
              </p>
            </div>
          </CardContent>
        </Card>

        {schools.length === 0 ? (
          <Card className="border-0 bg-white/70 backdrop-blur-sm shadow-xl">
            <CardContent className="py-16 text-center text-gray-600">
              No schools found yet. Schools will appear here after they authenticate through the main app.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {schools.map((school) => (
              <Card key={school.school_id} className="border-0 bg-white/80 backdrop-blur shadow-2xl">
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-2xl font-bold text-gray-800">
                      {school.school_name || 'Unnamed School'}
                    </CardTitle>
                    <p className="text-sm text-gray-500">
                      ID: {school.school_id}
                      {school.last_updated && (
                        <span className="ml-3">
                          Last update: {formatDate(school.last_updated)}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">
                      {school.total_selections} selections
                    </Badge>
                    <Button
                      variant="destructive"
                      className="bg-red-500 hover:bg-red-600"
                      onClick={() => handleDeleteSchool(school.school_id, school.school_name)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete School
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {Object.entries(GRADE_LABELS).map(([gradeKey]) =>
                    renderGradeSection(gradeKey, school.grades?.[gradeKey] || [])
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
