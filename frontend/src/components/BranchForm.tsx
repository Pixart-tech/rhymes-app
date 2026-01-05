import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import type { SchoolProfile } from '../types/types';

export interface BranchFormValues {
  branch_name: string;
  coordinator_name: string;
  coordinator_email: string;
  coordinator_phone: string;
  address: string;
  city: string;
  state: string;
  pin: string;
}

export const createDefaultBranchValues = (): BranchFormValues => ({
  branch_name: '',
  coordinator_name: '',
  coordinator_email: '',
  coordinator_phone: '',
  address: '',
  city: '',
  state: '',
  pin: ''
});

export const buildBranchFormValuesFromBranch = (branch?: SchoolProfile | null): BranchFormValues => ({
  branch_name: branch?.school_name ?? '',
  coordinator_name: branch?.principal_name ?? '',
  coordinator_email: branch?.principal_email ?? '',
  coordinator_phone: branch?.principal_phone ?? '',
  address: branch?.address ?? '',
  city: branch?.city ?? '',
  state: branch?.state ?? '',
  pin: branch?.pin ?? ''
});

export interface BranchFormProps {
  parentSchool: SchoolProfile;
  submitting: boolean;
  onSubmit: (values: BranchFormValues) => Promise<void> | void;
  onCancel: () => void;
  initialValues?: BranchFormValues;
  mode?: 'create' | 'edit' | 'view';
  formTitle?: string;
  formDescription?: string;
  submitLabel?: string;
}

const BranchForm: React.FC<BranchFormProps> = ({
  parentSchool,
  submitting,
  onSubmit,
  onCancel,
  initialValues,
  mode = 'create',
  formTitle,
  formDescription,
  submitLabel
}) => {
  const [values, setValues] = useState<BranchFormValues>(initialValues ?? createDefaultBranchValues());

  useEffect(() => {
    if (initialValues) {
      setValues(initialValues);
    } else {
      setValues(createDefaultBranchValues());
    }
  }, [initialValues, parentSchool.school_id]);

  const isViewMode = mode === 'view';

  const handleFieldChange =
    (field: keyof BranchFormValues) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextValue = event.target.value;
      setValues((prev) => ({ ...prev, [field]: nextValue }));
    };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isViewMode) {
      return;
    }
    await onSubmit(values);
  };

  const autoTitle =
    mode === 'edit' ? `Edit ${values.branch_name || 'branch'}` : `Add branch for ${parentSchool.school_name}`;
  const autoDescription =
    mode === 'view'
      ? 'Review the coordinator details for this branch.'
      : 'Share the branch name, coordinator contact, and location so the branch can be tracked separately.';

  const submitButtonLabel = submitLabel ?? (mode === 'edit' ? 'Save changes' : 'Create branch');

  return (
    <Card className="border border-slate-200 bg-white shadow-sm">
      <form onSubmit={handleSubmit} className="space-y-6">
        <CardHeader>
          <CardTitle className="text-2xl text-slate-900">{formTitle ?? autoTitle}</CardTitle>
          <p className="text-sm text-slate-500">{formDescription ?? autoDescription}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="branch_name">Branch name</Label>
            <Input
              id="branch_name"
              placeholder="Eg. Downtown Campus"
              value={values.branch_name}
              onChange={handleFieldChange('branch_name')}
              minLength={2}
              required
              disabled={submitting || isViewMode}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="coordinator_name">Coordinator name</Label>
              <Input
                id="coordinator_name"
                placeholder="Eg. Priya Rao"
                value={values.coordinator_name}
                onChange={handleFieldChange('coordinator_name')}
                minLength={2}
                required
                disabled={submitting || isViewMode}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="coordinator_email">Coordinator email</Label>
              <Input
                id="coordinator_email"
                type="email"
                placeholder="you@example.com"
                value={values.coordinator_email}
                onChange={handleFieldChange('coordinator_email')}
                required
                disabled={submitting || isViewMode}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="coordinator_phone">Coordinator phone</Label>
            <Input
              id="coordinator_phone"
              type="tel"
              placeholder="+91 98765 43210"
              value={values.coordinator_phone}
              onChange={handleFieldChange('coordinator_phone')}
              minLength={5}
              inputMode="tel"
              required
              disabled={submitting || isViewMode}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="branch_address">Address</Label>
            <Input
              id="branch_address"
              placeholder="Plot 123, Green Park"
              value={values.address}
              onChange={handleFieldChange('address')}
              required
              disabled={submitting || isViewMode}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="branch_city">City</Label>
              <Input
                id="branch_city"
                placeholder="Hyderabad"
                value={values.city}
                onChange={handleFieldChange('city')}
                required
                disabled={submitting || isViewMode}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch_state">State</Label>
              <Input
                id="branch_state"
                placeholder="Telangana"
                value={values.state}
                onChange={handleFieldChange('state')}
                required
                disabled={submitting || isViewMode}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="branch_pin">Pincode</Label>
            <Input
              id="branch_pin"
              placeholder="500047"
              value={values.pin}
              onChange={handleFieldChange('pin')}
              required
              disabled={submitting || isViewMode}
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-wrap items-center justify-end gap-3">
          <Button variant="outline" type="button" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          {!isViewMode && (
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {submitButtonLabel}
            </Button>
          )}
        </CardFooter>
      </form>
    </Card>
  );
};

export default BranchForm;
