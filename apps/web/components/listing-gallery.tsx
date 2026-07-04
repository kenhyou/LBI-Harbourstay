/**
 * Image gallery for the detail page. Server Component. Renders up to a lead
 * image plus a grid; falls back to a placeholder when there are no images.
 */
export function ListingGallery({
  images,
  title,
}: {
  images: string[];
  title: string;
}) {
  if (images.length === 0) {
    return (
      <div
        className="flex aspect-[16/9] w-full items-center justify-center rounded-xl bg-gray-100 text-sm text-gray-400"
        role="img"
        aria-label="No photos available"
      >
        No photos available
      </div>
    );
  }

  const [lead, ...rest] = images;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- remote hosts not configured for next/image in S1 */}
      <img
        src={lead}
        alt={`${title} — photo 1`}
        className="aspect-[4/3] w-full rounded-xl object-cover sm:col-span-2"
      />
      {rest.slice(0, 4).map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- remote hosts not configured for next/image in S1
        <img
          key={src}
          src={src}
          alt={`${title} — photo ${i + 2}`}
          className="aspect-[4/3] w-full rounded-xl object-cover"
        />
      ))}
    </div>
  );
}
