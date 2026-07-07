import { ConfigService } from '@nestjs/config';
import { StripePaymentAdapter } from './stripe-payment.adapter';

/** A ConfigService returning valid test keys. */
function testConfig(): ConfigService {
  const values: Record<string, string> = {
    STRIPE_SECRET_KEY: 'sk_test_dummy',
    STRIPE_WEBHOOK_SECRET: 'whsec_dummy',
  };
  return {
    get: (key: string): string | undefined => values[key],
  } as unknown as ConfigService;
}

/** Minimal shape of the Stripe SDK the adapter touches, all mocked. */
interface StripeStub {
  paymentIntents: { create: jest.Mock };
  webhooks: { constructEvent: jest.Mock };
}

describe('StripePaymentAdapter (BC-4 Stripe ACL)', () => {
  it('fails fast if the secret key is not configured', () => {
    const config = { get: (): undefined => undefined } as unknown as ConfigService;
    expect(() => new StripePaymentAdapter(config)).toThrow(
      /STRIPE_SECRET_KEY/,
    );
  });

  describe('with a stubbed Stripe SDK', () => {
    let adapter: StripePaymentAdapter;
    let stripe: StripeStub;

    beforeEach(() => {
      adapter = new StripePaymentAdapter(testConfig());
      stripe = {
        paymentIntents: { create: jest.fn() },
        webhooks: { constructEvent: jest.fn() },
      };
      // Replace the real client with the stub (unit isolation, no network).
      (adapter as unknown as { stripe: StripeStub }).stripe = stripe;
    });

    it('createIntent returns the intent id + client secret and lowercases currency', async () => {
      stripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_1',
        client_secret: 'cs_1',
      });

      const result = await adapter.createIntent('booking-1', 33_000, 'USD');

      expect(result).toEqual({ intentId: 'pi_1', clientSecret: 'cs_1' });
      expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 33_000,
          currency: 'usd',
          metadata: { bookingId: 'booking-1' },
        }),
      );
    });

    it('createIntent throws if Stripe returns no client secret', async () => {
      stripe.paymentIntents.create.mockResolvedValue({ id: 'pi_1', client_secret: null });
      await expect(adapter.createIntent('b', 1, 'usd')).rejects.toThrow();
    });

    it('verifyAndParse maps payment_intent.succeeded → succeeded', () => {
      stripe.webhooks.constructEvent.mockReturnValue({
        id: 'evt_1',
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_1' } },
      });

      const result = adapter.verifyAndParse(Buffer.from('{}'), 'sig');

      expect(result).toEqual({
        eventId: 'evt_1',
        type: 'succeeded',
        paymentIntentId: 'pi_1',
      });
      // Signature is verified with the raw bytes + the configured webhook secret.
      expect(stripe.webhooks.constructEvent).toHaveBeenCalledWith(
        expect.any(Buffer),
        'sig',
        'whsec_dummy',
      );
    });

    it('verifyAndParse maps payment_intent.payment_failed → failed', () => {
      stripe.webhooks.constructEvent.mockReturnValue({
        id: 'evt_2',
        type: 'payment_intent.payment_failed',
        data: { object: { id: 'pi_2' } },
      });
      expect(adapter.verifyAndParse(Buffer.from('{}'), 'sig')).toEqual({
        eventId: 'evt_2',
        type: 'failed',
        paymentIntentId: 'pi_2',
      });
    });

    it('verifyAndParse marks events it does not act on as ignored', () => {
      stripe.webhooks.constructEvent.mockReturnValue({
        id: 'evt_3',
        type: 'charge.updated',
        data: { object: { id: 'ch_1' } },
      });
      expect(adapter.verifyAndParse(Buffer.from('{}'), 'sig').type).toBe('ignored');
    });

    it('verifyAndParse propagates a signature verification failure (never translates unverified input)', () => {
      stripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('signature verification failed');
      });
      expect(() => adapter.verifyAndParse(Buffer.from('{}'), 'bad')).toThrow(
        /signature/,
      );
    });
  });
});
