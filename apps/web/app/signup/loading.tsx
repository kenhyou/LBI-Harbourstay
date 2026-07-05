export default function Loading() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center gap-6 p-6">
      <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
      <div className="flex flex-col gap-4">
        <div className="h-10 w-full animate-pulse rounded-md bg-gray-100" />
        <div className="h-10 w-full animate-pulse rounded-md bg-gray-100" />
        <div className="h-6 w-2/3 animate-pulse rounded bg-gray-100" />
        <div className="h-10 w-full animate-pulse rounded-md bg-gray-200" />
      </div>
    </main>
  );
}
