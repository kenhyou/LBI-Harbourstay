export default function Loading() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6 sm:p-8">
      <div className="h-4 w-40 animate-pulse rounded bg-gray-100" />
      <div className="flex items-start justify-between gap-4">
        <div className="h-8 w-1/2 animate-pulse rounded bg-gray-200" />
        <div className="h-6 w-24 animate-pulse rounded-full bg-gray-100" />
      </div>
      <div className="h-40 w-full animate-pulse rounded-xl bg-gray-100" />
      <div className="h-32 w-full animate-pulse rounded-xl bg-gray-100" />
    </main>
  );
}
