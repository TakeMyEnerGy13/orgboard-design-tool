import { STORAGE_KEY, DEMO_GOALS_VERSION, metricStatus, roleStatus, roleIssues, children, descendants, ancestors, teamHealth, managerOptions, saveRole, removeRole, serialize, readOrganization, seedRoles } from './domain.js';
import { metricStatusText, issueText, localizeDemo, errorText } from './locale.js';
import { esc, number, statusIcon, statusContent, statusBadge, metricProgress, readout, editValueIcon, fieldPencil, editableField } from './ui.js';
import { picker, mountPickers } from './picker.js';
import { createAssistant } from './assistant.js';
import { openGuide, showGuideOnFirstVisit } from './onboarding.js';

const $ = (selector, scope = document) => scope.querySelector(selector);
const blankMetric = () => ({ name: '', unit: '', target: null, current: null, direction: 'higher' });
let roles = localizeDemo(seedRoles()), storageError = '', loadError = false, dirty = false, toastTimer;
let focusId = null, chartObserver, chartSize = { width: 1, height: 1 }, zoom = 1, offset = { x: 0, y: 0 }, drag = null;
let zoomFrame = 0, zoomTarget = null;
let dismissEditorPickers = () => {}, dismissDialogPickers = () => {};
const metricsViewKey = 'orgboard.metrics-view.v1';
let metricsView = 'table';
try { if (localStorage.getItem(metricsViewKey) === 'cards') metricsView = 'cards'; } catch {}
const pages = { structure: 'Structure', metrics: 'Metrics', goals: 'Goals', assistant: 'AI assistant' };
const currentPage = () => Object.hasOwn(pages, location.hash.slice(1)) ? location.hash.slice(1) : 'structure';
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const state = readOrganization(saved);
    const demoGoalsVersion = state.demoGoalsVersion ?? 0;
    roles = localizeDemo(state.roles, { demoGoalsVersion });
    if (demoGoalsVersion < DEMO_GOALS_VERSION) persist(roles);
  }
} catch {
  loadError = true;
  storageError = 'Your saved data could not be opened. This is a sample; your data has not been replaced.';
}
const assistant = createAssistant({ getRoles: () => roles, formatNumber: number, renderStatus: statusBadge, openRole: id => { const role = roles.find(item => item.id === id); if (role) showEditor(role); }, applyRoles: next => {
  if (loadError) throw new Error('Your saved data could not be opened. Restore your team data first.');
  try { localStorage.setItem(STORAGE_KEY, serialize(next)); } catch { throw new Error('Your browser blocked saving. No changes were applied.'); }
  roles = next; storageError = ''; render(); notify('Changes saved');
} });

function notify(message) {
  $('#toast').textContent = message; $('#toast').classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3500);
}
function persist(next) {
  if (loadError) throw new Error('Your saved data could not be opened. Restore the demo from the Forma menu to continue.');
  try { localStorage.setItem(STORAGE_KEY, serialize(next)); storageError = ''; }
  catch { storageError = 'Changes are limited to this tab because your browser blocked saving.'; }
  roles = next;
}

function confirmAction({ title, body, label, action, destructive = false }) {
  dismissEditorPickers(); dismissDialogPickers();
  const dialog = $('#dialog');
  dialog.innerHTML = `<form method="dialog"><h2>${esc(title)}</h2><div class="dialog-body">${body}</div><p id="dialog-error" class="form-error" role="alert"></p><div class="dialog-actions"><button class="button secondary" value="cancel">Cancel</button><button class="button ${destructive ? 'danger' : 'primary'}" id="confirm-dialog">${esc(label)}</button></div></form>`;
  dismissDialogPickers = mountPickers(dialog);
  dialog.onclose = dismissDialogPickers;
  $('#confirm-dialog').onclick = event => {
    event.preventDefault();
    try { dismissDialogPickers(); action(); dialog.close(); } catch (error) { $('#dialog-error').textContent = errorText(error); }
  };
  dialog.showModal();
}
function guard(action) {
  if (!dirty) { action(); return; }
  confirmAction({ title: 'Discard unsaved changes?', body: '<p>Your latest changes will be lost.</p>', label: 'Discard changes', destructive: true, action: () => { dirty = false; action(); } });
}
function closeEditor() { dismissEditorPickers(); $('#editor').close(); dirty = false; }

function teamControl(role) {
  if (!children(roles, role.id).length) return { teamStatus: 'met', teamButton: '' };
  const team = teamHealth(roles, role.id);
  const teamNotes = [team.below.length && `${team.below.length} below target`, team.missing.length && `${team.missing.length} missing data`, team.vacant.length && `vacancies: ${team.vacant.length}`].filter(Boolean);
  const teamStatus = team.below.length ? 'below' : team.missing.length ? 'missing' : team.vacant.length ? 'vacant' : 'met';
  return { teamStatus, teamButton: `<button class="button team-link" data-open-team="${esc(role.id)}" data-status="${teamStatus}" title="${esc(teamNotes.join(' · ') || 'All team targets met')}" aria-label="Open team: ${esc(role.title)}. ${esc(teamNotes.join(' · ') || 'All clear')}">${statusIcon('team')}<span>${teamNotes.length ? 'Review team' : 'Open'}</span><svg class="team-link-arrow" viewBox="0 0 20 20" aria-hidden="true"><path d="m7 5 5 5-5 5"/></svg></button>` };
}
function metricsTable() {
  return `<div class="metric-table-wrap"><table class="metric-table"><thead><tr><th scope="col">Role and employee</th><th scope="col">Metric</th><th scope="col">Actual</th><th scope="col">Target</th><th scope="col">KPI status</th><th scope="col">Team</th></tr></thead><tbody>${roles.map(role => {
      const status = role.employee ? metricStatus(role.kpi) : 'vacant';
      const { teamButton, teamStatus } = teamControl(role);
      const initials = role.employee.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join('').toUpperCase();
      return `<tr data-metric-role="${esc(role.id)}" data-status="${status}" data-team-status="${teamStatus}"><td data-label="Role"><button class="table-owner" data-open="${esc(role.id)}" data-open-view="goals" data-goal-focus="kpi" aria-label="Open plan: ${esc(role.kpi.name || role.title)} — ${esc(role.employee || role.title)}"><span class="table-avatar" aria-hidden="true">${role.employee ? esc(initials) : statusIcon('vacant')}</span><span class="table-identity"><strong>${esc(role.title)}</strong><span class="table-person">${esc(role.employee || 'Vacant')}</span></span></button></td><td data-label="Metric"><span class="table-metric-name">${esc(role.kpi.name || 'Not set')}</span><small>${esc(role.department)}</small></td><td data-label="Actual"><button class="fact-value table-value" data-open="${esc(role.id)}" data-edit-current="kpi" aria-label="Update actual: ${esc(role.title)}"><span><strong class="table-number">${number(role.kpi.current)}</strong><small>${esc(role.kpi.unit)}</small></span>${editValueIcon}</button></td><td data-label="Target" class="table-target"><span class="table-number">${role.kpi.direction === 'lower' ? '≤ ' : ''}${number(role.kpi.target)}</span><small>${esc(role.kpi.unit)}</small></td><td data-label="KPI status" class="table-status">${statusBadge(status, '', metricStatusText(status, role.kpi))}</td><td data-label="Team" class="table-team">${teamButton || '<span class="no-team" aria-label="No direct reports">—</span>'}</td></tr>`;
    }).join('')}</tbody></table></div>`;
}
function performanceCards(items) {
  return `<div class="company-goals">${items.map(({ role, kind, title, metric }) => {
    const primary = kind === 'kpi', status = role.employee ? metricStatus(metric) : 'vacant';
    const { teamButton, teamStatus } = primary ? teamControl(role) : {};
    return `<article class="company-goal performance-surface" data-goal-role="${esc(role.id)}" data-goal-kind="${kind}" data-status="${status}" ${teamButton ? `data-team-status="${teamStatus}"` : ''}>
      <div class="goal-description">
        <div class="goal-heading"><h2>${esc(title)}</h2>${statusBadge(status, '', metricStatusText(status, metric))}</div>
        <div class="goal-owner-row">
          <p class="goal-owner">${esc(role.employee || 'Vacant')}<span>${esc(role.title)}</span></p>
          <div class="goal-actions">
            ${teamButton ? `<div class="goal-team">${teamButton}</div>` : ''}
            <button class="button secondary goal-open" data-open="${esc(role.id)}" data-open-view="goals" data-goal-focus="${kind}" aria-label="${primary ? 'Open plan' : 'Open goal'}: ${esc(title)} — ${esc(role.employee || role.title)}">${primary ? 'Open plan' : 'Open goal'}<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 5 5 5-5 5"/></svg></button>
          </div>
        </div>
      </div>
      <div class="goal-measure">${primary ? '' : `<h3>${esc(metric.name || 'No metric set')}</h3>`}${readout(metric, Boolean(role.employee), `data-open="${esc(role.id)}" data-edit-current="${primary ? 'kpi' : 'kr'}" aria-label="Update actual: ${esc(title)}"`)}</div>
    </article>`;
  }).join('')}</div>`;
}
function performancePage(page) {
  if (page === 'metrics') {
    const views = [
      { id: 'table', label: 'Table', icon: '<rect x="3" y="4" width="14" height="12" rx="2"/><path d="M3 8h14M3 12h14M8 4v12"/>' },
      { id: 'cards', label: 'Cards', icon: '<rect x="3" y="3" width="14" height="6" rx="2"/><rect x="3" y="11" width="14" height="6" rx="2"/>' },
    ];
    const switcher = `<div class="segments view-switch" role="group" aria-label="Metrics view">${views.map(view => `<button type="button" data-metrics-view="${view.id}" aria-pressed="${metricsView === view.id}"><svg viewBox="0 0 20 20" aria-hidden="true">${view.icon}</svg>${view.label}</button>`).join('')}</div>`;
    const content = metricsView === 'table' ? metricsTable() : performanceCards(roles.map(role => ({ role, kind: 'kpi', title: role.kpi.name || 'No primary KPI set', metric: role.kpi })));
    return `<section class="performance-page" aria-label="Team metrics"><div class="metrics-toolbar">${switcher}</div>${content}</section>`;
  }
  const goals = roles.filter(role => role.objective).map(role => ({ role, kind: 'objective', title: role.objective.title, metric: role.objective.result }));
  return `<section class="performance-page" aria-label="Team goals">${goals.length ? performanceCards(goals) : '<div class="empty-goals"><h2>No additional goals yet</h2><p>Add a goal to assign an owner and track progress.</p></div>'}</section>`;
}
function showGoalPicker() {
  const available = roles.filter(role => !role.objective);
  if (!available.length) { notify('Every role already has a goal. Open an existing goal to edit it.'); return; }
  confirmAction({ title: 'Who owns this goal?', label: 'Continue', body: `<p class="field-help">Each role can own one additional goal. Choose a role without a goal.</p>${picker({ id: 'goal-owner', label: 'Goal owner', options: roleChoices(available) })}`, action: () => {
    const role = roles.find(item => item.id === $('#goal-owner').value);
    showEditor(role, { view: 'goals', newGoal: true });
  } });
}

function roleCard(role) {
  const status = roleStatus(role), team = teamHealth(roles, role.id);
  const personalIssue = status === 'below', teamIssue = team.below.length > 0;
  const missing = status === 'missing' || team.missing.length > 0, hiring = team.vacant.length > 0;
  const missingHint = status === 'missing' ? 'Some metric data is missing' : 'Team data is missing';
  const signal = personalIssue ? 'Personal target not met' : teamIssue ? 'Team target not met' : missing ? missingHint : hiring ? 'Vacancy on the team' : '';
  const signalIcon = personalIssue ? 'below' : !teamIssue && status === 'missing' ? 'missing' : 'team';
  const tone = status === 'vacant' ? 'vacant' : personalIssue ? 'risk' : teamIssue ? 'warning' : missing ? 'neutral' : hiring ? 'vacant' : 'healthy';
  const description = status === 'vacant' ? 'Vacant' : signal || 'Personal and team targets met';
  return `<button class="role-card ${status}" data-tone="${tone}" data-role-id="${esc(role.id)}" data-open="${esc(role.id)}" aria-label="Open role: ${esc(role.title)}. ${esc(description)}">
    <span class="role-title">${esc(role.title)}</span><span class="role-person">${esc(role.employee || 'Vacant')}</span>
    ${signal ? `<span class="role-signal ${personalIssue ? 'personal' : teamIssue ? 'team' : 'unknown'}" aria-label="${esc(signal)}" data-hint="${esc(signal)}">${statusIcon(signalIcon)}</span>` : ''}
  </button>`;
}

function render() {
  const page = currentPage();
  const root = roles.find(r => r.managerId === null);
  if (!roles.some(r => r.id === focusId)) focusId = root.id;
  const visibleTeam = [roles.find(role => role.id === focusId), ...descendants(roles, focusId)];
  const attention = ['below', 'missing', 'vacant'].flatMap(status => visibleTeam.filter(role => roleStatus(role) === status));
  chartObserver?.disconnect();
  stopZoom();
  $('#app').classList.toggle('list-page', page !== 'structure');
  $('#app').innerHTML = `<header class="topbar"><span class="wordmark">orgboard<span>®</span></span><div class="topbar-actions">${page !== 'assistant' ? '<a class="button secondary assistant-launcher" id="open-assistant" href="#assistant" aria-label="Ask AI"><span><span class="launcher-prefix">Ask </span>AI</span></a>' : ''}<details class="demo-menu" name="workspace-menu"><summary class="company" aria-label="Forma menu">Forma<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></summary><div class="workspace-menu-items"><button id="open-guide" type="button">Take the tour</button><button id="reset-demo" type="button">Restore demo</button></div></details></div></header>
    <main id="workspace"><div class="page-heading"><h1>${page === 'structure' ? 'Your team' : page === 'metrics' ? 'Team metrics' : page === 'goals' ? 'Team goals' : 'AI assistant'}</h1>${page === 'assistant' ? '' : `<button class="button primary" id="${page === 'goals' ? 'add-goal' : 'add-role'}"><span class="button-plus" aria-hidden="true">+</span>${page === 'goals' ? 'Add goal' : 'Add role'}</button>`}</div>
      <nav class="workspace-nav" aria-label="Workspace navigation">${Object.entries(pages).map(([key, label]) => `<a href="#${key}" ${page === key ? 'aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
      ${page === 'structure' ? `<nav id="chart-path" aria-label="Team breadcrumb"></nav>
      <section class="organization" aria-label="Team structure">
        <div id="chart-viewport" aria-label="Reporting chart. Drag the background to pan."><div id="chart-stage"><div id="branch-surfaces"></div><svg id="connections" aria-hidden="true"></svg><div id="nodes"></div></div></div>
        <div class="canvas-footer"><div class="canvas-actions"><button id="chart-back" class="button secondary icon-only" aria-label="Back" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 5-7 7 7 7M3 12h18"/></svg></button>${attention.length ? `<details class="attention-menu" name="workspace-menu"><summary class="button secondary"><span>Needs attention</span><svg class="attention-chevron" viewBox="0 0 20 20" aria-hidden="true"><path d="m5 12 5-5 5 5"/></svg></summary><div>${attention.map(r => `<button class="attention-card" data-status="${roleStatus(r)}" data-discuss-role="${esc(r.id)}" title="Discuss in chat"><span class="attention-card-title">${esc(r.title)}</span>${r.employee ? `<small>${esc(r.employee)}</small>` : ''}<span class="attention-card-reason">${statusIcon(roleStatus(r))}${esc(roleIssues(r).map(issueText).join("; "))}</span><svg class="attention-card-arrow" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 3h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9l-5 3v-3a2 2 0 0 1-1-2V5a2 2 0 0 1 2-2Z"/></svg></button>`).join('')}</div></details>` : `<span class="calm-note status-badge met">${statusContent('met', 'All clear')}</span>`}</div><div class="canvas-tools"><button id="zoom-out" class="button quiet icon-only" aria-label="Zoom out">−</button><button id="zoom-in" class="button quiet icon-only" aria-label="Zoom in">+</button></div></div>
      </section>` : page === 'assistant' ? '<section id="assistant-page" class="assistant-page" aria-label="Team assistant"></section>' : performancePage(page)}
      ${storageError ? `<p id="save-state" class="save-warning" role="alert">${esc(storageError)}</p>` : ''}
    </main>`;
  if ($('#add-role')) $('#add-role').onclick = () => showEditor(null);
  if ($('#add-goal')) $('#add-goal').onclick = showGoalPicker;
  $('#app').querySelectorAll('[data-metrics-view]').forEach(button => button.onclick = () => {
    if (metricsView === button.dataset.metricsView) return;
    metricsView = button.dataset.metricsView;
    try { localStorage.setItem(metricsViewKey, metricsView); } catch {}
    render();
    $(`[data-metrics-view="${metricsView}"]`).focus({ preventScroll: true });
  });
  $('#app').querySelectorAll('[data-open]').forEach(button => button.onclick = () => showEditor(roles.find(r => r.id === button.dataset.open), { view: button.dataset.openView, edit: button.dataset.editCurrent, section: button.dataset.goalFocus }));
  const table = $('.metric-table tbody');
  if (table) table.onclick = event => {
    if (event.target.closest('button')) return;
    const plan = event.target.closest('tr')?.querySelector('.table-owner');
    if (plan) { plan.focus({ preventScroll: true }); plan.click(); }
  };
  $('#app').querySelectorAll('[data-discuss-role]').forEach(button => {
    button.onclick = () => assistant.discussRole(button.dataset.discussRole);
  });
  $('#app').querySelectorAll('[data-open-team]').forEach(button => button.onclick = () => {
    focusId = button.dataset.openTeam; location.hash = 'structure';
  });
  $('#open-guide').onclick = () => {
    const menu = $('.demo-menu');
    menu.open = false;
    menu.querySelector('summary').focus({ preventScroll: true });
    openGuide();
  };
  $('#reset-demo').onclick = () => {
    const menu = $('.demo-menu');
    menu.open = false;
    menu.querySelector('summary').focus({ preventScroll: true });
    confirmAction({ title: 'Restore demo?', body: '<p>Your changes to this demo team will be replaced with the original data.</p>', label: 'Restore', destructive: true, action: () => { loadError = false; focusId = null; persist(localizeDemo(seedRoles())); render(); notify(storageError || 'Demo restored'); } });
  };
  assistant.mount(page === 'assistant');
  if (page !== 'structure') return;
  $('#zoom-in').onclick = () => zoomTo((zoomTarget?.zoom ?? zoom) * 1.15);
  $('#zoom-out').onclick = () => zoomTo((zoomTarget?.zoom ?? zoom) / 1.15);
  const viewport = $('#chart-viewport');
  viewport.onpointerdown = event => {
    if (viewport.dataset.layout === 'stacked' || event.target.closest('button') || event.button !== 0) return;
    stopZoom();
    drag = { x: event.clientX, y: event.clientY, offset: { ...offset } };
    viewport.setPointerCapture(event.pointerId); viewport.classList.add('dragging');
  };
  viewport.onpointermove = event => {
    if (!drag) return;
    offset = { x: drag.offset.x + event.clientX - drag.x, y: drag.offset.y + event.clientY - drag.y }; transformChart();
  };
  viewport.onpointerup = viewport.onpointercancel = () => { drag = null; viewport.classList.remove('dragging'); };
  viewport.addEventListener('wheel', event => {
    if (!event.deltaY) return;
    event.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
    zoomTo((zoomTarget?.zoom ?? zoom) * Math.exp(-Math.max(-160, Math.min(160, delta)) * .0012), { x: event.clientX - rect.left, y: event.clientY - rect.top });
  }, { passive: false });
  chartObserver = new ResizeObserver(() => renderChart());
  chartObserver.observe(viewport);
  renderChart();
}

function showTeam(id) {
  focusId = id; drag = null; render();
}

function expandedLayout(root, width) {
  const narrow = width < 650, cardWidth = narrow ? Math.min(280, width - 80) : 280;
  const groups = [], positions = [];
  let cursorX = 0, cursorY = 184;
  for (const report of children(roles, root.id)) {
    const branch = [];
    const visit = (role, depth) => {
      branch.push({ role, depth });
      children(roles, role.id).forEach(child => visit(child, depth + 1));
    };
    visit(report, 0);
    const indent = depth => Math.min(depth, narrow ? 2 : 4) * (narrow ? 16 : 32);
    const groupWidth = cardWidth + Math.max(...branch.map(p => indent(p.depth))) + 32;
    const groupHeight = 32 + 120 + (branch.length - 1) * 120 + (branch.length > 1 ? 24 : 0);
    const x = narrow ? 0 : cursorX, y = narrow ? cursorY : 200;
    groups.push({ x, y, width: groupWidth, height: groupHeight });
    branch.forEach((p, i) => positions.push({ ...p, x: x + 16 + indent(p.depth), y: y + 16 + i * 120 + (i ? 24 : 0), width: cardWidth, height: p.depth ? 96 : 120 }));
    cursorX += groupWidth + 32;
    cursorY += groupHeight + 24;
  }
  const totalWidth = groups.length ? (narrow ? Math.max(...groups.map(g => g.width)) : cursorX - 32) : cardWidth;
  positions.unshift({ role: root, x: (totalWidth - cardWidth) / 2, y: 0, width: cardWidth, height: 120, depth: -1 });
  return { positions, groups, width: totalWidth, height: groups.length ? Math.max(...groups.map(g => g.y + g.height)) + 16 : 152 };
}

function renderChart() {
  const viewport = $('#chart-viewport'), root = roles.find(r => r.id === focusId);
  if (!viewport || !root) return;
  const focusedTeam = document.activeElement?.dataset.team, focusedRole = document.activeElement?.dataset.roleId;
  const reports = children(roles, root.id), n = reports.length;
  const width = viewport.clientWidth, stacked = width < 520, horizontal = !stacked && width < 900;
  if (!width) return;
  const W = stacked ? Math.min(280, width - 72) : 280, H = 120, GAP = 48;
  const expanded = root.managerId !== null;
  let positions = [], groups = [];
  if (expanded) {
    const layout = expandedLayout(root, width);
    positions = layout.positions; groups = layout.groups;
    chartSize = { width: layout.width, height: layout.height };
  } else if (stacked) {
    positions.push({ role: root, x: 0, y: 0 });
    reports.forEach((role, i) => positions.push({ role, x: 32, y: (i + 1) * 184 }));
    chartSize = { width: W + (n ? 32 : 0), height: (n * 184) + H + 48 };
  } else if (horizontal) {
    const total = Math.max(1, n) * 184 - 64;
    positions.push({ role: root, x: 0, y: (total - H) / 2 });
    reports.forEach((role, i) => positions.push({ role, x: W + 64, y: i * 184 }));
    chartSize = { width: n ? W * 2 + 64 : W, height: total + 48 };
  } else {
    const total = Math.max(W, n * (W + GAP) - GAP);
    positions.push({ role: root, x: (total - W) / 2, y: 0 });
    reports.forEach((role, i) => positions.push({ role, x: i * (W + GAP), y: 228 }));
    chartSize = { width: total, height: n ? 396 : 168 };
  }
  positions = positions.map(p => ({ width: W, height: H, ...p }));
  viewport.dataset.layout = stacked ? 'stacked' : horizontal ? 'horizontal' : 'vertical';
  viewport.closest('.organization').classList.toggle('expanded-organization', expanded);
  viewport.style.height = stacked || expanded ? `${chartSize.height + 128}px` : '';
  const chain = [...ancestors(roles, root.id).reverse(), root];
  $('#chart-path').innerHTML = chain.map((r, i) => `${i ? '<span class="path-separator" aria-hidden="true">›</span>' : ''}${r.id === root.id ? `<span aria-current="page">${i ? esc(r.title) : 'Whole company'}</span>` : `<button data-team="${esc(r.id)}">${i ? esc(r.title) : 'Whole company'}</button>`}`).join('');
  const back = $('#chart-back'), parent = chain.at(-2);
  back.hidden = !parent;
  if (parent) {
    const label = `Back: ${parent.managerId === null ? 'Whole company' : parent.title}`;
    back.setAttribute('aria-label', label); back.title = label;
    back.onclick = () => {
      $('.attention-menu')?.removeAttribute('open');
      showTeam(parent.id);
      const trigger = [...document.querySelectorAll('.open-team')].find(button => button.dataset.team === root.id);
      (trigger || $('#chart-back:not([hidden])') || $('.workspace-nav [aria-current]')).focus({ preventScroll: true });
    };
  }
  const svg = $('#connections'), origin = positions[0];
  svg.setAttribute('width', chartSize.width); svg.setAttribute('height', chartSize.height);
  svg.innerHTML = positions.slice(1).map(p => {
    let d;
    if (expanded) {
      const parent = positions.find(item => item.role.id === p.role.managerId);
      if (parent === origin && width >= 650) {
        const x = parent.x + parent.width / 2, endX = p.x + p.width / 2;
        d = `M${x} ${parent.height} C${x} 168 ${endX} 168 ${endX} ${p.y}`;
      } else if (parent === origin) {
        const startX = parent.x + parent.width / 2, y = parent.y + parent.height;
        const railX = p.x - 8, turnY = y + 24, endY = p.y + p.height / 2;
        d = `M${startX} ${y} V${turnY - 12} Q${startX} ${turnY} ${startX - 12} ${turnY} H${railX + 12} Q${railX} ${turnY} ${railX} ${turnY + 12} V${endY - 8} Q${railX} ${endY} ${p.x} ${endY}`;
      } else {
        const x = Math.min(parent.x + 8, p.x - 8), y = parent.y + parent.height;
        const endY = p.y + p.height / 2, radius = Math.min(12, p.x - x);
        d = `M${x} ${y} V${endY - radius} Q${x} ${endY} ${x + radius} ${endY} H${p.x}`;
      }
    } else if (stacked) d = `M${origin.x + W / 2} ${H} V${H + 20} H16 V${p.y + H / 2} H${p.x}`;
    else if (horizontal) {
      const x = origin.x + W, y = origin.y + H / 2, endY = p.y + H / 2;
      d = `M${x} ${y} C${x + 32} ${y} ${p.x - 32} ${endY} ${p.x} ${endY}`;
    } else {
      const x = origin.x + W / 2, endX = p.x + W / 2;
      d = `M${x} ${H} C${x} 178 ${endX} 178 ${endX} ${p.y}`;
    }
    return `<path d="${d}"/>`;
  }).join('');
  $('#branch-surfaces').innerHTML = groups.map(g => `<div class="branch-surface" aria-hidden="true" style="left:${g.x}px;top:${g.y}px;width:${g.width}px;height:${g.height}px"></div>`).join('');
  $('#nodes').innerHTML = positions.map(({ role, x, y, width: nodeWidth, depth }) => {
    const count = descendants(roles, role.id).length;
    const canOpen = !expanded && role.id !== root.id && count > 0;
    return `<div class="chart-node ${canOpen ? 'has-reports' : ''} ${expanded && depth > 0 ? 'nested-node' : ''}" style="left:${x}px;top:${y}px;width:${nodeWidth}px">${(!expanded && role.id !== root.id) || (expanded && role.id === root.id) ? `<span class="department-caption">${esc(role.department)}</span>` : ''}${roleCard(role)}${canOpen ? `<button class="open-team" data-team="${esc(role.id)}" aria-label="View direct reports: ${esc(role.title)}"><span class="report-count">${count}</span>Team<span class="team-chevron" aria-hidden="true">›</span></button>` : ''}</div>`;
  }).join('');
  $('#nodes').querySelectorAll('[data-open]').forEach(button => button.onclick = () => showEditor(roles.find(r => r.id === button.dataset.open)));
  document.querySelectorAll('[data-team]').forEach(button => button.onclick = () => showTeam(button.dataset.team));
  $('#chart-stage').style.width = `${chartSize.width}px`; $('#chart-stage').style.height = `${chartSize.height}px`;
  fitChart();
  if (focusedTeam) document.querySelector(`[data-team="${CSS.escape(focusedTeam)}"]`)?.focus({ preventScroll: true });
  else if (focusedRole) document.querySelector(`[data-role-id="${CSS.escape(focusedRole)}"]`)?.focus({ preventScroll: true });
}
function transformChart() {
  $('#chart-stage').style.transform = `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`;
  const viewport = $('#chart-viewport');
  viewport.style.setProperty('--grid-size', `${24 * zoom}px`);
  viewport.style.setProperty('--grid-x', `${offset.x}px`);
  viewport.style.setProperty('--grid-y', `${offset.y}px`);
}
function fitChart() {
  stopZoom();
  const rect = $('#chart-viewport').getBoundingClientRect();
  const fit = Math.min(1, (rect.width - 40) / chartSize.width, (rect.height - 112) / chartSize.height);
  zoom = Math.max(.82, fit);
  offset = { x: (rect.width - chartSize.width * zoom) / 2, y: Math.max(48, (rect.height - 88 - chartSize.height * zoom) / 2) }; transformChart();
}
function stopZoom() { cancelAnimationFrame(zoomFrame); zoomFrame = 0; zoomTarget = null; }
function zoomTo(value, anchor) {
  const base = zoomTarget || { zoom, offset };
  const rect = $('#chart-viewport').getBoundingClientRect(), next = Math.min(1.6, Math.max(.25, value)), ratio = next / base.zoom;
  const point = anchor || { x: rect.width / 2, y: rect.height / 2 };
  const target = { zoom: next, offset: { x: point.x - (point.x - base.offset.x) * ratio, y: point.y - (point.y - base.offset.y) * ratio } };
  stopZoom();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    zoom = target.zoom; offset = target.offset; transformChart(); return;
  }
  zoomTarget = target;
  const start = { zoom, offset: { ...offset } }, startedAt = performance.now();
  const animate = now => {
    const progress = Math.max(0, Math.min(1, (now - startedAt) / 260)), eased = 1 - (1 - progress) ** 4;
    zoom = start.zoom + (target.zoom - start.zoom) * eased;
    offset = { x: start.offset.x + (target.offset.x - start.offset.x) * eased, y: start.offset.y + (target.offset.y - start.offset.y) * eased };
    transformChart();
    if (progress < 1) zoomFrame = requestAnimationFrame(animate);
    else { zoomFrame = 0; zoomTarget = null; }
  };
  zoomFrame = requestAnimationFrame(animate);
}

const input = (label, name, value, { type = 'text', required = false, placeholder = '' } = {}) => `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${esc(value)}" ${required ? 'required' : ''} ${type === 'number' ? 'min="0" step="any" inputmode="decimal"' : 'maxlength="180"'} placeholder="${esc(placeholder)}"></label>`;
function metricSettings(metric, prefix) {
  const directions = [['higher', 'Higher', 'm6 9 4-4 4 4M10 5v10'], ['lower', 'Lower', 'm6 11 4 4 4-4M10 5v10']].map(([value, title, path]) => ({ value, title, icon: `<svg viewBox="0 0 20 20"><path d="${path}"/></svg>` }));
  return `<div class="goal-fields">${editableField('Metric name', `${prefix}Name`, metric.name, { placeholder: 'For example, video ads delivered', className: 'goal-field' })}<div class="metric-settings-row">${editableField('Target value', `${prefix}Target`, metric.target, { type: 'number', placeholder: 'Not set', className: 'goal-field goal-target-field' })}${editableField('Unit', `${prefix}Unit`, metric.unit, { placeholder: 'units, %, $', className: 'goal-field' })}${picker({ id: `${prefix}-direction`, name: `${prefix}Direction`, label: 'Better when', value: metric.direction, options: directions, identity: true })}</div></div>`;
}
function metricPanel(metric, prefix) {
  const title = `<h3 id="${prefix}-title"></h3>`;
  const heading = prefix === 'kpi' ? title : '<span class="metric-kind">Additional goal</span>';
  return `<section class="metric-editor" id="${prefix}-performance"><div class="section-heading">${heading}${statusBadge(metricStatus(metric), prefix === 'kpi' ? 'personal-status' : 'objective-summary-status')}</div>${prefix === 'kr' ? `${title}<p id="kr-measure" class="metric-subtitle"></p>` : ''}<div class="metric-pair"><div><span class="value-label" id="${prefix}-fact-label">Actual</span><button type="button" class="fact-value" data-start-edit="${prefix}" aria-label="${prefix === 'kpi' ? 'Update KPI actual' : 'Update goal actual'}" aria-expanded="false"><strong id="${prefix}-fact"></strong>${editValueIcon}</button><div class="inline-value-input" id="${prefix}-input" hidden>${input(prefix === 'kpi' ? 'KPI actual' : 'Goal actual', `${prefix}Current`, metric.current, { type: 'number', placeholder: 'Missing data' })}</div></div><div><span class="value-label" id="${prefix}-plan-label">Target</span><strong id="${prefix}-plan"></strong></div></div><div id="${prefix}-progress"></div></section>`;
}
function showEditor(existing, options = {}) {
  dismissEditorPickers();
  const root = roles.find(r => r.managerId === null);
  const manager = currentPage() === 'structure' ? roles.find(item => item.id === focusId) || root : root;
  const role = existing ? structuredClone(existing) : { id: crypto.randomUUID(), title: '', employee: '', department: manager.managerId ? manager.department : 'Marketing', managerId: manager.id, outcome: '', kpi: blankMetric(), objective: null };
  if (options.newGoal) role.objective = { title: '', result: blankMetric() };
  dirty = false;
  const isRoot = role.managerId === null, team = existing ? teamHealth(roles, role.id) : null;
  const issues = team ? [...team.below, ...team.missing, ...team.vacant] : [];
  const teamStatus = team?.below.length ? 'below' : team?.missing.length ? 'missing' : 'vacant';
  const teamMessage = teamStatus === 'below' ? 'Team target not met' : teamStatus === 'missing' ? 'Team data is missing' : 'Vacancy on the team';
  const editor = $('#editor');
  editor.innerHTML = `<form id="role-form" novalidate>
    <header class="editor-header"><div><h2 id="editor-title">${existing ? esc(role.title) : 'New role'}</h2><div class="editor-assignee"><span id="editor-person"></span><button type="button" class="button secondary config-action" id="assign-employee"></button></div></div><button type="button" class="button quiet icon-only" id="close-editor" aria-label="Close">×</button></header>
    <div class="segments editor-tabs" role="tablist" aria-label="Role details">
      ${[['result', 'Results'], ['goals', 'Plans'], ['role', 'Role']].map(([id, label]) => `<button type="button" role="tab" id="tab-${id}" data-editor-view="${id}" aria-controls="${id}-view" aria-selected="false" tabindex="-1">${label}</button>`).join('')}
    </div>
    <div class="editor-content">
      <div id="result-view" role="tabpanel" aria-labelledby="tab-result">
      ${existing ? '<div class="result-actions">' : ''}
      ${issues.length ? `<button type="button" class="button team-link editor-team-link" data-status="${teamStatus}" id="show-team-issues">${statusIcon('team')}<span>${teamMessage}</span><svg class="team-link-arrow" viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7 5 5 5-5"/></svg></button>` : ''}
      ${existing ? '<button type="button" class="button secondary config-action discuss-role" id="discuss-role"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 3h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9l-5 3v-3a2 2 0 0 1-1-2V5a2 2 0 0 1 2-2Z"/><path d="M7 7h6m-6 3h4"/></svg>Discuss with AI</button></div>' : ''}
      ${metricPanel(role.kpi, 'kpi')}
      <div id="objective-summary" ${role.objective ? '' : 'hidden'}>${metricPanel(role.objective?.result || blankMetric(), 'kr')}</div>
      ${issues.length ? `<section class="team-section" aria-labelledby="team-issues-title"><div class="team-section-heading"><h3 id="team-issues-title">Team alerts</h3><span class="team-issue-count" aria-label="Needs attention: ${issues.length}">${issues.length}</span></div><div class="team-issues">${issues.map(r => `<button type="button" class="team-issue" data-issue="${esc(r.id)}" data-status="${roleStatus(r)}" aria-label="Open role: ${esc(r.title)}. ${esc(r.employee ? `${r.employee}. ` : '')}${esc(roleIssues(r).map(issueText).join("; "))}"><span class="team-issue-identity"><span class="team-issue-title">${esc(r.title)}</span>${r.employee ? `<span class="team-issue-person">${esc(r.employee)}</span>` : ''}</span><span class="team-issue-reasons">${roleIssues(r).map(issue => `<span>${esc(issueText(issue))}</span>`).join('')}</span><svg class="team-issue-arrow" viewBox="0 0 20 20" aria-hidden="true"><path d="m7 5 5 5-5 5"/></svg></button>`).join('')}</div></section>` : ''}
      </div>
      <div id="goals-view" role="tabpanel" aria-labelledby="tab-goals" hidden>
      <section class="goal-section" id="kpi-config" aria-label="KPI target" tabindex="-1">${metricSettings(role.kpi, 'kpi')}</section>
      <section class="goal-section"><button type="button" class="button secondary" id="add-objective" aria-controls="objective-config" ${role.objective ? 'hidden' : ''}>Add goal</button>
      <div id="objective-config" role="group" aria-label="Additional goal" tabindex="-1" ${role.objective ? '' : 'hidden'}>
        <label class="check-field goal-switch"><span>Additional goal</span><input type="checkbox" name="hasObjective" ${role.objective ? 'checked' : ''}></label>
        <fieldset id="objective-fields" ${role.objective ? '' : 'hidden disabled'}>${editableField('Goal', 'objectiveTitle', role.objective?.title || '', { required: true, placeholder: 'What outcome do you want to achieve', className: 'goal-field goal-title-field' })}${metricSettings(role.objective?.result || blankMetric(), 'kr')}<p class="field-help">This goal also contributes to the team’s status.</p></fieldset>
      </div></section>
      </div>
      <div id="role-view" role="tabpanel" aria-labelledby="tab-role" hidden>${identityFields(role, isRoot)}</div>
    </div>
    <footer class="editor-footer"><p id="form-error" class="form-error" role="alert"></p><div><button type="button" class="button secondary" id="cancel-edit">Cancel</button><button type="submit" class="button primary" id="save-role" disabled>${existing ? 'Save' : 'Add'}</button></div></footer>
  </form>`;
  editor.setAttribute('aria-labelledby', 'editor-title');
  const form = $('#role-form');
  dismissEditorPickers = mountPickers(editor, { constrainToScope: true });
  const tabs = [...editor.querySelectorAll('[role="tab"]')];
  const switchView = (view, focus = true) => {
    dismissEditorPickers();
    tabs.forEach(tab => {
      const selected = tab.dataset.editorView === view;
      tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
      $(`#${tab.dataset.editorView}-view`).hidden = !selected;
    });
    $('.editor-content').scrollTop = 0;
    if (focus) $(`#tab-${view}`).focus({ preventScroll: true });
  };
  editor.querySelectorAll('[data-editor-view]').forEach(button => { button.onclick = () => switchView(button.dataset.editorView); });
  if ($('#show-team-issues')) $('#show-team-issues').onclick = () => {
    const content = $('.editor-content'), section = $('.team-section');
    content.scrollTop += section.getBoundingClientRect().top - content.getBoundingClientRect().top - 16;
    section.querySelector('button').focus({ preventScroll: true });
  };
  $('#assign-employee').onclick = () => {
    switchView('role', false);
    form.elements.employee.focus(); form.elements.employee.select();
  };
  $('.editor-tabs').onkeydown = event => {
    const index = tabs.indexOf(document.activeElement);
    if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    switchView(tabs[next].dataset.editorView);
  };
  switchView(options.view || (existing ? 'result' : 'role'), false);
  const readDraft = (withObjective = form.elements.hasObjective.checked) => {
    const value = name => String(form.elements[name].value || '').trim();
    const numeric = name => value(name) === '' ? null : Number(value(name));
    const metric = prefix => ({ name: value(`${prefix}Name`), current: numeric(`${prefix}Current`), target: numeric(`${prefix}Target`), unit: value(`${prefix}Unit`), direction: value(`${prefix}Direction`) });
    return { ...role, title: value('title'), employee: value('employee'), department: value('department'), managerId: isRoot ? null : value('managerId'), outcome: value('outcome'), kpi: metric('kpi'), objective: withObjective ? { title: value('objectiveTitle'), result: metric('kr') } : null };
  };
  const cleanDrafts = new Set([JSON.stringify(readDraft())]);
  if (!existing?.objective) {
    // Opening or collapsing an empty goal editor is navigation.
    cleanDrafts.add(JSON.stringify(readDraft(!form.elements.hasObjective.checked)));
  }
  const markDirty = () => {
    dirty = !cleanDrafts.has(JSON.stringify(readDraft())) || [...form.elements].some(field => field.willValidate && field.validity.badInput);
    $('#save-role').disabled = !dirty;
    $('#cancel-edit').textContent = dirty ? 'Cancel' : 'Close';
  };
  const startEditing = (prefix, reveal = false) => {
    const button = $(`[data-start-edit="${prefix}"]`), field = form.elements[`${prefix}Current`];
    button.hidden = true; button.setAttribute('aria-expanded', 'true');
    $(`#${prefix}-input`).hidden = false; field.focus({ preventScroll: true }); field.select();
    if (reveal) {
      const content = $('.editor-content');
      content.scrollTop += field.getBoundingClientRect().top - content.getBoundingClientRect().top - (content.clientHeight - field.offsetHeight) / 2;
    }
  };
  for (const prefix of ['kpi', 'kr']) {
    const button = $(`[data-start-edit="${prefix}"]`), field = form.elements[`${prefix}Current`];
    button.onclick = () => startEditing(prefix);
    field.onblur = event => {
      if (!field.validity.valid || event.relatedTarget?.closest('.editor-footer')) return;
      $(`#${prefix}-input`).hidden = true; button.hidden = false; button.setAttribute('aria-expanded', 'false');
    };
    field.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); field.blur(); button.focus(); } };
  }
  const updateResult = () => {
    const selectedManager = roles.find(item => item.id === form.elements.managerId.value);
    const departmentHint = $('#department-hint');
    departmentHint.hidden = !selectedManager?.managerId || selectedManager.department === form.elements.department.value.trim();
    $('#manager-department').textContent = selectedManager?.department || '';
    const employeeName = form.elements.employee.value.trim(), employee = Boolean(employeeName);
    $('#editor-person').textContent = employeeName || 'Vacant';
    $('#assign-employee').textContent = employee ? 'Change employee' : 'Assign employee';
    $('#employee-field').dataset.occupied = String(employee);
    $('#employee-avatar').innerHTML = employee ? esc(employeeName.split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join('').toUpperCase()) : statusIcon('vacant');
    for (const prefix of ['kpi', 'kr']) {
      const current = form.elements[`${prefix}Current`].value, target = form.elements[`${prefix}Target`].value;
      const metric = { name: form.elements[`${prefix}Name`].value, current: current === '' ? null : Number(current), target: target === '' ? null : Number(target), unit: form.elements[`${prefix}Unit`].value, direction: form.elements[`${prefix}Direction`].value };
      const status = employee ? metricStatus(metric) : 'vacant', unit = metric.unit ? `, ${metric.unit}` : '';
      const badge = $(prefix === 'kpi' ? '#personal-status' : '#objective-summary-status');
      badge.className = `status-badge ${status}`; badge.innerHTML = statusContent(status, metricStatusText(status, metric));
      $(`#${prefix}-performance`).dataset.status = status;
      $(`#${prefix}-title`).textContent = prefix === 'kpi' ? metric.name || 'No metric set' : form.elements.objectiveTitle.value || 'New goal';
      $(`#${prefix}-fact-label`).textContent = `Actual${unit}`;
      $(`#${prefix}-plan-label`).textContent = `Target${metric.direction === 'lower' ? ' ≤' : ''}${unit}`;
      $(`#${prefix}-fact`).textContent = number(metric.current); $(`#${prefix}-plan`).textContent = number(metric.target);
      $(`#${prefix}-progress`).innerHTML = metricProgress(metric, employee);
    }
    const hasGoal = form.elements.hasObjective.checked;
    $('#objective-summary').hidden = !hasGoal;
    form.elements.krCurrent.disabled = !hasGoal;
    $('#kr-measure').textContent = form.elements.krName.value;
  };
  const setObjective = enabled => {
    form.elements.hasObjective.checked = enabled;
    $('#add-objective').hidden = enabled;
    $('#objective-config').hidden = !enabled;
    $('#objective-fields').disabled = !enabled;
    $('#objective-fields').hidden = !enabled;
    markDirty(); updateResult();
    (enabled ? form.elements.objectiveTitle : $('#add-objective')).focus();
  };
  $('#add-objective').onclick = () => setObjective(true);
  form.oninput = () => { markDirty(); $('#form-error').textContent = ''; updateResult(); }; form.onchange = () => { markDirty(); updateResult(); };
  $('#use-manager-department').onclick = () => {
    form.elements.department.value = roles.find(item => item.id === form.elements.managerId.value).department;
    markDirty(); updateResult();
  };
  form.elements.hasObjective.onchange = () => setObjective(form.elements.hasObjective.checked);
  $('#close-editor').onclick = $('#cancel-edit').onclick = () => guard(closeEditor);
  if (existing) $('#discuss-role').onclick = () => guard(() => {
    closeEditor();
    queueMicrotask(() => assistant.discussRole(role.id));
  });
  editor.oncancel = event => { event.preventDefault(); guard(closeEditor); };
  if ($('#delete-role')) $('#delete-role').onclick = () => deleteRoleDialog(role);
  editor.querySelectorAll('[data-issue]').forEach(button => button.onclick = () => guard(() => showEditor(roles.find(r => r.id === button.dataset.issue))));
  form.onsubmit = event => {
    event.preventDefault();
    if (!dirty) return;
    try {
      if ([...form.elements].some(field => field.willValidate && field.type === 'number' && field.validity.badInput)) throw new Error('Metric values must be zero or greater, or left blank.');
      const updated = readDraft();
      persist(saveRole(roles, updated));
      if (!existing) focusId = updated.managerId || updated.id;
      closeEditor(); render(); notify(storageError || (existing ? 'Changes saved' : 'Role added'));
      document.querySelectorAll('[data-open]').forEach(button => { if (button.dataset.open === role.id && (!options.section || button.dataset.goalFocus === options.section)) button.focus({ preventScroll: true }); });
    } catch (error) {
      $('#form-error').textContent = errorText(error);
      const invalid = [...form.elements].find(field => field.willValidate && (!field.validity.valid || (field.required && !field.value.trim())));
      if (invalid) {
        switchView(invalid.closest('[role="tabpanel"]').id.replace('-view', ''));
        if (invalid.name === 'kpiCurrent' || invalid.name === 'krCurrent') startEditing(invalid.name.replace('Current', ''));
        invalid.focus();
      }
    }
  };
  if (!editor.open) editor.showModal();
  updateResult(); markDirty();
  if (!existing) form.elements.title.focus({ preventScroll: true });
  else if (options.newGoal) form.elements.objectiveTitle.focus();
  else if (options.edit) startEditing(options.edit, true);
  else if (options.section) $(`#${options.section}-config`).focus();
  else $(`#tab-${options.view || 'result'}`).focus({ preventScroll: true });
}
function roleChoices(list) {
  return list.map(role => ({ value: role.id, title: role.title, description: role.employee || 'Vacant', initials: role.employee.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join('').toUpperCase(), icon: role.employee ? '' : statusIcon('vacant') }));
}
function identityFields(role, isRoot) {
  const detailField = (label, name, value, placeholder) => editableField(label, name, value, { required: true, placeholder });
  const managers = isRoot ? [] : managerOptions(roles, role.id);
  return `<div class="identity-fields">
    <div class="employee-assignment"><label class="field identity-field person-field" id="employee-field"><span class="employee-avatar" id="employee-avatar" aria-hidden="true"></span><span class="identity-value"><span class="identity-label">Employee</span><input name="employee" value="${esc(role.employee)}" maxlength="180" placeholder="Full name" aria-describedby="employee-help"></span>${fieldPencil}</label><p class="field-help" id="employee-help">Leave empty for a vacancy.</p></div>
    <div class="identity-details">${detailField('Role title', 'title', role.title, 'For example, Designer')}${detailField('Department', 'department', role.department, 'Department name')}</div>
    ${picker({ id: 'manager', name: 'managerId', label: 'Reports to', value: role.managerId, options: roleChoices(managers), identity: true, icon: statusIcon('team'), disabled: isRoot, emptyLabel: 'Company leader' })}
    <div class="department-hint" id="department-hint" hidden><p>Manager’s department: <strong id="manager-department"></strong></p><button type="button" class="button secondary config-action" id="use-manager-department">Use for this role</button></div>
    ${editableField('What outcome does this role own', 'outcome', role.outcome, { multiline: true, placeholder: 'For example, video ads ready to launch', className: 'goal-field goal-outcome-field' })}
    ${roles.some(r => r.id === role.id) ? `<div class="remove-row"><button type="button" class="button danger delete-role" id="delete-role" ${isRoot ? 'disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5m4-5v5"/></svg>Delete role</button>${isRoot ? '<p class="field-help">You can edit the company leader but cannot remove the role.</p>' : ''}</div>` : ''}</div>`;
}
function deleteRoleDialog(role) {
  const direct = children(roles, role.id);
  confirmAction({ title: 'Delete role?', body: `<p>“${esc(role.title)}” will be removed.${direct.length ? ' Direct reports will stay on the team. Choose their new manager.' : ''}</p>${direct.length ? picker({ id: 'replacement-manager', label: 'New manager', value: role.managerId, options: roleChoices(managerOptions(roles, role.id)) }) : ''}`, label: 'Delete', destructive: true, action: () => {
    persist(removeRole(roles, role.id, $('#replacement-manager')?.value)); closeEditor(); render(); notify('Role deleted');
  } });
}
const openWorkspaceMenu = () => $('details[name="workspace-menu"][open]');
document.addEventListener('click', event => {
  const menu = openWorkspaceMenu();
  if (menu && !menu.contains(event.target)) menu.open = false;
}, true);
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || $('dialog[open]')) return;
  const menu = openWorkspaceMenu();
  if (!menu) return;
  menu.open = false;
  menu.querySelector('summary').focus({ preventScroll: true });
});
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('hashchange', () => {
  if (location.hash && !Object.hasOwn(pages, location.hash.slice(1))) return;
  render(); window.scrollTo(0, 0);
  if (document.activeElement?.id !== 'assistant-prompt') $('.workspace-nav [aria-current]').focus({ preventScroll: true });
});
render();
showGuideOnFirstVisit();
