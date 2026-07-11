export default function Loading() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-2xl flex-col gap-6 p-6">
      <div className="h-8 w-1/3 animate-pulse rounded bg-gray-200" />
      <div className="h-10 w-full animate-pulse rounded bg-gray-100" />
      <div className="h-24 w-full animate-pulse rounded bg-gray-100" />
      <div className="grid grid-cols-2 gap-5">
        <div className="h-10 animate-pulse rounded bg-gray-100" />
        <div className="h-10 animate-pulse rounded bg-gray-100" />
      </div>
    </main>
  );
}
