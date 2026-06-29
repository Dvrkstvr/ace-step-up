import React, { useState, useMemo } from 'react';
import { X, AlertTriangle, CheckCircle2 } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ModelConfig {
  ditModel: string;
  lmModel: string;
  thinking: boolean;
  inferenceSteps: number;
}

export interface DitModelEntry {
  name: string;
  downloaded: boolean;
}

interface Props {
  onApply: (config: ModelConfig) => void;
  onClose: () => void;
  availableDitModels?: DitModelEntry[];
}

type VramTier = 'low' | 'mid' | 'high';
type Priority = 'speed' | 'balance' | 'quality' | 'special';

// ─── Model metadata ───────────────────────────────────────────────────────────

export interface DitModelMeta {
  label: string;
  description: string;
  steps: string;
  cfgSupport: boolean;
  speed: 'fast' | 'slow';
  vram: string;
  xl?: boolean;
}

export const DIT_MODEL_META: Record<string, DitModelMeta> = {
  'acestep-v15-turbo': {
    label: 'Turbo',
    description: 'Best balance — fast generation, 8 steps. Recommended.',
    steps: '8',
    cfgSupport: false,
    speed: 'fast',
    vram: '~5 GB',
  },
  'acestep-v15-turbo-shift1': {
    label: 'Turbo Shift-1',
    description: 'Richer details, slightly weaker semantic adherence.',
    steps: '8',
    cfgSupport: false,
    speed: 'fast',
    vram: '~5 GB',
  },
  'acestep-v15-turbo-shift3': {
    label: 'Turbo Shift-3',
    description: 'Clearer timbre, minimal orchestration artifacts.',
    steps: '8',
    cfgSupport: false,
    speed: 'fast',
    vram: '~5 GB',
  },
  'acestep-v15-turbo-continuous': {
    label: 'Turbo Continuous',
    description: 'Experimental — continuous shift 1–5.',
    steps: '8',
    cfgSupport: false,
    speed: 'fast',
    vram: '~5 GB',
  },
  'acestep-v15-sft': {
    label: 'SFT',
    description: 'Supervised fine-tuned. Higher prompt fidelity, 50 steps.',
    steps: '50',
    cfgSupport: true,
    speed: 'slow',
    vram: '~5 GB',
  },
  'acestep-v15-base': {
    label: 'Base',
    description: 'All tasks: extract, lego, complete. Best for fine-tuning.',
    steps: '50',
    cfgSupport: true,
    speed: 'slow',
    vram: '~5 GB',
  },
  'acestep-v15-xl-turbo': {
    label: 'XL Turbo',
    description: 'Best daily driver on 20 GB+ GPUs. Higher audio quality.',
    steps: '8',
    cfgSupport: false,
    speed: 'fast',
    vram: '~9 GB',
    xl: true,
  },
  'acestep-v15-xl-sft': {
    label: 'XL SFT',
    description: 'Highest quality, tunable CFG. Requires ≥12 GB VRAM.',
    steps: '50',
    cfgSupport: true,
    speed: 'slow',
    vram: '~9 GB',
    xl: true,
  },
  'acestep-v15-xl-base': {
    label: 'XL Base',
    description: 'All tasks at higher quality. Requires ≥12 GB VRAM.',
    steps: '50',
    cfgSupport: true,
    speed: 'slow',
    vram: '~9 GB',
    xl: true,
  },
};

const FALLBACK_DIT_IDS = [
  'acestep-v15-turbo',
  'acestep-v15-turbo-shift1',
  'acestep-v15-turbo-shift3',
  'acestep-v15-sft',
  'acestep-v15-base',
  'acestep-v15-turbo-continuous',
  'acestep-v15-xl-turbo',
  'acestep-v15-xl-sft',
  'acestep-v15-xl-base',
];

const LM_OPTIONS = [
  {
    value: '',
    label: 'No LM',
    desc: 'Skip planning — DiT generates directly from your prompt.',
    vram: '',
    recommended: false,
    caution: false,
  },
  {
    value: 'acestep-5Hz-lm-0.6B',
    label: '0.6B',
    desc: 'Basic knowledge, fast. Good for < 8 GB VRAM.',
    vram: '~2 GB',
    recommended: false,
    caution: false,
  },
  {
    value: 'acestep-5Hz-lm-1.7B',
    label: '1.7B',
    desc: 'Recommended balance of quality and speed.',
    vram: '~3.5 GB',
    recommended: true,
    caution: false,
  },
  {
    value: 'acestep-5Hz-lm-4B',
    label: '4B',
    desc: 'Richest world knowledge, strongest memory for complex styles.',
    vram: '~8 GB',
    recommended: false,
    caution: true,
  },
];

// ─── Recommendation logic ─────────────────────────────────────────────────────

function deriveConfig(vram: VramTier, priority: Priority): ModelConfig {
  let ditModel: string;
  let lmModel: string;

  if (vram === 'low') {
    ditModel = 'acestep-v15-turbo';
    lmModel = priority === 'speed' ? '' : 'acestep-5Hz-lm-0.6B';
  } else if (vram === 'mid') {
    lmModel = priority === 'speed' ? 'acestep-5Hz-lm-0.6B' : 'acestep-5Hz-lm-1.7B';
    if (priority === 'special') ditModel = 'acestep-v15-base';
    else if (priority === 'quality') ditModel = 'acestep-v15-sft';
    else ditModel = 'acestep-v15-turbo';
  } else {
    lmModel = 'acestep-5Hz-lm-1.7B';
    if (priority === 'quality') ditModel = 'acestep-v15-xl-sft';
    else if (priority === 'special') ditModel = 'acestep-v15-xl-base';
    else ditModel = 'acestep-v15-xl-turbo';
  }

  const meta = DIT_MODEL_META[ditModel];
  return { ditModel, lmModel, thinking: lmModel !== '', inferenceSteps: Number(meta?.steps ?? 8) };
}

export function configSummary(config: ModelConfig): string {
  const dit = DIT_MODEL_META[config.ditModel]?.label ?? config.ditModel;
  if (!config.lmModel) return `${dit} · No LM`;
  const lm = LM_OPTIONS.find(o => o.value === config.lmModel)?.label ?? config.lmModel;
  return `${dit} · ${lm} LM`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const ModelSelectionHelper: React.FC<Props> = ({ onApply, onClose, availableDitModels }) => {
  const [mode, setMode] = useState<'simple' | 'advanced'>('simple');

  // Simple mode
  const [vram, setVram]         = useState<VramTier | null>(null);
  const [priority, setPriority] = useState<Priority | null>(null);

  // Advanced mode
  const [advDit, setAdvDit] = useState('acestep-v15-turbo');
  const [advLm,  setAdvLm]  = useState('acestep-5Hz-lm-1.7B');

  const ditEntries: DitModelEntry[] = (availableDitModels && availableDitModels.length > 0)
    ? availableDitModels
    : FALLBACK_DIT_IDS.map(name => ({ name, downloaded: true }));

  const simpleConfig = useMemo<ModelConfig | null>(() => {
    if (!vram || !priority) return null;
    return deriveConfig(vram, priority);
  }, [vram, priority]);

  const advancedConfig = useMemo<ModelConfig>(() => {
    const meta = DIT_MODEL_META[advDit];
    return { ditModel: advDit, lmModel: advLm, thinking: advLm !== '', inferenceSteps: Number(meta?.steps ?? 8) };
  }, [advDit, advLm]);

  const handleApply = () => {
    const cfg = mode === 'simple' ? simpleConfig : advancedConfig;
    if (cfg) onApply(cfg);
  };

  // ── Style helpers ──────────────────────────────────────────────────────────
  const cardBase = 'flex-1 text-left p-3 rounded-xl border-2 transition-all cursor-pointer';
  const cardOn   = 'border-pink-500 bg-pink-50 dark:bg-pink-500/10 text-pink-700 dark:text-pink-300';
  const cardOff  = 'border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-black/20 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-white/20';

  const rowBase  = 'w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all';
  const rowOn    = 'border-pink-500 bg-pink-50 dark:bg-pink-500/10';
  const rowOff   = 'border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-black/20 hover:border-zinc-300 dark:hover:border-white/20';

  const dot = (active: boolean) =>
    `w-2.5 h-2.5 rounded-full flex-shrink-0 border-2 ${active ? 'border-pink-500 bg-pink-500' : 'border-zinc-300 dark:border-zinc-600'}`;

  return (
    <div className="absolute right-0 top-0 z-20 w-1/2 max-h-full bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-zinc-200 dark:border-white/10 flex flex-col overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-white/5 flex-shrink-0">
        <div className="flex items-center gap-1 bg-zinc-100 dark:bg-black/40 rounded-lg p-1">
          {(['simple', 'advanced'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1 rounded-md text-xs font-semibold capitalize transition-colors ${
                mode === m
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {mode === 'simple' ? (
          <>
            {/* Q1 */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-zinc-900 dark:text-white">1. How powerful is your GPU?</p>
              <div className="flex gap-1.5">
                {([
                  { value: 'low',  label: 'Everyday laptop', sub: '< 8 GB' },
                  { value: 'mid',  label: 'Gaming PC',        sub: '8–16 GB' },
                  { value: 'high', label: 'Workstation',      sub: '16 GB+' },
                ] as { value: VramTier; label: string; sub: string }[]).map(o => (
                  <button key={o.value} onClick={() => setVram(o.value)}
                    className={`${cardBase} ${vram === o.value ? cardOn : cardOff}`}>
                    <div className="text-xs font-semibold leading-snug">{o.label}</div>
                    <div className="text-[10px] opacity-60 mt-0.5">{o.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Q2 */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-zinc-900 dark:text-white">2. What matters most?</p>
              <div className="grid grid-cols-2 gap-1.5">
                {([
                  { value: 'speed',   label: 'Quick drafts',  sub: 'Fast iteration' },
                  { value: 'balance', label: 'Balanced',       sub: 'Everyday use' },
                  { value: 'quality', label: 'Best quality',   sub: 'Slower, richest' },
                  { value: 'special', label: 'Special tasks',  sub: 'Stem split, lego…' },
                ] as { value: Priority; label: string; sub: string }[]).map(o => (
                  <button key={o.value} onClick={() => setPriority(o.value)}
                    className={`${cardBase} ${priority === o.value ? cardOn : cardOff}`}>
                    <div className="text-xs font-semibold leading-snug">{o.label}</div>
                    <div className="text-[10px] opacity-60 mt-0.5">{o.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Recommendation preview */}
            {simpleConfig && (
              <div className="p-3 bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/30 rounded-xl">
                <p className="text-[10px] font-semibold text-purple-500 dark:text-purple-400 uppercase tracking-wide mb-1">
                  Recommended
                </p>
                <p className="text-sm font-bold text-purple-900 dark:text-purple-200">
                  {configSummary(simpleConfig)}
                </p>
                <p className="text-[10px] text-purple-600/70 dark:text-purple-400/70 mt-1">
                  {simpleConfig.inferenceSteps} steps · Thinking {simpleConfig.thinking ? 'ON' : 'OFF'}
                </p>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Advanced: DiT */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-zinc-900 dark:text-white">DiT Model (executor)</p>
              <div className="space-y-1 max-h-52 overflow-y-auto pr-0.5">
                {ditEntries.map(({ name: id, downloaded }) => {
                  const meta = DIT_MODEL_META[id];
                  return (
                    <button key={id} onClick={() => setAdvDit(id)}
                      className={`${rowBase} ${advDit === id ? rowOn : rowOff}`}>
                      <div className={dot(advDit === id)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                            {meta?.label ?? id}
                          </span>
                          {meta?.xl && (
                            <span className="text-[9px] px-1.5 py-0.5 bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-300 rounded font-semibold">
                              XL
                            </span>
                          )}
                          {meta && (
                            <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                              {meta.speed === 'fast' ? '⚡⚡⚡' : '⚡'} · {meta.steps} steps{meta.cfgSupport ? ' · CFG ✓' : ''}
                            </span>
                          )}
                          {!downloaded && (
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                window.dispatchEvent(new CustomEvent('ace:open-settings', { detail: { tab: 'models' } }));
                              }}
                              className="text-[9px] px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 hover:text-blue-600 dark:hover:text-blue-400 rounded border border-zinc-200 dark:border-white/10 font-semibold transition-colors"
                              title="Not downloaded — click to go to Settings → Models"
                            >
                              ↓ Download
                            </button>
                          )}
                        </div>
                        {meta && (
                          <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                            {meta.description}
                          </p>
                        )}
                      </div>
                      {meta && (
                        <span className="text-[10px] text-zinc-400 flex-shrink-0">{meta.vram}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Advanced: LM */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-zinc-900 dark:text-white">LM Model (planner)</p>
              <div className="space-y-1">
                {LM_OPTIONS.map(o => (
                  <button key={o.value} onClick={() => setAdvLm(o.value)}
                    className={`${rowBase} ${advLm === o.value ? rowOn : rowOff}`}>
                    <div className={dot(advLm === o.value)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                          {o.label}
                        </span>
                        {o.recommended && (
                          <span className="text-[9px] px-1.5 py-0.5 bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-300 rounded font-semibold">
                            Recommended
                          </span>
                        )}
                        {o.caution && (
                          <span className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-300 rounded font-semibold">
                            <AlertTriangle size={9} /> Caution
                          </span>
                        )}
                        {o.vram && (
                          <span className="text-[10px] text-zinc-400">{o.vram}</span>
                        )}
                      </div>
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">{o.desc}</p>
                      {o.caution && (
                        <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                          ~17 GB combined with XL DiT. Requires{' '}
                          <code className="font-mono bg-amber-100 dark:bg-amber-500/20 px-0.5 rounded">
                            --cpu_offload
                          </code>{' '}
                          on your ACE-Step server.
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-zinc-200 dark:border-white/5 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <button
          onClick={onClose}
          className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleApply}
          disabled={mode === 'simple' && !simpleConfig}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-pink-500 hover:bg-pink-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-xs font-semibold transition-colors"
        >
          <CheckCircle2 size={13} />
          Apply
        </button>
      </div>
    </div>
  );
};
