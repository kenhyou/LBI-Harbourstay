import type { AuthUser, Role as ContractRole } from '@harbourstay/shared';
import { User } from '@/identity/domain/models/user.model';
import { Role } from '@/identity/domain/enums/role.enum';

/**
 * Command-result mapping: domain `User` → the SAFE `AuthUser` contract DTO.
 * The write path is allowed to project the aggregate it just mutated into a DTO
 * for the response (this is NOT the CQRS read path — that lives in infra/queries
 * and never touches a domain model). `passwordHash` is deliberately dropped.
 */
export function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email.value,
    role: toContractRole(user.role),
  };
}

/** Domain `Role` enum → the contract role string. Values coincide by design. */
export function toContractRole(role: Role): ContractRole {
  return role as unknown as ContractRole;
}
