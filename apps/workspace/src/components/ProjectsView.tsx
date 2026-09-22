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
    <div className="space-y-8 pb-20 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl text-neutral-900 dark:text-white font-normal tracking-tight">
            Projects
          </h2>
          <p className="text-neutral-500 dark:text-neutral-400 text-xs mt-1">
            Private projects, systems, and working notes.
          </p>
        </div>
        <button
          onClick={onNewProject}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium bg-neutral-900 text-white dark:bg-white dark:text-black hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors cursor-pointer shadow-xs"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2]" />
          <span>New Project</span>
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="bg-white dark:bg-[#16171b] rounded-2xl p-16 border border-neutral-200/70 dark:border-white/[0.07] text-center shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-neutral-100 dark:bg-white/5 flex items-center justify-center mx-auto mb-4 text-neutral-400 dark:text-neutral-500">
            <FolderDot className="w-6 h-6 stroke-[1.5]" />
          </div>
          <h3 className="text-sm font-medium text-neutral-900 dark:text-white">
            No projects yet
          </h3>
          <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1 max-w-sm mx-auto leading-relaxed">
            Keep private projects and working notes in one place.
          </p>
          <button
            onClick={onNewProject}
            className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium bg-neutral-100 dark:bg-white/10 hover:bg-neutral-200 dark:hover:bg-white/15 text-neutral-800 dark:text-neutral-200 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create First Project</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {projects.map((project) => (
            <div
              key={project.id}
              className="bg-white dark:bg-[#16171b] rounded-2xl p-5 border border-neutral-200/80 dark:border-white/[0.07] shadow-xs flex flex-col justify-between"
            >
              <div>
                <h3 className="text-sm font-medium text-neutral-900 dark:text-white">
                  {project.name}
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                  {project.tagline}
                </p>
                <p className="text-xs text-neutral-600 dark:text-neutral-300 mt-3 leading-relaxed">
                  {project.description}
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-neutral-100 dark:border-white/[0.05] flex items-center justify-between text-[11px] text-neutral-400">
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
