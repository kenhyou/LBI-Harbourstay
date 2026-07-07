export default function Loading() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6 sm:p-8">
      <div className="h-4 w-32 animate-pulse rounded bg-gray-100" />
      <div className="flex flex-col items-center gap-4 rounded-xl border border-gray-200 p-8">
        <div className="h-8 w-8 animate-pulse rounded-full bg-gray-200" />
        <div className="h-5 w-1/2 animate-pulse rounded bg-gray-200" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-gray-100" />
      </div>
    </main>
  );
}
