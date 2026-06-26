import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Workspace, Project, BreadcrumbLevel } from '../types';
import { workspacesApi, projectsApi } from '../services/api';

interface WorkspaceContextType {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  setActiveWorkspace: (ws: Workspace | null) => void;
  createWorkspace: (name: string, type: string) => Promise<Workspace>;
  deleteWorkspace: (id: string) => Promise<void>;
  refreshWorkspaces: () => Promise<void>;

  breadcrumb: BreadcrumbLevel;
  navigateTo: (level: BreadcrumbLevel) => void;

  activeProject: Project | null;
  setActiveProject: (p: Project | null) => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbLevel>({ level: 'root' });

  const refreshWorkspaces = useCallback(async (): Promise<void> => {
    try {
      const data = await workspacesApi.list();
      setWorkspaces(data);
    } catch (error) {
      console.error('Failed to load workspaces:', error);
    }
  }, []);

  // Fetch workspaces on mount
  useEffect(() => {
    refreshWorkspaces();
  }, [refreshWorkspaces]);

  const navigateTo = useCallback((level: BreadcrumbLevel): void => {
    setBreadcrumb(level);
    if (level.level === 'root') {
      setActiveWorkspace(null);
      setActiveProject(null);
    } else if (level.level === 'workspace') {
      setActiveWorkspace(level.workspace);
      setActiveProject(null);
    } else if (level.level === 'song') {
      setActiveWorkspace(level.workspace);
      setActiveProject(level.project);
    }
  }, []);

  const createWorkspace = useCallback(async (name: string, type: string): Promise<Workspace> => {
    const created = await workspacesApi.create(name, type);
    await refreshWorkspaces();
    return created;
  }, [refreshWorkspaces]);

  const deleteWorkspace = useCallback(async (id: string): Promise<void> => {
    await workspacesApi.delete(id);
    if (activeWorkspace?.id === id) {
      setActiveWorkspace(null);
      setActiveProject(null);
      setBreadcrumb({ level: 'root' });
    }
    await refreshWorkspaces();
  }, [activeWorkspace, refreshWorkspaces]);

  const value: WorkspaceContextType = {
    workspaces,
    activeWorkspace,
    setActiveWorkspace,
    createWorkspace,
    deleteWorkspace,
    refreshWorkspaces,
    breadcrumb,
    navigateTo,
    activeProject,
    setActiveProject,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextType {
  const context = useContext(WorkspaceContext);
  if (context === undefined) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}
