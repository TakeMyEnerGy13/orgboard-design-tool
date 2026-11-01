import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { seedRoles, roleIssues, teamHealth } from '../src/domain.js';
import { localizeDemo, issueText, metricStatusText } from '../src/locale.js';
import { prepareChanges } from '../src/assistant-domain.js';
import { answerQuestion, assistantConfig, handleAssistant } from '../assistant-api.mjs';

const update = (roleId, field, value) => ({ operation: 'update', roleId, edits: [{ field, value }] });
const env = { OPENAI_API_KEY: 'test-key', OPENAI_MODEL: 'test-model' };
const response = reply => ({ ok: true, json: async () => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(reply) }] }] }) });
const query = () => ({ roles: localizeDemo(seedRoles()), messages: [{ role: 'user', content: 'What needs attention?' }] });

test('assistant accepts its public HTTPS origin behind a proxy and rejects other origins', async t => {
  const origin = 'https://orgboard.example';
  const server = createServer((req, res) => handleAssistant(req, res, origin));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/assistant`;
  const post = site => fetch(url, { method: 'POST', headers: { Origin: site }, body: '{' });
  const accepted = await post(origin);
  assert.equal(accepted.status, 400);
  assert.equal((await post('https://other.example')).status, 403);
});

test('issue reasons distinguish KPI, objective, absent facts, vacancies and limits without alleging lateness', () => {
  const roles = localizeDemo(seedRoles()), editor = roles.find(role => role.id === 'editor');
  assert.match(issueText(roleIssues(editor)[0]), /KPI “Video ads delivered”: 12 of 20/);
  editor.kpi.current = 20; editor.objective.result.current = 2;
  assert.equal(roleIssues(editor)[0].source, 'objective');
  assert.match(issueText(roleIssues(editor)[0]), /Goal “Build a repeatable editing workflow”: 2 of 4/);
  editor.objective.result.current = null;
  assert.match(issueText(roleIssues(editor)[0]), /missing actual/);
  assert.equal(issueText(roleIssues(roles.find(role => role.id === 'crm'))[0]), 'No employee assigned');
  assert.equal(metricStatusText('below', { direction: 'lower' }), 'Over limit');
});
test('AI proposals preserve untouched data, clear inherited risks and expose exact field diffs', () => {
  const roles = seedRoles(), initial = structuredClone(roles);
  const result = prepareChanges(roles, [update('editor', 'kpi.current', 20)]);
  assert.deepEqual(roles, initial);
  assert.deepEqual(teamHealth(result.roles, 'ceo').below.map(role => role.id), ['finance']);
  assert.deepEqual(result.diffs[0].fields, [{ field: 'kpi.current', label: 'KPI actual', before: 12, after: 20 }]);
  assert.deepEqual(result.roles.find(role => role.id === 'editor').objective, initial.find(role => role.id === 'editor').objective);
  assert.throws(() => prepareChanges(result.roles, [update('editor', 'kpi.current', 20)]), /does not change/);
});
test('AI creates a vacancy with no invented facts; invalid fields, cycles and partial batches cannot apply', () => {
  const roles = seedRoles(), original = structuredClone(roles);
  const next = prepareChanges(roles, [{ operation: 'create', roleId: 'new-designer', edits: [
    { field: 'title', value: 'Designer' }, { field: 'department', value: 'Marketing' }, { field: 'managerId', value: 'creative' },
  ] }]).roles;
  assert.equal(next.at(-1).employee, ''); assert.equal(next.at(-1).kpi.current, null); assert.equal(next.at(-1).kpi.target, null);
  for (const bad of [update('creative', 'managerId', 'editor'), update('editor', 'kpi.current', -1), update('editor', '__proto__.polluted', true), update('missing', 'title', 'Role')]) {
    assert.throws(() => prepareChanges(roles, [bad]));
    assert.throws(() => prepareChanges(roles, [update('supply', 'kpi.current', 99), bad]));
  }
  assert.deepEqual(roles, original);
});
test('AI connection requires a key and config never exposes credentials', async () => {
  assert.deepEqual(assistantConfig(env), { configured: true, provider: 'OpenAI', model: 'test-model' });
  await assert.rejects(answerQuestion(query(), { env: {}, fetcher: () => assert.fail('No network without a key') }), /not connected/);
});
test('provider receives current data and derived evidence; structured reply links only real roles', async () => {
  const body = query(); body.roles.find(role => role.id === 'editor').kpi.current = 17;
  const reply = await answerQuestion(body, { env, fetcher: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(options.headers.Authorization, 'Bearer test-key');
    const payload = JSON.parse(options.body);
    assert.equal(payload.store, false); assert.equal(payload.model, 'test-model');
    assert.match(payload.input[0].content, /17 of 20/); assert.match(payload.instructions, /no deadlines/);
    assert.equal(payload.text.format.strict, true);
    return response({ answer: 'The target has not been reached.', roleIds: ['editor', 'unknown', 'editor'], changes: [] });
  } });
  assert.deepEqual(reply.roleIds, ['editor']);
});
test('OpenRouter credentials use its Responses endpoint and stay out of the public config', async () => {
  for (const settings of [{ OPENROUTER_API_KEY: 'router-test' }, { OPENAI_API_KEY: 'sk-or-test', OPENAI_MODEL: 'gpt-5-mini' }]) {
    assert.deepEqual(assistantConfig(settings), { configured: true, provider: 'OpenRouter', model: 'openai/gpt-5-mini' });
    await answerQuestion(query(), { env: settings, fetcher: async (url, options) => {
      assert.equal(url, 'https://openrouter.ai/api/v1/responses');
      assert.equal(options.headers.Authorization, 'Bearer ' + (settings.OPENROUTER_API_KEY || settings.OPENAI_API_KEY));
      assert.equal(JSON.parse(options.body).model, 'openai/gpt-5-mini');
      return response({ answer: 'Done', roleIds: [], changes: [] });
    } });
  }
});
test('invalid model mutations are discarded, and refusals or truncated responses never change data', async () => {
  const invalid = await answerQuestion(query(), { env, fetcher: async () => response({ answer: 'I suggest changing the manager.', roleIds: ['creative'], changes: [update('creative', 'managerId', 'editor')] }) });
  assert.deepEqual(invalid.changes, []); assert.match(invalid.answer, /failed validation/);
  const refused = await answerQuestion(query(), { env, fetcher: async () => ({ ok: true, json: async () => ({ output: [{ content: [{ type: 'refusal' }] }] }) }) });
  assert.deepEqual(refused.changes, []);
  await assert.rejects(answerQuestion(query(), { env, fetcher: async () => ({ ok: true, json: async () => ({ status: 'incomplete', output: [] }) }) }), /incomplete/);
  await assert.rejects(answerQuestion(query(), { env, fetcher: async () => ({ ok: false, status: 401 }) }), /API key/);
});
