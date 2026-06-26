import React, { useState, useEffect } from 'react';
import { Settings, Sun, Moon, ChevronRight } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { SettingsModal } from './SettingsModal';
import { TopView } from '../types';

interface TopNavProps {
  topView: TopView;
  onChangeView: (v: TopView) => void;
}

const TopNav: React.FC<TopNavProps> = ({ topView, onChangeView }) => {
  const { breadcrumb, navigateTo } = useWorkspace();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      return (localStorage.getItem('ace-theme') as 'light' | 'dark') || 'dark';
    } catch {
      return 'dark';
    }
  });

  // Sync dark class on <html> and persist
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try { localStorage.setItem('ace-theme', theme); } catch { /* storage unavailable */ }
  }, [theme]);

  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'));

  // ── Breadcrumb ────────────────────────────────────────────────────────────

  const renderBreadcrumb = () => {
    if (breadcrumb.level === 'root') {
      return (
        <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
          Generation
        </span>
      );
    }

    if (breadcrumb.level === 'workspace') {
      return (
        <div className="flex items-center gap-1 text-sm">
          <button
            onClick={() => navigateTo({ level: 'root' })}
            className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            Generation
          </button>
          <ChevronRight size={14} className="text-zinc-400 dark:text-zinc-600 flex-shrink-0" />
          <span className="font-semibold text-zinc-900 dark:text-white truncate">
            {breadcrumb.workspace.name}
          </span>
        </div>
      );
    }

    // level === 'song'
    return (
      <div className="flex items-center gap-1 text-sm min-w-0">
        <button
          onClick={() => navigateTo({ level: 'root' })}
          className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors flex-shrink-0"
        >
          Generation
        </button>
        <ChevronRight size={14} className="text-zinc-400 dark:text-zinc-600 flex-shrink-0" />
        <button
          onClick={() => navigateTo({ level: 'workspace', workspace: breadcrumb.workspace })}
          className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors truncate max-w-[160px]"
        >
          {breadcrumb.workspace.name}
        </button>
        <ChevronRight size={14} className="text-zinc-400 dark:text-zinc-600 flex-shrink-0" />
        <span className="font-semibold text-zinc-900 dark:text-white truncate">
          {breadcrumb.project.name}
        </span>
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <header className="bg-white dark:bg-suno-panel border-b border-zinc-200 dark:border-suno-border flex-shrink-0 z-40">
      {/* Row 1 — logo / tabs / controls */}
      <div className="flex items-center h-14 px-4 gap-3">
        {/* Logo */}
        <div className="flex items-center gap-2 flex-shrink-0 mr-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-[11px] font-extrabold tracking-tight">A</span>
          </div>
          <span className="text-sm font-bold text-zinc-900 dark:text-white hidden sm:block select-none">
            ACE-Step Up
          </span>
        </div>

        {/* Tab buttons — centered */}
        <div className="flex-1 flex items-center justify-center gap-1">
          <button
            onClick={() => onChangeView('generation')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              topView === 'generation'
                ? 'bg-pink-500/20 text-pink-600 dark:text-pink-400 border border-pink-500/30'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5'
            }`}
          >
            Generation
          </button>
          <button
            onClick={() => onChangeView('training')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              topView === 'training'
                ? 'bg-pink-500/20 text-pink-600 dark:text-pink-400 border border-pink-500/30'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5'
            }`}
          >
            Training
          </button>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-2 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors"
            title="Settings"
            aria-label="Settings"
          >
            <Settings size={18} />
          </button>
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </div>

      {/* Row 2 — Breadcrumb (generation view only) */}
      {topView === 'generation' && (
        <div className="px-4 pb-2.5 overflow-hidden">
          {renderBreadcrumb()}
        </div>
      )}

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    </header>
  );
};

export default TopNav;
