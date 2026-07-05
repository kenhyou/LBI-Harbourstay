import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PasswordHasherPort } from '@/identity/application/ports/password-hasher.port';

/**
 * bcrypt impl of the `PasswordHasherPort`. Cost factor 12 (see ADR-0006) —
 * a sane 2026 default balancing brute-force resistance against login latency.
 * The only place bcrypt is referenced.
 */
@Injectable()
export class BcryptPasswordHasher extends PasswordHasherPort {
  private static readonly ROUNDS = 12;

  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, BcryptPasswordHasher.ROUNDS);
  }

  compare(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
