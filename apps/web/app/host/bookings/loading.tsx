export default function Loading() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-4xl flex-col gap-6 p-6">
      <div className="h-8 w-1/4 animate-pulse rounded bg-gray-200" />
      <div className="h-10 w-full animate-pulse rounded bg-gray-100" />
      <div className="h-14 w-full animate-pulse rounded bg-gray-100" />
      <div className="h-14 w-full animate-pulse rounded bg-gray-100" />
      <div className="h-14 w-full animate-pulse rounded bg-gray-100" />
    </main>
  );
}
