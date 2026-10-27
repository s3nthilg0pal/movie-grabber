import { extension } from '../browser.js';
import { loadArrProfiles } from '../services/arr.js';
import { testQbitConnection } from '../services/qbittorrent.js';
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

function restoreSelection(id: string, value: string | number | undefined) {
  const select = $<HTMLSelectElement>(id);
  if (value === undefined || value === '') { select.value = ''; return; }
  const selected = String(value);
  if (!Array.from(select.options).some((option) => option.value === selected)) {
    const option = document.createElement('option');
    option.value = selected;
    option.textContent = selected;
    select.appendChild(option);
  }
  select.value = selected;
}

async function loadSettings() {
  const settings = (await extension.storage.sync.get(DEFAULT_SETTINGS)) as ExtensionSettings;

  for (const key of fields) {
    const el = $<HTMLInputElement>(key);
    if (el) el.value = String(settings[key] || '');
  }

  restoreSelection('radarrQualityProfile', settings.radarrQualityProfileId);
  restoreSelection('radarrRootFolder', settings.radarrRootFolderPath);
  restoreSelection('sonarrQualityProfile', settings.sonarrQualityProfileId);
  restoreSelection('sonarrRootFolder', settings.sonarrRootFolderPath);
}

// ─── Save settings ───────────────────────────────────────────────────────────

async function saveSettings() {
  const settings: ExtensionSettings = {
    backendUrl: $<HTMLInputElement>('backendUrl').value.trim().replace(/\/+$/, ''),
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

  const optionalFields: (keyof ExtensionSettings)[] = [
    'radarrQualityProfileId', 'radarrRootFolderPath', 'sonarrQualityProfileId', 'sonarrRootFolderPath',
  ];
  await extension.storage.sync.remove(optionalFields.filter((key) => settings[key] === undefined));
  await extension.storage.sync.set(settings);
  showStatus('Settings saved successfully!');
}

// ─── Test connections ────────────────────────────────────────────────────────

async function testBackend() {
  const url = $<HTMLInputElement>('backendUrl').value.trim().replace(/\/+$/, '');
  if (!url) return showStatus('Enter a backend URL first', true);

  try {
    const res = await fetch(`${url}/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
  const label = service === 'radarr' ? 'Radarr' : 'Sonarr';
  const url = $<HTMLInputElement>(`${service}Url`).value.trim().replace(/\/+$/, '');
  const apiKey = $<HTMLInputElement>(`${service}ApiKey`).value.trim();
  if (!url || !apiKey) return showStatus(`Enter the ${label} URL and API key first`, true);

  try {
    const svcData = await loadArrProfiles({ url, apiKey });

    // Populate quality profiles
    const profileSelect = $<HTMLSelectElement>(
      service === 'radarr' ? 'radarrQualityProfile' : 'sonarrQualityProfile',
    );
    const selectedProfile = profileSelect.value;
    profileSelect.innerHTML = '<option value="">Auto (first available)</option>';
    for (const p of svcData.profiles || []) {
      const opt = document.createElement('option');
      opt.value = String(p.id);
      opt.textContent = p.name;
      profileSelect.appendChild(opt);
    }
    profileSelect.value = selectedProfile;

    // Populate root folders
    const folderSelect = $<HTMLSelectElement>(
      service === 'radarr' ? 'radarrRootFolder' : 'sonarrRootFolder',
    );
    const selectedFolder = folderSelect.value;
    folderSelect.innerHTML = '<option value="">Auto (first available)</option>';
    for (const f of svcData.rootFolders || []) {
      const opt = document.createElement('option');
      opt.value = f.path;
      opt.textContent = `${f.path} (${Math.round(f.freeSpace / 1e9)} GB free)`;
      folderSelect.appendChild(opt);
    }
    folderSelect.value = selectedFolder;

    showStatus(
      `${service === 'radarr' ? 'Radarr' : 'Sonarr'} connected — ${svcData.profiles?.length || 0} profiles, ${svcData.rootFolders?.length || 0} folders loaded`,
    );
  } catch (err) {
    showStatus(`Connection failed: ${err instanceof Error ? err.message : err}`, true);
  }
}

async function testQbit() {
  try {
    const version = await testQbitConnection({
      url: $<HTMLInputElement>('qbitUrl').value,
      username: $<HTMLInputElement>('qbitUsername').value,
      password: $<HTMLInputElement>('qbitPassword').value,
    });
    showStatus(`qBittorrent connected (${version})`);
  } catch (err) {
    showStatus(`qBittorrent test failed: ${err instanceof Error ? err.message : err}`, true);
  }
}

// ─── Event listeners ─────────────────────────────────────────────────────────

$('save').addEventListener('click', saveSettings);
$('reset').addEventListener('click', async () => {
  await extension.storage.sync.remove([
    'radarrQualityProfileId', 'radarrRootFolderPath', 'sonarrQualityProfileId', 'sonarrRootFolderPath',
  ]);
  await extension.storage.sync.set(DEFAULT_SETTINGS);
  await loadSettings();
  showStatus('Settings reset to defaults');
});
$('testRadarr').addEventListener('click', () => loadProfiles('radarr'));
$('testBackend').addEventListener('click', testBackend);
$('testSonarr').addEventListener('click', () => loadProfiles('sonarr'));
$('testQbit').addEventListener('click', testQbit);

// Load on open
loadSettings();
