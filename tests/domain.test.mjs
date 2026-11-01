import test from 'node:test';
import assert from 'node:assert/strict';
import { seedRoles, metricStatus, attainment, roleStatus, teamHealth, saveRole, removeRole, managerOptions, serialize, deserialize, validateRoles } from '../src/domain.js';
import { localizeDemo } from '../src/locale.js';

test('one failing contributor propagates once to each ancestor, without changing their KPI', () => {
  const roles = seedRoles();
  for (const id of ['creative', 'cmo', 'ceo']) {
    assert.deepEqual(teamHealth(roles, id).below.map(r => r.id), id === 'ceo' ? ['editor', 'finance'] : ['editor']);
    assert.equal(roleStatus(roles.find(r => r.id === id)), 'met');
  }
  const editor = roles.find(r => r.id === 'editor');
  const next = saveRole(roles, { ...editor, kpi: { ...editor.kpi, current: 20 } });
  for (const id of ['creative', 'cmo']) assert.equal(teamHealth(next, id).below.length, 0);
  assert.deepEqual(teamHealth(next, 'ceo').below.map(r => r.id), ['finance']);
});
test('objective failure propagates, but the primary KPI remains independently achieved', () => {
  const roles = seedRoles();
  const editor = roles.find(r => r.id === 'editor');
  editor.kpi.current = 20;
  editor.objective.result.current = 2;
  assert.equal(metricStatus(editor.kpi), 'met');
  assert.equal(roleStatus(editor), 'below');
  assert.equal(teamHealth(roles, 'cmo').below.length, 1);
});
test('reparenting a manager moves the full branch and its health signal', () => {
  const roles = seedRoles();
  const next = saveRole(roles, { ...roles.find(r => r.id === 'creative'), managerId: 'ops' });
  assert.equal(teamHealth(next, 'cmo').below.length, 0);
  assert.equal(teamHealth(next, 'ops').below[0].id, 'editor');
  assert.equal(next.find(r => r.id === 'editor').managerId, 'creative');
});
test('self reporting and descendant reporting are rejected by data layer and manager options', () => {
  const roles = seedRoles(), cmo = roles.find(r => r.id === 'cmo');
  for (const managerId of ['cmo', 'editor']) assert.throws(() => saveRole(roles, { ...cmo, managerId }), /cannot report/);
  assert.equal(managerOptions(roles, 'cmo').some(r => ['cmo', 'editor'].includes(r.id)), false);
});
test('deletion reassigns only direct reports, preserving all other data', () => {
  const roles = seedRoles();
  assert.throws(() => removeRole(roles, 'creative'), /Choose a new manager/);
  assert.throws(() => removeRole(roles, 'creative', 'editor'), /Choose a new manager/);
  const next = removeRole(roles, 'creative', 'cmo');
  assert.equal(next.length, 12);
  assert.equal(next.find(r => r.id === 'editor').managerId, 'cmo');
  assert.equal(next.find(r => r.id === 'strategist').managerId, 'cmo');
  assert.throws(() => removeRole(roles, 'ceo', 'cmo'), /cannot be removed/);
});
test('lower-is-better, zeros, missing values and no division by zero', () => {
  const metric = { name: 'CAC', current: 65, target: 50, direction: 'lower' };
  assert.equal(metricStatus(metric), 'below');
  assert.equal(metricStatus({ ...metric, current: 42 }), 'met');
  assert.equal(metricStatus({ ...metric, current: null }), 'missing');
  assert.equal(metricStatus({ ...metric, current: 0, target: 0 }), 'met');
  assert.equal(attainment({ ...metric, current: 0, target: 0 }), 100);
  assert.equal(attainment({ ...metric, current: 1, target: 0 }), 0);
  assert.equal(attainment({ ...metric, direction: 'higher', current: 0, target: 0 }), 100);
});
test('vacancy and missing data remain visible and distinct from failure', () => {
  const roles = seedRoles();
  assert.equal(roleStatus(roles.find(r => r.id === 'crm')), 'vacant');
  const creative = roles.find(r => r.id === 'creative');
  creative.kpi.current = null;
  assert.equal(roleStatus(creative), 'missing');
  assert.equal(teamHealth(roles, 'ceo').missing.length, 1);
  assert.equal(teamHealth(roles, 'ceo').vacant.length, 1);
});
test('save round trip preserves new roles, metrics, objectives and structure', () => {
  const roles = seedRoles();
  const next = saveRole(roles, { ...roles[6], id: 'new', title: 'Designer', employee: '' });
  assert.deepEqual(deserialize(serialize(next)), next);
  assert.throws(() => deserialize('{broken'));
  assert.throws(() => deserialize('{"version":2}'), /different version/);
});
test('validation rejects disconnected trees, negative values and nonnumeric values', () => {
  const roles = seedRoles();
  assert.throws(() => saveRole(roles, { ...roles[1], managerId: 'missing' }), /existing manager/);
  assert.throws(() => saveRole(roles, { ...roles[1], managerId: null }), /one company leader/);
  for (const current of [-1, '8', NaN, Infinity]) assert.throws(() => saveRole(roles, { ...roles[1], kpi: { ...roles[1].kpi, current } }), /zero or greater/);
  assert.throws(() => validateRoles([...roles, roles[0]]), /unique/);
});

test('demo update fills only matching employees with empty goals', () => {
  const saved = localizeDemo(seedRoles());
  const custom = { title: 'My supply plan', result: { name: 'Batches', current: 2, target: 7, unit: 'units.', direction: 'higher' } };
  saved.find(r => r.id === 'supply').objective = custom;
  Object.assign(saved.find(r => r.id === 'support'), { employee: 'New employee', objective: null });
  saved.find(r => r.id === 'finance').objective = null;
  saved.find(r => r.id === 'ops').objective = null;
  const updated = localizeDemo(saved, { demoGoalsVersion: 0 });
  assert.equal(updated.find(r => r.id === 'finance').objective.result.current, 8);
  assert.deepEqual(updated.find(r => r.id === 'supply').objective, custom);
  for (const id of ['support', 'ops']) assert.equal(updated.find(r => r.id === id).objective, null);
  assert.deepEqual(localizeDemo(updated, { demoGoalsVersion: 0 }), updated);
});

test('retire untouched previous demo goals, preserving edited goals and an intentionally deleted forecast', () => {
  const saved = localizeDemo(seedRoles());
  saved.find(r => r.id === 'finance').objective = null;
  saved.find(r => r.id === 'supply').objective = { title: 'Find backup suppliers for bestsellers', result: { name: 'Bestsellers with a backup supplier', current: 6, target: 6, unit: 'products', direction: 'higher' } };
  const support = { title: 'Let support approve routine returns', result: { name: 'Returns approved without the founder', current: 93, target: 90, unit: '%', direction: 'higher' } };
  saved.find(r => r.id === 'support').objective = support;
  const updated = localizeDemo(saved, { demoGoalsVersion: 1 });
  assert.deepEqual(updated.filter(r => r.objective).map(r => r.id), ['editor', 'support']);
  assert.deepEqual(updated.find(r => r.id === 'support').objective, support);
  assert.deepEqual(localizeDemo(deserialize(serialize(updated))), updated);
});

test('Russian demo migration preserves measurements, relationships, custom text and new roles', () => {
  const roles = seedRoles();
  roles.find(r => r.id === 'editor').kpi.current = 17;
  roles.find(r => r.id === 'editor').title = 'Видеомонтажёр';
  roles.find(r => r.id === 'editor').employee = 'Итан Миллер';
  roles.find(r => r.id === 'creative').managerId = 'ops';
  roles.find(r => r.id === 'cmo').title = 'My custom director';
  roles.find(r => r.id === 'ceo').objective = { title: 'My custom objective', result: { name: 'My measure', current: 2, target: 3, unit: 'custom units', direction: 'higher' } };
  roles.find(r => r.id === 'ops').objective = null;
  roles.push({ ...structuredClone(roles[6]), id: 'custom', title: 'My new role' });
  const translated = localizeDemo(roles);
  assert.equal(translated.find(r => r.id === 'editor').title, 'Video Editor');
  assert.equal(translated.find(r => r.id === 'editor').kpi.current, 17);
  assert.equal(translated.find(r => r.id === 'creative').managerId, 'ops');
  assert.equal(translated.find(r => r.id === 'cmo').title, 'My custom director');
  assert.deepEqual(translated.find(r => r.id === 'ceo').objective, roles.find(r => r.id === 'ceo').objective);
  assert.equal(translated.find(r => r.id === 'ops').objective, null);
  assert.equal(translated.find(r => r.id === 'finance').objective.title, 'Build a 13-week cash forecast');
  assert.deepEqual(translated.find(r => r.id === 'custom'), roles.find(r => r.id === 'custom'));
  assert.deepEqual(localizeDemo(translated), translated);
  assert.equal(roles.find(r => r.id === 'editor').title, 'Видеомонтажёр');
  assert.equal(translated.find(r => r.id === 'editor').employee, 'Ethan Miller');
});
