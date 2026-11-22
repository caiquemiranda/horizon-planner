import { useEffect, useState } from 'react';

import { type ProjectRepository, projectRepository } from '@/services/persistence';
import type { Project } from '@/types/project';

/**
 * Read-only access to the saved projects.
 * Temporary bridge until the projects store (with create/update/delete) lands.
 */
export function useStoredProjects(repository: ProjectRepository = projectRepository): Project[] {
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    let active = true;

    repository
      .list()
      .then((stored) => {
        if (active) setProjects(stored);
      })
      .catch((error: unknown) => {
        console.error('[projects] Não foi possível carregar os projetos.', error);
      });

    return () => {
      active = false;
    };
  }, [repository]);

  return projects;
}
