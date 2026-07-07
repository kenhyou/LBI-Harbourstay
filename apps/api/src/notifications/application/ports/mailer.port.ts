/**
 * BC-8 outbound mail port. The MVP binds this to a TEST mailer (logs/stores, no
 * real email). `data` is the primitives payload carried by the outbox event.
 */
export abstract class MailerPort {
  abstract send(
    to: string,
    template: string,
    data: Record<string, unknown>,
  ): Promise<void>;
}
