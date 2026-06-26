import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useStudio } from '../../context/StudioContext';

interface StudioMixdownDialogProps {
  onClose: () => void;
}

type SaveAs = 'new_track' | 'new_version' | 'replace';

const SAVE_OPTIONS: { value: SaveAs; label: string; desc: string }[] = [
  { value: 'new_track', label: 'New Track', desc: 'Save as a standalone track in the library' },
  { value: 'new_version', label: 'New Version', desc: 'Save as a child version of the source track' },
  { value: 'replace', label: 'Replace Current', desc: 'Overwrite the source track\'s audio' },
];

const StudioMixdownDialog: React.FC<StudioMixdownDialogProps> = ({ onClose }) => {
  const { layers, mixdown } = useStudio();
  const [saveAs, setSaveAs] = useState<SaveAs>('new_track');
  const [trackName, setTrackName] = useState('');
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [includedLayers, setIncludedLayers] = useState<Set<string>>(
    new Set(layers.filter(l => !l.is_muted).map(l => l.id))
  );

  const toggleLayer = (id: string) => {
    setIncludedLayers(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleMixdown = async () => {
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      await mixdown(saveAs, trackName || undefined);
      setInfo('Mixdown complete!');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Request failed';
      if (msg.startsWith('501')) {
        setInfo('Mixdown coming soon — the server endpoint is not yet implemented.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const sortedLayers = [...layers].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-zinc-200 dark:border-white/10 w-[420px] p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Mixdown</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-500 dark:text-zinc-400 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Layer list */}
        <div className="mb-4">
          <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-2 font-medium uppercase tracking-wide">Include Layers</div>
          <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
            {sortedLayers.map(layer => (
              <label
                key={layer.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-50 dark:hover:bg-white/5 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={includedLayers.has(layer.id)}
                  onChange={() => toggleLayer(layer.id)}
                  className="rounded accent-pink-600"
                />
                <span className="text-sm text-zinc-800 dark:text-zinc-200 truncate flex-1">{layer.name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 uppercase tracking-wide flex-shrink-0">
                  {layer.source_type}
                </span>
              </label>
            ))}
            {sortedLayers.length === 0 && (
              <div className="text-xs text-zinc-400 dark:text-zinc-500 px-2 py-2">No layers in session.</div>
            )}
          </div>
        </div>

        {/* Save-as options */}
        <div className="mb-4">
          <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-2 font-medium uppercase tracking-wide">Save As</div>
          <div className="flex flex-col gap-1">
            {SAVE_OPTIONS.map(opt => (
              <label
                key={opt.value}
                className={`flex items-start gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                  saveAs === opt.value
                    ? 'border-pink-500 bg-pink-50 dark:bg-pink-900/20'
                    : 'border-zinc-200 dark:border-white/10 hover:bg-zinc-50 dark:hover:bg-white/5'
                }`}
              >
                <input
                  type="radio"
                  name="saveAs"
                  value={opt.value}
                  checked={saveAs === opt.value}
                  onChange={() => setSaveAs(opt.value)}
                  className="mt-0.5 accent-pink-600"
                />
                <div>
                  <div className="text-sm font-medium text-zinc-900 dark:text-white">{opt.label}</div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">{opt.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Track name */}
        {saveAs !== 'replace' && (
          <div className="mb-4">
            <label className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">Track Name (optional)</label>
            <input
              type="text"
              value={trackName}
              onChange={e => setTrackName(e.target.value)}
              placeholder="Leave blank to auto-generate"
              className="w-full px-2 py-1.5 text-sm rounded border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white outline-none focus:ring-1 focus:ring-pink-500"
            />
          </div>
        )}

        {/* Feedback */}
        {info && (
          <div className="mb-3 px-3 py-2 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs">
            {info}
          </div>
        )}
        {error && (
          <div className="mb-3 px-3 py-2 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleMixdown}
            disabled={loading}
            className="flex-1 py-2 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-black text-sm font-medium hover:bg-zinc-700 dark:hover:bg-zinc-100 transition-colors disabled:opacity-50"
          >
            {loading ? 'Processing…' : 'Mixdown & Save'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default StudioMixdownDialog;
