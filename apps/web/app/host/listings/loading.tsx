export default function Loading() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="h-8 w-1/3 animate-pulse rounded bg-gray-200" />
        <div className="h-9 w-28 animate-pulse rounded bg-gray-100" />
      </div>
      <div className="h-32 w-full animate-pulse rounded-xl bg-gray-100" />
      <div className="h-32 w-full animate-pulse rounded-xl bg-gray-100" />
    </main>
  );
}
