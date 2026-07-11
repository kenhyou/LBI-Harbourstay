/**
 * BC-2's domain enum for a listing's publication state. A freshly created
 * listing starts `Unpublished` (a draft the host has not yet made visible);
 * `publish()` makes it guest-visible, `unpublish()` hides it again.
 *
 * String values match the Prisma `ListingStatus` DB enum and the shared
 * `listingStatus` contract, so the mapper casts straight across — but this is
 * the domain's own declaration (no Prisma / contract import in the domain).
 */
export enum ListingStatus {
  Published = 'Published',
  Unpublished = 'Unpublished',
}
