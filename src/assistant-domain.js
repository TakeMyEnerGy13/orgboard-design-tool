import { saveRole, validateRoles } from './domain.js';

export const editablePaths = {
  title: ['Role title', 'string'], employee: ['Employee', 'string'],
  department: ['Department', 'string'], managerId: ['Manager', 'manager'], outcome: ['Ownership', 'string'],
  'kpi.name': ['Primary KPI', 'string'], 'kpi.unit': ['KPI unit', 'string'],
  'kpi.current': ['KPI actual', 'number'], 'kpi.target': ['KPI target', 'number'], 'kpi.direction': ['KPI direction', 'direction'],
  'objective.enabled': ['Additional goal', 'boolean'], 'objective.title': ['Goal title', 'string'],
  'objective.result.name': ['Goal metric', 'string'], 'objective.result.unit': ['Goal unit', 'string'],
  'objective.result.current': ['Goal actual', 'number'], 'objective.result.target': ['Goal target', 'number'],
  'objective.result.direction': ['Goal direction', 'direction'],
};
const blankMetric = () => ({ name: '', unit: '', current: null, target: null, direction: 'higher' });
const valueAt = (role, field) => field === 'objective.enabled' ? Boolean(role?.objective) : field.split('.').reduce((value, key) => value?.[key], role) ?? null;

// The model proposes only allowlisted fields. Existing domain rules remain authoritative.
export function prepareChanges(roles, changes) {
  if (!Array.isArray(changes) || !changes.length || changes.length > 8) throw new Error('A proposal must contain between 1 and 8 role changes.');
  let next = structuredClone(validateRoles(roles));
  const touched = new Set();
  for (const change of changes) {
    if (!['create', 'update'].includes(change.operation) || typeof change.roleId !== 'string' || touched.has(change.roleId)) throw new Error('Invalid change list.');
    touched.add(change.roleId);
    const existing = next.find(role => role.id === change.roleId);
    if (change.operation === 'update' && !existing) throw new Error('The role to update was not found.');
    if (change.operation === 'create' && (existing || !/^new-[a-z0-9-]{1,80}$/.test(change.roleId))) throw new Error('New roles must have a unique ID.');
    const role = existing ? structuredClone(existing) : { id: change.roleId, title: '', employee: '', department: '', managerId: '', outcome: '', kpi: blankMetric(), objective: null };
    if (!Array.isArray(change.edits) || !change.edits.length || change.edits.length > 17) throw new Error('No fields were selected for editing.');
    const fields = new Set();
    for (const { field, value } of change.edits) {
      if (!Object.hasOwn(editablePaths, field) || fields.has(field)) throw new Error('This field cannot be edited in a proposal.');
      fields.add(field);
      const type = editablePaths[field][1];
      if ((type === 'string' && (typeof value !== 'string' || value.length > (field === 'outcome' ? 500 : 180))) ||
        (type === 'number' && value !== null && (!Number.isFinite(value) || value < 0)) ||
        (type === 'manager' && value !== null && typeof value !== 'string') ||
        (type === 'direction' && !['higher', 'lower'].includes(value)) ||
        (type === 'boolean' && typeof value !== 'boolean')) throw new Error('Invalid value in proposal.');
      if (field === 'objective.enabled') {
        role.objective = value ? role.objective || { title: '', result: blankMetric() } : null;
      } else {
        if (field.startsWith('objective.') && !role.objective) role.objective = { title: '', result: blankMetric() };
        const keys = field.split('.'), leaf = keys.pop();
        const target = keys.reduce((item, key) => item[key], role);
        target[leaf] = typeof value === 'string' ? value.trim() : value;
      }
    }
    next = saveRole(next, role);
  }
  const diffs = [...touched].map(id => {
    const before = roles.find(role => role.id === id), after = next.find(role => role.id === id);
    return { id, title: after.title, created: !before, fields: Object.entries(editablePaths).flatMap(([field, [label]]) => {
      const previous = valueAt(before, field), value = valueAt(after, field);
      return previous === value ? [] : [{ field, label, before: previous, after: value }];
    }) };
  }).filter(diff => diff.fields.length);
  if (!diffs.length) throw new Error('The proposal does not change the current data.');
  return { roles: next, diffs };
}
