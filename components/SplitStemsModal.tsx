import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Scissors, Loader2, X, Check } from 'lucide-react';
import { tracksApi } from '../services/api';
import { Stem, Track } from '../types';

// ─── Model definitions ────────────────────────────────────────────────────────

type DemucsModel = 'htdemucs' | 'htdemucs_ft' | 'htdemucs_6s';

const MODELS: { value: DemucsModel; label: string; description: string; stems: string[] }[] = [
  {
    value: 'htdemucs',
    label: 'Standard (4 stems)',
    description: 'Fast, good quality',
    stems: ['vocals', 'drums', 'bass', 'other'],
  },
  {
    value: 'htdemucs_ft',
    label: 'Fine-tuned (4 stems)',
    description: 'Higher quality, slower',
    stems: ['vocals', 'drums', 'bass', 'other'],
  },
  {
    value: 'htdemucs_6s',
    label: 'Extended (6 stems)',
    description: 'Adds guitar & piano',
    stems: ['vocals', 'drums', 'bass', 'guitar', 'piano', 'other'],
  },
];

const STEM_META: Record<string, { emoji: string; label: string }> = {
  vocals: { emoji: '🎤', label: 'Vocals' },
  drums:  { emoji: '🥁', label: 'Drums' },
  bass:   { emoji: '🎸', label: 'Bass' },
  other:  { emoji: '🎹', label: 'Other' },
  guitar: { emoji: '🎸', label: 'Guitar' },
  piano:  { emoji: '🎹', label: 'Piano' },
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface SplitStemsModalProps {
  track: Track;
  onClose: () => void;
  onSuccess: (stems: Stem[]) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

const SplitStemsModal: React.FC<SplitStemsModalProps> = ({ track, onClose, onSuccess }) => {
  const [model, setModel] = useState<DemucsModel>('htdemucs');
  const [checkedStems, setCheckedStems] = useState<Set<string>>(new Set(MODELS[0].stems));

  const [phase, setPhase] = useState<'configure' | 'running' | 'done' | 'error'>('configure');
  const [elapsed, setElapsed] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);

  // When model changes, reset checked stems to all stems of that model
  const selectedModel = MODELS.find(m => m.value === model)!;

  const handleModelChange = (m: DemucsModel) => {
    setModel(m);
    setCheckedStems(new Set(MODELS.find(x => x.value === m)!.stems));
  };

  const toggleStem = (stem: string) => {
    setCheckedStems(prev => {
      const next = new Set(prev);
      next.has(stem) ? next.delete(stem) : next.add(stem);
      return next;
    });
  };

  // Poll job status while running
  useEffect(() => {
    if (phase !== 'running' || !jobId) return;

    const interval = setInterval(async () => {
      try {
        const result = await tracksApi.getStemJob(track.id, jobId);
        setElapsed(result.elapsed);

        if (result.status === 'succeeded' && result.stems) {
          clearInterval(interval);
          setPhase('done');
          setTimeout(() => {
            onSuccess(result.stems!);
            onClose();
          }, 800);
        } else if (result.status === 'failed') {
          clearInterval(interval);
          setPhase('error');
          setErrorMsg(result.error || 'Stem splitting failed');
        }
      } catch {
        // Network hiccup — keep polling
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [phase, jobId, track.id, onSuccess, onClose]);

  const handleSubmit = async () => {
    if (checkedStems.size === 0) return;
    setPhase('running');
    setElapsed(0);
    try {
      const { jobId: id } = await tracksApi.splitStems(track.id, {
        model,
        stems: [...checkedStems],
      });
      setJobId(id);
    } catch (err) {
      setPhase('error');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to start stem splitting');
    }
  };

  const content = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-white/10 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-zinc-100 dark:border-white/8">
          <div className="flex items-center gap-2.5">
            <Scissors size={17} className="text-pink-500" />
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">Split to Stems</h2>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5 truncate max-w-[200px]">{track.title}</p>
            </div>
          </div>
          {phase !== 'running' && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">

          {phase === 'configure' && (
            <>
              {/* Model selector */}
              <div>
                <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
                  Model
                </label>
                <div className="space-y-1.5">
                  {MODELS.map(m => (
                    <button
                      key={m.value}
                      onClick={() => handleModelChange(m.value)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${
                        model === m.value
                          ? 'border-pink-500/60 bg-pink-50 dark:bg-pink-500/10'
                          : 'border-zinc-200 dark:border-white/8 hover:border-zinc-300 dark:hover:border-white/15'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                        model === m.value ? 'border-pink-500 bg-pink-500' : 'border-zinc-300 dark:border-zinc-600'
                      }`}>
                        {model === m.value && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200">{m.label}</p>
                        <p className="text-[11px] text-zinc-400 dark:text-zinc-500">{m.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Stem checkboxes */}
              <div>
                <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
                  Stems to extract
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {selectedModel.stems.map(stem => {
                    const meta = STEM_META[stem] ?? { emoji: '🎵', label: stem };
                    const checked = checkedStems.has(stem);
                    return (
                      <button
                        key={stem}
                        onClick={() => toggleStem(stem)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-colors ${
                          checked
                            ? 'border-pink-500/50 bg-pink-50 dark:bg-pink-500/10 text-zinc-800 dark:text-zinc-200'
                            : 'border-zinc-200 dark:border-white/8 text-zinc-500 dark:text-zinc-500 hover:border-zinc-300 dark:hover:border-white/15'
                        }`}
                      >
                        <span className="text-base leading-none">{meta.emoji}</span>
                        <span className="text-xs font-medium">{meta.label}</span>
                        {checked && <Check size={11} className="ml-auto text-pink-500 flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {phase === 'running' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 size={32} className="animate-spin text-pink-500" />
              <div className="text-center">
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Splitting stems…</p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                  Elapsed: {elapsed}s · This may take 30–90 seconds
                </p>
              </div>
            </div>
          )}

          {phase === 'done' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-500/20 flex items-center justify-center">
                <Check size={22} className="text-green-600 dark:text-green-400" />
              </div>
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Stems ready!</p>
            </div>
          )}

          {phase === 'error' && (
            <div className="space-y-3 py-2">
              <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg px-3 py-2">
                {errorMsg}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        {(phase === 'configure' || phase === 'error') && (
          <div className="flex gap-2 px-5 pb-5">
            <button
              onClick={onClose}
              className="flex-1 py-2 text-sm rounded-xl bg-zinc-100 dark:bg-white/8 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-white/12 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={checkedStems.size === 0}
              className="flex-1 py-2 text-sm rounded-xl bg-pink-500 hover:bg-pink-600 text-white font-medium disabled:opacity-40 transition-colors"
            >
              {phase === 'error' ? 'Retry' : 'Generate Stems'}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

export default SplitStemsModal;
