import { Payment } from './payment.model';
import { Money } from '@/payment/domain/vo/money.vo';
import { PaymentStatus } from '@/payment/domain/enums/payment-status.enum';
import { InvalidPaymentStateException } from '@/payment/domain/exceptions/invalid-payment-state.exception';

/**
 * KEN'S EXECUTABLE SPEC for the `Payment` aggregate. Pure unit — ZERO mocks. RED
 * until you implement `payment.model.ts` (and the VOs/exception it depends on).
 *
 * The idempotency cases are the heart of S4: a duplicate Stripe webhook re-applies
 * the SAME terminal state and must be a NO-OP, while a CONFLICTING transition must
 * throw. Do not weaken these to pass a stub.
 */
describe('Payment (aggregate)', () => {
  const bookingId = '22222222-2222-2222-2222-222222222222';

  function newPayment(): Payment {
    return Payment.create({
      bookingId,
      amount: Money.create(33_000, 'USD'),
      stripePaymentIntentId: 'pi_test_123',
    });
  }

  describe('create', () => {
    it('starts Pending with a generated id and the given fields', () => {
      const payment = newPayment();
      expect(payment.status).toBe(PaymentStatus.Pending);
      expect(payment.bookingId).toBe(bookingId);
      expect(payment.stripePaymentIntentId).toBe('pi_test_123');
      expect(payment.amount.amount).toBe(33_000);
      expect(payment.amount.currency).toBe('USD');
      expect(typeof payment.id).toBe('string');
      expect(payment.id.length).toBeGreaterThan(0);
      expect(payment.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('markSucceeded', () => {
    it('transitions Pending → Succeeded', () => {
      const payment = newPayment();
      payment.markSucceeded();
      expect(payment.status).toBe(PaymentStatus.Succeeded);
    });

    it('is IDEMPOTENT — calling it twice stays Succeeded and does not throw', () => {
      const payment = newPayment();
      payment.markSucceeded();
      expect(() => payment.markSucceeded()).not.toThrow();
      expect(payment.status).toBe(PaymentStatus.Succeeded);
    });

    it('throws InvalidPaymentStateException on a Failed payment (conflict)', () => {
      const payment = newPayment();
      payment.markFailed();
      expect(() => payment.markSucceeded()).toThrow(InvalidPaymentStateException);
      expect(payment.status).toBe(PaymentStatus.Failed);
    });
  });

  describe('markFailed', () => {
    it('transitions Pending → Failed', () => {
      const payment = newPayment();
      payment.markFailed();
      expect(payment.status).toBe(PaymentStatus.Failed);
    });

    it('is IDEMPOTENT — calling it twice stays Failed and does not throw', () => {
      const payment = newPayment();
      payment.markFailed();
      expect(() => payment.markFailed()).not.toThrow();
      expect(payment.status).toBe(PaymentStatus.Failed);
    });

    it('throws InvalidPaymentStateException on a Succeeded payment (conflict)', () => {
      const payment = newPayment();
      payment.markSucceeded();
      expect(() => payment.markFailed()).toThrow(InvalidPaymentStateException);
      expect(payment.status).toBe(PaymentStatus.Succeeded);
    });
  });

  describe('reconstitute', () => {
    it('restores a persisted Succeeded payment without generating a new id', () => {
      const createdAt = new Date('2026-07-01T00:00:00.000Z');
      const payment = Payment.reconstitute({
        id: '33333333-3333-3333-3333-333333333333',
        bookingId,
        amount: Money.reconstitute(33_000, 'USD'),
        status: PaymentStatus.Succeeded,
        stripePaymentIntentId: 'pi_test_123',
        createdAt,
      });
      expect(payment.id).toBe('33333333-3333-3333-3333-333333333333');
      expect(payment.status).toBe(PaymentStatus.Succeeded);
      expect(payment.amount.amount).toBe(33_000);
    });
  });
});
