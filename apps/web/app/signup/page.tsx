import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { SignupForm } from '@/components/signup-form';
import { getCurrentUser } from '@/lib/auth/session';

// Session is per-request; never cache this route.
export const dynamic = 'force-dynamic';

export default async function SignupPage() {
  const user = await getCurrentUser();
  if (user) redirect('/account');

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Create your account</h1>
        <p className="text-sm text-gray-500">
          Book stays as a guest, or host a place.
        </p>
      </header>

      {/* useSearchParams (for ?next=) needs a Suspense boundary. */}
      <Suspense fallback={null}>
        <SignupForm />
      </Suspense>

      <p className="text-sm text-gray-600">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-gray-900 underline">
          Log in
        </Link>
      </p>
    </main>
  );
}
