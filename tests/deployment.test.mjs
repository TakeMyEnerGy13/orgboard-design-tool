import { test } from 'node:test';
import assert from 'node:assert/strict';
import assistant from '../api/assistant.js';
import config from '../api/assistant/config.js';

function recorder() {
  return {
    code: 200, setHeader() {}, status(code) { this.code = code; return this; },
    writeHead(code) { this.code = code; }, end(value) { this.data = JSON.parse(value); },
    json(value) { this.data = value; },
  };
}
test('Vercel config publishes only connection metadata', () => {
  const response = recorder();
  config({ method: 'GET' }, response);
  assert.deepEqual(Object.keys(response.data).sort(), ['configured', 'model', 'provider']);
});
test('Vercel chat accepts the public HTTPS origin; malformed input never reaches the provider', async () => {
  const headers = { host: 'demo.example', origin: 'https://demo.example' };
  for (const [body, code] of [['{', 400], ['null', 400], [' '.repeat(500001), 413]]) {
    const r = recorder();
    await assistant({ method: 'POST', url: '/api/assistant', headers, body }, r);
    assert.equal(r.code, code);
  }
  const rejected = recorder();
  await assistant({ method: 'POST', url: '/api/assistant', headers: { ...headers, origin: 'https://other.example' }, body: {} }, rejected);
  assert.equal(rejected.code, 403);
});
