// Brouille le code JavaScript livré au navigateur (rend la copie et la réutilisation du code très difficiles).
// Usage : node obfuscate.mjs entree.js sortie.js
import fs from 'node:fs';
import JavaScriptObfuscator from 'javascript-obfuscator';
const [, , src, dst] = process.argv;
const code = fs.readFileSync(src, 'utf8');
const out = JavaScriptObfuscator.obfuscate(code, {
  compact: true, target: 'browser', renameGlobals: false, identifierNamesGenerator: 'hexadecimal',
  stringArray: true, stringArrayEncoding: ['base64'], stringArrayThreshold: 0.8, stringArrayRotate: true, stringArrayShuffle: true,
  splitStrings: false, controlFlowFlattening: false, deadCodeInjection: false, selfDefending: false,
  transformObjectKeys: false, unicodeEscapeSequence: false, numbersToExpressions: false, simplify: true,
});
fs.writeFileSync(dst, '/* RM Paie — © RM Expertise. Reproduction, extraction et réutilisation interdites (voir conditions générales). */\n' + out.getObfuscatedCode());
