import { Injectable, Logger } from '@nestjs/common';
import { MailerPort } from '@/notifications/application/ports/mailer.port';

/** A record of one "sent" email, for test assertions. */
export interface SentMail {
  to: string;
  template: string;
  data: Record<string, unknown>;
}

/**
 * Test mailer adapter (MVP). Does NOT send real email — it logs each message and
 * keeps them in `sent` so tests can assert delivery. Swap for an SMTP/provider
 * adapter later without touching the handler or port.
 */
@Injectable()
export class TestMailerAdapter extends MailerPort {
  private readonly logger = new Logger(TestMailerAdapter.name);
  /** In-memory outbox of everything "sent" this process, for inspection/tests. */
  readonly sent: SentMail[] = [];

  async send(
    to: string,
    template: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    this.sent.push({ to, template, data });
    this.logger.log(`[test-mailer] to=${to} template=${template}`);
    return Promise.resolve();
  }
}
