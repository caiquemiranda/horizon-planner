import type { UUID } from '@/types/project';

/** Generates a random RFC 4122 v4 identifier. */
export function createId(): UUID {
  return crypto.randomUUID();
}
