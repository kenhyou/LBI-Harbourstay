/**
 * BC-2's domain enum for a listing's kind. Mirrors the Prisma `ListingType`
 * enum AND the shared contract `listingType` — but is deliberately its OWN
 * declaration: the domain never imports Prisma types or contract Zod schemas
 * (that would couple the hexagon's core to the ORM / transport layer). The
 * mapper (infra) and the presenter (contract) translate at the boundaries.
 *
 * String values match the DB enum exactly, so persistence is a straight cast.
 */
export enum ListingType {
  Stay = 'stay',
  Tour = 'tour',
}
