import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { HandleStripeWebhookCommand } from '@/payment/application/commands/handle-stripe-webhook.command';
import { PaymentGatewayPort } from '@/payment/application/ports/payment-gateway.port';
import { PaymentRepositoryPort } from '@/payment/application/ports/payment.repository.port';
import { ProcessedWebhookEventRepositoryPort } from '@/payment/application/ports/processed-webhook-event.repository.port';
import { TransactionManagerPort } from '@/shared/transaction/transaction-manager.port';
import { ProcessedWebhookEvent } from '@/payment/domain/models/processed-webhook-event.model';
import { PaymentNotFoundException } from '@/payment/domain/exceptions/payment-not-found.exception';
import { PaymentSucceededEvent } from '@/payment/domain/events/payment-succeeded.event';
import { PaymentFailedEvent } from '@/payment/domain/events/payment-failed.event';

/** What (if anything) to publish after the webhook txn commits. */
interface PublishPlan {
  paymentId: string;
  type: 'succeeded' | 'failed';
}

/**
 * Handle a verified Stripe webhook, idempotently. Flow:
 *   1. verify + translate via the ACL (throws on bad signature; `'ignored'` → 200)
 *   2. in ONE transaction: dedup on `event.id` (skip if seen), resolve the Payment
 *      from the intent, mark it Succeeded/Failed (aggregate transition is itself
 *      idempotent), and record the ledger row — all atomic
 *   3. AFTER commit, publish the in-process `PaymentSucceeded`/`PaymentFailed`
 *      event so the `BookingCheckoutSaga` runs its SEPARATE confirm/compensate txn
 *
 * Delivering the same event twice → the dedup ledger short-circuits the second,
 * so exactly one confirm / one Payment succeeded / one outbox row results.
 */
@CommandHandler(HandleStripeWebhookCommand)
export class HandleStripeWebhookHandler
  implements ICommandHandler<HandleStripeWebhookCommand, void>
{
  constructor(
    private readonly tx: TransactionManagerPort,
    private readonly gateway: PaymentGatewayPort,
    private readonly payments: PaymentRepositoryPort,
    private readonly processed: ProcessedWebhookEventRepositoryPort,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: HandleStripeWebhookCommand): Promise<void> {
    const event = this.gateway.verifyAndParse(command.rawBody, command.signature);
    if (event.type === 'ignored') {
      return;
    }

    const plan = await this.tx.run<PublishPlan | null>(async () => {
      if (await this.processed.exists(event.eventId)) {
        return null; // duplicate delivery — already handled, skip
      }

      const payment = await this.payments.findByStripeIntentId(
        event.paymentIntentId,
      );
      if (!payment) {
        throw new PaymentNotFoundException(event.paymentIntentId);
      }

      // Past the `'ignored'` guard above, so this is 'succeeded' | 'failed'.
      const outcome: 'succeeded' | 'failed' =
        event.type === 'succeeded' ? 'succeeded' : 'failed';
      if (outcome === 'succeeded') {
        payment.markSucceeded();
      } else {
        payment.markFailed();
      }
      await this.payments.save(payment);

      await this.processed.record(ProcessedWebhookEvent.create(event.eventId));

      return { paymentId: payment.id, type: outcome };
    });

    if (!plan) {
      return;
    }

    // Separate from the payment txn: the saga confirms/compensates in its own
    // transaction (eventual consistency — never hold a lock across Stripe).
    if (plan.type === 'succeeded') {
      this.eventBus.publish(new PaymentSucceededEvent(plan.paymentId));
    } else {
      this.eventBus.publish(new PaymentFailedEvent(plan.paymentId));
    }
  }
}
