export default function Loading() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-3xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
        <div className="h-4 w-64 animate-pulse rounded bg-gray-100" />
      </div>
      <div className="flex flex-col gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-32 w-full animate-pulse rounded-xl bg-gray-100"
          />
        ))}
      </div>
    </main>
  );
}
