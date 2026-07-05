import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { LoginForm } from '@/components/login-form';
import { getCurrentUser } from '@/lib/auth/session';

// Session is per-request; never cache this route.
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  // Already signed in? Skip the form.
  const user = await getCurrentUser();
  if (user) redirect('/account');

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Log in</h1>
        <p className="text-sm text-gray-500">
          Welcome back to Harbourstay.
        </p>
      </header>

      {/* useSearchParams (for ?next=) needs a Suspense boundary. */}
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>

      <p className="text-sm text-gray-600">
        No account?{' '}
        <Link href="/signup" className="font-medium text-gray-900 underline">
          Sign up
        </Link>
      </p>
    </main>
  );
}
