export default function Loading() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-2xl flex-col gap-6 p-6">
      <div className="h-8 w-1/3 animate-pulse rounded bg-gray-200" />
      <div className="h-40 w-full animate-pulse rounded-xl bg-gray-100" />
      <div className="h-16 w-full animate-pulse rounded-lg bg-gray-100" />
      <div className="h-16 w-full animate-pulse rounded-lg bg-gray-100" />
    </main>
  );
}
