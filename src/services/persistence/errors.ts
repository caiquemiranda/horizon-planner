import type { z } from 'zod';

import type { UUID } from '@/types/project';

export class ProjectNotFoundError extends Error {
  override readonly name = 'ProjectNotFoundError';

  constructor(readonly projectId: UUID) {
    super(`Project "${projectId}" was not found.`);
  }
}

/** Raised when data does not satisfy the domain schemas. */
export class ProjectValidationError extends Error {
  override readonly name = 'ProjectValidationError';

  constructor(readonly issues: readonly z.core.$ZodIssue[]) {
    super(issues.map((issue) => issue.message).join(' ') || 'Invalid project data.');
  }
}

export type PersistenceErrorReason =
  'quota-exceeded' | 'unavailable' | 'corrupted' | 'unsupported-version';

/** Raised when the underlying storage cannot be read or written. */
export class PersistenceError extends Error {
  override readonly name = 'PersistenceError';

  constructor(
    readonly reason: PersistenceErrorReason,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
