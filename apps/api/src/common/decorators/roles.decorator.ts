import { SetMetadata } from '@nestjs/common';
import type { AdminRole } from '../guards/admin-jwt.guard';

export const ROLES_KEY = 'roles';
/** จำกัด endpoint ให้เฉพาะ role ที่ระบุ (ใช้คู่ RolesGuard) — US-30 */
export const Roles = (...roles: AdminRole[]) => SetMetadata(ROLES_KEY, roles);
