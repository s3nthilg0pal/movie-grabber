import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

// Exercise the shipped bundle with Firefox's native browser namespace and
// Chrome's namespace. A deliberately unusable chrome object in Firefox catches
// accidental uses of Chrome's callback-only API conventions.
for (const target of ['firefox', 'chrome']) {
  const directory = new URL(target === 'firefox' ? '../dist-firefox/' : '../dist/', import.meta.url);
  const bundle = readFileSync(new URL('service-worker.js', directory), 'utf8');

  function setup() {
    let onMessage;
    let onClicked;
    let failure;
    const requests = [];
    const injections = [];
    const settings = {
      backendUrl: 'http://localhost:3000',
      radarrApiKey: 'radarr-test-key',
      sonarrApiKey: 'sonarr-test-key',
      qbitUrl: 'http://localhost:8080',
      qbitUsername: 'test-user',
      qbitPassword: 'test-password',
    };
    const api = {
      storage: { sync: { get: async (defaults) => ({ ...defaults, ...settings }) } },
      action: { onClicked: { addListener: (listener) => { onClicked = listener; } } },
      scripting: { executeScript: async (details) => { injections.push(details); } },
      runtime: { onMessage: { addListener: (listener) => { onMessage = listener; } } },
    };
    runInNewContext(bundle, {
      ...(target === 'firefox' ? {
        browser: api,
        chrome: new Proxy({}, { get() { throw new Error('Firefox must use browser APIs'); } }),
      } : { chrome: api }),
      console: { log() {}, error() {} },
      fetch: async (url, options) => {
        if (failure) throw failure;
        requests.push({ url, ...options, body: JSON.parse(options.body) });
        return { json: async () => ({ success: true, message: 'OK', data: { exists: true } }) };
      },
    });
    return {
      settings, requests, injections,
      fail: (error) => { failure = error; },
      click: (tab) => onClicked(tab),
      message: (message) => new Promise((resolve) => {
        assert.equal(onMessage(message, {}, resolve), true, 'async response channel stays open');
      }),
    };
  }

  test(`${target}: packaged manifest references exist and background matches the browser`, () => {
    const manifest = JSON.parse(readFileSync(new URL('manifest.json', directory), 'utf8'));
    if (target === 'firefox') {
      assert.deepEqual(manifest.background, { scripts: ['service-worker.js'] });
      assert.ok(manifest.browser_specific_settings.gecko.id);
    } else {
      assert.equal(manifest.background.service_worker, 'service-worker.js');
      assert.equal(manifest.browser_specific_settings, undefined);
    }
    const files = [
      manifest.options_page,
      ...Object.values(manifest.icons),
      ...manifest.content_scripts.flatMap((script) => script.js),
      'service-worker.js', 'content-magnet.js', 'options.js',
    ];
    for (const file of files) assert.ok(existsSync(new URL(file, directory)), `Missing ${file}`);
  });

  test(`${target}: media and magnet messages reach the configured backend`, async () => {
    const state = setup();
    for (const type of ['movie', 'series']) {
      const media = { type, title: 'Test title', year: 2026, imdbId: 'tt1234567' };
      assert.equal((await state.message({ action: 'addMedia', media })).success, true);
      const status = await state.message({ action: 'checkStatus', media });
      assert.equal(status.alreadyExists, true);
      const request = state.requests.at(-2);
      assert.equal(request.url, `http://localhost:3000/api/${type}/add`);
      assert.equal(request.headers['X-Radarr-Key'], 'radarr-test-key');
      assert.equal(request.body.imdbId, media.imdbId);
      assert.equal(state.requests.at(-1).url, `http://localhost:3000/api/${type}/status`);
    }
    for (const [type, category] of [['movie', 'radarr'], ['series', 'sonarr']]) {
      const magnetUri = 'magnet:?xt=urn:btih:0123456789012345678901234567890123456789';
      const result = await state.message({ action: 'addMagnet', type, title: 'Test magnet', magnetUri });
      assert.equal(result.success, true);
      const request = state.requests.at(-1);
      assert.equal(request.url, 'http://localhost:3000/api/magnet/add');
      assert.equal(request.body.magnetUri, magnetUri);
      assert.equal(request.body.category, category);
      assert.equal(request.headers['X-Qbit-Password'], 'test-password');
    }
  });

  test(`${target}: missing configuration and network errors return responses`, async () => {
    const state = setup();
    state.settings.backendUrl = '';
    const media = { type: 'movie', title: 'Test title' };
    assert.equal((await state.message({ action: 'addMedia', media })).success, false);
    assert.equal(state.requests.length, 0);
    state.settings.backendUrl = 'http://localhost:3000';
    state.fail(new Error('Backend unavailable'));
    const response = await state.message({ action: 'addMedia', media });
    assert.equal(response.success, false);
    assert.equal(response.message, 'Backend unavailable');
  });

  test(`${target}: toolbar click injects the magnet scanner into the active tab`, async () => {
    const state = setup();
    await state.click({ id: 42 });
    assert.equal(state.injections.length, 1);
    assert.equal(state.injections[0].target.tabId, 42);
    assert.equal(state.injections[0].files[0], 'content-magnet.js');
    await state.click({});
    assert.equal(state.injections.length, 1);
  });
}
