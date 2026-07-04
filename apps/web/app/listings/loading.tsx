export default function Loading() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 p-6 sm:p-8">
      <div className="flex flex-col gap-2">
        <div className="h-8 w-64 animate-pulse rounded bg-gray-200" />
        <div className="h-4 w-80 animate-pulse rounded bg-gray-100" />
      </div>
      <div className="h-24 w-full animate-pulse rounded-xl bg-gray-100" />
      <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <li
            key={i}
            className="flex flex-col overflow-hidden rounded-xl border border-gray-200"
          >
            <div className="aspect-[4/3] w-full animate-pulse bg-gray-200" />
            <div className="flex flex-col gap-2 p-4">
              <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-gray-100" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-gray-100" />
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
