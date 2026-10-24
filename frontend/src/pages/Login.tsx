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
import { isAxiosError } from 'axios';
import { BrandMark } from '../components/BrandMark';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

export const Login: React.FC = () => {
  const { user, login, isLoading } = useAuthStore();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  if (user) {
    return <Navigate to="/" />;
  }

  const onSubmit = async (data: LoginForm) => {
    try {
      await login(data.email, data.password);
      toast.success('Welcome back!');
      navigate('/');
    } catch (error: unknown) {
      const message = isAxiosError(error) && typeof error.response?.data?.message === 'string'
        ? error.response.data.message
        : 'Login failed';
      toast.error(message);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--page)] px-4 py-12 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute -left-32 -top-32 h-80 w-80 rounded-full bg-[var(--primary)]/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-20 h-96 w-96 rounded-full bg-[var(--accent)]/10 blur-3xl" />
      <Card className="relative w-full max-w-[420px] shadow-xl shadow-slate-900/5 dark:shadow-black/30">
          <CardHeader className="items-center p-7 pb-4 text-center">
            <div className="flex justify-center">
              <BrandMark />
            </div>
            <CardTitle className="text-xl">Welcome back</CardTitle>
            <p className="mt-2 text-sm text-[var(--text-muted)]">Sign in to continue to your workspace.</p>
          </CardHeader>
          <CardContent className="p-7 pt-3">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <Input
                {...register('email')}
                type="email"
                label="Email"
                placeholder="johndoe@email.com"
                error={errors.email?.message}
              />

              <Input
                {...register('password')}
                type="password"
                label="Password"
                placeholder="Enter your password"
                error={errors.password?.message}
              />

              <Button
                type="submit"
                className="w-full"
                isLoading={isLoading}
              >
                Sign In
              </Button>
            </form>

            <div className="mt-6 text-center">
              <span className="text-sm text-gray-600">
                Don't have an account?{' '}
                <Link to="/register" className="font-semibold text-[var(--primary)] hover:text-[var(--primary-strong)]">
                  Sign up
                </Link>
              </span>
            </div>
          </CardContent>
      </Card>
    </div>
  );
};