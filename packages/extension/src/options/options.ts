import type { ExtensionSettings } from '@movie-grabber/shared';
import { DEFAULT_SETTINGS } from '@movie-grabber/shared';

// ─── DOM helpers ─────────────────────────────────────────────────────────────

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const fields: (keyof ExtensionSettings)[] = [
  'backendUrl',
  'radarrUrl',
  'radarrApiKey',
  'sonarrUrl',
  'sonarrApiKey',
  'qbitUrl',
  'qbitUsername',
  'qbitPassword',
  'qbitMovieCategory',
  'qbitTvCategory',
];

function showStatus(message: string, isError = false) {
  const el = $<HTMLDivElement>('status');
  el.textContent = message;
  el.className = `status ${isError ? 'error' : 'success'}`;
  setTimeout(() => {
    el.className = 'status';
  }, 4000);
}

// ─── Load settings ───────────────────────────────────────────────────────────

async function loadSettings() {
  const settings = (await chrome.storage.sync.get(DEFAULT_SETTINGS)) as ExtensionSettings;

  for (const key of fields) {
    const el = $<HTMLInputElement>(key);
    if (el) el.value = String(settings[key] || '');
  }

  // Quality profile & root folder selects
  if (settings.radarrQualityProfileId) {
    ($<HTMLSelectElement>('radarrQualityProfile')).value = String(
      settings.radarrQualityProfileId,
    );
  }
  if (settings.radarrRootFolderPath) {
    ($<HTMLSelectElement>('radarrRootFolder')).value = settings.radarrRootFolderPath;
  }
  if (settings.sonarrQualityProfileId) {
    ($<HTMLSelectElement>('sonarrQualityProfile')).value = String(
      settings.sonarrQualityProfileId,
    );
  }
  if (settings.sonarrRootFolderPath) {
    ($<HTMLSelectElement>('sonarrRootFolder')).value = settings.sonarrRootFolderPath;
  }
}

// ─── Save settings ───────────────────────────────────────────────────────────

async function saveSettings() {
  const settings: ExtensionSettings = {
    backendUrl: $<HTMLInputElement>('backendUrl').value.replace(/\/+$/, ''),
    radarrUrl: $<HTMLInputElement>('radarrUrl').value.replace(/\/+$/, ''),
    radarrApiKey: $<HTMLInputElement>('radarrApiKey').value,
    sonarrUrl: $<HTMLInputElement>('sonarrUrl').value.replace(/\/+$/, ''),
    sonarrApiKey: $<HTMLInputElement>('sonarrApiKey').value,
    qbitUrl: $<HTMLInputElement>('qbitUrl').value.replace(/\/+$/, ''),
    qbitUsername: $<HTMLInputElement>('qbitUsername').value,
    qbitPassword: $<HTMLInputElement>('qbitPassword').value,
    qbitMovieCategory: $<HTMLInputElement>('qbitMovieCategory').value || 'radarr',
    qbitTvCategory: $<HTMLInputElement>('qbitTvCategory').value || 'sonarr',
  };

  const radarrProfile = $<HTMLSelectElement>('radarrQualityProfile').value;
  if (radarrProfile) settings.radarrQualityProfileId = parseInt(radarrProfile, 10);

  const radarrFolder = $<HTMLSelectElement>('radarrRootFolder').value;
  if (radarrFolder) settings.radarrRootFolderPath = radarrFolder;

  const sonarrProfile = $<HTMLSelectElement>('sonarrQualityProfile').value;
  if (sonarrProfile) settings.sonarrQualityProfileId = parseInt(sonarrProfile, 10);

  const sonarrFolder = $<HTMLSelectElement>('sonarrRootFolder').value;
  if (sonarrFolder) settings.sonarrRootFolderPath = sonarrFolder;

  await chrome.storage.sync.set(settings);
  showStatus('Settings saved successfully!');
}

// ─── Test connections ────────────────────────────────────────────────────────

async function testBackend() {
  const url = $<HTMLInputElement>('backendUrl').value.replace(/\/+$/, '');
  if (!url) return showStatus('Enter a backend URL first', true);

  try {
    const res = await fetch(`${url}/health`);
    const data = await res.json();
    if (data.status === 'ok') {
      showStatus(`Backend connected! (${data.timestamp})`);
    } else {
      showStatus('Backend responded but status is not OK', true);
    }
  } catch (err) {
    showStatus(`Cannot reach backend: ${err instanceof Error ? err.message : err}`, true);
  }
}

async function loadProfiles(service: 'radarr' | 'sonarr') {
  const backendUrl = $<HTMLInputElement>('backendUrl').value.replace(/\/+$/, '');
  if (!backendUrl) return showStatus('Enter a backend URL first', true);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (service === 'radarr') {
    headers['X-Radarr-Url'] = $<HTMLInputElement>('radarrUrl').value;
    headers['X-Radarr-Key'] = $<HTMLInputElement>('radarrApiKey').value;
  } else {
    headers['X-Sonarr-Url'] = $<HTMLInputElement>('sonarrUrl').value;
    headers['X-Sonarr-Key'] = $<HTMLInputElement>('sonarrApiKey').value;
  }

  try {
    const res = await fetch(`${backendUrl}/api/config/profiles`, { headers });
    const data = await res.json();

    if (!data.success) {
      showStatus(`Failed: ${data.message || 'Unknown error'}`, true);
      return;
    }

    const svcData = data.data?.[service];
    if (svcData?.error) {
      showStatus(svcData.error, true);
      return;
    }

    // Populate quality profiles
    const profileSelect = $<HTMLSelectElement>(
      service === 'radarr' ? 'radarrQualityProfile' : 'sonarrQualityProfile',
    );
    profileSelect.innerHTML = '<option value="">Auto (first available)</option>';
    for (const p of svcData.profiles || []) {
      const opt = document.createElement('option');
      opt.value = String(p.id);
      opt.textContent = p.name;
      profileSelect.appendChild(opt);
    }

    // Populate root folders
    const folderSelect = $<HTMLSelectElement>(
      service === 'radarr' ? 'radarrRootFolder' : 'sonarrRootFolder',
    );
    folderSelect.innerHTML = '<option value="">Auto (first available)</option>';
    for (const f of svcData.rootFolders || []) {
      const opt = document.createElement('option');
      opt.value = f.path;
      opt.textContent = `${f.path} (${Math.round(f.freeSpace / 1e9)} GB free)`;
      folderSelect.appendChild(opt);
    }

    showStatus(
      `${service === 'radarr' ? 'Radarr' : 'Sonarr'} connected — ${svcData.profiles?.length || 0} profiles, ${svcData.rootFolders?.length || 0} folders loaded`,
    );
  } catch (err) {
    showStatus(`Connection failed: ${err instanceof Error ? err.message : err}`, true);
  }
}

// ─── Event listeners ─────────────────────────────────────────────────────────

$('save').addEventListener('click', saveSettings);
$('reset').addEventListener('click', async () => {
  await chrome.storage.sync.set(DEFAULT_SETTINGS);
  await loadSettings();
  showStatus('Settings reset to defaults');
});
$('testBackend').addEventListener('click', testBackend);
$('testRadarr').addEventListener('click', () => loadProfiles('radarr'));
$('testSonarr').addEventListener('click', () => loadProfiles('sonarr'));

// Load on open
loadSettings();
