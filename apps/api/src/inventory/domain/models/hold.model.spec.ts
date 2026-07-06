import { Hold } from './hold.model';
import { DateRange } from '@/inventory/domain/vo/date-range.vo';
import { HoldStatus } from '@/inventory/domain/enums/hold-status.enum';
import { InvalidHoldStateException } from '@/inventory/domain/exceptions/invalid-hold-state.exception';

const d = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
const range = (): DateRange => DateRange.create(d('2026-07-01'), d('2026-07-04'));

/**
 * BC-2 `Hold` aggregate spec (scaffold-owned, GREEN now). Positive AND negative
 * per transition. Zero mocks. The cross-hold non-overlap invariant lives in the
 * DB, not here — this pins only the aggregate's own lifecycle.
 */
describe('Hold (aggregate root)', () => {
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  describe('create', () => {
    it('starts Active with a generated id and a TTL in the future', () => {
      const before = Date.now();
      const hold = Hold.create({ listingId: 'listing-1', dateRange: range(), ttlMinutes: 15 });

      expect(hold.id).toMatch(UUID_RE);
      expect(hold.listingId).toBe('listing-1');
      expect(hold.status).toBe(HoldStatus.Active);
      expect(hold.expiresAt.getTime()).toBeGreaterThan(before);
    });

    it('sets expiresAt roughly ttlMinutes ahead', () => {
      const hold = Hold.create({ listingId: 'l', dateRange: range(), ttlMinutes: 15 });
      const deltaMin = (hold.expiresAt.getTime() - hold.createdAt.getTime()) / 60_000;
      expect(deltaMin).toBeCloseTo(15, 1);
    });
  });

  describe('commit (Active -> Committed)', () => {
    it('commits an Active hold', () => {
      const hold = Hold.create({ listingId: 'l', dateRange: range(), ttlMinutes: 15 });
      hold.commit();
      expect(hold.status).toBe(HoldStatus.Committed);
    });

    it('cannot commit an already-committed hold', () => {
      const hold = Hold.create({ listingId: 'l', dateRange: range(), ttlMinutes: 15 });
      hold.commit();
      expect(() => hold.commit()).toThrow(InvalidHoldStateException);
    });

    it('cannot commit a released hold', () => {
      const hold = Hold.create({ listingId: 'l', dateRange: range(), ttlMinutes: 15 });
      hold.release();
      expect(() => hold.commit()).toThrow(InvalidHoldStateException);
    });
  });

  describe('release (Active|Committed -> Released)', () => {
    it('releases an Active hold', () => {
      const hold = Hold.create({ listingId: 'l', dateRange: range(), ttlMinutes: 15 });
      hold.release();
      expect(hold.status).toBe(HoldStatus.Released);
    });

    it('releases a Committed hold (cancel after payment)', () => {
      const hold = Hold.create({ listingId: 'l', dateRange: range(), ttlMinutes: 15 });
      hold.commit();
      hold.release();
      expect(hold.status).toBe(HoldStatus.Released);
    });

    it('cannot release an already-released hold', () => {
      const hold = Hold.create({ listingId: 'l', dateRange: range(), ttlMinutes: 15 });
      hold.release();
      expect(() => hold.release()).toThrow(InvalidHoldStateException);
    });
  });

  describe('expire (Active -> Expired)', () => {
    it('expires an Active hold', () => {
      const hold = Hold.create({ listingId: 'l', dateRange: range(), ttlMinutes: 15 });
      hold.expire();
      expect(hold.status).toBe(HoldStatus.Expired);
    });

    it('cannot expire a committed hold', () => {
      const hold = Hold.create({ listingId: 'l', dateRange: range(), ttlMinutes: 15 });
      hold.commit();
      expect(() => hold.expire()).toThrow(InvalidHoldStateException);
    });
  });

  describe('reconstitute', () => {
    it('round-trips every field from a snapshot without generating a new id', () => {
      const snapshot = {
        id: '11111111-1111-4111-8111-111111111111',
        listingId: 'listing-9',
        dateRange: range(),
        status: HoldStatus.Committed,
        expiresAt: d('2026-07-01'),
        createdAt: d('2026-06-30'),
      };
      const hold = Hold.reconstitute(snapshot);
      expect(hold.id).toBe(snapshot.id);
      expect(hold.status).toBe(HoldStatus.Committed);
      expect(hold.dateRange.equals(snapshot.dateRange)).toBe(true);
    });
  });
});
