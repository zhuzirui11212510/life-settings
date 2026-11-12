import assert from 'node:assert/strict';
import test from 'node:test';
import { getLesson, listLessons, summarizeAnswers, validateAnswer, validateLesson, viewStep } from './lessons.mjs';

test('the catalog exposes bundled lesson versions and protects the published configs', () => {
  const entries = listLessons();
  assert.equal(entries[0].id, getLesson().id);
  assert.ok(entries.some(({ id }) => id === 'reading-2-workshop'));
  for (const { id, title, version } of entries) {
    const lesson = getLesson(id, version);
    assert.equal(lesson.title, title);
    assert.deepEqual(validateLesson(lesson), lesson);
  }
  const copy = getLesson();
  copy.steps.length = 0;
  assert.ok(getLesson().steps.length > 0);
  assert.equal(getLesson('reading-2', '999.0.0'), null);
});

test('lesson validation checks pinned modules, option IDs, and earlier result sources', () => {
  const wrongModule = getLesson();
  wrongModule.steps[1].module = 'framing@2';
  assert.throws(() => validateLesson(wrongModule), /module is not supported/);

  const duplicateOption = getLesson();
  duplicateOption.steps[1].config.options[1].id = 'care';
  assert.throws(() => validateLesson(duplicateOption), /options\[1\]\.id is duplicated/);

  const lateSource = getLesson();
  lateSource.steps[2].sourceStepId = 'exit-ticket';
  assert.throws(() => validateLesson(lateSource), /earlier activity/);

  const missingArtifact = getLesson();
  delete missingArtifact.steps[1].config.options[0].artifact;
  assert.throws(() => validateLesson(missingArtifact), /artifact must be an object/);
});

test('teacher-only content and early answers stay out of public step views', () => {
  const lesson = getLesson();
  const ticket = lesson.steps.find(({ id }) => id === 'exit-ticket');
  assert.equal(viewStep(ticket, { role: 'host', phase: 'open' }).teacher.correctOptionId, 'reviews');
  for (const role of ['student', 'screen']) {
    for (const phase of ['preview', 'open', 'locked', 'aborted']) {
      const view = viewStep(ticket, { role, phase });
      assert.ok(!Object.hasOwn(view, 'teacher'));
      assert.ok(!Object.hasOwn(view, 'answer'));
    }
    const revealed = viewStep(ticket, { role, phase: 'revealed' });
    assert.deepEqual(revealed.answer, {
      correctOptionId: 'reviews',
      explanation: ticket.teacher.explanation,
    });
    assert.ok(!Object.hasOwn(revealed, 'teacher'));
  }
  ticket.config.correctOptionId = 'reviews';
  assert.throws(() => validateLesson(lesson), /config\.correctOptionId is not supported/);
});

test('summary uses the pinned option order and includes unselected options', () => {
  const step = getLesson().steps.find(({ id }) => id === 'book-review');
  assert.equal(validateAnswer(step, 'care'), 'care');
  assert.throws(() => validateAnswer(step, 'reviews'), { status: 400, code: 'INVALID_ANSWER' });
  assert.throws(() => validateAnswer(step, { id: 'care' }), { code: 'INVALID_ANSWER' });
  assert.deepEqual(summarizeAnswers(step, ['action', 'action']), {
    count: 2,
    choices: [
      { id: 'care', label: 'Family care', count: 0 },
      { id: 'action', label: 'Public action', count: 2 },
    ],
  });
  assert.equal(summarizeAnswers(step, []).count, 0);
});
