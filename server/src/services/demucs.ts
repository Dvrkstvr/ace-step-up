import { spawn } from 'child_process';
import { mkdir, copyFile, rm } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolvePythonPath } from './acestep.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUDIO_DIR = path.join(__dirname, '../../public/audio');

function resolveAceStepDir(): string {
  const envPath = process.env.ACESTEP_PATH;
  if (envPath) return path.isAbsolute(envPath) ? envPath : path.resolve(process.cwd(), envPath);
  return path.resolve(__dirname, '../../../ACE-Step-1.5');
}

export type DemucsModel = 'htdemucs' | 'htdemucs_ft' | 'htdemucs_6s';

export const DEMUCS_MODEL_STEMS: Record<DemucsModel, string[]> = {
  htdemucs: ['vocals', 'drums', 'bass', 'other'],
  htdemucs_ft: ['vocals', 'drums', 'bass', 'other'],
  htdemucs_6s: ['vocals', 'drums', 'bass', 'guitar', 'piano', 'other'],
};

export interface StemResult {
  instrument_class: string;
  audio_url: string;
}

/**
 * Run Demucs on a local audio file and return the saved stem audio URLs.
 * selectedStems filters which of the model's outputs to keep; if omitted, all are kept.
 */
export async function splitWithDemucs(
  audioPath: string,
  trackId: string,
  model: DemucsModel = 'htdemucs',
  selectedStems?: string[],
): Promise<StemResult[]> {
  const aceStepDir = resolveAceStepDir();
  const pythonPath = resolvePythonPath(aceStepDir);
  const tmpDir = path.join(AUDIO_DIR, '_stems_tmp', trackId);

  await mkdir(tmpDir, { recursive: true });

  try {
    await runDemucsProcess(pythonPath, audioPath, tmpDir, model);

    // Demucs outputs to: <tmpDir>/<model>/<input_basename_no_ext>/<stem>.wav
    const inputBasename = path.basename(audioPath, path.extname(audioPath));
    const stemDir = path.join(tmpDir, model, inputBasename);

    const allStems = DEMUCS_MODEL_STEMS[model];
    const stemsToSave = selectedStems?.length
      ? allStems.filter(s => selectedStems.includes(s))
      : allStems;

    const results: StemResult[] = [];
    for (const stemName of stemsToSave) {
      const srcPath = path.join(stemDir, `${stemName}.wav`);
      const destFilename = `stem_${trackId}_${stemName}.wav`;
      const destPath = path.join(AUDIO_DIR, destFilename);
      await copyFile(srcPath, destPath);
      results.push({ instrument_class: stemName, audio_url: `/audio/${destFilename}` });
    }

    return results;
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

function runDemucsProcess(
  pythonPath: string,
  audioPath: string,
  outputDir: string,
  model: DemucsModel,
  timeoutMs = 600_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = ['-m', 'demucs', '-n', model, '--out', outputDir, audioPath];

    const proc = spawn(pythonPath, args);

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      setTimeout(() => { if (!proc.killed) proc.kill('SIGKILL'); }, 5000);
      reject(new Error(`Demucs timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    let stderr = '';
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
      for (const line of d.toString().split('\n')) {
        if (line.trim()) console.log(`[Demucs] ${line}`);
      }
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`Demucs exited with code ${code}: ${stderr.slice(-500)}`));
    });

    proc.on('error', (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
