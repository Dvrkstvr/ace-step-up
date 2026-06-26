import React, { useState } from 'react';
import { X } from 'lucide-react';
import { studioApi } from '../../services/api';
import { useStudio } from '../../context/StudioContext';

interface StudioRepaintFormProps {
  onClose: () => void;
}

const StudioRepaintForm: React.FC<StudioRepaintFormProps> = ({ onClose }) => {
  const { selectedRegion, layers } = useStudio();

  const region = selectedRegion ?? { layerId: '', start: 0, end: 0 };
  const layer = layers.find(l => l.id === region.layerId);

  const [regionStart, setRegionStart] = useState(region.start);
  const [regionEnd, setRegionEnd] = useState(region.end);
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState('');
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!layer) return;

    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      await studioApi.repaintRegion(layer.id, {
        region_start: regionStart,
        region_end: regionEnd,
        prompt: prompt || undefined,
        style: style || undefined,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Request failed';
      // 501 = not implemented yet
      if (msg.startsWith('501')) {
        setInfo('Repaint coming soon — the server endpoint is not yet implemented.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-zinc-200 dark:border-white/10 w-96 p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
            Repaint Region
            {layer && (
              <span className="ml-2 text-zinc-500 dark:text-zinc-400 font-normal">— {layer.name}</span>
            )}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-500 dark:text-zinc-400 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Region */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">Start (s)</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={regionStart}
                onChange={e => setRegionStart(parseFloat(e.target.value) || 0)}
                className="w-full px-2 py-1.5 text-sm rounded border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white outline-none focus:ring-1 focus:ring-pink-500"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">End (s)</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={regionEnd}
                onChange={e => setRegionEnd(parseFloat(e.target.value) || 0)}
                className="w-full px-2 py-1.5 text-sm rounded border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white outline-none focus:ring-1 focus:ring-pink-500"
              />
            </div>
          </div>

          {/* Prompt */}
          <div>
            <label className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">Prompt</label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              rows={3}
              placeholder="Describe the sound for this region…"
              className="w-full px-2 py-1.5 text-sm rounded border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white outline-none focus:ring-1 focus:ring-pink-500 resize-none"
            />
          </div>

          {/* Style */}
          <div>
            <label className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">Style</label>
            <input
              type="text"
              value={style}
              onChange={e => setStyle(e.target.value)}
              placeholder="e.g. ambient, orchestral, lo-fi…"
              className="w-full px-2 py-1.5 text-sm rounded border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white outline-none focus:ring-1 focus:ring-pink-500"
            />
          </div>

          {/* Feedback */}
          {info && (
            <div className="px-3 py-2 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs">
              {info}
            </div>
          )}
          {error && (
            <div className="px-3 py-2 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 rounded-lg bg-pink-600 hover:bg-pink-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              {loading ? 'Processing…' : 'Repaint'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default StudioRepaintForm;
