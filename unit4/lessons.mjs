import { defaultLessonId, demoLessons } from './demo-catalog.mjs';

export { defaultLessonId };

// These identifiers are part of saved rooms. Keep old module versions readable.
const activityModules = new Set(['framing@1', 'choice@1', 'demo@1']);
const identifier = /^[a-z][a-z0-9-]{0,39}$/;
const versionPattern = /^(0|[1-9][0-9]{0,2})\.(0|[1-9][0-9]{0,2})\.(0|[1-9][0-9]{0,2})$/;

function checkFields(value, allowed, path) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${path} must be an object`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new TypeError(`${path}.${key} is not supported`);
  }
}

function checkText(value, path, maxLength = 400) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new TypeError(`${path} must be non-empty text up to ${maxLength} characters`);
  }
}

function checkOptionalText(record, key, path, maxLength) {
  if (Object.hasOwn(record, key)) checkText(record[key], `${path}.${key}`, maxLength);
}

function checkId(value, path) {
  if (typeof value !== 'string' || !identifier.test(value)) {
    throw new TypeError(`${path} must be a lowercase identifier`);
  }
}

function validateOptions(step, path) {
  const { body, prompt, options } = step.config;
  checkText(body, `${path}.body`, 1600);
  checkText(prompt, `${path}.prompt`);
  const minOptions = step.module === 'demo@1' ? 1 : 2;
  if (!Array.isArray(options) || options.length < minOptions || options.length > 8) {
    throw new TypeError(`${path}.options must have between ${minOptions} and 8 choices`);
  }
  const framing = step.module === 'framing@1';
  const optionIds = new Set();
  for (const [index, option] of options.entries()) {
    const optionPath = `${path}.options[${index}]`;
    checkFields(option, framing ? ['id', 'label', 'artifact'] : ['id', 'label'], optionPath);
    checkId(option.id, `${optionPath}.id`);
    if (optionIds.has(option.id)) throw new TypeError(`${optionPath}.id is duplicated`);
    optionIds.add(option.id);
    checkText(option.label, `${optionPath}.label`);
    if (framing) {
      const artifactPath = `${optionPath}.artifact`;
      checkFields(option.artifact, ['title', 'body'], artifactPath);
      checkText(option.artifact.title, `${artifactPath}.title`, 160);
      checkText(option.artifact.body, `${artifactPath}.body`, 800);
    }
  }
  return optionIds;
}

export function validateLesson(lesson) {
  checkFields(lesson, ['id', 'version', 'title', 'steps'], 'lesson');
  checkId(lesson.id, 'lesson.id');
  if (typeof lesson.version !== 'string' || !versionPattern.test(lesson.version)) {
    throw new TypeError('lesson.version must be a numeric major.minor.patch version');
  }
  checkText(lesson.title, 'lesson.title', 100);
  if (!Array.isArray(lesson.steps) || lesson.steps.length < 1 || lesson.steps.length > 30) {
    throw new TypeError('lesson.steps must have between 1 and 30 steps');
  }

  const priorSteps = new Map();
  for (const [index, step] of lesson.steps.entries()) {
    const path = `lesson.steps[${index}]`;
    const fields = ['id', 'type', 'title', 'config', 'teacher'];
    if (step?.type === 'activity') fields.push('module');
    if (step?.type === 'discussion') fields.push('sourceStepId', 'fallback');
    checkFields(step, fields, path);
    checkId(step.id, `${path}.id`);
    if (priorSteps.has(step.id)) throw new TypeError(`${path}.id is duplicated`);
    checkText(step.title, `${path}.title`, 100);

    const configPath = `${path}.config`;
    let optionIds;
    switch (step.type) {
      case 'briefing':
        checkFields(step.config, ['body', 'prompt'], configPath);
        checkText(step.config.body, `${configPath}.body`, 1600);
        checkOptionalText(step.config, 'prompt', configPath);
        break;
      case 'activity':
        if (!activityModules.has(step.module)) throw new TypeError(`${path}.module is not supported`);
        if (step.module === 'demo@1') {
          checkFields(step.config, ['body', 'prompt', 'options', 'demoUrl'], configPath);
          if (typeof step.config.demoUrl !== 'string' || !/^\/demos\/[a-z0-9-]+\/v[1-9][0-9]*\/index\.html\?classroom=1(?:#[a-z][a-z0-9-]*)?$/.test(step.config.demoUrl)) {
            throw new TypeError(`${configPath}.demoUrl must name a versioned classroom demo`);
          }
        } else {
          checkFields(step.config, ['body', 'prompt', 'options'], configPath);
        }
        optionIds = validateOptions(step, configPath);
        break;
      case 'discussion':
        checkFields(step.config, ['body', 'prompt'], configPath);
        checkOptionalText(step.config, 'body', configPath, 1600);
        checkText(step.config.prompt, `${configPath}.prompt`);
        checkId(step.sourceStepId, `${path}.sourceStepId`);
        if (priorSteps.get(step.sourceStepId) !== 'activity') {
          throw new TypeError(`${path}.sourceStepId must name an earlier activity`);
        }
        checkText(step.fallback, `${path}.fallback`);
        break;
      default:
        throw new TypeError(`${path}.type is not supported`);
    }
    if (Object.hasOwn(step, 'teacher')) {
      const teacherPath = `${path}.teacher`;
      const fields = optionIds ? ['note', 'correctOptionId', 'explanation'] : ['note'];
      checkFields(step.teacher, fields, teacherPath);
      checkOptionalText(step.teacher, 'note', teacherPath, 800);
      checkOptionalText(step.teacher, 'explanation', teacherPath, 800);
      if (Object.hasOwn(step.teacher, 'correctOptionId') && !optionIds?.has(step.teacher.correctOptionId)) {
        throw new TypeError(`${teacherPath}.correctOptionId must name one of the choices`);
      }
    }
    priorSteps.set(step.id, step.type);
  }
  return lesson;
}

export function viewStep(step, { role, phase }) {
  const { id, type, title, config, teacher } = step;
  const view = { id, type, title, config: {} };
  if (config.body !== undefined) view.config.body = config.body;
  if (config.prompt !== undefined) view.config.prompt = config.prompt;
  if (type === 'activity') {
    view.module = step.module;
    if (step.module === 'demo@1') view.config.demoUrl = config.demoUrl;
    view.config.options = config.options.map(({ id, label, artifact }) => {
      if (step.module === 'framing@1') {
        return { id, label, artifact: { title: artifact.title, body: artifact.body } };
      }
      return { id, label };
    });
  }
  if (type === 'discussion') {
    view.sourceStepId = step.sourceStepId;
    view.fallback = step.fallback;
  }
  if (role === 'host' && teacher) {
    view.teacher = { note: teacher.note, correctOptionId: teacher.correctOptionId, explanation: teacher.explanation };
  } else if (type === 'activity' && phase === 'revealed' && (teacher?.correctOptionId || teacher?.explanation)) {
    view.answer = { correctOptionId: teacher.correctOptionId, explanation: teacher.explanation };
  }
  return view;
}

export function validateAnswer(step, value) {
  if (step.type === 'activity' && step.config.options.some(({ id }) => id === value)) return value;
  throw Object.assign(new Error('提交结果与本轮活动不匹配。'), { status: 400, code: 'INVALID_ANSWER' });
}

export function summarizeAnswers(step, values) {
  const counts = new Map(step.config.options.map(({ id }) => [id, 0]));
  let count = 0;
  for (const value of values) {
    if (!counts.has(value)) throw new TypeError('Saved answer does not match the pinned activity');
    counts.set(value, counts.get(value) + 1);
    count++;
  }
  return {
    count,
    choices: step.config.options.map(({ id, label }) => ({ id, label, count: counts.get(id) })),
  };
}

function versionNumber(version) {
  return version.split('.').reduce((number, part) => number * 1000 + Number(part), 0);
}

const lessons = new Map();
const latest = new Map();
for (const lesson of demoLessons) {
  const key = `${lesson.id}@${lesson.version}`;
  try {
    validateLesson(lesson);
    if (lessons.has(key)) throw new TypeError(`Duplicate lesson version ${key}`);
    lessons.set(key, lesson);
    const existing = latest.get(lesson.id);
    if (!existing || versionNumber(lesson.version) > versionNumber(existing.version)) latest.set(lesson.id, lesson);
  } catch (error) {
    throw new Error(`Invalid classroom collection ${key}: ${error.message}`, { cause: error });
  }
}

export function getLesson(id = defaultLessonId, version) {
  if (typeof id !== 'string' || (version !== undefined && typeof version !== 'string')) return null;
  const lesson = version === undefined ? latest.get(id) : lessons.get(`${id}@${version}`);
  return lesson ? structuredClone(lesson) : null;
}

export function listLessons() {
  return Array.from(latest.values())
    .sort((a, b) => Number(b.id === defaultLessonId) - Number(a.id === defaultLessonId) || a.id.localeCompare(b.id))
    .map(({ id, version, title }) => ({ id, version, title }));
}
