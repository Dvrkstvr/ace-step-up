import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Play, Edit3, Scissors, ArrowUp, RefreshCw, FileText, Trash2, Loader2,
} from 'lucide-react';
import { useStudio } from '../context/StudioContext';
import { projectsApi, tracksApi } from '../services/api';
import { Track } from '../types';
import { ConfirmDialog } from './ConfirmDialog';

export interface TrackContextMenuProps {
  track: Track;
  onClose: () => void;
  onUpdate: () => void;
  position?: { x: number; y: number };
}

const TrackContextMenu: React.FC<TrackContextMenuProps> = ({
  track,
  onClose,
  onUpdate,
  position = { x: 0, y: 0 },
}) => {
  const { openStudio } = useStudio();
  const menuRef = useRef<HTMLDivElement>(null);

  // Inline states
  const [showRename, setShowRename] = useState(false);
  const [renameValue, setRenameValue] = useState(track.title);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [inlineMsg, setInlineMsg] = useState('');

  // Smart placement — nudge away from screen edges after first render
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({
    left: position.x,
    top: position.y,
    opacity: 0,  // invisible until placement resolved
  });

  useEffect(() => {
    if (!menuRef.current) return;
    const { width, height } = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const x = Math.min(position.x, vw - width - 8);
    const y = Math.min(position.y, vh - height - 8);
    setMenuStyle({ left: Math.max(8, x), top: Math.max(8, y), opacity: 1 });
  }, []); // run once after mount

  // Escape key + click-outside dismissal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  // ── Actions ─────────────────────────────────────────────────────────────

  const showComingSoon = (label: string) => {
    setInlineMsg(`${label} coming soon`);
    setTimeout(() => setInlineMsg(''), 2500);
  };

  const handlePlay = () => {
    window.dispatchEvent(new CustomEvent('ace:play-track', { detail: track }));
    onClose();
  };

  const handleOpenInStudio = async () => {
    onClose();
    try {
      await openStudio(track);
    } catch (err) {
      console.error('Failed to open studio:', err);
    }
  };

  const handlePromoteToSong = async () => {
    setLoading('promote');
    try {
      await projectsApi.promote(track.id);
      onUpdate();
      onClose();
    } catch (err) {
      console.error('Failed to promote track:', err);
    } finally {
      setLoading(null);
    }
  };

  const handleCreateVariation = async () => {
    setLoading('variation');
    try {
      await tracksApi.iterate(track.id);
      onUpdate();
      onClose();
    } catch (err) {
      console.error('Failed to create variation:', err);
    } finally {
      setLoading(null);
    }
  };

  const handleRename = async () => {
    const trimmed = renameValue.trim();
    if (!trimmed) { setShowRename(false); return; }
    if (trimmed === track.title) { setShowRename(false); return; }
    setLoading('rename');
    try {
      await tracksApi.update(track.id, { title: trimmed });
      onUpdate();
      onClose();
    } catch (err) {
      console.error('Failed to rename track:', err);
    } finally {
      setLoading(null);
      setShowRename(false);
    }
  };

  const handleDelete = async () => {
    try {
      await tracksApi.delete(track.id);
      onUpdate();
      onClose();
    } catch (err) {
      console.error('Failed to delete track:', err);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  const menuContent = (
    <>
      <div
        ref={menuRef}
        style={{ ...menuStyle, position: 'fixed', zIndex: 9999 }}
        className="w-52 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-xl shadow-2xl overflow-hidden transition-opacity duration-75"
        onClick={e => e.stopPropagation()}
      >
        {/* Inline status message (coming soon / errors) */}
        {inlineMsg && (
          <div className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-white/5 border-b border-zinc-100 dark:border-white/5">
            {inlineMsg}
          </div>
        )}

        <div className="py-1">
          {/* Play */}
          <MenuItem icon={<Play size={14} />} onClick={handlePlay}>
            Play
          </MenuItem>

          {/* Open in Studio */}
          <MenuItem icon={<Edit3 size={14} />} onClick={handleOpenInStudio}>
            Open in Studio
          </MenuItem>

          <Divider />

          {/* Split to Stems */}
          <MenuItem icon={<Scissors size={14} />} onClick={() => showComingSoon('Split to Stems')}>
            Split to Stems <ComingSoonBadge />
          </MenuItem>

          {/* Promote to Song — only for tracks not already in a project */}
          {!track.project_id && (
            <MenuItem
              icon={<ArrowUp size={14} />}
              onClick={handlePromoteToSong}
              loading={loading === 'promote'}
            >
              Promote to Song
            </MenuItem>
          )}

          {/* Create Variation */}
          <MenuItem
            icon={<RefreshCw size={14} />}
            onClick={handleCreateVariation}
            loading={loading === 'variation'}
          >
            Create Variation
          </MenuItem>

          {/* Extract Prompt */}
          <MenuItem icon={<FileText size={14} />} onClick={() => showComingSoon('Extract Prompt')}>
            Extract Prompt <ComingSoonBadge />
          </MenuItem>

          <Divider />

          {/* Rename */}
          {showRename ? (
            <div className="px-3 py-2" onClick={e => e.stopPropagation()}>
              <input
                type="text"
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onKeyDown={e => {
                  e.stopPropagation();
                  if (e.key === 'Enter') handleRename();
                  if (e.key === 'Escape') {
                    setShowRename(false);
                    setRenameValue(track.title);
                  }
                }}
                autoFocus
                className="w-full px-2 py-1.5 text-sm rounded-lg bg-zinc-100 dark:bg-white/10 border border-zinc-300 dark:border-white/20 text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:border-pink-500/50"
              />
              <div className="flex gap-1.5 mt-2">
                <button
                  onClick={() => { setShowRename(false); setRenameValue(track.title); }}
                  className="flex-1 py-1.5 text-xs rounded-lg bg-zinc-100 dark:bg-white/5 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRename}
                  disabled={loading === 'rename'}
                  className="flex-1 py-1.5 text-xs rounded-lg bg-pink-500 hover:bg-pink-600 text-white disabled:opacity-50 flex items-center justify-center gap-1 transition-colors"
                >
                  {loading === 'rename' && <Loader2 size={11} className="animate-spin" />}
                  Save
                </button>
              </div>
            </div>
          ) : (
            <MenuItem
              icon={<Edit3 size={14} />}
              onClick={() => setShowRename(true)}
            >
              Rename
            </MenuItem>
          )}

          {/* Delete */}
          <MenuItem
            icon={<Trash2 size={14} />}
            onClick={() => setShowDeleteConfirm(true)}
            danger
          >
            Delete
          </MenuItem>
        </div>
      </div>

      {showDeleteConfirm && (
        <ConfirmDialog
          isOpen
          title="Delete Track"
          message={`Are you sure you want to delete "${track.title}"? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </>
  );

  return createPortal(menuContent, document.body);
};

// ── Helper sub-components ─────────────────────────────────────────────────────

interface MenuItemProps {
  icon?: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  loading?: boolean;
}

const MenuItem: React.FC<MenuItemProps> = ({ icon, onClick, children, danger = false, loading = false }) => (
  <button
    onClick={onClick}
    disabled={loading}
    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors disabled:opacity-50 text-left ${
      danger
        ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10'
        : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-white'
    }`}
  >
    <span className="flex-shrink-0 w-4 flex items-center justify-center">
      {loading
        ? <Loader2 size={13} className="animate-spin" />
        : icon}
    </span>
    <span className="flex items-center gap-2 flex-1">{children}</span>
  </button>
);

const Divider: React.FC = () => (
  <div className="my-1 border-t border-zinc-100 dark:border-white/5" />
);

const ComingSoonBadge: React.FC = () => (
  <span className="text-[9px] px-1 py-0.5 bg-zinc-100 dark:bg-white/10 text-zinc-400 dark:text-zinc-500 rounded font-semibold uppercase tracking-wide leading-none">
    soon
  </span>
);

export default TrackContextMenu;
