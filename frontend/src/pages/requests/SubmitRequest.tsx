import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { ErrorCard, LoadingCard } from '../../components/resources/PageState';
import { useCatalog } from '../../components/resources/useCatalog';
import { errorMessage, resourceApi } from '../../lib/resourceApi';
import { useAuthStore } from '../../stores/auth';
import { RequestFields } from './RequestFields';
import { emptyRequestForm, toRequestPayload, validateRequestForm, type RequestFormErrors } from './requestForm';

export const SubmitRequest: React.FC = () => {
  const { catalog, error: catalogError } = useCatalog();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [values, setValues] = useState(() => emptyRequestForm(user?.department ?? ''));
  const [errors, setErrors] = useState<RequestFormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  if (catalogError) return <ErrorCard message={catalogError} />;
  if (!catalog) return <LoadingCard />;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const found = validateRequestForm(values);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSubmitting(true);
    try {
      const created = await resourceApi.createRequest(toRequestPayload(values));
      toast.success('Request submitted');
      navigate(`/requests/${created._id}`);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to submit request'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Request IT Resources</h1>
      <Card>
        <CardHeader>
          <CardTitle>What do you need?</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-6" noValidate>
            <RequestFields catalog={catalog} values={values} errors={errors} onChange={setValues} showDepartment />
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => navigate('/requests')}>Cancel</Button>
              <Button type="submit" isLoading={submitting}>Submit request</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
