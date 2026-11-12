import { readdirSync, readFileSync } from 'node:fs';
import { takeTheLightLesson } from './take-the-light.mjs';

export const defaultLessonId = 'demo-classroom';
// Increment when the set of published bundles used in the combined classroom changes.
const classroomVersion = '1.0.0';
const collections = [
  ['one-surface', '沿着纸带'],
  ['live-stages', '改写现场'],
  ['interaction-atlas', '可操作的课'],
];

export const demoBundles = new Map();
export const demoLessons = [];
const currentCollections = [];

function loadDemoBundle(key) {
  const directory = new URL(`./public/demos/${key}/`, import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', directory), 'utf8'));
  if (!Array.isArray(manifest)) throw new Error(`${key}/manifest.json must contain an array`);
  const steps = manifest.map(({ id, title, description, prompt, hash, options }) => {
    if (typeof hash !== 'string' || !/^(?:#[a-z][a-z0-9-]*)?$/.test(hash)) {
      throw new Error(`Invalid demo link in ${key}/${id}`);
    }
    return {
      id,
      type: 'activity',
      title,
      module: 'demo@1',
      config: { body: description, prompt, options, demoUrl: `/demos/${key}/index.html?classroom=1${hash}` },
    };
  });
  demoBundles.set(key, directory);
  return steps;
}

for (const [id, title] of collections) {
  const collection = new URL(`./public/demos/${id}/`, import.meta.url);
  const releases = readdirSync(collection, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^v[1-9][0-9]{0,2}$/.test(entry.name))
    .map(entry => entry.name)
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  if (!releases.length) throw new Error(`No published demos in ${id}`);
  for (const release of releases) {
    const steps = loadDemoBundle(`${id}/${release}`);
    const lesson = { id, version: `${release.slice(1)}.0.0`, title, steps };
    demoLessons.push(lesson);
    if (release === releases.at(-1)) currentCollections.push(lesson);
  }
}

demoLessons.push({
  id: defaultLessonId,
  version: classroomVersion,
  title: '课堂互动作品',
  steps: currentCollections.flatMap(({ id, steps }) => steps.map(step => ({ ...step, id: `${id}-${step.id}` }))),
});

const editLede = loadDemoBundle('take-the-light/v1').find(({ id }) => id === 'edit-lede');
if (!editLede) throw new Error('The take-the-light/v1 bundle must define the edit-lede activity');
demoLessons.push(takeTheLightLesson(editLede));
