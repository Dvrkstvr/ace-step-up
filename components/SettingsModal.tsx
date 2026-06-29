import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Palette, Info, Globe, ChevronDown, Github, Cpu, Download, CheckCircle, AlertCircle, Loader2, Zap, Clock } from 'lucide-react';
import { useI18n } from '../context/I18nContext';
import { systemApi } from '../services/api';
import { DIT_MODEL_META } from './ModelSelectionHelper';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    theme: 'light' | 'dark';
    onToggleTheme: () => void;
}

type Tab = 'general' | 'models' | 'about';

interface ModelEntry {
    name: string;
    is_active: boolean;
    is_preloaded: boolean;
    is_downloading: boolean;
}

type DownloadState = 'idle' | 'downloading' | 'done' | 'error' | 'unavailable';

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, theme, onToggleTheme }) => {
    const { t, language, setLanguage } = useI18n();
    const [activeTab, setActiveTab] = useState<Tab>('general');
    const [showLangInfo, setShowLangInfo] = useState(false);
    const langInfoRef = useRef<HTMLDivElement>(null);

    // Models tab state
    const [models, setModels] = useState<ModelEntry[]>([]);
    const [modelsLoading, setModelsLoading] = useState(false);
    const [modelsError, setModelsError] = useState<string | null>(null);
    const [downloadStates, setDownloadStates] = useState<Record<string, DownloadState>>({});

    useEffect(() => {
        if (!showLangInfo) return;
        const handleClick = (e: MouseEvent) => {
            if (langInfoRef.current && !langInfoRef.current.contains(e.target as Node)) {
                setShowLangInfo(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [showLangInfo]);

    const fetchModels = useCallback(async () => {
        setModelsLoading(true);
        setModelsError(null);
        try {
            const data = await systemApi.getModels();
            setModels(data.models);
        } catch {
            setModelsError('Could not load models. Is the backend running?');
        } finally {
            setModelsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isOpen && activeTab === 'models') {
            fetchModels();
        }
    }, [isOpen, activeTab, fetchModels]);

    const handleDownload = async (name: string) => {
        setDownloadStates(s => ({ ...s, [name]: 'downloading' }));
        try {
            const res = await systemApi.downloadModel(name);
            if (res.status === 'already_downloaded') {
                setDownloadStates(s => ({ ...s, [name]: 'done' }));
                fetchModels();
            } else if (res.status === 'not_available') {
                setDownloadStates(s => ({ ...s, [name]: 'unavailable' }));
            } else {
                // Poll until server reports is_downloading = false (process exited)
                const poll = setInterval(async () => {
                    try {
                        const data = await systemApi.getModels();
                        setModels(data.models);
                        const m = data.models.find(x => x.name === name);
                        if (m && !m.is_downloading) {
                            setDownloadStates(s => ({ ...s, [name]: m.is_preloaded ? 'done' : 'error' }));
                            clearInterval(poll);
                        }
                    } catch { /* keep polling */ }
                }, 4000);
                // Safety timeout — stop polling after 30 min
                setTimeout(() => clearInterval(poll), 30 * 60 * 1000);
            }
        } catch {
            setDownloadStates(s => ({ ...s, [name]: 'error' }));
        }
    };

    if (!isOpen) return null;

    const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
        { id: 'general', label: 'General', icon: <Globe size={15} /> },
        { id: 'models', label: 'Models', icon: <Cpu size={15} /> },
        { id: 'about', label: 'About', icon: <Info size={15} /> },
    ];

    const downloaded = models.filter(m => m.is_preloaded);
    const notDownloaded = models.filter(m => !m.is_preloaded);

    return (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-zinc-200 dark:border-white/5 flex-shrink-0">
                    <h2 className="text-xl font-bold text-zinc-900 dark:text-white">{t('settings')}</h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-full transition-colors"
                    >
                        <X size={18} className="text-zinc-500" />
                    </button>
                </div>

                {/* Tab bar */}
                <div className="flex gap-1 px-6 pt-3 flex-shrink-0">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                activeTab === tab.id
                                    ? 'bg-zinc-100 dark:bg-white/10 text-zinc-900 dark:text-white'
                                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/5'
                            }`}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">

                    {/* ── General tab ── */}
                    {activeTab === 'general' && (
                        <>
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 text-zinc-900 dark:text-white">
                                    <Globe size={16} className="text-zinc-500" />
                                    <h3 className="text-sm font-semibold">{t('language')}</h3>
                                    <div className="relative" ref={langInfoRef}>
                                        <button
                                            onClick={() => setShowLangInfo(!showLangInfo)}
                                            className="p-1 rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors"
                                        >
                                            <Info size={13} />
                                        </button>
                                        {showLangInfo && (
                                            <div className="absolute left-0 top-8 z-10 w-64 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl p-3">
                                                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">{t('localizedBy')}</p>
                                                <div className="flex flex-wrap gap-1.5">
                                                    <a href="https://x.com/bdsqlsz" target="_blank" rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-black dark:bg-white text-white dark:text-black rounded-lg text-xs font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors">
                                                        <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                                                        @bdsqlsz
                                                    </a>
                                                    <a href="https://space.bilibili.com/219296" target="_blank" rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-[#00A1D6] text-white rounded-lg text-xs font-medium hover:bg-[#0090C0] transition-colors">
                                                        <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1-.373-.906c0-.356.124-.658.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 0 1 .16-.213l2.853-2.747c.267-.249.573-.373.92-.373.347 0 .662.151.929.4.267.249.391.551.391.907 0 .355-.124.657-.373.906zM5.333 7.24c-.746.018-1.373.276-1.88.773-.506.498-.769 1.13-.786 1.894v7.52c.017.764.28 1.395.786 1.893.507.498 1.134.756 1.88.773h13.334c.746-.017 1.373-.275 1.88-.773.506-.498.769-1.129.786-1.893v-7.52c-.017-.765-.28-1.396-.786-1.894-.507-.497-1.134-.755-1.88-.773zM8 11.107c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c0-.373.129-.689.386-.947.258-.257.574-.386.947-.386zm8 0c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373Z" /></svg>
                                                        青龙圣者
                                                    </a>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="relative">
                                    <select
                                        value={language}
                                        onChange={e => setLanguage(e.target.value as 'en' | 'zh' | 'ja' | 'ko')}
                                        className="w-full appearance-none py-2.5 px-4 pr-10 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm font-medium transition-colors hover:border-zinc-400 dark:hover:border-zinc-600 focus:outline-none focus:border-pink-500 dark:focus:border-pink-500 cursor-pointer"
                                    >
                                        <option value="en">{t('english')}</option>
                                        <option value="zh">{t('chinese')}</option>
                                        <option value="ja">{t('japaneseLanguage')}</option>
                                        <option value="ko">{t('koreanLanguage')}</option>
                                    </select>
                                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="flex items-center gap-2 text-zinc-900 dark:text-white">
                                    <Palette size={16} className="text-zinc-500" />
                                    <h3 className="text-sm font-semibold">{t('appearance')}</h3>
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        onClick={theme === 'dark' ? onToggleTheme : undefined}
                                        className={`flex-1 py-2.5 px-4 rounded-lg border text-sm font-medium transition-colors ${
                                            theme === 'light'
                                                ? 'border-pink-500 bg-pink-50 dark:bg-pink-500/10 text-pink-700 dark:text-pink-300'
                                                : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600'
                                        }`}
                                    >
                                        {t('light')}
                                    </button>
                                    <button
                                        onClick={theme === 'light' ? onToggleTheme : undefined}
                                        className={`flex-1 py-2.5 px-4 rounded-lg border text-sm font-medium transition-colors ${
                                            theme === 'dark'
                                                ? 'border-pink-500 bg-pink-950/30 text-pink-300'
                                                : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600'
                                        }`}
                                    >
                                        {t('dark')}
                                    </button>
                                </div>
                            </div>
                        </>
                    )}

                    {/* ── Models tab ── */}
                    {activeTab === 'models' && (
                        <div className="space-y-5">
                            <div className="flex items-center justify-between">
                                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                                    DiT model checkpoints stored in <code className="text-xs bg-zinc-100 dark:bg-white/10 px-1.5 py-0.5 rounded">checkpoints/</code>
                                </p>
                                <button
                                    onClick={fetchModels}
                                    disabled={modelsLoading}
                                    className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors disabled:opacity-50"
                                >
                                    Refresh
                                </button>
                            </div>

                            {modelsLoading && (
                                <div className="flex items-center gap-2 text-zinc-400 py-4">
                                    <Loader2 size={16} className="animate-spin" />
                                    <span className="text-sm">Loading models…</span>
                                </div>
                            )}

                            {modelsError && (
                                <div className="flex items-center gap-2 text-red-500 dark:text-red-400 text-sm py-2">
                                    <AlertCircle size={15} />
                                    {modelsError}
                                </div>
                            )}

                            {!modelsLoading && !modelsError && (
                                <>
                                    {downloaded.length > 0 && (
                                        <div className="space-y-2">
                                            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Downloaded</p>
                                            {downloaded.map(m => {
                                                const meta = DIT_MODEL_META[m.name];
                                                return (
                                                    <div key={m.name} className={`flex items-start gap-3 p-3 rounded-xl border ${
                                                        m.is_active
                                                            ? 'border-pink-300 dark:border-pink-500/40 bg-pink-50 dark:bg-pink-500/10'
                                                            : 'border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-black/20'
                                                    }`}>
                                                        <CheckCircle size={16} className="mt-0.5 flex-shrink-0 text-green-500" />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="text-sm font-semibold text-zinc-900 dark:text-white">
                                                                    {meta?.label ?? m.name}
                                                                </span>
                                                                {m.is_active && (
                                                                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-pink-100 dark:bg-pink-500/20 text-pink-700 dark:text-pink-300 font-medium">
                                                                        Active
                                                                    </span>
                                                                )}
                                                                {meta && (
                                                                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                                                                        meta.speed === 'fast'
                                                                            ? 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300'
                                                                            : 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300'
                                                                    }`}>
                                                                        {meta.speed === 'fast' ? <Zap size={10} className="inline mr-0.5" /> : <Clock size={10} className="inline mr-0.5" />}
                                                                        {meta.steps} steps
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {meta && (
                                                                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{meta.description}</p>
                                                            )}
                                                            {meta && (
                                                                <p className="text-[11px] text-zinc-400 dark:text-zinc-600 mt-1">
                                                                    {meta.vram} · CFG: {meta.cfgSupport ? 'yes' : 'no'}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {notDownloaded.length > 0 && (
                                        <div className="space-y-2">
                                            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Available to Download</p>
                                            {notDownloaded.map(m => {
                                                const meta = DIT_MODEL_META[m.name];
                                                const dlState = downloadStates[m.name] ?? 'idle';
                                                return (
                                                    <div key={m.name} className="flex items-start gap-3 p-3 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-black/20">
                                                        <div className="w-4 h-4 mt-0.5 flex-shrink-0 rounded-full border-2 border-zinc-300 dark:border-zinc-600" />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                                                                    {meta?.label ?? m.name}
                                                                </span>
                                                                {meta && (
                                                                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                                                                        meta.speed === 'fast'
                                                                            ? 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300'
                                                                            : 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300'
                                                                    }`}>
                                                                        {meta.steps} steps
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {meta && (
                                                                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{meta.description}</p>
                                                            )}
                                                            {meta && (
                                                                <p className="text-[11px] text-zinc-400 dark:text-zinc-600 mt-1">
                                                                    {meta.vram} · CFG: {meta.cfgSupport ? 'yes' : 'no'}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <div className="flex-shrink-0 mt-0.5">
                                                            {dlState === 'idle' ? (
                                                                <button
                                                                    onClick={() => handleDownload(m.name)}
                                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-black text-xs font-semibold hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
                                                                >
                                                                    <Download size={12} />
                                                                    Download
                                                                </button>
                                                            ) : dlState === 'downloading' ? (
                                                                <div className="flex items-center gap-1.5 px-3 py-1.5 text-zinc-500 dark:text-zinc-400 text-xs">
                                                                    <Loader2 size={12} className="animate-spin" />
                                                                    Downloading…
                                                                </div>
                                                            ) : dlState === 'done' ? (
                                                                <div className="flex items-center gap-1.5 px-3 py-1.5 text-green-600 dark:text-green-400 text-xs font-medium">
                                                                    <CheckCircle size={12} />
                                                                    Done
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    onClick={() => handleDownload(m.name)}
                                                                    className="flex items-center gap-1.5 px-3 py-1.5 text-red-500 dark:text-red-400 text-xs"
                                                                >
                                                                    <AlertCircle size={12} />
                                                                    Retry
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {models.length === 0 && !modelsLoading && (
                                        <p className="text-sm text-zinc-400 dark:text-zinc-500 py-4">No models found.</p>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {/* ── About tab ── */}
                    {activeTab === 'about' && (
                        <div className="space-y-5 text-sm text-zinc-600 dark:text-zinc-400">
                            <div className="space-y-1">
                                <p className="text-zinc-900 dark:text-white font-semibold">ACE-Step UI</p>
                                <p>{t('version')} 2.0.0 · {t('localAIMusicGenerator')}</p>
                                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">{t('poweredBy')}</p>
                            </div>

                            <div className="pt-4 border-t border-zinc-200 dark:border-zinc-700/50 space-y-3">
                                <p className="text-zinc-900 dark:text-white font-medium text-sm">{t('createdBy')}</p>
                                <div className="flex flex-wrap gap-2">
                                    <a
                                        href="https://x.com/AmbsdOP"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
                                    >
                                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                                        {t('follow')} @AmbsdOP
                                    </a>
                                    <a
                                        href="https://github.com/fspecii/ace-step-ui"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 dark:bg-zinc-700 text-white rounded-lg text-sm font-medium hover:bg-zinc-700 dark:hover:bg-zinc-600 transition-colors"
                                    >
                                        <Github size={14} />
                                        GitHub Repo
                                    </a>
                                </div>
                                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                                    Report issues or request features on GitHub
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="border-t border-zinc-200 dark:border-white/5 px-6 py-4 flex justify-end flex-shrink-0">
                    <button
                        onClick={onClose}
                        className="px-5 py-2 bg-zinc-900 dark:bg-white text-white dark:text-black text-sm font-semibold rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
                    >
                        {t('done')}
                    </button>
                </div>
            </div>
        </div>
    );
};
