import React, { useRef, useState } from 'react';
import { useStudio } from '../../context/StudioContext';
import { X, Upload, Layers } from 'lucide-react';

interface StudioAddLayerModalProps {
  onClose: () => void;
}

const StudioAddLayerModal: React.FC<StudioAddLayerModalProps> = ({ onClose }) => {
  const { addLayer, layers } = useStudio();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const nextOrder = layers.length;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    try {
      // Use an object URL for now; real upload endpoint can replace this later
      const audioUrl = URL.createObjectURL(file);
      await addLayer({
        source_type: 'upload',
        name: file.name.replace(/\.[^.]+$/, ''),
        audio_url: audioUrl,
        volume: 1.0,
        is_muted: false,
        is_solo: false,
        is_locked: false,
        sort_order: nextOrder,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add layer');
    } finally {
      setLoading(false);
    }
  };

  const handleEmptyLayer = async () => {
    setLoading(true);
    setError(null);
    try {
      await addLayer({
        source_type: 'upload',
        name: `Layer ${nextOrder + 1}`,
        audio_url: '',
        volume: 1.0,
        is_muted: false,
        is_solo: false,
        is_locked: false,
        sort_order: nextOrder,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add layer');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-zinc-200 dark:border-white/10 w-80 p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Add Layer</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-500 dark:text-zinc-400 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {error && (
          <div className="mb-3 px-3 py-2 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-2">
          {/* Upload Audio */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="flex items-center gap-3 px-4 py-3 rounded-lg border border-zinc-200 dark:border-white/10 hover:bg-zinc-50 dark:hover:bg-white/5 text-zinc-800 dark:text-zinc-200 text-sm transition-colors disabled:opacity-50 text-left"
          >
            <Upload size={18} className="text-pink-600 dark:text-pink-500 flex-shrink-0" />
            <div>
              <div className="font-medium">Upload Audio</div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Add a local audio file as a new layer</div>
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={handleUpload}
          />

          {/* Empty Layer */}
          <button
            onClick={handleEmptyLayer}
            disabled={loading}
            className="flex items-center gap-3 px-4 py-3 rounded-lg border border-zinc-200 dark:border-white/10 hover:bg-zinc-50 dark:hover:bg-white/5 text-zinc-800 dark:text-zinc-200 text-sm transition-colors disabled:opacity-50 text-left"
          >
            <Layers size={18} className="text-zinc-400 flex-shrink-0" />
            <div>
              <div className="font-medium">Empty Layer</div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Create a blank placeholder layer</div>
            </div>
          </button>
        </div>

        {loading && (
          <div className="mt-3 text-center text-xs text-zinc-500 dark:text-zinc-400">Adding layer…</div>
        )}
      </div>
    </div>
  );
};

export default StudioAddLayerModal;
