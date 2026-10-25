import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import toast from 'react-hot-toast';
import { BrandMark } from '../components/BrandMark';

const registerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
  department: z.string().max(200).optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type RegisterForm = z.infer<typeof registerSchema>;

export const Register: React.FC = () => {
  const { user, register: registerUser, isLoading } = useAuthStore();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });

  if (user) {
    return <Navigate to="/" />;
  }

  const onSubmit = async (data: RegisterForm) => {
    try {
      await registerUser(data.email, data.password, data.name, data.department);
      toast.success('Account created successfully!');
      navigate('/');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error && 'response' in error && 
        typeof error.response === 'object' && error.response !== null &&
        'data' in error.response && typeof error.response.data === 'object' &&
        error.response.data !== null && 'message' in error.response.data
        ? String(error.response.data.message)
        : 'Registration failed';
      toast.error(errorMessage);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--page)] px-4 py-12 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute -left-32 -top-32 h-80 w-80 rounded-full bg-[var(--primary)]/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-20 h-96 w-96 rounded-full bg-[var(--accent)]/10 blur-3xl" />
      <div className="relative w-full max-w-[420px] space-y-7">
        <div className="flex flex-col items-center text-center">
          <BrandMark />
          <p className="mt-6 text-sm text-[var(--text-muted)]">Create an account for your resource workspace</p>
        </div>

        <Card className="shadow-xl shadow-slate-900/5 dark:shadow-black/30">
          <CardHeader className="p-7 pb-4">
            <CardTitle className="text-xl">Create your account</CardTitle>
            <p className="mt-2 text-sm text-[var(--text-muted)]">Get started with IT Resource Desk.</p>
          </CardHeader>
          <CardContent className="p-7 pt-3">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <Input
                {...register('name')}
                type="text"
                label="Name"
                placeholder="Enter your name"
                error={errors.name?.message}
              />

              <Input
                {...register('department')}
                type="text"
                label="Department (optional)"
                placeholder="e.g. Computer Science"
                error={errors.department?.message}
              />

              <Input
                {...register('email')}
                type="email"
                label="Email"
                placeholder="Enter your email"
                error={errors.email?.message}
              />

              <Input
                {...register('password')}
                type="password"
                label="Password"
                placeholder="Enter your password"
                error={errors.password?.message}
              />

              <Input
                {...register('confirmPassword')}
                type="password"
                label="Confirm Password"
                placeholder="Confirm your password"
                error={errors.confirmPassword?.message}
              />

              <Button
                type="submit"
                className="w-full"
                isLoading={isLoading}
              >
                Sign Up
              </Button>
            </form>

            <div className="mt-6 text-center">
              <span className="text-sm text-gray-600">
                Already have an account?{' '}
                <Link
                  to="/login"
                  className="font-semibold text-[var(--primary)] hover:text-[var(--primary-strong)]"
                >
                  Sign in
                </Link>
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};