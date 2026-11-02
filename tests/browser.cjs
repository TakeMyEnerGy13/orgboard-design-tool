const { visitWorkspace } = require('./visit-workspace.cjs');
const { chromium, expect } = require('playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const output = path.resolve(__dirname, '../artifacts');
const results = [], errors = [];
const check = async (name, action) => { await action(); results.push(name); console.log('PASS ' + name); };
(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.TEST_BROWSER || undefined });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', error => errors.push(error.message));
  const url = process.env.TEST_URL || 'http://127.0.0.1:4188';
  const state = async () => page.evaluate(() => JSON.parse(localStorage.getItem('orgboard.forma.v1'))?.roles);
  const { seedRoles, ancestors } = await import('../src/domain.js');
  const demoGoalCount = seedRoles().filter(role => role.objective).length;
  const reveal = async id => {
    const home = page.locator('#chart-path [data-team]').first();
    if (await home.count()) await home.click();
    const all = await state() || seedRoles();
    const manager = ancestors(all, id).reverse().find(r => r.managerId !== null);
    if (manager) await page.locator(`[data-team="${manager.id}"]`).click();
  };
  const open = async id => { await reveal(id); await page.locator(`[data-role-id="${id}"]`).click(); };
  const save = async () => page.getByRole('button', { name: 'Save', exact: true }).click();
  const settings = async () => page.getByRole('tab', { name: 'Role', exact: true }).click();
  const goals = async () => page.getByRole('tab', { name: 'Targets', exact: true }).click();
  const resultTab = async () => page.getByRole('tab', { name: 'Results', exact: true }).click();
  const fact = async (value, prefix = 'kpi', target = page) => {
    const button = target.locator(`[data-start-edit="${prefix}"]`);
    if (await button.isVisible()) await button.click();
    await target.locator(`[name="${prefix}Current"]`).fill(value);
  };
  const close = async () => page.locator('#close-editor').click();
  try {
    await visitWorkspace(page, url);
    await expect(page.locator('.role-card')).toHaveCount(4);
    const fonts = await page.evaluate(async () => {
      const loaded = await Promise.all([
        document.fonts.load('600 16px Manrope', 'Team'),
        document.fonts.load('650 40px Manrope', 'Your team'),
      ]);
      return loaded.map(faces => faces.map(face => ({ family: face.family, status: face.status })));
    });
    assert.deepEqual(fonts, [[{ family: 'Manrope', status: 'loaded' }], [{ family: 'Manrope', status: 'loaded' }]]);
    await page.screenshot({ path: path.join(output, 'graph-overview.png'), fullPage: true });
    if (process.env.SCREENSHOT_ONLY) return;
    await check('overview has four spacious two-line cards; team drilldown and breadcrumbs work', async () => {
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expect(page.locator('h1')).toHaveText('Your team');
      await expect(page.locator('.period, .page-heading p, #fit-chart, .organization #chart-path')).toHaveCount(0);
      await expect(page.locator('[data-role-id="ops"]')).toHaveAttribute('data-tone', 'healthy');
      await expect(page.locator('[data-role-id="cmo"]')).toHaveAttribute('data-tone', 'warning');
      await expect(page.locator('.open-team[data-team="cmo"]')).toHaveText('6on the team›');
      await expect(page.locator('.role-result, .team-note, .own-status')).toHaveCount(0);
      await expect(page.locator('[data-role-id="cmo"] .role-signal')).toHaveAttribute('data-hint', 'Team target not met');
      await expect(page.locator('#chart-back')).toBeHidden();
      const beforeNavigation = await state();
      const boardBeforeMenu = await page.locator('.organization').boundingBox();
      await page.locator('.attention-menu summary').focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('.attention-menu')).toHaveAttribute('open', '');
      assert.deepEqual(await page.locator('.organization').boundingBox(), boardBeforeMenu, 'Opening attention must not resize the board');
      await page.screenshot({ path: path.join(output, 'graph-attention-overview.png') });
      await page.keyboard.press('Enter');
      await expect(page.locator('.attention-menu')).not.toHaveAttribute('open', '');
      const companyMenu = page.locator('.demo-menu');
      await page.locator('.attention-menu summary').click();
      await companyMenu.locator('summary').click();
      await expect(page.locator('.attention-menu')).not.toHaveAttribute('open', '');
      await page.keyboard.press('Escape');
      await expect(companyMenu).not.toHaveAttribute('open', '');
      await expect(companyMenu.locator('summary')).toBeFocused();
      await companyMenu.locator('summary').click();
      await page.locator('.page-heading h1').click();
      await expect(companyMenu).not.toHaveAttribute('open', '');
      await page.locator('[data-team="cmo"]').click();
      await expect(page.locator('#chart-back')).toHaveAccessibleName('Back: Whole company');
      await page.locator('#chart-back').click();
      await expect(page.locator('.role-card')).toHaveCount(4);
      await expect(page.locator('#chart-back')).toBeHidden();
      await expect(page.locator('.open-team[data-team="cmo"]')).toBeFocused();
      await page.keyboard.press('Enter');
      assert.deepEqual(await state(), beforeNavigation);
      await expect(page.locator('.role-card')).toHaveCount(7);
      await expect(page.locator('.open-team')).toHaveCount(0);
      await expect(page.locator('.branch-surface')).toHaveCount(2);
      await expect(page.locator('.nested-node')).toHaveCount(4);
      await expect(page.locator('[data-role-id="editor"] .role-signal')).toHaveAttribute('data-hint', 'Personal target not met');
      await expect(page.locator('[data-role-id="editor"]')).toHaveAttribute('data-tone', 'risk');
      await expect(page.locator('[data-role-id="crm"]')).toHaveAttribute('data-tone', 'vacant');
      await expect(page.locator('[data-role-id="creative"] .role-signal')).toHaveAttribute('data-hint', 'Team target not met');
      await expect(page.locator('[data-role-id="editor"]')).not.toContainText('12 / 20');
      await expect(page.locator('.attention-menu summary')).toHaveText('Needs attention');
      await page.screenshot({ path: path.join(output, 'graph-team.png') });
      await page.locator('[data-role-id="cmo"] .role-signal').hover();
      await expect.poll(() => page.locator('[data-role-id="cmo"] .role-signal').evaluate(node => getComputedStyle(node, '::after').opacity)).toBe('1');
      await page.screenshot({ path: path.join(output, 'graph-signal.png') });
      await page.mouse.move(0, 0);
      await page.locator('.attention-menu summary').click();
      await expect(page.locator('.attention-menu [data-discuss-role="editor"]')).toContainText('Ethan Miller');
      const menu = await page.locator('.attention-menu > div').boundingBox();
      const back = await page.locator('#chart-back').boundingBox();
      assert(menu.x >= back.x + back.width, 'The attention menu must stay beside the back button');
      await page.screenshot({ path: path.join(output, 'graph-attention.png') });
      await page.locator('.attention-menu summary').click();
      await page.locator('[data-role-id="editor"]').click();
      await expect(page.locator('#editor-title')).toHaveText('Video Editor');
      await expect(page.locator('[name="kpiCurrent"]')).toBeHidden();
      await expect(page.locator('#kpi-fact')).toHaveText('12');
      await expect(page.locator('#kpi-plan')).toHaveText('20');
      await expect(page.locator('.metric-note')).toHaveCount(0);
      await expect(page.locator('#kpi-progress .progress-heading strong')).toHaveText('60%');
      await expect(page.locator('#tab-result')).toBeFocused();
      await expect(page.getByRole('tab')).toHaveCount(3);
      await expect(page.locator('#tab-result')).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('#role-view')).toBeHidden();
      await expect(page.locator('#goals-view')).toBeHidden();
      await expect(page.locator('[name="kpiTarget"]')).not.toBeVisible();
      await expect(page.locator('[data-start-edit="kr"]')).toBeVisible();
      await expect(page.locator('#save-role')).toBeDisabled();
      await expect(page.locator('#kpi-performance .section-heading h3')).toHaveText('Video ads delivered');
      await expect(page.locator('#editor')).toHaveCSS('opacity', '1');
      await page.screenshot({ path: path.join(output, 'graph-editor.png') });
    });
    await check('temporarily hidden chart preserves valid geometry and redraws without console errors', async () => {
      const chartContext = await browser.newContext({ reducedMotion: 'reduce' });
      const chartPage = await chartContext.newPage();
      const consoleErrors = [];
      chartPage.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
      chartPage.on('pageerror', error => errors.push(error.message));
      try {
        for (const width of [1440, 390]) {
          await chartPage.setViewportSize({ width, height: 900 });
          await visitWorkspace(chartPage, url);
          await chartPage.locator('.open-team[data-team="cmo"]').click();
          await expect(chartPage.locator('.role-card')).toHaveCount(7);
          for (const hidden of [true, false]) {
            await chartPage.locator('#chart-viewport').evaluate(async (element, value) => {
              element.hidden = value;
              await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            }, hidden);
            assert(Number(await chartPage.locator('#connections').getAttribute('width')) > 0);
          }
          await expect(chartPage.locator('[data-role-id="editor"]')).toBeVisible();
          assert(await chartPage.locator('.role-card').evaluateAll(cards => cards.every(card => card.getBoundingClientRect().width > 0)));
        }
        assert.deepEqual(consoleErrors, []);
      } finally { await chartContext.close(); }
    });
    await check('one-click editing clears the issue on every manager and persists after refresh', async () => {
      await fact('20');
      await expect(page.locator('#personal-status')).toHaveText('Target met');
      await expect(page.locator('#personal-status [data-status-icon="met"]')).toHaveAttribute('aria-hidden', 'true');
      await goals();
      await expect(page.locator('[name="outcome"]')).toBeHidden();
      await expect(page.locator('[name="kpiTarget"]')).toBeVisible();
      await expect(page.locator('#goals-view .metric-progress')).toHaveCount(0);
      await page.screenshot({ path: path.join(output, 'graph-goals.png') });
      await page.locator('[name="kpiTarget"]').fill('24');
      await resultTab();
      await expect(page.locator('[name="kpiCurrent"]')).toHaveValue('20');
      await expect(page.locator('#personal-status')).toHaveText('Below target');
      await expect(page.locator('#personal-status [data-status-icon="below"]')).toHaveCount(1);
      await goals();
      await page.locator('[name="kpiTarget"]').fill('20');
      await resultTab(); await save();
      await expect(page.locator('#editor')).not.toBeVisible();
      for (const id of ['creative', 'cmo', 'ceo']) {
        await reveal(id);
        await expect(page.locator(`[data-role-id="${id}"]`)).toHaveAttribute('data-tone', { creative: 'healthy', cmo: 'vacant', ceo: 'warning' }[id]);
      }
      await page.locator('.attention-menu summary').click();
      await expect(page.locator('.attention-menu [data-discuss-role="editor"]')).toHaveCount(0);
      await expect(page.locator('.attention-menu [data-discuss-role="crm"]')).toContainText('No employee assigned');
      await page.locator('.attention-menu summary').click();
      await page.reload(); await open('editor');
      await expect(page.locator('[name="kpiCurrent"]')).toHaveValue('20');
      await close();
    });
    await check('optional objective still affects team health independently of the primary KPI', async () => {
      await open('editor');
      await fact('2', 'kr'); await save();
      await reveal('cmo'); await expect(page.locator('[data-role-id="cmo"] .role-signal')).toHaveAttribute('data-hint', 'Team target not met');
      await open('editor');
      await expect(page.locator('#personal-status')).toHaveText('Target met');
      await expect(page.locator('#objective-summary')).toContainText('Below target');
      await expect(page.locator('#goals-view')).not.toBeVisible();
      await close();
    });
    await check('reparenting moves branch and issue; descendant manager choices excluded', async () => {
      await open('creative'); await settings();
      await page.getByRole('combobox', { name: 'Reports to', exact: true }).click();
      const options = await page.getByRole('option').evaluateAll(items => items.map(i => i.dataset.pickerOption));
      assert(!options.includes('editor') && !options.includes('creative'));
      await page.locator('#manager-menu [data-picker-option="ops"]').click(); await save();
      assert.equal((await state()).find(r => r.id === 'editor').managerId, 'creative');
      await reveal('ops'); await expect(page.locator('[data-role-id="ops"] .role-signal')).toHaveAttribute('data-hint', 'Team target not met');
      await expect(page.locator('[data-role-id="cmo"] .role-signal')).toHaveAttribute('data-hint', 'Vacancy on the team');
    });
    await check('goal tabs support keyboard navigation, preserve drafts and reveal invalid hidden fields', async () => {
      await open('editor'); await resultTab();
      await page.locator('#tab-result').press('ArrowRight');
      await expect(page.locator('#tab-goals')).toHaveAttribute('aria-selected', 'true');
      const goalTitle = await page.locator('[name="objectiveTitle"]').inputValue();
      await page.locator('[name="hasObjective"]').uncheck();
      await resultTab();
      await expect(page.locator('#objective-summary')).toBeHidden();
      await goals(); await page.locator('#add-objective').click();
      await expect(page.locator('[name="objectiveTitle"]')).toHaveValue(goalTitle);
      await page.locator('[name="objectiveTitle"]').fill('');
      await resultTab(); await save();
      await expect(page.locator('#tab-goals')).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('[name="objectiveTitle"]')).toBeFocused();
      await page.locator('[name="objectiveTitle"]').fill(goalTitle);
      await page.locator('#tab-goals').click(); await page.locator('#tab-goals').press('End');
      await expect(page.locator('#tab-role')).toHaveAttribute('aria-selected', 'true');
      await page.locator('#tab-role').press('Home');
      await expect(page.locator('#tab-result')).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('[name="krCurrent"]')).toHaveValue('2');
      await expect(page.locator('#save-role')).toBeDisabled();
      await close();
    });
    await check('create vacancy, assign ownership, then distinguish missing results', async () => {
      await page.locator('#add-role').click();
      await expect(page.getByRole('textbox', { name: 'Role title', exact: true })).toBeFocused();
      await page.getByRole('textbox', { name: 'Role title', exact: true }).fill('Designer');
      await page.getByRole('combobox', { name: 'Reports to', exact: true }).click();
      await page.locator('#manager-menu [data-picker-option="creative"]').click();
      await page.locator('[name="outcome"]').fill('Design campaign assets.');
      await goals();
      await page.locator('[name="kpiName"]').fill('Assets delivered');
      await page.locator('[name="kpiTarget"]').fill('10');
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      const added = (await state()).find(r => r.title === 'Designer'); assert(added);
      await expect(page.locator(`[data-role-id="${added.id}"]`)).toHaveClass(/vacant/);
      await open(added.id);
      await expect(page.locator('#kpi-progress')).toContainText('Waiting for an employee');
      await fact('5');
      await expect(page.locator('#kpi-progress')).toContainText('An actual is recorded. Assign an employee to assess it.');
      await fact('');
      await page.getByRole('button', { name: 'Assign employee', exact: true }).click();
      const employee = page.getByRole('textbox', { name: 'Employee', exact: true });
      await expect(employee).toBeFocused();
      await expect(employee).toHaveAccessibleDescription('Leave empty for a vacancy.');
      await expect(employee).toHaveValue('');
      await employee.fill('Anna Ivanova');
      await expect(page.locator('#employee-avatar')).toHaveText('AI');
      await employee.fill('');
      await expect(page.locator('#employee-avatar [data-status-icon="vacant"]')).toHaveCount(1);
      await employee.fill('Anna Ivanova'); await save();
      await expect(page.locator(`[data-role-id="${added.id}"] .role-signal`)).toHaveAttribute('data-hint', 'Some metric data is missing');
      await expect(page.locator(`[data-role-id="${added.id}"]`)).toHaveAttribute('data-tone', 'neutral');
    });
    await check('lower-is-better works and negative values show an English error', async () => {
      await open('buyer'); await fact('-1'); await save();
      await expect(page.locator('#form-error')).toContainText('Metric values must be zero or greater');
      await fact('65'); await save();
      await expect(page.locator('[data-role-id="buyer"] .role-signal')).toHaveAttribute('data-hint', 'Personal target not met');
      await open('buyer'); await fact('42'); await save();
      await expect(page.locator('[data-role-id="buyer"] .role-signal')).toHaveCount(0);
    });
    await check('remove manager only after confirmation and keep direct reports', async () => {
      await open('creative'); await settings();
      await page.screenshot({ path: path.join(output, 'role-settings.png') });
      await page.locator('#delete-role').click();
      await page.screenshot({ path: path.join(output, 'delete-confirmation.png') });
      await page.locator('#dialog button[value="cancel"]').click();
      assert((await state()).some(r => r.id === 'creative'));
      await page.locator('#delete-role').click();
      await page.getByRole('combobox', { name: 'New manager', exact: true }).click();
      await page.locator('#replacement-manager-menu [data-picker-option="cmo"]').click();
      await page.locator('#confirm-dialog').click();
      assert(!(await state()).some(r => r.id === 'creative'));
      for (const id of ['editor', 'strategist']) assert.equal((await state()).find(r => r.id === id).managerId, 'cmo');
    });
    await check('root protection and unsaved changes on Escape', async () => {
      await open('ceo'); await settings();
      await expect(page.locator('#delete-role')).toBeDisabled();
      await expect(page.getByRole('combobox', { name: 'Reports to', exact: true })).toBeDisabled();
      await page.locator('[name="title"]').fill('Not saved');
      await page.keyboard.press('Escape');
      await expect(page.locator('#dialog')).toContainText('Discard unsaved changes?');
      await page.locator('#dialog button[value="cancel"]').click();
      await expect(page.locator('[name="title"]')).toHaveValue('Not saved');
      await close(); await page.locator('#confirm-dialog').click();
      await expect(page.locator('#editor')).not.toBeVisible();
      await expect(page.locator('[data-role-id="ceo"] .role-title')).toHaveText('Founder & CEO');
    });
    await check('reset restores the English demo and persisted organization', async () => {
      await page.locator('.demo-menu summary').click(); await page.locator('#reset-demo').click();
      await page.locator('#confirm-dialog').click(); await page.reload();
      assert.equal((await state()).length, 13);
      assert.equal((await state()).find(r => r.id === 'editor').kpi.current, 12);
      await expect(page.locator('.role-card')).toHaveCount(4);
      await reveal('editor'); await expect(page.locator('[data-role-id="editor"] .role-title')).toHaveText('Video Editor');
    });
    await check('employee popup stays centered and readable across desktop and mobile; save always visible', async () => {
      for (const [width, height] of [[1440, 900], [1000, 800], [700, 900], [390, 844]]) {
        await page.setViewportSize({ width, height }); await reveal('ceo'); await page.evaluate(() => scrollTo(0, 0));
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await expect.poll(async () => page.locator('.role-title').evaluateAll(nodes => nodes.length === 4 && nodes.every(n => parseFloat(getComputedStyle(n).fontSize) >= 16))).toBe(true);
        await page.screenshot({ path: path.join(output, `graph-overview-${width}.png`), fullPage: true });
        await open('editor');
        await expect.poll(async () => {
          const popup = await page.locator('#editor').boundingBox();
          return Math.abs(popup.x + popup.width / 2 - width / 2) + Math.abs(popup.y + popup.height / 2 - height / 2);
        }).toBeLessThan(2);
        const popup = await page.locator('#editor').boundingBox();
        if (width > 600) assert(popup.x >= 24 && popup.y >= 31 && popup.width > 600, 'The popup floats in the center instead of docking to the edge');
        assert(await page.locator('#editor').evaluate(node => node.scrollWidth <= node.clientWidth));
        const actions = await page.locator('.editor-footer').boundingBox();
        assert(actions.y + actions.height <= height + 1);
        assert(actions.y + actions.height <= popup.y + popup.height);
        await expect(page.locator('[data-start-edit="kpi"]')).toBeVisible();
        await page.screenshot({ path: path.join(output, `graph-editor-${width}.png`) });
        if (width === 390) {
          await settings();
          assert(await page.locator('#role-view').evaluate(node => node.scrollWidth <= node.clientWidth));
          await expect(page.getByRole('textbox', { name: 'Department', exact: true })).toHaveValue('Marketing');
          await page.screenshot({ path: path.join(output, 'role-settings-390.png') });
        }
        await close();
        await expect(page.locator('.role-card')).toHaveCount(7);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        const cards = await page.locator('.chart-node').evaluateAll(nodes => nodes.map(n => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom }; }));
        const back = await page.locator('#chart-back').boundingBox();
        for (const card of cards) assert(card.bottom <= back.y || card.right <= back.x || card.x >= back.x + back.width, 'The back button must not cover fitted cards');
        for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
          const a = cards[i], b = cards[j];
          assert(a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y, 'Expanded cards must not overlap');
        }
        await page.screenshot({ path: path.join(output, `graph-team-${width}.png`), fullPage: true });
      }
    });
    await check('smooth wheel zoom anchors to the cursor; pan, navigation and reduced motion work', async () => {
      await page.setViewportSize({ width: 1440, height: 900 }); await reveal('ceo');
      const savedBefore = await state();
      const card = page.locator('[data-role-id="ceo"]');
      const cardBefore = await card.boundingBox();
      const anchor = { x: cardBefore.x + 64, y: cardBefore.y + 40 };
      const scrollBefore = await page.evaluate(() => scrollY);
      await page.mouse.move(anchor.x, anchor.y);
      await page.mouse.wheel(0, 120);
      await expect.poll(async () => (await card.boundingBox()).width).toBeLessThan(cardBefore.width);
      const inMotion = await card.boundingBox();
      const targetWidth = cardBefore.width * Math.exp(-120 * .0012);
      assert(inMotion.width > targetWidth + .1, 'Zoom should interpolate rather than jump to its destination');
      await expect.poll(async () => Math.abs((await card.boundingBox()).width - targetWidth)).toBeLessThan(.1);
      const cardAfter = await card.boundingBox(), ratio = cardAfter.width / cardBefore.width;
      assert(Math.abs(cardAfter.x - anchor.x - (cardBefore.x - anchor.x) * ratio) < 1);
      assert(Math.abs(cardAfter.y - anchor.y - (cardBefore.y - anchor.y) * ratio) < 1);
      assert.equal(await page.evaluate(() => scrollY), scrollBefore);
      await page.mouse.wheel(0, -120);
      await expect.poll(async () => Math.abs((await card.boundingBox()).width - cardBefore.width)).toBeLessThan(1);
      await card.click(); await expect(page.locator('#editor-title')).toHaveText('Founder & CEO'); await close();
      const before = await page.locator('#chart-stage').evaluate(el => el.style.transform);
      await page.locator('#zoom-in').click();
      await expect.poll(() => page.locator('#chart-stage').evaluate(el => el.style.transform)).not.toBe(before);
      await page.locator('#zoom-out').click();
      await expect.poll(async () => Math.abs((await card.boundingBox()).width - cardBefore.width)).toBeLessThan(.1);
      const fitted = await page.locator('#chart-stage').evaluate(el => el.style.transform);
      const rect = await page.locator('#chart-viewport').boundingBox();
      await page.mouse.move(rect.x + 8, rect.y + 8); await page.mouse.down();
      await page.mouse.move(rect.x + 48, rect.y + 28); await page.mouse.up();
      assert.notEqual(await page.locator('#chart-stage').evaluate(el => el.style.transform), fitted);
      assert.deepEqual(await state(), savedBefore);
      await page.mouse.move(anchor.x, anchor.y); await page.mouse.wheel(0, -120);
      await page.locator('[data-team="cmo"]').click();
      const newView = await page.locator('#chart-stage').evaluate(el => el.style.transform);
      await page.waitForTimeout(300);
      assert.equal(await page.locator('#chart-stage').evaluate(el => el.style.transform), newView, 'A previous zoom must not move a newly opened team');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const reducedBefore = await page.locator('[data-role-id="cmo"]').boundingBox();
      await page.locator('#zoom-in').click();
      const reducedAfter = await page.locator('[data-role-id="cmo"]').boundingBox();
      assert(Math.abs(reducedAfter.width / reducedBefore.width - 1.15) < .01);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
    });
    await check('company tabs expose all KPIs and goals, sync edits and survive refresh', async () => {
      await page.locator('.workspace-nav a[href="#metrics"]').click();
      await expect(page.locator('.workspace-nav [aria-current]')).toBeFocused();
      await expect(page.locator('.metric-table tbody tr')).toHaveCount(13);
      await expect(page.locator('[data-metric-role="cmo"] .status-badge')).toHaveText('Target met');
      await expect(page.locator('[data-metric-role="cmo"] .team-link')).toHaveAttribute('data-status', 'below');
      await expect(page.locator('[data-metric-role="cmo"] .team-link')).toHaveAccessibleName(/1 below target/);
      await expect(page.locator('[data-metric-role="crm"] .status-badge [data-status-icon="vacant"]')).toHaveCount(1);
      await expect(page.locator('[data-metric-role="editor"] .status-badge')).toHaveText('Below target');
      await page.screenshot({ path: path.join(output, 'company-metrics.png'), fullPage: true });
      await page.locator('[data-metric-role="editor"] .table-value').click();
      await expect(page.locator('[name="kpiCurrent"]')).toBeFocused();
      await fact('20'); await save();
      await expect(page.locator('[data-metric-role="editor"] .status-badge')).toHaveText('Target met');
      await expect(page.locator('[data-metric-role="cmo"] .team-link')).toHaveAttribute('data-status', 'vacant');
      await expect(page.locator('[data-metric-role="cmo"] .team-link')).toHaveAccessibleName(/vacancies: 1/);
      await page.reload();
      await expect(page.locator('.workspace-nav [aria-current]')).toHaveText('Metrics');
      await expect(page.locator('[data-metric-role="editor"] .table-value')).toContainText('20');
      await page.locator('.workspace-nav a[href="#goals"]').click();
      await expect(page.locator('.company-goal')).toHaveCount(demoGoalCount);
      await expect(page.locator('[data-goal-kind="kpi"]')).toHaveCount(0);
      await page.screenshot({ path: path.join(output, 'company-goals.png') });
      await page.locator('[data-goal-role="editor"][data-goal-kind="objective"] .goal-open').click();
      await expect(page.locator('#tab-goals')).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('[name="krTarget"]')).toHaveValue('4');
      await expect(page.locator('#objective-config')).toBeVisible();
      await resultTab(); await fact('2', 'kr'); await save();
      await expect(page.locator('[data-goal-role="editor"][data-goal-kind="objective"] .status-badge')).toHaveText('Below target');
      await page.locator('.workspace-nav a[href="#metrics"]').click();
      await expect(page.locator('[data-metric-role="editor"] .status-badge')).toHaveText('Target met');
      await page.locator('.workspace-nav a[href="#structure"]').click();
      await reveal('ceo');
      await expect(page.locator('[data-role-id="ceo"]')).toHaveAttribute('data-tone', 'warning');
    });
    await check('create a company goal, assign its owner, edit its result and show an empty state without additional goals', async () => {
      await page.locator('.workspace-nav a[href="#goals"]').click();
      await page.locator('#add-goal').click();
      await page.getByRole('combobox', { name: 'Goal owner', exact: true }).click();
      await expect(page.locator('#goal-owner-menu [data-picker-option="editor"]')).toHaveCount(0);
      await page.locator('#goal-owner-menu [data-picker-option="strategist"]').click();
      await page.locator('#confirm-dialog').click();
      await expect(page.locator('[name="objectiveTitle"]')).toBeFocused();
      await expect(page.locator('#save-role')).toBeDisabled();
      await expect(page.locator('#cancel-edit')).toHaveText('Close');
      await page.locator('[name="objectiveTitle"]').fill('Test new concepts');
      await expect(page.locator('#save-role')).toBeEnabled();
      await page.locator('[name="krName"]').fill('Concepts tested');
      await page.locator('[name="krTarget"]').fill('3');
      await page.locator('[name="krUnit"]').fill('units.');
      await save();
      await expect(page.locator('.company-goal')).toHaveCount(demoGoalCount + 1);
      await expect(page.locator('[data-goal-role="strategist"][data-goal-kind="objective"] .status-badge')).toHaveText('Missing data');
      await expect(page.locator('[data-goal-role="strategist"][data-goal-kind="objective"] [data-status-icon="missing"]')).toHaveCount(1);
      await page.locator('[data-goal-role="strategist"][data-goal-kind="objective"] .goal-open').click();
      await resultTab(); await fact('3', 'kr'); await save();
      await page.reload();
      await expect(page.locator('[data-goal-role="strategist"][data-goal-kind="objective"] .status-badge')).toHaveText('Target met');
      await expect(page.locator('[data-goal-role="strategist"][data-goal-kind="objective"] [data-status-icon="met"]')).toHaveCount(1);
      for (const section of ['metrics', 'goals']) {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.locator(`.workspace-nav a[href="#${section}"]`).click();
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: path.join(output, `company-${section}-390.png`) });
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      const { serialize } = await import('../src/domain.js');
      const noGoals = seedRoles().map(role => ({ ...role, objective: null }));
      noGoals.find(role => role.id === 'support').kpi.target = null;
      const emptyContext = await browser.newContext();
      await emptyContext.addInitScript(text => localStorage.setItem('orgboard.forma.v1', text), serialize(noGoals));
      const empty = await emptyContext.newPage(); await visitWorkspace(empty, url + '/#goals');
      await expect(empty.locator('.company-goal')).toHaveCount(0);
      await expect(empty.locator('.empty-goals')).toContainText('No additional goals yet');
      await expect(empty.locator('#add-goal')).toBeEnabled();
      await empty.locator('.workspace-nav a[href="#metrics"]').click();
      await empty.getByRole('button', { name: 'Cards', exact: true }).click();
      await expect(empty.locator('[data-goal-kind="kpi"]')).toHaveCount(13);
      await expect(empty.locator('[data-goal-role="support"] .status-badge')).toHaveText('Missing data');
      await expect(empty.locator('[data-goal-role="support"] .metric-progress')).toContainText('Add target');
      await emptyContext.close();
    });
    await check('legacy saves migrate to English without losing edited values or roles', async () => {
      const previous = seedRoles().map(role => ({ ...role, objective: role.id === 'editor' ? role.objective : null }));
      previous.find(r => r.id === 'ops').objective = { title: 'Prepare fulfillment for higher order volume', result: { name: 'Daily orders fulfilled on time in a load test', current: 1600, target: 1500, unit: 'orders/day', direction: 'higher' } };
      previous.find(r => r.id === 'editor').title = 'Видеомонтажёр';
      previous.find(r => r.id === 'editor').kpi.current = 17;
      previous.find(r => r.id === 'creative').managerId = 'ops';
      previous.find(r => r.id === 'cmo').title = 'My team lead';
      const migratedContext = await browser.newContext();
      await migratedContext.addInitScript(text => { if (!localStorage.getItem('orgboard.forma.v1')) localStorage.setItem('orgboard.forma.v1', text); }, JSON.stringify({ version: 1, roles: previous }));
      const migrated = await migratedContext.newPage(); await visitWorkspace(migrated, url + '/#goals');
      await expect(migrated.locator('[data-goal-kind="objective"]')).toHaveCount(2);
      const forecast = migrated.locator('[data-goal-role="finance"]');
      await expect(forecast).toContainText('Priya Shah');
      await expect(forecast.locator('.progress-heading strong')).toHaveText('61.54%');
      await forecast.locator('.goal-open').click();
      await migrated.locator('[name="hasObjective"]').uncheck();
      await migrated.locator('#save-role').click();
      await migrated.reload();
      await expect(forecast).toHaveCount(0);
      await expect(migrated.locator('[data-goal-kind="objective"]')).toHaveCount(1);
      await migrated.getByRole('link', { name: 'Structure', exact: true }).click();
      await migrated.locator('[data-team="ops"]').click();
      await expect(migrated.locator('[data-role-id="editor"]')).toContainText('Video Editor');
      assert.equal(await migrated.locator('#chart-path [data-team="ceo"]').count(), 1);
      await migrated.locator('[data-role-id="editor"]').click();
      await expect(migrated.locator('[name="kpiCurrent"]')).toHaveValue('17');
      await expect(migrated.locator('#save-role')).toBeDisabled();
      await migrated.getByRole('tab', { name: 'Role', exact: true }).click();
      await migrated.locator('[name="employee"]').fill('Ethan Miller (reassigned)');
      await migrated.getByRole('button', { name: 'Save', exact: true }).click();
      const stored = await migrated.evaluate(() => JSON.parse(localStorage.getItem('orgboard.forma.v1')).roles);
      assert.equal(stored.find(r => r.id === 'cmo').title, 'My team lead');
      assert.equal(stored.find(r => r.id === 'creative').managerId, 'ops');
      assert.equal(stored.find(r => r.id === 'editor').kpi.current, 17);
      await migratedContext.close();
    });
    await check('storage failures and corrupted saved data are explained in English', async () => {
      const blockedContext = await browser.newContext();
      await blockedContext.addInitScript(() => { Storage.prototype.setItem = function () { throw new DOMException('Blocked', 'SecurityError'); }; });
      const blocked = await blockedContext.newPage(); await visitWorkspace(blocked, url);
      await blocked.locator('.attention-menu summary').click();
      await blocked.locator('.attention-menu [data-discuss-role="editor"]').click();
      await blocked.locator('#open-subject').click();
      await fact('20', 'kpi', blocked);
      await blocked.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(blocked.locator('#save-state')).toContainText('browser blocked saving');
      await blockedContext.close();
      const invalidContext = await browser.newContext();
      await invalidContext.addInitScript(() => localStorage.setItem('orgboard.forma.v1', '{broken'));
      const invalid = await invalidContext.newPage(); await visitWorkspace(invalid, url);
      await expect(invalid.locator('#save-state')).toContainText('could not be opened');
      assert.equal(await invalid.evaluate(() => localStorage.getItem('orgboard.forma.v1')), '{broken');
      await invalidContext.close();
    });
    await check('plan scales distinguish shortfall, overachievement, limits, zero targets and missing results', async () => {
      const scaleContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      const scalePage = await scaleContext.newPage();
      scalePage.on('pageerror', error => errors.push(error.message));
      try {
        await visitWorkspace(scalePage, url + '/#metrics');
        await scalePage.locator('[data-metric-role="cmo"] .table-owner').click();
        await scalePage.getByRole('tab', { name: 'Results', exact: true }).click();
        const markerOrder = async selector => scalePage.locator(selector).evaluate(node => {
          const actual = node.querySelector('.progress-actual').getBoundingClientRect();
          const target = node.querySelector('.progress-target').getBoundingClientRect();
          return (actual.x + actual.width / 2) - (target.x + target.width / 2);
        });
        await expect(scalePage.locator('#kpi-progress .progress-heading strong')).toHaveText('108.57%');
        assert(await markerOrder('#kpi-progress') > 0, 'Overachievement extends past the plan marker');
        await scalePage.screenshot({ path: path.join(output, 'progress-plan.png') });
        await scalePage.getByRole('tab', { name: 'Results', exact: true }).click();
        await fact('3', 'kpi', scalePage);
        assert(await markerOrder('#kpi-progress') < 0, 'Shortfall remains before the plan marker');
        await fact('3.5', 'kpi', scalePage);
        assert(Math.abs(await markerOrder('#kpi-progress')) < 1, 'Exact achievement aligns with the plan marker');
        await scalePage.getByRole('tab', { name: 'Targets', exact: true }).click();
        await scalePage.locator('[name="kpiTarget"]').fill('0');
        await scalePage.getByRole('tab', { name: 'Results', exact: true }).click();
        await expect(scalePage.locator('#kpi-progress')).toContainText('Target — 0');
        await expect(scalePage.locator('#kpi-progress')).not.toContainText('Infinity');
        await fact('0', 'kpi', scalePage);
        assert(Math.abs(await markerOrder('#kpi-progress')) < 1);
        await scalePage.getByRole('button', { name: 'Save', exact: true }).click();
        await scalePage.locator('[data-metric-role="buyer"] .table-owner').click();
        await scalePage.getByRole('tab', { name: 'Results', exact: true }).click();
        await expect(scalePage.locator('#kpi-progress')).toContainText('Limit used');
        await expect(scalePage.locator('#kpi-progress .progress-heading strong')).toHaveText('84%');
        assert(await markerOrder('#kpi-progress') < 0);
        await scalePage.screenshot({ path: path.join(output, 'progress-limit.png') });
        await fact('65', 'kpi', scalePage);
        await expect(scalePage.locator('#kpi-progress .progress-heading strong')).toHaveText('130%');
        assert(await markerOrder('#kpi-progress') > 0);
        await expect(scalePage.locator('#personal-status')).toHaveText('Over limit');
        await fact('', 'kpi', scalePage);
        await expect(scalePage.locator('#kpi-progress .progress-actual')).toHaveCount(0);
        await expect(scalePage.locator('#kpi-progress')).toContainText('Add actual');
        await scalePage.getByRole('button', { name: 'Save', exact: true }).click();
        await scalePage.locator('[data-metric-role="crm"] .table-owner').click();
        await scalePage.getByRole('tab', { name: 'Results', exact: true }).click();
        await expect(scalePage.locator('#kpi-progress')).toContainText('Waiting for an employee');
        await expect(scalePage.locator('#kpi-progress .progress-actual')).toHaveCount(0);
      } finally { await scaleContext.close(); }
    });
    await check('employee popup blocks background focus and scroll and returns focus on Escape', async () => {
      const popupContext = await browser.newContext({ viewport: { width: 1000, height: 650 }, reducedMotion: 'reduce' });
      const popupPage = await popupContext.newPage();
      popupPage.on('pageerror', error => errors.push(error.message));
      try {
        await visitWorkspace(popupPage, url + '/#metrics');
        const owner = popupPage.locator('[data-metric-role="cmo"] .table-owner');
        await owner.click();
        await expect(popupPage.locator('#editor')).toBeVisible();
        assert.equal(await popupPage.locator('#editor').evaluate(node => getComputedStyle(node).animationName), 'none');
        assert.equal(await popupPage.locator('body').evaluate(node => getComputedStyle(node).overflow), 'hidden');
        await owner.focus();
        await expect(owner).not.toBeFocused();
        await popupPage.locator('#cancel-edit').focus();
        await popupPage.keyboard.press('Tab');
        if (await popupPage.evaluate(() => document.activeElement === document.body)) await popupPage.keyboard.press('Tab');
        await expect(popupPage.locator('#assign-employee')).toBeFocused();
        await popupPage.keyboard.press('Shift+Tab');
        if (await popupPage.evaluate(() => document.activeElement === document.body)) await popupPage.keyboard.press('Shift+Tab');
        await expect(popupPage.locator('#cancel-edit')).toBeFocused();
        await popupPage.getByRole('tab', { name: 'Targets', exact: true }).click();
        await expect(popupPage.locator('[name="kpiTarget"]')).toHaveValue('3.5');
        await expect(popupPage.locator('#goals-view .metric-progress')).toHaveCount(0);
        await popupPage.screenshot({ path: path.join(output, 'employee-popup.png') });
        await popupPage.keyboard.press('Escape');
        await expect(popupPage.locator('#editor')).not.toBeVisible();
        await expect(owner).toBeFocused();
        assert.notEqual(await popupPage.locator('body').evaluate(node => getComputedStyle(node).overflow), 'hidden');
      } finally { await popupContext.close(); }
    });
    await check('team attention rows stay readable, open employees and preserve unsaved-change protection', async () => {
      const teamContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
      const teamPage = await teamContext.newPage();
      teamPage.on('pageerror', error => errors.push(error.message));
      try {
        await visitWorkspace(teamPage, url + '/#metrics');
        await teamPage.locator('[data-metric-role="cmo"] .table-owner').click();
        await teamPage.getByRole('tab', { name: 'Results', exact: true }).click();
        await expect(teamPage.locator('.team-issue-count')).toHaveText('2');
        await expect(teamPage.locator('.team-issue[data-issue="editor"]')).toContainText('Ethan Miller');
        await expect(teamPage.locator('.team-issue[data-issue="crm"] .team-issue-reasons')).toHaveText('No employee assigned');
        for (const [width, height] of [[1440, 1000], [390, 844]]) {
          await teamPage.setViewportSize({ width, height });
          await teamPage.locator('.editor-content').evaluate(node => { node.scrollTop = node.scrollHeight; });
          assert(await teamPage.locator('#editor').evaluate(node => node.scrollWidth <= node.clientWidth));
          for (const row of await teamPage.locator('.team-issue').all()) {
            const bounds = await row.boundingBox();
            const title = await row.locator('.team-issue-title').boundingBox();
            const badge = await row.locator('.team-issue-reasons').boundingBox();
            assert(badge.x + badge.width <= bounds.x + bounds.width);
            assert(title.x + title.width <= badge.x || title.y + title.height <= badge.y, 'Role and status must not overlap');
          }
          await teamPage.screenshot({ path: path.join(output, `role-team-${width}.png`) });
        }
        await teamPage.setViewportSize({ width: 1440, height: 1000 });
        await fact('3.6', 'kpi', teamPage);
        await teamPage.locator('.team-issue[data-issue="editor"]').click();
        await expect(teamPage.locator('#dialog')).toContainText('Discard unsaved changes?');
        await teamPage.locator('#dialog button[value="cancel"]').click();
        await expect(teamPage.locator('#editor-title')).toHaveText('Chief Marketing Officer');
        await expect(teamPage.locator('[name="kpiCurrent"]')).toHaveValue('3.6');
        await teamPage.locator('.team-issue[data-issue="editor"]').click();
        await teamPage.locator('#confirm-dialog').click();
        await expect(teamPage.locator('#editor-title')).toHaveText('Video Editor');
        await fact('20', 'kpi', teamPage);
        await teamPage.getByRole('button', { name: 'Save', exact: true }).click();
        await teamPage.locator('[data-metric-role="cmo"] .table-owner').click();
        await teamPage.getByRole('tab', { name: 'Results', exact: true }).click();
        await expect(teamPage.locator('.team-issue')).toHaveCount(1);
        await expect(teamPage.locator('.team-issue-count')).toHaveText('1');
        await expect(teamPage.locator('#kpi-fact')).toHaveText('3.8');
        await teamPage.locator('.team-issue[data-issue="crm"]').click();
        await expect(teamPage.locator('#editor-title')).toHaveText('CRM Manager');
        await expect(teamPage.locator('#personal-status')).toHaveText('Vacant');
      } finally { await teamContext.close(); }
    });
    await check('manager picker supports keyboard, touch, dismissal, viewport fitting and saved hierarchy changes', async () => {
      const pickerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, hasTouch: true, reducedMotion: 'reduce' });
      const pickerPage = await pickerContext.newPage();
      pickerPage.on('pageerror', error => errors.push(error.message));
      const trigger = pickerPage.getByRole('combobox', { name: 'Reports to', exact: true });
      const menu = pickerPage.getByRole('listbox', { name: 'Reports to', exact: true });
      const field = pickerPage.locator('[name="managerId"]');
      const openSettings = async () => {
        await pickerPage.locator('[data-metric-role="cmo"] .table-owner').click();
        await pickerPage.getByRole('tab', { name: 'Role', exact: true }).click();
      };
      try {
        await visitWorkspace(pickerPage, url + '/#metrics'); await openSettings();
        for (const [width, height] of [[1440, 1000], [390, 844], [1440, 640]]) {
          await pickerPage.setViewportSize({ width, height });
          await trigger.click();
          await expect(menu).toBeVisible();
          await expect(pickerPage.getByRole('option', { selected: true })).toContainText('Alex Morgan');
          await expect(pickerPage.getByRole('option')).toHaveCount(6);
          const bounds = await menu.boundingBox();
          assert(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height <= height, 'Menu must fit inside the viewport');
          const contentBounds = await pickerPage.locator('.editor-content').boundingBox();
          assert(bounds.y >= contentBounds.y && bounds.y + bounds.height <= contentBounds.y + contentBounds.height, 'Menu must not cover the editor header, tabs or footer');
          if (width === 390) {
            const anchor = await trigger.boundingBox();
            assert(bounds.y + bounds.height < anchor.y, 'Menu must open upwards when space below is limited');
          }
          if (height !== 640) await pickerPage.screenshot({ path: path.join(output, `manager-menu-${width}.png`) });
          await trigger.press('End');
          await expect(trigger).toHaveAttribute('aria-activedescendant', 'manager-option-accountant');
          const last = await pickerPage.locator('#manager-option-accountant').boundingBox();
          assert(last.y >= bounds.y && last.y + last.height <= bounds.y + bounds.height, 'Keyboard navigation must scroll the active option into view');
          await expect(field).toHaveValue('ceo');
          await trigger.press('Escape');
          await expect(menu).toBeHidden();
          await expect(trigger).toHaveAttribute('aria-expanded', 'false');
          await expect(pickerPage.locator('#editor')).toBeVisible();
          await expect(field).toHaveValue('ceo');
        }
        await pickerPage.setViewportSize({ width: 1440, height: 1000 });
        await trigger.click();
        await pickerPage.locator('.editor-footer').click();
        await expect(menu).toBeHidden();
        await trigger.press('ArrowDown'); await trigger.dispatchEvent('keydown', { key: 'p', code: 'KeyP' });
        await expect(trigger).toHaveAttribute('aria-activedescendant', 'manager-option-finance');
        await trigger.press('Home'); await trigger.press('ArrowDown'); await trigger.press('Enter');
        await expect(field).toHaveValue('ops');
        await expect(trigger).toBeFocused();
        await expect(pickerPage.locator('#manager-current')).toHaveText('Head of Operations');
        assert.equal(await pickerPage.evaluate(() => localStorage.getItem('orgboard.forma.v1')), null, 'Selection stays a draft until saved');
        await pickerPage.getByRole('button', { name: 'Save', exact: true }).click();
        await pickerPage.reload(); await openSettings();
        await expect(field).toHaveValue('ops');
        await pickerPage.setViewportSize({ width: 390, height: 844 });
        await trigger.tap();
        await pickerPage.locator('#manager-menu [data-picker-option="ceo"]').tap();
        await expect(menu).toBeHidden();
        await expect(field).toHaveValue('ceo');
        await pickerPage.locator('#close-editor').click();
        await expect(pickerPage.locator('#dialog')).toContainText('Discard unsaved changes?');
        await pickerPage.locator('#confirm-dialog').click();
        await openSettings(); await expect(field).toHaveValue('ops');
      } finally { await pickerContext.close(); }
    });
    await check('shared direction pickers update KPI and goal statuses, preserve drafts and work on mobile', async () => {
      const directionContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, hasTouch: true, reducedMotion: 'reduce' });
      const directionPage = await directionContext.newPage();
      directionPage.on('pageerror', error => errors.push(error.message));
      try {
        await visitWorkspace(directionPage, url + '/#metrics');
        await directionPage.locator('[data-metric-role="editor"] .table-owner').click();
        await directionPage.getByRole('tab', { name: 'Targets', exact: true }).click();
        await expect(directionPage.locator('select')).toHaveCount(0);
        const kpi = directionPage.locator('#kpi-direction-trigger');
        const kr = directionPage.locator('#kr-direction-trigger');
        await kpi.click();
        await expect(directionPage.locator('#kpi-direction-menu [aria-selected="true"]')).toHaveText('Higher');
        await kpi.press('End'); await kpi.press('Escape');
        await expect(directionPage.locator('[name="kpiDirection"]')).toHaveValue('higher');
        await expect(directionPage.locator('#editor')).toBeVisible();
        await kpi.press('ArrowDown'); await kpi.press('End'); await kpi.press('Enter');
        await expect(directionPage.locator('#personal-status')).toHaveText('Target met');
        await directionPage.getByRole('tab', { name: 'Role', exact: true }).click();
        await directionPage.getByRole('tab', { name: 'Targets', exact: true }).click();
        await expect(directionPage.locator('[name="kpiDirection"]')).toHaveValue('lower');
        await directionPage.getByRole('tab', { name: 'Role', exact: true }).click();
        await expect(directionPage.getByRole('textbox', { name: 'What outcome does this role own?', exact: true })).toBeVisible();
        await directionPage.getByRole('tab', { name: 'Targets', exact: true }).click();
        await directionPage.locator('.editor-content').evaluate(node => { node.scrollTop = 0; });
        await directionPage.screenshot({ path: path.join(output, 'goal-fields-1440.png') });
        for (const [width, height] of [[1440, 1000], [390, 844]]) {
          await directionPage.setViewportSize({ width, height });
          await directionPage.locator('#kpi-config').scrollIntoViewIfNeeded();
          assert(await directionPage.locator('#goals-view').evaluate(node => node.scrollWidth <= node.clientWidth), 'Goal fields must not overflow the panel');
          await expect(directionPage.locator('#kpi-config').getByRole('spinbutton', { name: 'Target value', exact: true })).toHaveValue('20');
          const labelBounds = await kpi.locator('.picker-value').boundingBox(), arrowBounds = await kpi.locator('.picker-chevron').boundingBox();
          assert(arrowBounds.x >= labelBounds.x + labelBounds.width, 'The direction chevron must stay to the right of the label and value');
          if (width === 390) await directionPage.screenshot({ path: path.join(output, 'goal-fields-390.png') });
          await kpi.click();
          const bounds = await directionPage.locator('#kpi-direction-menu').boundingBox();
          assert(bounds.width >= 220 && bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y >= 0 && bounds.y + bounds.height <= height);
          await directionPage.screenshot({ path: path.join(output, `goal-direction-${width}.png`) });
          await kpi.press('Escape');
        }
        await directionPage.locator('[name="krTarget"]').fill('6');
        await expect(directionPage.locator('#objective-summary-status')).toHaveText('Below target');
        await kr.tap();
        await directionPage.locator('#kr-direction-menu [data-picker-option="lower"]').tap();
        await expect(directionPage.locator('#objective-summary-status')).toHaveText('Target met');
        await directionPage.locator('[name="hasObjective"]').uncheck();
        await expect(kr).toBeDisabled();
        await directionPage.locator('#add-objective').click();
        await expect(kr).toBeEnabled();
        await directionPage.locator('#objective-fields').scrollIntoViewIfNeeded();
        await directionPage.screenshot({ path: path.join(output, 'goal-objective-fields-390.png') });
        await directionPage.getByRole('button', { name: 'Save', exact: true }).click();
        await directionPage.reload();
        const saved = await directionPage.evaluate(() => JSON.parse(localStorage.getItem('orgboard.forma.v1')).roles.find(role => role.id === 'editor'));
        assert.equal(saved.kpi.direction, 'lower'); assert.equal(saved.objective.result.direction, 'lower');
        await directionPage.locator('[data-metric-role="editor"] .table-owner').click();
        await directionPage.getByRole('tab', { name: 'Targets', exact: true }).click();
        await expect(directionPage.locator('#kpi-direction-current')).toHaveText('Lower');
      } finally { await directionContext.close(); }
    });
    await check('owner and replacement pickers fit small dialogs, dismiss safely and show role identities', async () => {
      const dialogContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
      const dialogPage = await dialogContext.newPage();
      dialogPage.on('pageerror', error => errors.push(error.message));
      try {
        await visitWorkspace(dialogPage, url + '/#goals');
        for (const [width, height] of [[1440, 1000], [390, 844]]) {
          await dialogPage.setViewportSize({ width, height });
          await dialogPage.locator('#add-goal').click();
          const owner = dialogPage.getByRole('combobox', { name: 'Goal owner', exact: true });
          await owner.click();
          await expect(dialogPage.locator('#goal-owner-menu [aria-selected="true"]')).toContainText('Alex Morgan');
          await expect(dialogPage.locator('#goal-owner-menu [data-picker-option="crm"]')).toContainText('Vacant');
          await expect(dialogPage.locator('#goal-owner-menu [data-picker-option="editor"]')).toHaveCount(0);
          const bounds = await dialogPage.locator('#goal-owner-menu').boundingBox();
          assert(bounds.height >= 200 && bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y >= 0 && bounds.y + bounds.height <= height);
          await dialogPage.screenshot({ path: path.join(output, `goal-owner-${width}.png`) });
          await owner.press('End'); await owner.press('Tab');
          await expect(dialogPage.locator('#goal-owner')).toHaveValue('accountant');
          await expect(dialogPage.locator('#goal-owner-menu')).toBeHidden();
          await owner.click(); await owner.press('Escape');
          await expect(dialogPage.locator('#dialog')).toBeVisible();
          await dialogPage.locator('#dialog button[value="cancel"]').click();
          await expect(dialogPage.locator('.picker-menu:popover-open')).toHaveCount(0);
        }
        await dialogPage.setViewportSize({ width: 1440, height: 1000 });
        await dialogPage.locator('.workspace-nav a[href="#metrics"]').click();
        await dialogPage.locator('[data-metric-role="creative"] .table-owner').click();
        await dialogPage.getByRole('tab', { name: 'Role', exact: true }).click();
        await dialogPage.locator('#delete-role').click();
        await dialogPage.getByRole('combobox', { name: 'New manager', exact: true }).click();
        await expect(dialogPage.locator('#replacement-manager-menu [aria-selected="true"]')).toContainText('Sarah Chen');
        for (const id of ['creative', 'strategist', 'editor']) await expect(dialogPage.locator(`#replacement-manager-menu [data-picker-option="${id}"]`)).toHaveCount(0);
        await dialogPage.screenshot({ path: path.join(output, 'replacement-picker.png') });
        await dialogPage.locator('#replacement-manager-menu [data-picker-option="ops"]').click();
        await dialogPage.locator('#dialog button[value="cancel"]').click();
        await expect(dialogPage.locator('#editor')).toBeVisible();
        await expect(dialogPage.locator('[name="managerId"]')).toHaveValue('cmo');
        assert.equal(await dialogPage.evaluate(() => localStorage.getItem('orgboard.forma.v1')), null);
      } finally { await dialogContext.close(); }
    });
    await check('metrics views persist and stay synchronized while Goals contains only additional objectives', async () => {
      const goalsContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
      const goalsPage = await goalsContext.newPage();
      goalsPage.on('pageerror', error => errors.push(error.message));
      const main = goalsPage.locator('[data-goal-role="editor"][data-goal-kind="kpi"]');
      const extra = goalsPage.locator('[data-goal-role="editor"][data-goal-kind="objective"]');
      try {
        await visitWorkspace(goalsPage, url + '/#metrics');
        const cardsButton = goalsPage.getByRole('button', { name: 'Cards', exact: true });
        const tableButton = goalsPage.getByRole('button', { name: 'Table', exact: true });
        await expect(tableButton).toHaveAttribute('aria-pressed', 'true');
        await expect(goalsPage.locator('.metric-table tbody tr')).toHaveCount(13);
        const finance = goalsPage.locator('[data-metric-role="finance"]');
        await expect(finance.locator('.status-badge')).toHaveText('Target met');
        await finance.getByRole('button', { name: 'Goal below target' }).click();
        await expect(goalsPage.locator('[name="objectiveTitle"]')).toHaveValue('Build a 13-week cash forecast');
        await expect(goalsPage.locator('#objective-config')).toBeFocused();
        await goalsPage.locator('#close-editor').click();
        for (const width of [1440, 1024, 961, 960, 901, 872, 851, 390]) {
          await goalsPage.setViewportSize({ width, height: 1000 });
          assert(await goalsPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Table must fit at ${width}px`);
          const tableBounds = await goalsPage.locator('.metric-table').boundingBox();
          const tableWrapBounds = await goalsPage.locator('.metric-table-wrap').boundingBox();
          assert(tableBounds.x + tableBounds.width <= tableWrapBounds.x + tableWrapBounds.width - 4, `Table must stay within its surface at ${width}px`);
          assert(await goalsPage.locator('.table-number').evaluateAll(values => values.every(value => value.getBoundingClientRect().right <= value.closest('td').getBoundingClientRect().right + 1)), `Table numbers must fit their cells at ${width}px`);
          if (width !== 1024) await goalsPage.screenshot({ path: path.join(output, `metrics-table-${width}.png`) });
        }
        await goalsPage.setViewportSize({ width: 1440, height: 1000 });
        await cardsButton.focus(); await cardsButton.press('Enter');
        await expect(cardsButton).toBeFocused();
        await expect(cardsButton).toHaveAttribute('aria-pressed', 'true');
        await expect(tableButton).toHaveAttribute('aria-pressed', 'false');
        await expect(goalsPage.locator('.metric-table')).toHaveCount(0);
        await expect(goalsPage.locator('.company-goal')).toHaveCount(13);
        await expect(goalsPage.locator('[data-goal-kind="objective"]')).toHaveCount(0);
        await expect(main.getByRole('heading', { level: 2 })).toHaveText('Video ads delivered');
        await expect(main.locator('.goal-owner')).toContainText('Ethan Miller');
        await expect(main.locator('.progress-heading strong')).toHaveText('60%');
        await expect(goalsPage.locator('[data-goal-role="crm"] .metric-progress')).toContainText('Waiting for an employee');
        await expect(goalsPage.locator('[data-goal-role="buyer"] .metric-progress')).toContainText('Limit used');
        await expect(goalsPage.locator('[data-goal-role="buyer"] .progress-heading strong')).toHaveText('84%');
        await goalsPage.reload();
        await expect(cardsButton).toHaveAttribute('aria-pressed', 'true');
        await expect(main.locator('.progress-heading strong')).toHaveText('60%');
        await goalsPage.screenshot({ path: path.join(output, 'metrics-cards-1440.png') });
        await goalsPage.locator('.workspace-nav a[href="#goals"]').click();
        await expect(goalsPage.locator('.company-goal')).toHaveCount(demoGoalCount);
        await expect(goalsPage.locator('[data-goal-kind="kpi"], .view-switch')).toHaveCount(0);
        await expect(extra.getByRole('heading', { level: 2 })).toHaveText('Build a repeatable editing workflow');
        await expect(extra.locator('.goal-owner')).toContainText('Ethan Miller');
        await expect(extra.locator('.progress-heading strong')).toHaveText('100%');
        await goalsPage.screenshot({ path: path.join(output, 'additional-goals-1440.png') });
        await goalsPage.locator('.workspace-nav a[href="#metrics"]').click();
        await expect(cardsButton).toHaveAttribute('aria-pressed', 'true');
        for (const width of [1024, 872, 390]) {
          await goalsPage.setViewportSize({ width, height: 844 });
          await goalsPage.evaluate(() => window.scrollTo(0, 0));
          assert(await goalsPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
          const valuesStayTogether = await goalsPage.locator('.company-goal .metric-pair strong').evaluateAll(values => values.every(value => value.getBoundingClientRect().height < parseFloat(getComputedStyle(value).lineHeight) * 1.5));
          assert(valuesStayTogether, `Metric values must remain on one line at ${width}px`);
          assert(await goalsPage.locator('.goal-open').evaluateAll(buttons => buttons.every(button => {
            const bounds = button.getBoundingClientRect(), card = button.closest('article').getBoundingClientRect();
            return bounds.height >= 44 && bounds.left >= card.left && bounds.right <= card.right;
          })), `Plan actions must remain usable inside their cards at ${width}px`);
          if (width !== 1024) await goalsPage.screenshot({ path: path.join(output, `metrics-cards-${width}.png`) });
        }
        for (const { card, section, kind, progress } of [{ card: main, section: 'metrics', kind: 'kpi', progress: '75%' }, { card: extra, section: 'goals', kind: 'objective', progress: '50%' }]) {
          await goalsPage.locator(`.workspace-nav a[href="#${section}"]`).click();
          await card.locator('.goal-open').click();
          await expect(goalsPage.locator(`#${kind}-config`)).toBeFocused();
          await expect(goalsPage.locator(`#${kind}-config`)).toBeInViewport();
          await goalsPage.locator(`[name="${kind === 'kpi' ? 'kpiTarget' : 'krTarget'}"]`).fill(kind === 'kpi' ? '16' : '8');
          await goalsPage.getByRole('button', { name: 'Save', exact: true }).click();
          await expect(card.locator('.goal-open')).toBeFocused();
          await expect(card.locator('.progress-heading strong')).toHaveText(progress);
          await goalsPage.reload();
          await expect(card.locator('.progress-heading strong')).toHaveText(progress);
        }
        await goalsPage.locator('.workspace-nav a[href="#metrics"]').click();
        await expect(main.locator('.progress-heading strong')).toHaveText('75%');
        await tableButton.click();
        await expect(tableButton).toBeFocused();
        await expect(goalsPage.locator('[data-metric-role="editor"] .table-target')).toContainText('16');
        await goalsPage.locator('[data-metric-role="editor"] .table-value').click();
        await fact('16', 'kpi', goalsPage);
        await goalsPage.getByRole('button', { name: 'Save', exact: true }).click();
        await cardsButton.click();
        await expect(main.locator('.status-badge')).toHaveText('Target met');
        await expect(main.locator('.progress-heading strong')).toHaveText('100%');
        await tableButton.click();
        await goalsPage.reload();
        await expect(tableButton).toHaveAttribute('aria-pressed', 'true');
        await expect(goalsPage.locator('[data-metric-role="editor"] .table-value')).toContainText('16');
        await goalsPage.locator('.workspace-nav a[href="#goals"]').click();
        await expect(goalsPage.locator('[data-goal-kind="kpi"]')).toHaveCount(0);
        await expect(extra.locator('.status-badge')).toHaveText('Below target');
        await expect(extra.locator('.progress-heading strong')).toHaveText('50%');
      } finally { await goalsContext.close(); }
    });
    await check('visible employee assignment and result actions work on desktop and mobile and survive refresh', async () => {
      for (const width of [1440, 390]) {
        const assignmentContext = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
        const assignmentPage = await assignmentContext.newPage();
        assignmentPage.on('pageerror', error => errors.push(error.message));
        try {
          await visitWorkspace(assignmentPage, url);
          await assignmentPage.locator('[data-team="cmo"]').click();
          await assignmentPage.locator('[data-role-id="crm"]').click();
          await expect(assignmentPage.locator('#editor-person')).toHaveText('Vacant');
          await assignmentPage.getByRole('button', { name: 'Assign employee', exact: true }).click();
          const employee = assignmentPage.getByRole('textbox', { name: 'Employee', exact: true });
          await expect(employee).toBeFocused();
          await employee.fill('Anna Ivanova');
          await assignmentPage.getByRole('button', { name: 'Save', exact: true }).click();
          await expect(assignmentPage.locator('[data-role-id="crm"]')).toContainText('Anna Ivanova');
          await assignmentPage.reload();
          await assignmentPage.locator('[data-team="cmo"]').click();
          await assignmentPage.locator('[data-role-id="crm"]').click();
          await expect(assignmentPage.locator('#editor-person')).toHaveText('Anna Ivanova');
          await assignmentPage.getByRole('button', { name: 'Change employee', exact: true }).click();
          await expect(employee).toBeFocused();
          await employee.fill('Maria Petrova');
          await assignmentPage.getByRole('button', { name: 'Save', exact: true }).click();
          await assignmentPage.locator('[data-role-id="editor"]').click();
          const editFact = assignmentPage.getByRole('button', { name: 'Update KPI actual', exact: true });
          await expect(editFact).toHaveText('12');
          await expect(editFact.locator('.edit-value-icon')).toBeVisible();
          await assignmentPage.screenshot({ path: path.join(output, `acceptance-result-${width}.png`) });
          await fact('20', 'kpi', assignmentPage);
          await assignmentPage.getByRole('button', { name: 'Save', exact: true }).click();
          await expect(assignmentPage.locator('[data-role-id="cmo"]')).toHaveAttribute('data-tone', 'neutral');
          await assignmentPage.reload();
          const saved = await assignmentPage.evaluate(() => JSON.parse(localStorage.getItem('orgboard.forma.v1')).roles);
          assert.equal(saved.find(role => role.id === 'crm').employee, 'Maria Petrova');
          assert.equal(saved.find(role => role.id === 'editor').kpi.current, 20);
        } finally { await assignmentContext.close(); }
      }
    });
    await check('incomplete numeric input cannot erase results; hidden errors are revealed and decimal values save', async () => {
      const numericContext = await browser.newContext({ locale: 'en-US', reducedMotion: 'reduce' });
      const numericPage = await numericContext.newPage();
      numericPage.on('pageerror', error => errors.push(error.message));
      try {
        await visitWorkspace(numericPage, url);
        await numericPage.locator('[data-role-id="cmo"]').click();
        for (const invalidValue of ['-', '1e']) {
          await fact('', 'kpi', numericPage);
          const current = numericPage.locator('[name="kpiCurrent"]');
          await current.pressSequentially(invalidValue);
          assert(await current.evaluate(field => field.validity.badInput));
          const before = await numericPage.evaluate(() => localStorage.getItem('orgboard.forma.v1'));
          await numericPage.getByRole('button', { name: 'Save', exact: true }).click();
          await expect(numericPage.locator('#editor')).toBeVisible();
          await expect(numericPage.locator('#form-error')).toContainText('Metric values must be zero or greater');
          await expect(current).toBeFocused();
          assert.equal(await numericPage.evaluate(() => localStorage.getItem('orgboard.forma.v1')), before);
        }
        await fact('', 'kpi', numericPage);
        await numericPage.locator('[name="kpiCurrent"]').pressSequentially('3.5');
        await numericPage.getByRole('button', { name: 'Save', exact: true }).click();
        assert.equal(await numericPage.evaluate(() => JSON.parse(localStorage.getItem('orgboard.forma.v1')).roles.find(role => role.id === 'cmo').kpi.current), 3.5);
        await numericPage.locator('[data-team="cmo"]').click();
        await numericPage.locator('[data-role-id="editor"]').click();
        await numericPage.getByRole('tab', { name: 'Targets', exact: true }).click();
        const target = numericPage.locator('[name="krTarget"]');
        await target.fill(''); await target.pressSequentially('-');
        await numericPage.getByRole('tab', { name: 'Results', exact: true }).click();
        await numericPage.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(numericPage.locator('#tab-goals')).toHaveAttribute('aria-selected', 'true');
        await expect(target).toBeFocused();
        await expect(numericPage.locator('#form-error')).toContainText('Metric values must be zero or greater');
        await numericPage.locator('[name="hasObjective"]').uncheck();
        await numericPage.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(numericPage.locator('#editor')).not.toBeVisible();
        assert.equal(await numericPage.evaluate(() => JSON.parse(localStorage.getItem('orgboard.forma.v1')).roles.find(role => role.id === 'editor').objective), null);
      } finally { await numericContext.close(); }
    });
    await check('card and goal results are directly editable; missing metric names and whitespace errors are explained', async () => {
      const reviewContext = await browser.newContext({ reducedMotion: 'reduce' });
      const reviewPage = await reviewContext.newPage();
      reviewPage.on('pageerror', error => errors.push(error.message));
      try {
        await visitWorkspace(reviewPage, url + '/#metrics');
        await reviewPage.getByRole('button', { name: 'Cards', exact: true }).click();
        await reviewPage.locator('[data-goal-role="editor"] .fact-value').click();
        await expect(reviewPage.locator('[name="kpiCurrent"]')).toBeFocused();
        await reviewPage.locator('[name="kpiCurrent"]').fill('20');
        await reviewPage.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(reviewPage.locator('[data-goal-role="editor"] .status-badge')).toHaveText('Target met');
        await reviewPage.locator('.workspace-nav a[href="#goals"]').click();
        await reviewPage.locator('[data-goal-role="editor"] .fact-value').click();
        await expect(reviewPage.locator('[name="krCurrent"]')).toBeFocused();
        const inputBounds = await reviewPage.locator('[name="krCurrent"]').boundingBox();
        const contentBounds = await reviewPage.locator('.editor-content').boundingBox();
        assert(inputBounds.y >= contentBounds.y && inputBounds.y + inputBounds.height <= contentBounds.y + contentBounds.height);
        assert.equal(await reviewPage.locator('#editor').evaluate(dialog => dialog.scrollTop), 0, 'Revealing an input must not move the dialog header or save button');
        await reviewPage.locator('[name="krCurrent"]').fill('2');
        await reviewPage.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(reviewPage.locator('[data-goal-role="editor"] .status-badge')).toHaveText('Below target');
        await reviewPage.locator('[data-goal-role="editor"] .goal-open').click();
        await reviewPage.getByRole('tab', { name: 'Results', exact: true }).click();
        await reviewPage.locator('[data-start-edit="kr"]').click();
        await expect(reviewPage.locator('[name="krCurrent"]')).toBeFocused();
        await reviewPage.getByRole('tab', { name: 'Targets', exact: true }).click();
        await reviewPage.locator('[name="kpiName"]').fill('');
        await reviewPage.getByRole('tab', { name: 'Results', exact: true }).click();
        await expect(reviewPage.locator('#kpi-progress .progress-empty')).toHaveText('Add metric name');
        await expect(reviewPage.locator('#kpi-fact')).toHaveText('20');
        await expect(reviewPage.locator('#kpi-plan')).toHaveText('20');
        await reviewPage.getByRole('tab', { name: 'Targets', exact: true }).click();
        await reviewPage.locator('[name="kpiName"]').fill('Video ads delivered');
        await reviewPage.getByRole('tab', { name: 'Role', exact: true }).click();
        await reviewPage.locator('[name="title"]').fill('   ');
        await reviewPage.getByRole('tab', { name: 'Results', exact: true }).click();
        await reviewPage.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(reviewPage.locator('#tab-role')).toHaveAttribute('aria-selected', 'true');
        await expect(reviewPage.locator('[name="title"]')).toBeFocused();
        await reviewPage.locator('[name="title"]').fill('Video Editor');
        await expect(reviewPage.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
        await reviewPage.locator('#close-editor').click();
        await reviewPage.reload();
        await expect(reviewPage.locator('[data-goal-role="editor"] .status-badge')).toHaveText('Below target');
      } finally { await reviewContext.close(); }
    });
    await check('team column opens its branch and attention cards start a role-scoped conversation', async () => {
      const teamContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
      const teamSeed = seedRoles(); teamSeed.find(role => role.id === 'support').kpi.current = null;
      await teamContext.addInitScript(roles => localStorage.setItem('orgboard.forma.v1', JSON.stringify({ version: 1, roles })), teamSeed);
      const teamPage = await teamContext.newPage();
      teamPage.on('pageerror', error => errors.push(error.message));
      try {
        await visitWorkspace(teamPage, url + '/#metrics');
        await expect(teamPage.getByRole('columnheader', { name: 'Team', exact: true })).toBeVisible();
        await expect(teamPage.locator('.team-risk')).toHaveCount(0);
        await expect(teamPage.locator('[data-metric-role="cmo"] .table-status')).toHaveText('Target met');
        await expect(teamPage.locator('[data-metric-role="cmo"] .team-link')).toHaveText('Review team');
        await expect(teamPage.locator('[data-metric-role="strategist"] .team-link')).toHaveCount(0);
        const before = await teamPage.evaluate(() => localStorage.getItem('orgboard.forma.v1'));
        await teamPage.locator('[data-open-team="cmo"]').click();
        await expect(teamPage).toHaveURL(/#structure$/);
        await expect(teamPage.locator('#chart-path [aria-current]')).toHaveText('Chief Marketing Officer');
        await expect(teamPage.locator('.role-card')).toHaveCount(7);
        await teamPage.goBack();
        await expect(teamPage).toHaveURL(/#metrics$/);
        await teamPage.locator('[data-open-team="ops"]').click();
        await expect(teamPage.locator('#chart-path [aria-current]')).toHaveText('Head of Operations');
        await expect(teamPage.locator('.role-card')).toHaveCount(3);
        await teamPage.locator('.attention-menu summary').click();
        await expect(teamPage.locator('.attention-card')).toHaveCount(1);
        await expect(teamPage.locator('.attention-card')).toContainText('Customer Experience Lead');
        await teamPage.locator('#chart-back').click();
        for (const width of [1440, 887, 390]) {
          await teamPage.setViewportSize({ width, height: 1000 });
          await teamPage.locator('.attention-menu summary').click();
          const menu = teamPage.locator('.attention-menu > div');
          await expect(menu.locator('.attention-card')).toHaveCount(4);
          await expect(menu.locator('[data-discuss-role="editor"]')).toContainText('12 of 20');
          await expect(menu.locator('[data-discuss-role="finance"]')).toContainText('8 of 13');
          await expect(menu.locator('[data-status="missing"]')).toContainText('actual');
          await expect(menu.locator('[data-status="vacant"]')).toContainText('No employee assigned');
          const backgrounds = await menu.locator('.attention-card').evaluateAll(cards => cards.map(card => getComputedStyle(card).backgroundImage));
          assert.equal(new Set(backgrounds).size, 3);
          const bounds = await menu.boundingBox();
          assert(bounds.x >= 0 && bounds.x + bounds.width <= width);
          await teamPage.screenshot({ path: path.join(output, `attention-cards-${width}.png`) });
          await menu.locator('[data-discuss-role="support"]').click();
          await expect(teamPage).toHaveURL(/#assistant$/);
          await expect(teamPage.locator('#assistant-prompt')).toBeFocused();
          await expect(teamPage.locator('#subject-label')).toContainText('Customer Experience Lead');
          await teamPage.locator('#open-subject').click();
          await expect(teamPage.locator('#editor-title')).toHaveText('Customer Experience Lead');
          await teamPage.locator('#close-editor').click();
          await teamPage.getByRole('link', { name: 'Structure', exact: true }).click();
        }
        assert.equal(await teamPage.evaluate(() => localStorage.getItem('orgboard.forma.v1')), before);
      } finally { await teamContext.close(); }
    });
    await check('first-use review: KPI labels, team context, new-role defaults and explicit department transfer', async () => {
      const auditContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
      const auditSeed = seedRoles();
      auditSeed.find(role => role.id === 'editor').kpi.current = 22;
      auditSeed.find(role => role.id === 'editor').objective.result.current = 2;
      await auditContext.addInitScript(roles => {
        if (!localStorage.getItem('orgboard.forma.v1')) localStorage.setItem('orgboard.forma.v1', JSON.stringify({ version: 1, roles }));
      }, auditSeed);
      const auditPage = await auditContext.newPage();
      auditPage.on('pageerror', error => errors.push(error.message));
      try {
        await visitWorkspace(auditPage, url + '/#metrics');
        await expect(auditPage.getByRole('columnheader', { name: 'KPI status', exact: true })).toBeVisible();
        await expect(auditPage.locator('[data-metric-role="editor"] .table-status .status-badge')).toHaveText('Target met');
        await expect(auditPage.locator('[data-metric-role="editor"] .goal-alert')).toHaveText(/Goal below target/);
        await expect(auditPage.locator('[data-open-team="cmo"]')).toHaveAttribute('data-status', 'below');
        await auditPage.getByRole('link', { name: 'Structure', exact: true }).click();
        await auditPage.locator('[data-role-id="ceo"]').click();
        for (const width of [1440, 390]) {
          await auditPage.setViewportSize({ width, height: 900 });
          const hint = await auditPage.locator('#show-team-issues').boundingBox();
          const content = await auditPage.locator('.editor-content').boundingBox();
          assert(hint.y >= content.y && hint.y + hint.height <= content.y + content.height);
          await auditPage.locator('#show-team-issues').click();
          await expect(auditPage.locator('[data-issue="editor"]')).toBeFocused();
          await auditPage.locator('#tab-role').click();
          await auditPage.locator('#tab-result').click();
        }
        await auditPage.screenshot({ path: path.join(output, 'live-review-team-context-390.png') });
        await auditPage.locator('#close-editor').click();
        await auditPage.setViewportSize({ width: 1440, height: 1000 });
        await auditPage.locator('.open-team[data-team="ops"]').click();
        await expect(auditPage.locator('.attention-menu')).toHaveCount(0);
        await expect(auditPage.locator('.calm-note')).toHaveText('All clear');
        await auditPage.locator('#add-role').click();
        await expect(auditPage.locator('[name="managerId"]')).toHaveValue('ops');
        await expect(auditPage.locator('[name="department"]')).toHaveValue('Operations');
        await auditPage.locator('[name="title"]').fill('Operations Analyst');
        await auditPage.locator('[name="employee"]').fill('Vera Smirnova');
        await auditPage.getByRole('button', { name: 'Add', exact: true }).click();
        await expect(auditPage.locator('#chart-path [aria-current]')).toHaveText('Head of Operations');
        await auditPage.getByRole('button', { name: /^Open role: Operations Analyst/ }).click();
        await auditPage.locator('#tab-role').click();
        await auditPage.locator('#manager-trigger').click();
        await auditPage.locator('#manager-menu [data-picker-option="cmo"]').click();
        await expect(auditPage.locator('#department-hint')).toContainText('Marketing');
        await expect(auditPage.locator('[name="department"]')).toHaveValue('Operations');
        await auditPage.locator('#use-manager-department').click();
        await expect(auditPage.locator('[name="department"]')).toHaveValue('Marketing');
        await expect(auditPage.locator('#department-hint')).toBeHidden();
        await auditPage.getByRole('button', { name: 'Save', exact: true }).click();
        await auditPage.reload();
        const saved = await auditPage.evaluate(() => JSON.parse(localStorage.getItem('orgboard.forma.v1')).roles.find(role => role.title === 'Operations Analyst'));
        assert.equal(saved.managerId, 'cmo'); assert.equal(saved.department, 'Marketing'); assert.equal(saved.employee, 'Vera Smirnova');
      } finally { await auditContext.close(); }
    });
    await check('performance cards expose team health, open plans across the surface and retain independent actions', async () => {
      const cardsContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
      const cardSeed = seedRoles();
      cardSeed.find(role => role.id === 'support').kpi.current = null;
      await cardsContext.addInitScript(roles => {
        if (!localStorage.getItem('orgboard.forma.v1')) localStorage.setItem('orgboard.forma.v1', JSON.stringify({ version: 1, roles }));
      }, cardSeed);
      const cardsPage = await cardsContext.newPage();
      cardsPage.on('pageerror', error => errors.push(error.message));
      try {
        await visitWorkspace(cardsPage, url + '/#metrics');
        await cardsPage.getByRole('button', { name: 'Cards', exact: true }).click();
        const card = id => cardsPage.locator(`[data-goal-role="${id}"]`);
        for (const [id, status] of [['cmo', 'below'], ['growth', 'vacant'], ['ops', 'missing'], ['finance', 'met']]) {
          await expect(card(id).locator('.team-link')).toHaveAttribute('data-status', status);
          await expect(card(id)).toHaveAttribute('data-team-status', status);
          await expect(card(id).locator('.status-badge')).toHaveText('Target met');
        }
        await expect(card('editor').locator('.goal-team')).toHaveCount(0);
        for (const width of [1440, 1024, 872, 390]) {
          await cardsPage.setViewportSize({ width, height: 1000 });
          await cardsPage.evaluate(() => window.scrollTo(0, 0));
          assert(await cardsPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
          assert(await cardsPage.locator('.goal-team .team-link').evaluateAll(buttons => buttons.every(button => {
            const bounds = button.getBoundingClientRect(), card = button.closest('article').getBoundingClientRect();
            return Math.round(bounds.width) >= 176 && bounds.height >= 44 && bounds.left >= card.left && bounds.right <= card.right;
          })));
          await cardsPage.screenshot({ path: path.join(output, `team-plan-cards-${width}.png`) });
          await card('ceo').click({ position: { x: 16, y: 16 } });
          await expect(cardsPage.locator('#editor-title')).toHaveText('Founder & CEO');
          await expect(cardsPage.locator('#tab-goals')).toHaveAttribute('aria-selected', 'true');
          await expect(cardsPage.locator('#kpi-config')).toBeFocused();
          await cardsPage.locator('#close-editor').click();
          await expect(card('ceo').locator('.goal-open')).toBeFocused();
        }
        await card('ceo').locator('.goal-open').press('Enter');
        await expect(cardsPage.locator('#tab-goals')).toHaveAttribute('aria-selected', 'true');
        await cardsPage.locator('#close-editor').click();
        await card('ceo').locator('.fact-value').click();
        await expect(cardsPage.locator('[name="kpiCurrent"]')).toBeFocused();
        await expect(cardsPage.locator('[name="kpiCurrent"]')).toHaveValue('2000000');
        await cardsPage.locator('#close-editor').click();
        await card('cmo').locator('.team-link').click();
        await expect(cardsPage.locator('#editor')).not.toBeVisible();
        await expect(cardsPage.locator('#chart-path [aria-current]')).toHaveText('Chief Marketing Officer');
        await cardsPage.getByRole('link', { name: 'Goals', exact: true }).click();
        await expect(cardsPage.locator('.company-goal')).toHaveCount(demoGoalCount);
        await expect(cardsPage.locator('.company-goal h2')).toHaveText(['Build a 13-week cash forecast', 'Build a repeatable editing workflow']);
        await expect(card('finance')).toHaveAttribute('data-status', 'below');
        await expect(card('editor')).toHaveAttribute('data-status', 'met');
        await card('finance').click({ position: { x: 16, y: 16 } });
        await expect(cardsPage.locator('#objective-config')).toBeFocused();
        await cardsPage.locator('#close-editor').click();
        await cardsPage.reload();
        await expect(cardsPage.locator('.company-goal')).toHaveCount(demoGoalCount);
        await cardsPage.setViewportSize({ width: 1440, height: 1000 });
        await cardsPage.screenshot({ path: path.join(output, 'growth-demo-goals.png'), fullPage: true });
      } finally { await cardsContext.close(); }
    });
    await check('saving an inline goal result requires one click even when the field loses focus', async () => {
      const saveContext = await browser.newContext({ viewport: { width: 872, height: 884 } });
      const savePage = await saveContext.newPage();
      savePage.on('pageerror', error => errors.push(error.message));
      try {
        await visitWorkspace(savePage, url + '/#goals');
        await savePage.locator('[data-goal-role="finance"] .fact-value').click();
        await savePage.locator('[name="krCurrent"]').fill('7');
        await savePage.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(savePage.locator('#editor')).not.toBeVisible();
        await savePage.reload();
        await expect(savePage.locator('[data-goal-role="finance"] .fact-value strong')).toHaveText('7');
      } finally { await saveContext.close(); }
    });
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(output, 'browser-results.json'), JSON.stringify({ passed: results, errors }, null, 2));
    console.log(`${results.length} browser scenarios passed; no uncaught browser errors.`);
  } catch (error) {
    console.error('Original failure:', error);
    await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true, timeout: 5000 }).catch(() => {});
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
