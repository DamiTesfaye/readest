import type { UserPlan } from '@/types/quota';

export const FREE_MAP_LIMIT = 3;

export const canCreateMap = (plan: UserPlan, count: number): boolean =>
  plan !== 'free' || count < FREE_MAP_LIMIT;
