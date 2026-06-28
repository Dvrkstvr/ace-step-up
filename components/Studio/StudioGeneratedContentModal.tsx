import React from 'react';
import { X } from 'lucide-react';

// TODO: Reuse NewTrackModal generation form here, routing the result to addLayer
// instead of creating a new top-level track. This requires wiring up the full
// generation flow (params, job polling, result handling).

interface StudioGeneratedContentModalProps {
  onClose: () => void;
}

const StudioGeneratedContentModal: React.FC<StudioGeneratedContentModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-zinc-200 dark:border-white/10 w-80 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Generated Content</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-500 dark:text-zinc-400 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        <div className="py-6 text-center">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Generation form — coming soon</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2">
            This will let you generate audio directly onto a Studio layer.
          </p>
        </div>
        <button
          onClick={onClose}
          className="mt-2 w-full px-4 py-2 rounded-lg text-sm font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default StudioGeneratedContentModal;
