import { prepareChanges } from './assistant-domain.js';
import { bindDictation } from './dictation.js';
import { metricStatus, roleIssues, roleStatus, teamHealth } from './domain.js';
import { errorText, issueText, metricStatusText } from './locale.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const arrow = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 10 5-5 5 5M10 5v11"/></svg>';
const glyph = path => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
const branchIcon = glyph('<rect x="9" y="3" width="6" height="5" rx="1.5"/><path d="M12 8v4M5 16v-4h14v4"/><rect x="2" y="16" width="6" height="5" rx="1.5"/><rect x="16" y="16" width="6" height="5" rx="1.5"/>');
const searchIcon = glyph('<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>');
const listIcon = glyph('<path d="M7 6h13M7 12h13M7 18h9M3 6h.01M3 12h.01M3 18h.01"/>');
const addRoleIcon = glyph('<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2m4-14v6m-3-3h6"/>');
const metricIcon = glyph('<path d="M4 19h16M7 15v-4m5 4V5m5 10V8"/>');
const goalIcon = glyph('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>');
const micIcon = glyph('<rect x="9" y="2.5" width="6" height="12" rx="3"/><path d="M5.5 10.5a6.5 6.5 0 0 0 13 0M12 17v4m-3 0h6"/>');
const stopIcon = glyph('<rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor"/>');

const subjectLabel = role => `${role.employee || 'Vacant'} · ${role.title}`;

function quickRequests(roles, subject) {
  if (subject) {
    let advice = ['How can I support this person?', 'What should I discuss with this person at our next meeting? Suggest two steps based on their results.'];
    if (!subject.employee) advice = ['What should we clarify before hiring?', 'What should the hiring manager clarify before filling this role? Use its ownership and metrics.'];
    else if (!roleIssues(subject).length) advice = ['What should we work on next?', 'The target is met. What next step should I discuss with this person, and why?'];
    return [
      ['Explain this status', 'Explain the status of the selected role. Use the company data to show the cause and identify any missing information.'],
      advice,
    ];
  }
  const creative = roles.find(role => role.id === 'creative' && roles.some(child => child.managerId === role.id));
  const manager = creative || roles.find(role => roles.some(child => child.managerId === role.id));
  let teamQuestion = 'Which metrics need attention?';
  if (manager) {
    const team = teamHealth(roles, manager.id);
    const flagged = Boolean(team.below.length || team.missing.length || team.vacant.length);
    const name = manager.title;
    teamQuestion = flagged ? `Why is the ${name}’s team flagged?` : `How is the team doing under the ${name}?`;
  }
  return [
    [teamQuestion, `${teamQuestion} Compare the manager’s own KPI with the results of their reports. Identify the roles and numbers behind the status.`],
    ['Founder briefing', 'Give me a short founder briefing. Which targets are met and where should I focus first?'],
    ['Where are we missing data?', 'Find roles without an employee, a target or an actual value. Tell me exactly what each one needs.'],
  ];
}
function editOptions(subject) {
  return [
    ['Create a role', 'I want to create a role. Ask for the title, manager and outcome, then propose a new role card.', addRoleIcon],
    ['Update a KPI', subject ? 'I want to update the actual KPI value for the selected role. Ask for the new value and show the change before saving.' : 'I want to update a KPI. Ask for the role, metric and actual value, then propose the change.', metricIcon],
    ['Add goal', subject ? 'Help me add a measurable goal to the selected role. Check for an existing goal first and clarify the outcome.' : 'Help me add a measurable goal. Ask for the owner, outcome and target. Show any existing goal first.', goalIcon],
  ];
}
function requestsMarkup(requests, busy) {
  const icons = [branchIcon, listIcon, searchIcon];
  return `<div class="quick-requests">${requests.map(([title], index) => `<button class="request-choice" type="button" data-suggestion="${index}" ${busy ? 'disabled' : ''}>${icons[index]}<span>${esc(title)}</span></button>`).join('')}</div>`;
}
const searchable = value => value.trim().toLocaleLowerCase('en');
function employeeEntries(roles, subjectId, query) {
  const term = searchable(query);
  const departments = new Map();
  const shortcuts = [];
  for (const role of roles) {
    if (!role.employee.trim()) continue;
    if (!searchable(`${role.employee} ${role.title} ${role.department}`).includes(term)) continue;
    const department = role.department.trim();
    if (!departments.has(department)) departments.set(department, []);
    departments.get(department).push(role);
    const status = roleStatus(role);
    if (status !== 'met') {
      const reason = roleIssues(role).map(issueText).join('; ');
      shortcuts.push(`<button type="button" class="employee-shortcut" data-employee-role="${esc(role.id)}" data-status="${status}" aria-pressed="${role.id === subjectId}" aria-description="${esc(role.title + '. ' + reason)}">${esc(role.employee)}</button>`);
    }
  }
  if (!departments.size) return `<p>${term ? 'No employees found.' : 'No employees assigned yet.'}</p>`;
  const groups = Array.from(departments, ([department, members]) => {
    members.sort((a, b) => a.employee.localeCompare(b.employee, 'en'));
    const buttons = members.map(role => `<button type="button" class="employee-choice" data-employee-role="${esc(role.id)}" aria-pressed="${role.id === subjectId}">
      <strong>${esc(role.employee)}</strong><small>${esc(role.title)}</small>
    </button>`).join('');
    return `<section class="employee-department" aria-label="${esc(department)}"><h3>${esc(department)}</h3>${buttons}</section>`;
  }).join('');
  const attention = shortcuts.length
    ? `<section class="employee-shortcuts" aria-labelledby="employee-attention-title"><h3 id="employee-attention-title">Needs attention</h3>${shortcuts.join('')}</section>`
    : '';
  return attention + groups;
}
function employeePanel(roles, subjectId, expanded, query) {
  return `<aside class="employee-panel" aria-label="Employees">
    <h2>Employees</h2>
    <button type="button" class="button secondary employee-panel-toggle" aria-controls="employee-directory" aria-expanded="${expanded}">Choose an employee</button>
    <div id="employee-directory" class="employee-directory">
      <label class="employee-search">${searchIcon}<input id="employee-search" type="search" aria-label="Search employees" placeholder="Name, role or department" value="${esc(query)}"></label>
      <div id="assistant-employees" class="employee-list">${employeeEntries(roles, subjectId, query)}</div>
    </div>
  </aside>`;
}
function topicHeader(role) {
  const label = subjectLabel(role);
  return `<header class="assistant-topic"><div class="topic-identity">
    <span class="topic-glyph" aria-hidden="true">${branchIcon}</span>
    <div><span class="topic-caption">Discussing</span><h2 id="subject-label">${esc(label)}</h2></div>
    </div><div class="topic-actions">
      <button type="button" id="open-subject" class="button secondary config-action">View results</button>
      <button type="button" id="clear-subject" class="button quiet topic-clear" aria-label="Remove the selected role and return to the team">Back to team</button>
    </div></header>`;
}
function topicMetric(role, formatNumber, renderStatus) {
  const metric = role.kpi, status = role.employee ? metricStatus(metric) : 'vacant';
  const value = amount => Number.isFinite(amount) ? [formatNumber(amount), metric.unit].filter(Boolean).join(' ') : '—';
  return `<section class="topic-metric" aria-label="Primary KPI for this role">
    <div class="topic-metric-name"><span>Primary KPI</span><strong>${esc(metric.name || 'No metric set')}</strong></div>
    <dl><div><dt>Actual</dt><dd>${esc(value(metric.current))}</dd></div><div><dt>${metric.direction === 'lower' ? 'Limit' : 'Target'}</dt><dd>${esc(value(metric.target))}</dd></div></dl>
    ${renderStatus(status, '', metricStatusText(status, metric))}
  </section>`;
}
export function createAssistant({ getRoles, applyRoles, openRole, formatNumber, renderStatus }) {
  let messages = [], draft = '', busy = false, failure = '', controller;
  let requestsOpen = false, employeesOpen = false, employeeQuery = '';
  let subjectId = null, focusOnArrival = false;
  let cancelDictation;
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelDictation?.(); });
  function sizePrompt(prompt) {
    if (CSS.supports('field-sizing', 'content')) return;
    prompt.style.height = 'auto';
    prompt.style.height = `${prompt.scrollHeight}px`;
  }
  function updatePromptHint(prompt) {
    const width = prompt.clientWidth;
    if (width < 150) prompt.placeholder = 'Your question…';
    else prompt.placeholder = subjectId
      ? (width < 225 ? 'Ask about this role…' : 'Ask a question about this role…')
      : (width < 320 ? 'Ask about the team…' : 'Ask about your team or suggest a change…');
    sizePrompt(prompt);
  }
  window.addEventListener('resize', () => {
    const prompt = document.getElementById('assistant-prompt');
    if (prompt) updatePromptHint(prompt);
  });
  const history = () => messages.slice(-18).map(item => {
    let content = item.text;
    if (item.subject) content = `Role selected for this question: ${JSON.stringify(item.subject)}\n\n${content}`;
    if (item.changes?.length) content += `\nProposal status: ${item.applied ? 'applied by the user' : item.undone ? 'undone by the user' : item.dismissed ? 'dismissed by the user' : 'not yet applied'}.`;
    return { role: item.role, content };
  });
  function discussRole(id) {
    subjectId = id;
    requestsOpen = true;
    employeesOpen = false;
    if (location.hash === '#assistant') render(true);
    else {
      focusOnArrival = true;
      location.hash = 'assistant';
    }
  }
  const snapshot = () => JSON.stringify(getRoles());
  function displayValue(value, field) {
    if (value === null || value === '') return 'Not set';
    if (field === 'managerId') return getRoles().find(role => role.id === value)?.title || value;
    if (field === 'objective.enabled') return value ? 'Yes' : 'No';
    if (value === 'higher') return 'Higher is better';
    if (value === 'lower') return 'Lower is better';
    return typeof value === 'number' ? new Intl.NumberFormat('en-US').format(value) : value;
  }
  function proposal(item, index) {
    if (!item.changes?.length) return '';
    if (item.applied) return `<div class="assistant-applied"><span>Changes saved</span><button class="button quiet text-action" data-undo="${index}" ${snapshot() !== item.after ? 'disabled title="Team data has changed since then"' : ''}>Undo changes</button></div>`;
    if (item.undone || item.dismissed) return `<p class="assistant-proposal-state">${item.undone ? 'Changes undone' : 'Proposal dismissed'}</p>`;
    const stale = snapshot() !== item.before;
    return `<section class="assistant-proposal" aria-label="Proposed changes"><h3>Review these changes</h3>${item.diffs.map(diff => `<div class="assistant-change"><h4>${diff.created ? 'New role: ' : ''}${esc(diff.title)}</h4><dl>${diff.fields.map(field => `<div><dt>${esc(field.label)}</dt><dd>${diff.created ? '' : `<span class="change-before">${esc(displayValue(field.before, field.field))}</span><span aria-hidden="true"> → </span>`}<strong>${esc(displayValue(field.after, field.field))}</strong></dd></div>`).join('')}</dl></div>`).join('')}<div class="assistant-proposal-actions"><button class="button primary" data-apply="${index}" ${stale || busy ? 'disabled' : ''}>Apply changes</button><button class="button secondary" data-dismiss="${index}">Dismiss</button></div>${stale ? '<p class="field-help">Team data has changed. Ask for a fresh proposal.</p>' : ''}</section>`;
  }
  function render(focusComposer = false) {
    const root = document.querySelector('#assistant-page'); if (!root) return;
    cancelDictation?.();
    const composerWasFocused = root.querySelector('#assistant-prompt') === document.activeElement;
    const searchWasFocused = root.querySelector('#employee-search') === document.activeElement;
    const listScrollTop = root.querySelector('#assistant-employees')?.scrollTop || 0;
    const roles = getRoles(), subject = roles.find(role => role.id === subjectId);
    if (!subject) subjectId = null;
    const requests = quickRequests(roles, subject), options = editOptions(subject), hasThread = messages.length > 0;
    const welcome = !hasThread && !subject;
    const conversation = messages.map((item, index) => `<article class="assistant-message ${item.role}"><span class="assistant-speaker">${item.role === 'user' ? 'You' : 'OrgBoard'}</span>${item.subject ? `<span class="message-subject">${esc(subjectLabel(item.subject))}</span>` : ''}<p>${esc(item.text)}</p>${item.roleIds?.length ? `<div class="assistant-sources">${item.roleIds.map(id => { const role = roles.find(role => role.id === id); return role ? `<button data-assistant-role="${esc(id)}">${esc(role.title)}<span>${esc(role.employee || 'Vacant')}</span></button>` : ''; }).join('')}</div>` : ''}${proposal(item, index)}</article>`).join('');
    const composer = `<div class="assistant-compose-area">
        ${failure ? `<div class="assistant-error" role="alert">${esc(failure)}</div>` : ''}
        <p class="dictation-status" role="status"></p>
        <div class="composer-shell"><form class="assistant-composer">
          ${subject ? `<button type="button" class="composer-subject" title="Remove from question" aria-label="Remove from question: ${esc(subjectLabel(subject))}"><span class="mention-at" aria-hidden="true">@</span><span>${esc(subject.employee || 'Vacant · ' + subject.title)}</span><span aria-hidden="true">×</span></button>` : ''}
          <label class="sr-only" for="assistant-prompt">Message the assistant</label>
          <textarea id="assistant-prompt" ${subject ? 'aria-describedby="subject-label"' : ''} rows="1" maxlength="4000">${esc(draft)}</textarea>
          <div class="composer-actions">
            <button class="button secondary assistant-mic" type="button" aria-label="Dictate a message" title="Dictate a message" aria-pressed="false" ${busy ? 'disabled' : ''}>${micIcon}${stopIcon}<span class="mic-label">Dictate</span></button>
            <button class="button primary assistant-send" type="${busy ? 'button' : 'submit'}" ${!busy && !draft.trim() ? 'disabled' : ''} aria-label="${busy ? 'Stop response' : 'Send message'}">${busy ? 'Stop' : `Send ${arrow}`}</button>
          </div></form>
        <div class="composer-options" role="group" aria-label="Team actions">${options.map(([label, , icon], index) => `<button type="button" class="button quiet" data-compose-option="${index}" ${busy ? 'disabled' : ''}>${icon}<span>${esc(label)}</span></button>`).join('')}</div></div>
      </div>`;
    root.innerHTML = `<div class="assistant-desk ${welcome ? 'is-welcome' : ''}">
      ${subject ? topicHeader(subject) : ''}
      ${hasThread ? `<div class="assistant-thread-bar"><h2>Conversation</h2><button class="button secondary config-action" id="assistant-requests" aria-controls="request-shelf" aria-expanded="${requestsOpen}">${requestsOpen ? 'Hide suggestions' : 'Suggestions'}</button></div>` : ''}
      <div class="assistant-scroll">
        <section id="request-shelf" class="request-shelf" ${hasThread && !requestsOpen ? 'hidden' : ''} aria-label="Suggestions">
          ${welcome ? '<h2 class="assistant-greeting">Hello! What would you like to work on?</h2>' : ''}
          ${subject ? topicMetric(subject, formatNumber, renderStatus) : ''}
          ${requestsMarkup(requests, busy)}
        </section>
        <div class="assistant-conversation" role="log" aria-label="Conversation with the assistant" aria-live="polite">${conversation}${busy ? '<p class="assistant-thinking" role="status">Reading team data…</p>' : ''}</div>
      </div>
      ${composer}
    </div>${employeePanel(roles, subjectId, employeesOpen, employeeQuery)}`;
    const prompt = root.querySelector('#assistant-prompt');
    const list = root.querySelector('#assistant-employees');
    list.scrollTop = listScrollTop;
    const toggle = root.querySelector('.employee-panel-toggle');
    toggle.onclick = () => {
      employeesOpen = !employeesOpen;
      toggle.setAttribute('aria-expanded', String(employeesOpen));
    };
    const search = root.querySelector('#employee-search');
    search.oninput = () => {
      employeeQuery = search.value;
      list.innerHTML = employeeEntries(getRoles(), subjectId, employeeQuery);
      list.scrollTop = 0;
    };
    list.onclick = event => {
      const choice = event.target.closest('[data-employee-role]');
      if (choice) discussRole(choice.dataset.employeeRole);
    };
    updatePromptHint(prompt);
    prompt.oninput = () => {
      draft = prompt.value;
      sizePrompt(prompt);
      root.querySelector('.assistant-send').disabled = !busy && !draft.trim();
    };
    cancelDictation = bindDictation(root.querySelector('.assistant-mic'), prompt, root.querySelector('.dictation-status'), prompt.oninput);
    prompt.onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); if (!busy) send(); } };
    root.querySelector('form').onsubmit = event => { event.preventDefault(); send(); };
    if (busy) root.querySelector('.assistant-send').onclick = () => controller?.abort();
    root.querySelector('#assistant-requests')?.addEventListener('click', () => {
      requestsOpen = !requestsOpen; render(); root.querySelector('#assistant-requests').focus({ preventScroll: true });
    });
    const fillPrompt = text => {
      draft = text;
      requestsOpen = false; render(true);
    };
    root.querySelectorAll('[data-suggestion]').forEach(button => {
      button.onclick = () => fillPrompt(requests[Number(button.dataset.suggestion)][1]);
    });
    root.querySelectorAll('[data-compose-option]').forEach(button => {
      button.onclick = () => fillPrompt(options[Number(button.dataset.composeOption)][1]);
    });
    const showRole = id => { cancelDictation(); openRole(id); };
    root.querySelector('#open-subject')?.addEventListener('click', () => showRole(subjectId));
    const clearSubject = () => {
      subjectId = null; requestsOpen = false; render(true);
    };
    root.querySelector('#clear-subject')?.addEventListener('click', clearSubject);
    root.querySelector('.composer-subject')?.addEventListener('click', clearSubject);
    root.querySelectorAll('[data-assistant-role]').forEach(button => { button.onclick = () => showRole(button.dataset.assistantRole); });
    root.querySelectorAll('[data-dismiss]').forEach(button => { button.onclick = () => { messages[button.dataset.dismiss].dismissed = true; render(); }; });
    root.querySelectorAll('[data-apply]').forEach(button => { button.onclick = () => {
      const item = messages[button.dataset.apply];
      try {
        if (snapshot() !== item.before) throw new Error('Team data has changed. Request a new proposal.');
        const next = prepareChanges(getRoles(), item.changes).roles;
        applyRoles(next); item.after = snapshot(); item.applied = true; failure = ''; render();
      } catch (error) { failure = errorText(error); render(); }
    }; });
    root.querySelectorAll('[data-undo]').forEach(button => { button.onclick = () => {
      const item = messages[button.dataset.undo];
      try {
        if (snapshot() !== item.after) throw new Error('Team data has changed. To undo this change, edit the relevant fields.');
        applyRoles(JSON.parse(item.before)); item.applied = false; item.undone = true; failure = ''; render();
      } catch (error) { failure = errorText(error); render(); }
    }; });
    const scroll = root.querySelector('.assistant-scroll');
    if (hasThread && !requestsOpen) scroll.scrollTop = scroll.scrollHeight;
    if (focusComposer || composerWasFocused) prompt.focus({ preventScroll: true });
    else if (searchWasFocused) search.focus({ preventScroll: true });
  }
  async function send() {
    if (busy || !draft.trim()) return;
    const question = draft.trim(), before = snapshot();
    const role = getRoles().find(role => role.id === subjectId);
    const subject = role ? { id: role.id, title: role.title, employee: role.employee } : null;
    messages.push({ role: 'user', text: question, subject }); draft = ''; failure = ''; busy = true;
    requestsOpen = false; controller = new AbortController(); render();
    try {
      const response = await fetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ roles: JSON.parse(before), messages: history() }) });
      if (response.status === 503) throw new Error('AI is not connected yet. Try again once it is connected.');
      const reply = await response.json();
      if (!response.ok) throw new Error(reply.error || 'No response received.');
      const prepared = reply.changes?.length ? prepareChanges(JSON.parse(before), reply.changes) : null;
      messages.push({ role: 'assistant', text: reply.answer, roleIds: reply.roleIds, changes: reply.changes, diffs: prepared?.diffs, before });
    } catch (error) {
      messages.pop();
      if (!draft && subjectId === (subject?.id ?? null)) draft = question;
      failure = error.name === 'AbortError' ? 'Response stopped. You can send your message again.' : /^[A-Z]/u.test(error.message) ? error.message : 'Could not reach the assistant. Please try again.';
    } finally { busy = false; controller = null; render(); }
  }
  return {
    discussRole,
    mount(isPage) {
      if (!isPage) { cancelDictation?.(); cancelDictation = null; return; }
      render(focusOnArrival);
      focusOnArrival = false;
    },
  };
}
