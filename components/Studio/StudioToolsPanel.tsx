import React, { useRef, useState } from 'react';
import { Paintbrush, Zap, Scissors, Upload, Layers, X } from 'lucide-react';
import { useStudio } from '../../context/StudioContext';
import StudioRepaintForm from './StudioRepaintForm';
import StudioMixdownDialog from './StudioMixdownDialog';

const ComingSoonTooltip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="relative group inline-flex w-full">
    {children}
    <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1 px-2 py-1 rounded bg-zinc-900 dark:bg-zinc-700 text-white text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10">
      Coming soon
    </div>
  </div>
);

const ToolButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'default' | 'danger';
}> = ({ icon, label, onClick, disabled, variant = 'default' }) => {
  const base = 'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed';
  const colors =
    variant === 'danger'
      ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
      : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10';

  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${colors}`}>
      <span className="flex-shrink-0 opacity-70">{icon}</span>
      {label}
    </button>
  );
};

const StudioToolsPanel: React.FC = () => {
  const { selectedRegion, closeStudio, addLayer, layers } = useStudio();
  const [showRepaint, setShowRepaint] = useState(false);
  const [showMixdown, setShowMixdown] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const audioUrl = URL.createObjectURL(file);
    await addLayer({
      source_type: 'upload',
      name: file.name.replace(/\.[^.]+$/, ''),
      audio_url: audioUrl,
      volume: 1.0,
      is_muted: false,
      is_solo: false,
      is_locked: false,
      sort_order: layers.length,
    }).catch(console.error);
    // Reset so the same file can be re-selected
    e.target.value = '';
  };

  return (
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-900 border-l border-zinc-200 dark:border-white/10">
      {/* Header */}
      <div className="px-3 py-2 border-b border-zinc-200 dark:border-white/10 flex-shrink-0">
        <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Tools</span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
        {/* Repaint */}
        <ToolButton
          icon={<Paintbrush size={15} />}
          label="Repaint Region"
          onClick={() => setShowRepaint(true)}
          disabled={!selectedRegion}
        />
        {!selectedRegion && (
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 px-3 -mt-0.5 mb-1">
            Select a region on the timeline first
          </p>
        )}

        {/* Generate on Layer — coming soon */}
        <ComingSoonTooltip>
          <ToolButton
            icon={<Zap size={15} />}
            label="Generate on Layer"
            disabled
          />
        </ComingSoonTooltip>

        {/* Split to Stems — coming soon */}
        <ComingSoonTooltip>
          <ToolButton
            icon={<Scissors size={15} />}
            label="Split to Stems"
            disabled
          />
        </ComingSoonTooltip>

        {/* Upload Audio */}
        <ToolButton
          icon={<Upload size={15} />}
          label="Upload Audio"
          onClick={handleUploadClick}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Mixdown */}
        <ToolButton
          icon={<Layers size={15} />}
          label="Mixdown"
          onClick={() => setShowMixdown(true)}
        />

        {/* Divider */}
        <div className="border-t border-zinc-200 dark:border-white/10 my-1" />

        {/* Close session */}
        <ToolButton
          icon={<X size={15} />}
          label="Close Session"
          onClick={closeStudio}
          variant="danger"
        />
      </div>

      {showRepaint && <StudioRepaintForm onClose={() => setShowRepaint(false)} />}
      {showMixdown && <StudioMixdownDialog onClose={() => setShowMixdown(false)} />}
    </div>
  );
};

export default StudioToolsPanel;
