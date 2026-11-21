import { describe, expect, it } from 'vitest';

import { ProjectValidationError } from '../errors';
import { InMemoryRepository } from '../InMemoryRepository';
import { createDependencies, makeDraft } from './helpers';
import { describeRepositoryContract } from './repositoryContract';

describeRepositoryContract(
  'InMemoryRepository',
  (dependencies) => new InMemoryRepository([], dependencies),
);

describe('InMemoryRepository', () => {
  it('accepts initial projects', async () => {
    const source = new InMemoryRepository([], createDependencies());
    const project = await source.create(makeDraft());

    const repository = new InMemoryRepository([project]);

    await expect(repository.list()).resolves.toEqual([project]);
  });

  it('throws on invalid initial projects', async () => {
    const source = new InMemoryRepository([], createDependencies());
    const project = await source.create(makeDraft());

    expect(() => new InMemoryRepository([{ ...project, progress: 999 }])).toThrow(
      ProjectValidationError,
    );
  });
});
