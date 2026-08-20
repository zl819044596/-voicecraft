import { protagonistFromOut } from './src/pipeline/style-context.js';

const probe = 'here: has_protagonist: true, description: "x"';
const res = protagonistFromOut(probe);

// Duplicate the module's internal steps with debug
const jsonStr = (() => {
  const start = probe.indexOf('{');
  if (start < 0) return null;
  return probe.slice(start);
})();
console.log('extractOuterJson-start:', JSON.stringify(jsonStr));

const hasRe = /"?has_protagonist"?\s*:\s*true/.test(probe);
console.log('hasRe:', hasRe);

const m = probe.match(/"?"description"?\s*:\s*"((?:[^"\\]|\\.)*)"/);
console.log('desc match:', JSON.stringify(m && m[1]));

const viaJsonParse = (() => {
  if (m && m[1].trim()) {
    try {
      return JSON.parse(`"${m[1]}"`);
    } catch {
      return m[1].replace(/\\"/g, '"');
    }
  }
  return null;
})();
console.log('parsed desc:', JSON.stringify(viaJsonParse));

console.log('protagonistFromOut result:', JSON.stringify(res));
