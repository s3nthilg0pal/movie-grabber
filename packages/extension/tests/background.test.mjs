import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

for (const target of ['firefox', 'chrome']) {
  const directory = new URL(target === 'firefox' ? '../dist-firefox/' : '../dist/', import.meta.url);
  const bundle = readFileSync(new URL('service-worker.js', directory), 'utf8');

  function setup() {
    let onMessage, onClicked, failure;
    const requests = [], injections = [], rules = [];
    const settings = {
      // A stale backend setting must never receive requests or credentials.
      backendUrl: 'http://unrelated-backend.test',
      radarrUrl: 'http://radarr.test:7878/radarr', radarrApiKey: 'radarr-test-key',
      sonarrUrl: 'http://sonarr.test:8989', sonarrApiKey: 'sonarr-test-key',
      qbitUrl: 'http://qbit.test:8080', qbitUsername: 'test-user', qbitPassword: 'test-password',
    };
    const library = { movie: [], series: [] };
    const movie = { title: 'Test movie', year: 2026, tmdbId: 123, imdbId: 'tt1234567' };
    const series = { title: 'Test series', year: 2026, tvdbId: 456, imdbId: 'tt7654321', seasons: [{ seasonNumber: 1 }] };
    let qbitLogin = 'Ok.';
    const api = {
      storage: { sync: { get: async (defaults) => ({ ...defaults, ...settings }) } },
      action: { onClicked: { addListener: (listener) => { onClicked = listener; } } },
      scripting: { executeScript: async (details) => { injections.push(details); } },
      declarativeNetRequest: { updateSessionRules: async (details) => { rules.push(details); } },
      runtime: {
        getURL: () => `${target === 'firefox' ? 'moz' : 'chrome'}-extension://test-extension/`,
        onMessage: { addListener: (listener) => { onMessage = listener; } },
      },
    };
    runInNewContext(bundle, {
      ...(target === 'firefox' ? {
        browser: api,
        chrome: new Proxy({}, { get() { throw new Error('Firefox must use browser APIs'); } }),
      } : { chrome: api }),
      URL, URLSearchParams, AbortSignal, Error,
      console: { log() {}, error() {} },
      fetch: async (url, options = {}) => {
        if (failure) throw failure;
        assert.ok(!url.includes('unrelated-backend'), 'must not call the backend');
        requests.push({ url, ...options });
        let data;
        const parsed = new URL(url);
        const path = parsed.pathname;
        if (path.includes('/api/v3/')) {
          const isMovie = parsed.hostname === 'radarr.test';
          assert.equal(options.headers['X-Api-Key'], isMovie ? settings.radarrApiKey : settings.sonarrApiKey);
          assert.deepEqual(Object.keys(options.headers).sort(), ['Content-Type', 'X-Api-Key']);
          if (path.endsWith('/lookup/imdb')) data = movie;
          else if (path.includes('/lookup')) data = [isMovie ? movie : series];
          else if (path.endsWith('/qualityprofile')) data = [{ id: 7, name: 'HD' }];
          else if (path.endsWith('/rootfolder')) data = [{ path: '/media', freeSpace: 1e12 }];
          else if (options.method === 'POST') data = JSON.parse(options.body);
          else data = library[isMovie ? 'movie' : 'series'];
        } else if (path.endsWith('/auth/login')) data = qbitLogin;
        else if (path.endsWith('/torrents/categories')) data = {};
        else if (path.endsWith('/app/version')) data = 'v5.1.0';
        else data = 'Ok.';
        return { ok: true, status: 200, json: async () => data, text: async () => data };
      },
    });
    return {
      settings, requests, injections, rules, library, movie, series,
      fail: (error) => { failure = error; },
      rejectQbitLogin: () => { qbitLogin = 'Fails.'; },
      click: (tab) => onClicked(tab),
      message: (message) => new Promise((resolve) => {
        assert.equal(onMessage(message, {}, resolve), true);
      }),
    };
  }

  test(`${target}: packaged manifest references exist and background matches browser`, () => {
    const manifest = JSON.parse(readFileSync(new URL('manifest.json', directory), 'utf8'));
    if (target === 'firefox') {
      assert.deepEqual(manifest.background, { scripts: ['service-worker.js'] });
      assert.ok(manifest.browser_specific_settings.gecko.id);
    } else assert.equal(manifest.background.service_worker, 'service-worker.js');
    assert.ok(manifest.permissions.includes('declarativeNetRequestWithHostAccess'));
    assert.ok(!manifest.content_security_policy.extension_pages.includes('upgrade-insecure-requests'));
    assert.match(manifest.content_security_policy.extension_pages, /script-src 'self'/);
    for (const file of [manifest.options_page, ...Object.values(manifest.icons),
      ...manifest.content_scripts.flatMap((script) => script.js), 'service-worker.js', 'content-magnet.js', 'options.js']) {
      assert.ok(existsSync(new URL(file, directory)), `Missing ${file}`);
    }
  });

  test(`${target}: adds movies and series directly with the service's API key`, async () => {
    const state = setup();
    for (const type of ['movie', 'series']) {
      const media = type === 'movie' ? state.movie : state.series;
      assert.equal((await state.message({ action: 'addMedia', media: { ...media, type } })).success, true);
      const request = state.requests.at(-1);
      assert.equal(request.url, `${type === 'movie' ? state.settings.radarrUrl : state.settings.sonarrUrl}/api/v3/${type}`);
      const body = JSON.parse(request.body);
      assert.equal(body.qualityProfileId, 7);
      assert.equal(body.rootFolderPath, '/media');
      assert.equal(body.monitored, true);
      assert.equal(type === 'movie' ? body.addOptions.searchForMovie : body.addOptions.searchForMissingEpisodes, true);
    }
    assert.ok(state.requests.some((r) => r.url.includes('term=imdb%3Att7654321')));
  });

  test(`${target}: honors selected profile/folder and detects duplicates without adding`, async () => {
    const state = setup();
    state.settings.radarrQualityProfileId = 9;
    state.settings.radarrRootFolderPath = '/movies';
    const media = { ...state.movie, type: 'movie' };
    await state.message({ action: 'addMedia', media });
    const body = JSON.parse(state.requests.at(-1).body);
    assert.equal(body.qualityProfileId, 9);
    assert.equal(body.rootFolderPath, '/movies');
    assert.ok(!state.requests.some((r) => /qualityprofile|rootfolder/.test(r.url)));
    state.library.movie.push(state.movie);
    const count = state.requests.filter((r) => r.method === 'POST').length;
    assert.equal((await state.message({ action: 'addMedia', media })).alreadyExists, true);
    assert.equal((await state.message({ action: 'checkStatus', media })).alreadyExists, true);
    assert.equal(state.requests.filter((r) => r.method === 'POST').length, count);
  });

  test(`${target}: status checks resolve lookup IDs and never add to a library`, async () => {
    const state = setup();
    state.library.series.push({ ...state.series, title: 'Localized series', imdbId: undefined });
    const result = await state.message({ action: 'checkStatus', media: { type: 'series', title: 'Test series', year: 2026 } });
    assert.equal(result.alreadyExists, true);
    assert.ok(!state.requests.some((r) => r.method === 'POST'));
    const absent = await state.message({ action: 'checkStatus', media: { type: 'movie', title: 'Test movie', year: 2026 } });
    assert.equal(absent.alreadyExists, false);
  });

  test(`${target}: missing configuration and network errors return responses`, async () => {
    const state = setup();
    state.settings.radarrApiKey = '';
    const media = { type: 'movie', title: 'Test movie' };
    assert.equal((await state.message({ action: 'addMedia', media })).success, false);
    assert.equal(state.requests.length, 0);
    state.settings.radarrApiKey = 'radarr-test-key';
    state.fail(new Error('Service unavailable'));
    assert.equal((await state.message({ action: 'addMedia', media })).message, 'Service unavailable');
  });

  test(`${target}: sends magnets directly with cookies and correctly scoped headers`, async () => {
    const state = setup();
    for (const [type, category] of [['movie', 'radarr'], ['series', 'sonarr']]) {
      const magnetUri = 'magnet:?xt=urn:btih:0123456789012345678901234567890123456789';
      assert.equal((await state.message({ action: 'addMagnet', type, title: 'Test title (2026)', magnetUri })).success, true);
      const request = state.requests.at(-1);
      assert.equal(request.url, 'http://qbit.test:8080/api/v2/torrents/add');
      assert.equal(request.credentials, 'include');
      assert.equal(request.body.get('urls'), magnetUri);
      assert.equal(request.body.get('category'), category);
      const rule = state.rules.at(-1).addRules[0];
      assert.equal(rule.condition.initiatorDomains[0], 'test-extension');
      const pattern = new RegExp(rule.condition.regexFilter);
      assert.ok(pattern.test(request.url));
      assert.ok(!pattern.test('http://qbitXtest:8080/api/v2/torrents/add'));
      assert.ok(!pattern.test('http://other.test/api/v2/auth/login'));
      assert.equal(rule.action.requestHeaders.find((h) => h.header === 'Origin').value, 'http://qbit.test:8080');
    }
    const login = state.requests.find((r) => r.url.endsWith('/auth/login'));
    assert.equal(login.body.get('username'), 'test-user');
    assert.equal(login.body.get('password'), 'test-password');
  });

  test(`${target}: magnet flow reports partial success and refuses bad qBittorrent credentials`, async () => {
    const state = setup();
    state.settings.radarrApiKey = '';
    const message = { action: 'addMagnet', type: 'movie', title: 'Test movie', magnetUri: 'magnet:?xt=test' };
    const result = await state.message(message);
    assert.equal(result.success, false);
    assert.match(result.message, /Radarr failed.*Magnet sent/);
    state.rejectQbitLogin();
    const failed = await state.message(message);
    assert.match(failed.message, /invalid username or password/);
    assert.equal(state.requests.filter((r) => r.url.endsWith('/torrents/add')).length, 1);
  });

  test(`${target}: toolbar click injects scanner`, async () => {
    const state = setup();
    await state.click({ id: 42 });
    assert.equal(state.injections[0].target.tabId, 42);
    assert.equal(state.injections[0].files[0], 'content-magnet.js');
    await state.click({});
    assert.equal(state.injections.length, 1);
  });
}
