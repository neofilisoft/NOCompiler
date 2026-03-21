// src/main/agent-sandbox.js
// Agent and external AI tooling bridge for NVECode extensions and integrations.

'use strict';

const { shell } = require('electron');
const { spawnSync } = require('child_process');

const PROVIDERS = [
  {
    id: 'codex',
    displayName: 'Codex',
    commands: ['codex'],
    versionArgs: [['--version'], ['version'], ['-V']],
    category: 'agent',
    homeUrl: 'https://platform.openai.com/',
  },
  {
    id: 'chatdev',
    displayName: 'ChatDev',
    commands: ['chatdev'],
    versionArgs: [['--version'], ['version'], ['--help']],
    category: 'agent',
    homeUrl: 'https://github.com/OpenBMB/ChatDev',
  },
  {
    id: 'openclaw',
    displayName: 'OpenClaw',
    commands: ['openclaw'],
    versionArgs: [['--version'], ['version'], ['--help']],
    category: 'agent',
    homeUrl: '',
  },
];

function runCommand(command, args = [], opts = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: opts.timeoutMs || 15000,
    cwd: opts.cwd || undefined,
    env: { ...process.env, ...(opts.env || {}) },
    windowsHide: true,
  });

  return {
    ok: !result.error && (result.status === 0 || `${result.stdout || ''}${result.stderr || ''}`.trim().length > 0),
    command,
    args,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: typeof result.status === 'number' ? result.status : -1,
    error: result.error ? result.error.message : '',
  };
}

function detectProvider(provider) {
  if (!provider) {
    return null;
  }

  for (const command of provider.commands) {
    for (const versionArgs of provider.versionArgs) {
      const result = runCommand(command, versionArgs, { timeoutMs: 5000 });
      const output = `${result.stdout}${result.stderr}`.trim();
      if (!result.ok) continue;
      return {
        ...provider,
        found: true,
        command,
        version: output.split(/\r?\n/)[0] || '',
      };
    }
  }

  return {
    ...provider,
    found: false,
    command: provider.commands[0],
    version: '',
  };
}

function listProviders() {
  return PROVIDERS.map((provider) => detectProvider(provider));
}

function getCapabilities() {
  const providers = listProviders();
  return {
    providers,
    supportsExtensionsBridge: true,
    supportsExternalAgentCli: providers.some((provider) => provider && provider.found),
    supportsWorkspaceFilesystem: true,
    supportsCommandExecution: true,
  };
}

function runProvider(providerId, args = [], opts = {}) {
  const provider = detectProvider(PROVIDERS.find((entry) => entry.id === providerId));
  if (!provider) {
    return { ok: false, error: `Unknown provider: ${providerId}` };
  }
  if (!provider.found) {
    return { ok: false, error: `${provider.displayName} CLI is not installed or not on PATH.` };
  }
  return runCommand(provider.command, Array.isArray(args) ? args : [], opts);
}

function openProviderHome(providerId) {
  const provider = PROVIDERS.find((entry) => entry.id === providerId);
  if (!provider || !provider.homeUrl) {
    return { ok: false, error: `No homepage registered for ${providerId}.` };
  }
  shell.openExternal(provider.homeUrl);
  return { ok: true, url: provider.homeUrl };
}

module.exports = {
  getCapabilities,
  listProviders,
  runProvider,
  openProviderHome,
};
