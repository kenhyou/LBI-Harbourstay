/**
 * Cross-cutting transaction boundary port. The application layer depends on THIS
 * (an abstract class → DI token), never on Prisma's `$transaction` or on the CLS
 * library — so application code stays framework/ORM-free (conventions §Backend
 * layering). The transaction *context* flows implicitly via CLS inside the infra
 * repositories (which read the ambient transactional client), never as a param.
 *
 * S3 is the first real use: `CreateBooking` writes a Hold (BC-2) and a Booking
 * (BC-1) in ONE transaction at the Partnership seam.
 */
export abstract class TransactionManagerPort {
  /** Run `work` inside a single DB transaction; commit on resolve, roll back on throw. */
  abstract run<T>(work: () => Promise<T>): Promise<T>;
}
