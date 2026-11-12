import assert from 'node:assert/strict';
import test from 'node:test';
import { getLesson, listLessons, summarizeAnswers, validateAnswer, validateLesson, viewStep } from './lessons.mjs';

test('the default classroom includes all 21 original demo routes', () => {
  const entries = listLessons();
  assert.equal(entries[0].id, 'demo-classroom');
  const combined = getLesson();
  const suites = ['one-surface', 'live-stages', 'interaction-atlas'];
  assert.deepEqual(new Set(entries.slice(1).map(({ id }) => id)), new Set(suites));
  const routes = new Set();
  for (const id of suites) {
    const lesson = getLesson(id, '1.0.0');
    assert.deepEqual(validateLesson(lesson), lesson);
    for (const step of lesson.steps) {
      assert.equal(step.module, 'demo@1');
      assert.ok(step.config.demoUrl.startsWith(`/demos/${id}/v1/`));
      assert.ok(!routes.has(step.config.demoUrl));
      routes.add(step.config.demoUrl);
    }
  }
  assert.equal(routes.size, 21);
  assert.deepEqual(new Set(combined.steps.map(step => step.config.demoUrl)), routes);
  combined.steps.length = 0;
  assert.equal(getLesson().steps.length, 21);
  assert.equal(getLesson('one-surface', '999.0.0'), null);
});

test('lesson validation checks versioned demo paths and outcome IDs', () => {
  const lesson = getLesson('one-surface');
  const config = lesson.steps[0].config;
  const validUrl = config.demoUrl;
  for (const badUrl of ['https://example.invalid/demo', '//example.invalid/demo', '/demos/one-surface/latest/index.html?classroom=1']) {
    config.demoUrl = badUrl;
    assert.throws(() => validateLesson(lesson), /must name a versioned classroom demo/);
  }
  config.demoUrl = validUrl;
  config.options[1].id = config.options[0].id;
  assert.throws(() => validateLesson(lesson), /options\[1\]\.id is duplicated/);
});

test('host-only notes stay out of the public demo views', () => {
  const step = getLesson('one-surface').steps[0];
  step.teacher = { note: 'Private facilitator note' };
  assert.equal(viewStep(step, { role: 'host', phase: 'open' }).teacher.note, step.teacher.note);
  for (const role of ['student', 'screen']) {
    for (const phase of ['preview', 'open', 'locked', 'aborted', 'revealed']) {
      const view = viewStep(step, { role, phase });
      assert.equal(view.config.demoUrl, step.config.demoUrl);
      assert.ok(!Object.hasOwn(view, 'teacher'));
    }
  }
});

test('summary uses the pinned outcome order and includes zero-count outcomes', () => {
  const step = getLesson('one-surface').steps[0];
  assert.equal(validateAnswer(step, 'single-ring'), 'single-ring');
  assert.throws(() => validateAnswer(step, 'glass-air'), { status: 400, code: 'INVALID_ANSWER' });
  assert.throws(() => validateAnswer(step, { id: 'single-ring' }), { code: 'INVALID_ANSWER' });
  assert.deepEqual(summarizeAnswers(step, ['single-ring', 'single-ring']), {
    count: 2,
    choices: step.config.options.map(option => ({ ...option, count: option.id === 'single-ring' ? 2 : 0 })),
  });
  assert.equal(summarizeAnswers(step, []).count, 0);
});
