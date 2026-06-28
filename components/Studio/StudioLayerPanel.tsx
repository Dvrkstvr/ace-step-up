import React, { useRef, useState, useEffect } from 'react';
import { Plus, Lock, Trash2, Volume2, BookOpen, Wand2, Upload, Layers } from 'lucide-react';
import { useStudio } from '../../context/StudioContext';
import { StudioLayer } from '../../types';
import StudioLibraryModal from './StudioLibraryModal';
import StudioGeneratedContentModal from './StudioGeneratedContentModal';

const SOURCE_BADGE_COLORS: Record<string, string> = {
  master:    'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  stem:      'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
  upload:    'bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300',
  generated: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',
  repaint:   'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300',
};

type ActiveModal = 'library' | 'generated' | null;

const StudioLayerPanel: React.FC = () => {
  const { layers, updateLayer, deleteLayer, addLayer } = useStudio();
  const [showPopover, setShowPopover] = useState(false);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sorted = [...layers].sort((a, b) => a.sort_order - b.sort_order);
  const nextOrder = layers.length;

  // Close popover on outside click
  useEffect(() => {
    if (!showPopover) return;
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        addButtonRef.current && !addButtonRef.current.contains(e.target as Node)
      ) {
        setShowPopover(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPopover]);

  const startEdit = (layer: StudioLayer) => {
    setEditingId(layer.id);
    setEditingName(layer.name);
  };

  const commitEdit = async (layer: StudioLayer) => {
    if (editingName.trim() && editingName !== layer.name) {
      await updateLayer(layer.id, { name: editingName.trim() }).catch(console.error);
    }
    setEditingId(null);
  };

  const handleVolume = async (layer: StudioLayer, value: number) => {
    await updateLayer(layer.id, { volume: value }).catch(console.error);
  };

  const handleMute = async (layer: StudioLayer) => {
    await updateLayer(layer.id, { is_muted: !layer.is_muted }).catch(console.error);
  };

  const handleSolo = async (layer: StudioLayer) => {
    await updateLayer(layer.id, { is_solo: !layer.is_solo }).catch(console.error);
  };

  const handleDelete = async (layer: StudioLayer) => {
    if (layer.is_locked) return;
    await deleteLayer(layer.id).catch(console.error);
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
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
    } catch (err) {
      console.error('Failed to add uploaded layer:', err);
    }
  };

  const handleEmptyLayer = async () => {
    setShowPopover(false);
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
    } catch (err) {
      console.error('Failed to add empty layer:', err);
    }
  };

  const menuItems = [
    {
      id: 'library',
      icon: <BookOpen size={16} className="text-pink-500 flex-shrink-0" />,
      label: 'From Library',
      description: 'Browse your tracks and stems',
      action: () => { setShowPopover(false); setActiveModal('library'); },
    },
    {
      id: 'generated',
      icon: <Wand2 size={16} className="text-purple-500 flex-shrink-0" />,
      label: 'Generated Content',
      description: 'Generate audio on this layer',
      action: () => { setShowPopover(false); setActiveModal('generated'); },
    },
    {
      id: 'upload',
      icon: <Upload size={16} className="text-pink-600 flex-shrink-0" />,
      label: 'Upload Audio',
      description: 'Add a local audio file',
      action: () => { setShowPopover(false); fileInputRef.current?.click(); },
    },
    {
      id: 'empty',
      icon: <Layers size={16} className="text-zinc-400 flex-shrink-0" />,
      label: 'Empty Layer',
      description: 'Create a blank placeholder',
      action: handleEmptyLayer,
    },
  ];

  return (
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-900 border-r border-zinc-200 dark:border-white/10">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-200 dark:border-white/10 flex-shrink-0 relative">
        <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Layers</span>
        <button
          ref={addButtonRef}
          onClick={() => setShowPopover(v => !v)}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-zinc-900 dark:bg-white text-white dark:text-black hover:bg-zinc-700 dark:hover:bg-zinc-100 transition-colors"
        >
          <Plus size={12} />
          Add
        </button>

        {/* Popover */}
        {showPopover && (
          <div
            ref={popoverRef}
            className="absolute top-full right-0 mt-1 z-50 w-56 bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-zinc-200 dark:border-white/10 py-1 overflow-hidden"
          >
            {menuItems.map(item => (
              <button
                key={item.id}
                onClick={item.action}
                className="w-full flex items-start gap-2.5 px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors text-left"
              >
                <span className="mt-0.5">{item.icon}</span>
                <div>
                  <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{item.label}</div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">{item.description}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Hidden file input for upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={handleUploadFile}
      />

      {/* Layer list */}
      <div className="flex-1 overflow-y-auto">
        {sorted.length === 0 && (
          <div className="px-4 py-8 text-center text-xs text-zinc-400 dark:text-zinc-500">
            No layers yet.<br />
            Click <strong>Add</strong> to get started.
          </div>
        )}

        {sorted.map(layer => (
          <div
            key={layer.id}
            className={`group px-3 py-2 border-b border-zinc-100 dark:border-white/5 transition-colors ${
              layer.is_muted ? 'opacity-50' : ''
            }`}
          >
            {/* Row 1: lock + name + badge */}
            <div className="flex items-center gap-1.5 mb-1.5 min-w-0">
              {layer.is_locked && (
                <Lock size={11} className="text-zinc-400 dark:text-zinc-500 flex-shrink-0" />
              )}

              {editingId === layer.id ? (
                <input
                  autoFocus
                  value={editingName}
                  onChange={e => setEditingName(e.target.value)}
                  onBlur={() => commitEdit(layer)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitEdit(layer);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  className="flex-1 min-w-0 text-xs px-1 py-0.5 rounded border border-pink-500 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white outline-none"
                />
              ) : (
                <span
                  onDoubleClick={() => !layer.is_locked && startEdit(layer)}
                  className="flex-1 min-w-0 text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate cursor-default select-none"
                  title={layer.is_locked ? layer.name : 'Double-click to rename'}
                >
                  {layer.name}
                </span>
              )}

              <span className={`text-[9px] px-1 py-0.5 rounded uppercase tracking-wide font-medium flex-shrink-0 ${SOURCE_BADGE_COLORS[layer.source_type] ?? SOURCE_BADGE_COLORS.upload}`}>
                {layer.source_type}
              </span>
            </div>

            {/* Row 2: volume + M/S + delete */}
            <div className="flex items-center gap-1.5">
              <Volume2 size={11} className="text-zinc-400 dark:text-zinc-500 flex-shrink-0" />
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={layer.volume}
                onChange={e => handleVolume(layer, parseFloat(e.target.value))}
                className="flex-1 min-w-0 h-1 accent-pink-600 cursor-pointer"
              />
              <button
                onClick={() => handleMute(layer)}
                className={`w-5 h-5 rounded text-[10px] font-bold transition-colors flex items-center justify-center flex-shrink-0 ${
                  layer.is_muted
                    ? 'bg-amber-400 dark:bg-amber-500 text-black'
                    : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600'
                }`}
              >
                M
              </button>
              <button
                onClick={() => handleSolo(layer)}
                className={`w-5 h-5 rounded text-[10px] font-bold transition-colors flex items-center justify-center flex-shrink-0 ${
                  layer.is_solo
                    ? 'bg-green-400 dark:bg-green-500 text-black'
                    : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600'
                }`}
              >
                S
              </button>
              {!layer.is_locked && (
                <button
                  onClick={() => handleDelete(layer)}
                  className="w-5 h-5 rounded text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors flex items-center justify-center flex-shrink-0 opacity-0 group-hover:opacity-100"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {activeModal === 'library' && (
        <StudioLibraryModal onClose={() => setActiveModal(null)} />
      )}
      {activeModal === 'generated' && (
        <StudioGeneratedContentModal onClose={() => setActiveModal(null)} />
      )}
    </div>
  );
};

export default StudioLayerPanel;
