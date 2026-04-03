import { forbidden } from '@/backend/utils/api-response'
import { ROLES, type Role } from '@/backend/config/constants'

// Role hierarchy: higher index = more permissions
const ROLE_HIERARCHY: Role[] = [
  ROLES.CASHIER,
  ROLES.STAFF,
  ROLES.BRANCH_MANAGER,
  ROLES.BUSINESS_OWNER,
  ROLES.SUPER_ADMIN,
]

export function hasRole(userRole: string, requiredRole: Role): boolean {
  const userIdx = ROLE_HIERARCHY.indexOf(userRole as Role)
  const reqIdx = ROLE_HIERARCHY.indexOf(requiredRole)
  return userIdx >= reqIdx
}

export function rbacMiddleware(
  userRole: string,
  requiredRole: Role
): { error: null } | { error: ReturnType<typeof forbidden> } {
  if (!hasRole(userRole, requiredRole)) {
    return {
      error: forbidden(`Requires ${requiredRole} role or higher`),
    }
  }
  return { error: null }
}
