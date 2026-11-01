export const STORAGE_KEY = 'orgboard.forma.v1';
export const DEMO_GOALS_VERSION = 2;

export function metricStatus(metric) {
  if (!metric?.name?.trim() || !Number.isFinite(metric.current) || !Number.isFinite(metric.target)) return 'missing';
  return (metric.direction === 'lower' ? metric.current <= metric.target : metric.current >= metric.target) ? 'met' : 'below';
}

export function attainment(metric) {
  if (metricStatus(metric) === 'missing') return null;
  if (metric.direction === 'lower') {
    if (metric.current === 0) return 100;
    return Math.min(100, (metric.target / metric.current) * 100);
  }
  if (metric.target === 0) return 100;
  return Math.min(100, (metric.current / metric.target) * 100);
}

export function roleStatus(role) {
  if (!role.employee.trim()) return 'vacant';
  const statuses = [metricStatus(role.kpi)];
  if (role.objective) statuses.push(metricStatus(role.objective.result));
  if (statuses.includes('below')) return 'below';
  if (statuses.includes('missing')) return 'missing';
  return 'met';
}

export function roleIssues(role) {
  if (!role.employee.trim()) return [{ source: 'role', status: 'vacant' }];
  const metrics = [{ source: 'kpi', metric: role.kpi }];
  if (role.objective) metrics.push({ source: 'objective', metric: role.objective.result, title: role.objective.title });
  return metrics.map(item => ({ ...item, status: metricStatus(item.metric) })).filter(item => item.status !== 'met');
}

export function children(roles, id) { return roles.filter(r => r.managerId === id); }
export function descendants(roles, id) {
  return children(roles, id).flatMap(r => [r, ...descendants(roles, r.id)]);
}
export function ancestors(roles, id) {
  const list = [];
  let current = roles.find(r => r.id === id);
  while (current?.managerId) {
    current = roles.find(r => r.id === current.managerId);
    if (current) list.push(current);
  }
  return list;
}
export function teamHealth(roles, id) {
  const team = descendants(roles, id);
  return {
    total: team.length,
    below: team.filter(r => roleStatus(r) === 'below'),
    missing: team.filter(r => roleStatus(r) === 'missing'),
    vacant: team.filter(r => roleStatus(r) === 'vacant'),
  };
}
export function managerOptions(roles, id) {
  const excluded = new Set([id, ...descendants(roles, id).map(r => r.id)]);
  return roles.filter(r => !excluded.has(r.id));
}

export function validateRoles(roles) {
  if (!Array.isArray(roles) || !roles.length) throw new Error('An organization needs a leadership role.');
  const ids = new Set(roles.map(r => r.id));
  if (ids.size !== roles.length || roles.some(r => typeof r.id !== 'string' || !r.id)) throw new Error('Role IDs must be unique.');
  if (roles.filter(r => r.managerId === null).length !== 1) throw new Error('Keep one company leader at the top.');
  for (const role of roles) {
    if (!role.title?.trim() || !role.department?.trim() || typeof role.employee !== 'string' || typeof role.outcome !== 'string') throw new Error('Add a role title and department.');
    if (role.managerId !== null && !ids.has(role.managerId)) throw new Error('Choose an existing manager.');
    const seen = new Set([role.id]);
    let manager = role.managerId;
    while (manager !== null) {
      if (seen.has(manager)) throw new Error('A role cannot report to itself or its own team.');
      seen.add(manager);
      manager = roles.find(r => r.id === manager)?.managerId ?? null;
    }
    const metrics = [role.kpi];
    if (role.objective) {
      if (!role.objective.title?.trim()) throw new Error('Give the objective a name.');
      metrics.push(role.objective.result);
    }
    for (const metric of metrics) {
      if (!metric || typeof metric.name !== 'string' || typeof metric.unit !== 'string' || !['higher', 'lower'].includes(metric.direction)) throw new Error('Check the metric details.');
      for (const value of [metric.current, metric.target]) {
        if (value !== null && (!Number.isFinite(value) || value < 0)) throw new Error('Metric values must be zero or greater, or left blank.');
      }
    }
  }
  return roles;
}

export function saveRole(roles, role) {
  const next = roles.some(r => r.id === role.id) ? roles.map(r => r.id === role.id ? role : r) : [...roles, role];
  return validateRoles(next);
}
export function removeRole(roles, id, replacementId) {
  const role = roles.find(r => r.id === id);
  if (!role) throw new Error('Role not found.');
  if (role.managerId === null) throw new Error('The company leader cannot be removed. You can edit this role.');
  if (children(roles, id).length && !managerOptions(roles, id).some(r => r.id === replacementId)) throw new Error('Choose a new manager for the direct reports.');
  return validateRoles(roles.filter(r => r.id !== id).map(r => r.managerId === id ? { ...r, managerId: replacementId } : r));
}
export function serialize(roles) { return JSON.stringify({ version: 1, demoGoalsVersion: DEMO_GOALS_VERSION, roles: validateRoles(roles) }); }
export function readOrganization(text) {
  const state = JSON.parse(text);
  if (state.version !== 1) throw new Error('This saved organization uses a different version.');
  validateRoles(state.roles);
  return state;
}
export function deserialize(text) { return readOrganization(text).roles; }

const kpi = (name, current, target, unit = '', direction = 'higher') => ({ name, current, target, unit, direction });
export function seedRoles() {
  const role = (id, title, employee, department, managerId, outcome, metric, objective = null) => ({ id, title, employee, department, managerId, outcome, kpi: metric, objective });
  return [
    role('ceo', 'Founder & CEO', 'Alex Morgan', 'Leadership', null, 'Build a profitable company that can scale beyond founder-led operations.', kpi('Monthly revenue', 2000000, 2000000, '$')),
    role('cmo', 'Chief Marketing Officer', 'Sarah Chen', 'Marketing', 'ceo', 'Grow demand profitably through repeatable acquisition and standout creative.', kpi('Blended ROAS', 3.8, 3.5, '×')),
    role('ops', 'Head of Operations', 'James Wilson', 'Operations', 'ceo', 'Get every order to the customer reliably, without founder intervention.', kpi('On-time fulfillment', 98, 97, '%')),
    role('finance', 'Head of Finance', 'Priya Shah', 'Finance', 'ceo', 'Protect profitability and give the team a reliable financial picture.', kpi('Contribution margin', 28, 25, '%'), { title: 'Build a 13-week cash forecast', result: kpi('Weeks covered by the cash forecast', 8, 13, 'weeks') }),
    role('creative', 'Head of Creative', 'Olivia Brooks', 'Marketing', 'cmo', 'Turn customer insights into a consistent pipeline of winning ads.', kpi('Winning ads', 8, 8, 'ads')),
    role('growth', 'Head of Growth', 'Daniel Kim', 'Marketing', 'cmo', 'Acquire new customers efficiently and grow customer lifetime value.', kpi('New customers', 4200, 4000, 'customers')),
    role('strategist', 'Creative Strategist', 'Mia Rodriguez', 'Marketing', 'creative', 'Develop insight-led concepts that give the creative team a clear direction.', kpi('Approved concepts', 12, 10, 'concepts')),
    role('editor', 'Video Editor', 'Ethan Miller', 'Marketing', 'creative', 'Deliver launch-ready video ads so winning concepts reach customers.', kpi('Video ads delivered', 12, 20, 'videos'), { title: 'Build a repeatable editing workflow', result: kpi('Reusable editing templates', 4, 4, 'templates') }),
    role('buyer', 'Media Buyer', 'Noah Davis', 'Marketing', 'growth', 'Scale paid acquisition while keeping customer acquisition cost within target.', kpi('Customer acquisition cost', 42, 50, '$', 'lower')),
    role('crm', 'CRM Manager', '', 'Marketing', 'growth', 'Turn first-time buyers into repeat customers through lifecycle campaigns.', kpi('Repeat purchase rate', null, 30, '%')),
    role('supply', 'Supply Chain Manager', 'Lucas Martin', 'Operations', 'ops', 'Keep best-selling products in stock and avoid costly over-ordering.', kpi('Stock availability', 98, 95, '%')),
    role('support', 'Customer Experience Lead', 'Emma Taylor', 'Operations', 'ops', 'Resolve customer issues quickly and turn service into a reason to return.', kpi('Customer satisfaction', 96, 95, '%')),
    role('accountant', 'Accountant', 'Ava Patel', 'Finance', 'finance', 'Deliver accurate monthly accounts so every decision uses reliable numbers.', kpi('Days to monthly close', 4, 5, 'days', 'lower')),
  ];
}
