export default function Loading() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 p-6 sm:p-8">
      <div className="h-4 w-32 animate-pulse rounded bg-gray-100" />
      <div className="flex flex-col gap-3">
        <div className="h-6 w-20 animate-pulse rounded-full bg-gray-100" />
        <div className="h-9 w-2/3 animate-pulse rounded bg-gray-200" />
        <div className="h-4 w-1/3 animate-pulse rounded bg-gray-100" />
      </div>
      <div className="aspect-[16/9] w-full animate-pulse rounded-xl bg-gray-200" />
      <div className="flex flex-col gap-3">
        <div className="h-4 w-full animate-pulse rounded bg-gray-100" />
        <div className="h-4 w-5/6 animate-pulse rounded bg-gray-100" />
        <div className="h-4 w-4/6 animate-pulse rounded bg-gray-100" />
      </div>
    </main>
  );
}
