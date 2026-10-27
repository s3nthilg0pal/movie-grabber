import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

for (const target of ['firefox', 'chrome']) {
  const directory = new URL(target === 'firefox' ? '../dist-firefox/' : '../dist/', import.meta.url);
  function setup() {
    const requests = [];
    const stored = {
      backendUrl: 'http://backend.test:3000',
      radarrUrl: 'http://radarr.test:7878', radarrApiKey: 'movie-key',
      sonarrUrl: 'http://sonarr.test:8989', sonarrApiKey: 'series-key',
      radarrQualityProfileId: 9, radarrRootFolderPath: '/movies',
      qbitUrl: 'http://qbit.test:8080', qbitUsername: 'test', qbitPassword: 'password',
    };
    class Element {
      options = []; listeners = {}; textContent = ''; className = ''; _value = '';
      constructor(select = false) { this.select = select; if (select) this.options = [{ value: '' }]; }
      get value() { return this._value; }
      set value(value) { this._value = this.select && !this.options.some((o) => o.value === value) ? '' : value; }
      set innerHTML(value) { this.options = [{ value: '' }]; this._value = ''; }
      appendChild(option) { this.options.push(option); }
      addEventListener(event, listener) { this.listeners[event] = listener; }
    }
    const fields = {};
    const html = readFileSync(new URL('options.html', directory), 'utf8');
    for (const match of html.matchAll(/<(\w+)[^>]*\bid="([^"]+)"/g)) fields[match[2]] = new Element(match[1] === 'select');
    const api = {
      storage: { sync: {
        get: async (defaults) => ({ ...defaults, ...stored }),
        set: async (values) => Object.assign(stored, values),
        remove: async (keys) => { for (const key of keys) delete stored[key]; },
      } },
      runtime: { getURL: () => 'moz-extension://test/' },
      declarativeNetRequest: { updateSessionRules: async () => {} },
    };
    runInNewContext(readFileSync(new URL('options.js', directory), 'utf8'), {
      ...(target === 'firefox' ? { browser: api } : { chrome: api }),
      document: { getElementById: (id) => fields[id], createElement: () => new Element() },
      URL, URLSearchParams, AbortSignal, Error,
      setTimeout() {},
      fetch: async (url, init) => {
        requests.push({ url, ...init });
        const data = url.endsWith('/health') ? { status: 'ok', timestamp: 'test-time' }
          : url.endsWith('/qualityprofile') ? [{ id: 9, name: 'HD' }]
          : url.endsWith('/rootfolder') ? [{ path: '/movies', freeSpace: 1e12 }] : [];
        return { ok: true, json: async () => data };
      },
    });
    return { fields, stored, requests, click: async (id) => fields[id].listeners.click() };
  }
  test(`${target}: settings load profiles directly using unsaved service credentials`, async () => {
    const state = setup();
    await new Promise(setImmediate);
    state.fields.radarrUrl.value = 'http://new-radarr.test:7878/radarr/';
    state.fields.radarrApiKey.value = 'new-key';
    await state.click('testRadarr');
    assert.equal(state.requests.length, 2);
    assert.ok(state.requests.every((r) => r.url.startsWith('http://new-radarr.test:7878/radarr/api/v3/')));
    assert.ok(state.requests.every((r) => r.headers['X-Api-Key'] === 'new-key'));
    assert.equal(state.fields.radarrQualityProfile.value, '9');
    assert.equal(state.fields.radarrRootFolder.value, '/movies');
    assert.equal(state.fields.backendUrl.value, 'http://backend.test:3000');
    await state.click('testSonarr');
    assert.ok(state.requests.slice(2).every((r) => r.url.startsWith('http://sonarr.test:8989/api/v3/')));
    assert.ok(state.requests.slice(2).every((r) => r.headers['X-Api-Key'] === 'series-key'));
  });
  test(`${target}: backend setting is retained and its test only calls the backend`, async () => {
    const state = setup();
    await new Promise(setImmediate);
    state.fields.backendUrl.value = 'http://another-backend.test:3000/';
    await state.click('testBackend');
    assert.equal(state.requests.length, 1);
    assert.equal(state.requests[0].url, 'http://another-backend.test:3000/health');
    assert.equal(state.requests[0].headers, undefined);
    assert.match(state.fields.status.textContent, /Backend connected/);
    await state.click('save');
    assert.equal(state.stored.backendUrl, 'http://another-backend.test:3000');
    await state.click('testRadarr');
    assert.ok(state.requests.slice(1).every((r) => r.url.startsWith('http://radarr.test:7878/api/v3/')));
  });
  test(`${target}: saving preserves stored selections and Auto clears them`, async () => {
    const state = setup();
    await new Promise(setImmediate);
    await state.click('save');
    assert.equal(state.stored.radarrQualityProfileId, 9);
    assert.equal(state.stored.radarrRootFolderPath, '/movies');
    state.fields.radarrQualityProfile.value = '';
    state.fields.radarrRootFolder.value = '';
    await state.click('save');
    assert.equal(state.stored.radarrQualityProfileId, undefined);
    assert.equal(state.stored.radarrRootFolderPath, undefined);
    state.stored.radarrQualityProfileId = 9;
    await state.click('reset');
    assert.equal(state.stored.radarrQualityProfileId, undefined);
  });
}
