import React, { useState } from 'react';
import { Plus, FolderDot, Sparkles } from 'lucide-react';
import type { Project } from '../types';

interface ProjectsViewProps {
  projects: Project[];
  onNewProject: () => void;
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({
  projects,
  onNewProject,
}) => {
  return (
    <div className="workspace-view space-y-8 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="type-page-heading text-neutral-900 dark:text-white">
            Projects
          </h2>
          <p className="type-secondary mt-1">
            Private projects, systems, and working notes.
          </p>
        </div>
        <button
          onClick={onNewProject}
          className="workspace-button workspace-button-primary cursor-pointer shadow-xs"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2]" />
          <span>New Project</span>
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="workspace-card workspace-empty p-10 sm:p-16">
          <div className="workspace-empty-icon">
            <FolderDot className="w-6 h-6 stroke-[1.5]" />
          </div>
          <h3 className="type-section-heading text-neutral-900 dark:text-white">
            No projects yet
          </h3>
          <p className="type-secondary mt-1 max-w-sm mx-auto leading-relaxed">
            Keep private projects and working notes in one place.
          </p>
          <button
            onClick={onNewProject}
            className="workspace-button workspace-button-secondary mt-6 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create First Project</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {projects.map((project) => (
            <div
              key={project.id}
              className="workspace-card p-5 flex flex-col justify-between"
            >
              <div>
                <h3 className="type-section-heading text-neutral-900 dark:text-white">
                  {project.name}
                </h3>
                <p className="type-secondary mt-1">
                  {project.tagline}
                </p>
                <p className="type-body text-neutral-600 dark:text-neutral-300 mt-3">
                  {project.description}
                </p>
              </div>
              <div className="type-caption mt-5 pt-3 border-t border-neutral-100 dark:border-white/[0.05] flex items-center justify-between">
                <span>{project.status}</span>
                <span>{project.updatedAt}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
