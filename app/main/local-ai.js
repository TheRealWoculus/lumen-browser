/**
 * Local inference for .gguf and .bin weights (llama.cpp / node-llama-cpp).
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const SUPPORTED_EXT = new Set(['.gguf', '.bin']);

let llamaApi = null;
let model = null;
let context = null;
let session = null;
let loadedPath = null;
let loading = false;
let lastError = null;

function isSupportedModel(filePath) {
  return SUPPORTED_EXT.has(path.extname(filePath).toLowerCase());
}

function status() {
  return {
    loaded: !!model,
    loading,
    path: loadedPath,
    error: lastError,
    engine: model ? 'node-llama-cpp' : null,
  };
}

async function importLlama() {
  if (!llamaApi) {
    llamaApi = await import('node-llama-cpp');
  }
  return llamaApi;
}

async function unloadModel() {
  try {
    if (session?.dispose) await session.dispose();
  } catch {
    /* ignore */
  }
  session = null;
  try {
    if (context?.dispose) await context.dispose();
  } catch {
    /* ignore */
  }
  context = null;
  if (model && !model.binFallback) {
    try {
      if (model.dispose) await model.dispose();
    } catch {
      /* ignore */
    }
  }
  model = null;
  loadedPath = null;
}

async function loadModel(modelPath, options = {}) {
  if (loading) throw new Error('Model is already loading');
  if (!modelPath || !fs.existsSync(modelPath)) {
    throw new Error('Model file not found');
  }
  if (!isSupportedModel(modelPath)) {
    throw new Error('Supported formats: .gguf and .bin');
  }

  loading = true;
  lastError = null;
  try {
    await unloadModel();
    const ext = path.extname(modelPath).toLowerCase();

    try {
      const { getLlama, LlamaChatSession } = await importLlama();
      const llama = await getLlama();
      model = await llama.loadModel({
        modelPath,
        gpuLayers: options.gpuLayers ?? (options.useGpu === false ? 0 : 'auto'),
      });
      context = await model.createContext({
        contextSize: options.contextSize ?? 4096,
      });
      session = new LlamaChatSession({
        contextSequence: context.getSequence(),
      });
      loadedPath = modelPath;
      return { ok: true, path: modelPath, engine: 'node-llama-cpp', format: ext };
    } catch (nodeErr) {
      if (ext === '.bin') {
        const cli = await findLlamaCli();
        if (cli) {
          loadedPath = modelPath;
          model = { cli, binFallback: true };
          return {
            ok: true,
            path: modelPath,
            engine: 'llama-cli',
            format: ext,
            note: 'Loaded via llama-cli (.bin legacy format)',
          };
        }
      }
      throw nodeErr;
    }
  } catch (err) {
    lastError = err.message;
    await unloadModel();
    throw err;
  } finally {
    loading = false;
  }
}

function findLlamaCli() {
  return new Promise((resolve) => {
    const names = ['llama-cli', 'llama', 'main'];
    const tryNext = (i) => {
      if (i >= names.length) {
        resolve(null);
        return;
      }
      const p = spawn('which', [names[i]], { stdio: ['ignore', 'pipe', 'ignore'] });
      let out = '';
      p.stdout.on('data', (d) => {
        out += d;
      });
      p.on('close', (code) => {
        if (code === 0 && out.trim()) resolve(out.trim());
        else tryNext(i + 1);
      });
      p.on('error', () => tryNext(i + 1));
    };
    tryNext(0);
  });
}

function buildPrompt(messages) {
  const lines = messages.map((m) => {
    const who = m.role === 'user' ? 'User' : 'Assistant';
    return `${who}: ${m.content}`;
  });
  lines.push('Assistant:');
  return lines.join('\n');
}

function chatViaCli(modelPath, messages, options) {
  return new Promise(async (resolve, reject) => {
    const cli = (model && model.cli) || (await findLlamaCli());
    if (!cli) {
      reject(
        new Error(
          'Could not load .bin model. Install llama.cpp (llama-cli) or convert to .gguf.'
        )
      );
      return;
    }
    const prompt = buildPrompt(messages);
    const args = [
      '-m',
      modelPath,
      '-p',
      prompt,
      '-n',
      String(options.maxTokens ?? 512),
      '--temp',
      String(options.temperature ?? 0.7),
      '-no-cnv',
    ];
    const proc = spawn(cli, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    proc.stdout.on('data', (d) => {
      out += d.toString();
    });
    proc.stderr.on('data', (d) => {
      err += d.toString();
    });
    proc.on('error', (e) => reject(e));
    proc.on('close', (code) => {
      if (code !== 0 && !out.trim()) {
        reject(new Error(err.slice(0, 300) || `llama-cli exited ${code}`));
        return;
      }
      let text = out.trim();
      const marker = 'Assistant:';
      const idx = text.lastIndexOf(marker);
      if (idx >= 0) text = text.slice(idx + marker.length).trim();
      resolve(text || '(empty response)');
    });
  });
}

async function chat(messages, options = {}) {
  if (!loadedPath) {
    throw new Error('Load a local model in Settings → AI Assistant first');
  }
  if (!messages?.length) {
    throw new Error('Missing messages');
  }

  if (model?.binFallback) {
    return chatViaCli(loadedPath, messages, options);
  }

  if (!session) {
    throw new Error('Local model session not ready');
  }

  const prompt = buildPrompt(messages);
  const reply = await session.prompt(prompt, {
    maxTokens: options.maxTokens ?? 512,
    temperature: options.temperature ?? 0.7,
  });
  return typeof reply === 'string' ? reply : String(reply ?? '');
}

module.exports = {
  isSupportedModel,
  loadModel,
  unloadModel,
  chat,
  status,
};
