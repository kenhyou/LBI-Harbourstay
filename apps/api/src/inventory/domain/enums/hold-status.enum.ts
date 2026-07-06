/**
 * BC-2 Hold lifecycle status. Values match the Postgres `HoldStatus` enum
 * (lowercase) so the mapper is a straight cast. `Active` = tentative (TTL);
 * `Committed` = permanent taking (post-payment); `Released`/`Expired` = returned
 * to supply. Only `Active`/`Committed` participate in the overbooking EXCLUDE.
 */
export enum HoldStatus {
  Active = 'active',
  Committed = 'committed',
  Released = 'released',
  Expired = 'expired',
}
