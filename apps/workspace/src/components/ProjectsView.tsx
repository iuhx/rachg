import React, { useState } from 'react';
import {
  Plus,
  ExternalLink,
  Globe,
  Layers,
  Sparkles,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Compass,
} from 'lucide-react';
import type { Project, ProjectStatus } from '../types';
import { ArtThumbnail } from './ArtThumbnail';

interface ProjectsViewProps {
  projects: Project[];
  onSelectProject: (p: Project) => void;
  onNewProject: () => void;
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({
  projects,
  onSelectProject,
  onNewProject,
}) => {
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredProjects = projects.filter((p) => {
    const matchesFilter = filterStatus === 'all' || p.status.toLowerCase() === filterStatus.toLowerCase();
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.tagline.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.stack.some((s) => s.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  const getStatusBadge = (status: ProjectStatus) => {
    switch (status) {
      case 'In Progress':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            In Progress
          </span>
        );
      case 'Planning':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-50 text-slate-700 dark:bg-slate-800/40 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/30">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            Planning
          </span>
        );
      case 'Exploring':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200/50 dark:border-blue-800/30">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            Exploring
          </span>
        );
      case 'Live':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300 border border-teal-200/50 dark:border-teal-800/30">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
            Live
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
            <span className="w-1.5 h-1.5 rounded-full bg-neutral-400" />
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl text-neutral-900 dark:text-white font-normal tracking-tight">
            Projects
          </h2>
          <p className="text-neutral-500 dark:text-neutral-400 text-xs mt-1">
            Personal software, systems, and active applications.
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

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          {['all', 'in progress', 'planning', 'exploring', 'live'].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs capitalize transition-colors cursor-pointer ${
                filterStatus === s
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-black font-medium'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search projects..."
            className="w-full pl-9 pr-3 py-1.5 rounded-xl text-xs bg-white dark:bg-[#16171b] border border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:focus:ring-white/20 transition-all"
          />
        </div>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
        {filteredProjects.map((project) => (
          <div
            key={project.id}
            onClick={() => onSelectProject(project)}
            className="bg-white dark:bg-[#16171b] rounded-2xl p-5 border border-neutral-200/80 dark:border-white/[0.07] shadow-xs hover:shadow-md hover:border-neutral-300 dark:hover:border-white/15 transition-all cursor-pointer group flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <ArtThumbnail
                    id={project.id}
                    name={project.name}
                    gradient={project.thumbnailGradient}
                    styleVariant={project.thumbnailStyle}
                    className="w-12 h-12 rounded-xl"
                  />
                  <div>
                    <h3 className="text-sm font-medium text-neutral-900 dark:text-white group-hover:text-black dark:group-hover:text-white transition-colors">
                      {project.name}
                    </h3>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 line-clamp-1">
                      {project.tagline}
                    </p>
                  </div>
                </div>

                {getStatusBadge(project.status)}
              </div>

              <p className="text-xs text-neutral-600 dark:text-neutral-300 mt-4 leading-relaxed line-clamp-2">
                {project.description}
              </p>
            </div>

            <div className="mt-5 pt-4 border-t border-neutral-100 dark:border-white/[0.05] flex items-center justify-between text-[11px] text-neutral-400">
              <div className="flex items-center gap-2 flex-wrap">
                {project.stack.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 font-mono text-[10px]"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {project.externalUrl && (
                <a
                  href={project.externalUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1 hover:text-neutral-800 dark:hover:text-white transition-colors"
                >
                  <span>Launch</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
