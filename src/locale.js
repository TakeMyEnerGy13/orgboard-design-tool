import { DEMO_GOALS_VERSION, seedRoles } from './domain.js';

export const statusText = { met: 'Target met', below: 'Below target', missing: 'Missing data', vacant: 'Vacant' };
export const metricStatusText = (status, metric) => status === 'below' && metric.direction === 'lower' ? 'Over limit' : statusText[status];
const decimals = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const singular = { days: 'day', weeks: 'week', videos: 'video', ads: 'ad', partners: 'partner', templates: 'template', concepts: 'concept', customers: 'customer' };
export function measure(value, unit = '') {
  if (!Number.isFinite(value)) return '—';
  const n = decimals.format(value);
  if (unit === '$') return '$' + n;
  if (unit === '%' || unit === '×') return n + unit;
  return unit ? n + ' ' + (value === 1 ? singular[unit] || unit : unit) : n;
}
export const unitLabel = unit => unit ? ' (' + (unit === '$' ? 'USD' : unit) + ')' : '';
export function issueText(issue) {
  if (issue.status === 'vacant') return 'No employee assigned';
  const metric = issue.metric;
  const title = issue.title || metric.name;
  const label = (issue.source === 'kpi' ? 'KPI' : 'Goal') + (title ? ` “${title}”` : '');
  if (issue.status === 'missing') {
    const fields = [!metric.name?.trim() && 'metric name', !Number.isFinite(metric.current) && 'actual', !Number.isFinite(metric.target) && 'target'].filter(Boolean);
    return `${label}: missing ${fields.join(', ')}`;
  }
  return metric.direction === 'lower'
    ? `${label}: ${measure(metric.current, metric.unit)} (limit: ${measure(metric.target, metric.unit)})`
    : `${label}: ${measure(metric.current, ['$', '%', '×'].includes(metric.unit) ? metric.unit : '')} of ${measure(metric.target, metric.unit)}`;
}
// Historical Russian defaults are kept solely to migrate existing browser saves.
const departments = { Leadership: 'Руководство', Marketing: 'Маркетинг', Operations: 'Операции', Finance: 'Финансы' };
const demo = {
  ceo: ['Основатель', 'Алекс Морган', 'Развивать прибыльную компанию, которая работает без постоянного участия основателя.', 'Выручка за месяц', '$'],
  cmo: ['Директор по маркетингу', 'Сара Чен', 'Обеспечивать прибыльный рост за счёт рекламы и сильных креативов.', 'Окупаемость рекламы', '×'],
  ops: ['Операционный директор', 'Джеймс Уилсон', 'Доставлять заказы вовремя без вмешательства основателя.', 'Заказы в срок', '%'],
  finance: ['Финансовый директор', 'Прия Шах', 'Сохранять прибыльность и обеспечивать точность финансовых данных.', 'Маржинальность', '%'],
  creative: ['Руководитель креатива', 'Оливия Брукс', 'Стабильно выпускать эффективные рекламные материалы.', 'Успешные объявления', 'шт.'],
  growth: ['Руководитель роста', 'Дэниел Ким', 'Привлекать новых покупателей и увеличивать их долгосрочную ценность.', 'Новые покупатели', 'чел.'],
  strategist: ['Креативный стратег', 'Миа Родригес', 'Готовить рекламные концепции на основе потребностей покупателей.', 'Одобренные концепции', 'шт.'],
  editor: ['Видеомонтажёр', 'Итан Миллер', 'Выпускать готовые рекламные ролики для запуска кампаний.', 'Готовые видеоролики', 'шт.'],
  buyer: ['Специалист по рекламе', 'Ноа Дэвис', 'Увеличивать продажи, удерживая стоимость привлечения в пределах плана.', 'Стоимость привлечения', '$'],
  crm: ['Менеджер по удержанию', '', 'Возвращать покупателей с помощью персональных предложений и рассылок.', 'Повторные покупки', '%'],
  supply: ['Менеджер по поставкам', 'Лукас Мартин', 'Поддерживать наличие популярных товаров без избыточных запасов.', 'Наличие товаров', '%'],
  support: ['Руководитель поддержки', 'Эмма Тейлор', 'Быстро решать вопросы покупателей и повышать качество обслуживания.', 'Довольные покупатели', '%'],
  accountant: ['Бухгалтер', 'Ава Патель', 'Вовремя готовить точную отчётность для принятия решений.', 'Закрытие месяца', 'дн.'],
};
const demoObjectives = {
  ceo: ['Освободить время основателя для роста', 'Время на операционные задачи', 'ч./нед.'],
  ops: ['Подготовить склад к росту заказов', 'Заказы в срок на нагрузочном тесте', 'заказов/день'],
  finance: ['Составить прогноз движения денег на 13 недель', 'Недель с готовым прогнозом', 'нед.'],
  supply: ['Найти запасных поставщиков для хитов продаж', 'Хиты продаж с запасным поставщиком', 'шт.'],
  support: ['Передать поддержке согласование возвратов', 'Доля возвратов без участия основателя', '%'],
  growth: ['Подготовить сценарии повторных покупок', 'Сценарии удержания, готовые к запуску', 'шт.'],
  editor: ['Упростить подготовку роликов', 'Готовые шаблоны монтажа', 'шт.'],
};

// Exact defaults from older saves, used only to retire unchanged sample objectives.
const previousGoal = (title, name, current, target, unit, direction = 'higher') => ({ title, result: { name, current, target, unit, direction } });
const retiredObjectives = {
  ceo: previousGoal('Free founder time for growth', 'Weekly time spent on operations', 8, 10, 'hours/week', 'lower'),
  ops: previousGoal('Prepare fulfillment for higher order volume', 'Daily orders fulfilled on time in a load test', 1600, 1500, 'orders/day'),
  growth: previousGoal('Prepare lifecycle campaigns for repeat purchases', 'Lifecycle campaigns ready to launch', 4, 4, 'campaigns'),
  supply: previousGoal('Find backup suppliers for bestsellers', 'Bestsellers with a backup supplier', 6, 6, 'products'),
  support: previousGoal('Let support approve routine returns', 'Returns approved without the founder', 92, 90, '%'),
};

// Translate only untouched sample text. Keep user edits, measurements and relationships.
export function localizeDemo(roles, { demoGoalsVersion = DEMO_GOALS_VERSION } = {}) {
  const originals = seedRoles();
  return roles.map(role => {
    const original = originals.find(r => r.id === role.id), copy = structuredClone(role);
    if (!original) return copy;
    const [title, employee, outcome, metric, unit] = demo[role.id];
    for (const [field, translated] of Object.entries({ title, employee, outcome })) {
      if (copy[field] === translated) copy[field] = original[field];
    }
    if (copy.department === departments[original.department]) copy.department = original.department;
    if (copy.kpi.name === metric) copy.kpi.name = original.kpi.name;
    if (copy.kpi.unit === unit) copy.kpi.unit = original.kpi.unit;
    if (demoGoalsVersion === 0 && role.id === 'finance' && !copy.objective && copy.title === original.title && copy.employee === original.employee) {
      copy.objective = structuredClone(original.objective);
    }
    const retired = demoGoalsVersion < DEMO_GOALS_VERSION && retiredObjectives[role.id];
    const sample = original.objective || retired;
    if (copy.objective && sample) {
      const [objectiveTitle, resultName, resultUnit] = demoObjectives[role.id];
      const result = copy.objective.result;
      if (copy.objective.title === objectiveTitle) copy.objective.title = sample.title;
      if (result.name === resultName) result.name = sample.result.name;
      if (result.unit === resultUnit) result.unit = sample.result.unit;
      if (retired && copy.objective.title === retired.title && result.name === retired.result.name && result.unit === retired.result.unit &&
          result.current === retired.result.current && result.target === retired.result.target && result.direction === retired.result.direction) {
        copy.objective = null;
      }
    }
    return copy;
  });
}

export const errorText = error => error?.message || 'Could not save your changes. Check the fields and try again.';
