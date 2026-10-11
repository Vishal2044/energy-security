import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toggleLanguage, translateText, translateValue } from '../../client/src/locales/runtime.js';

test('language presentation never mutates canonical status identifiers', () => {
  assert.equal(translateValue('MANUAL_REVIEW', 'gu'), 'મેન્યુઅલ સમીક્ષા');
  assert.equal(translateValue('MANUAL_REVIEW', 'en'), 'Manual review');
  assert.equal(translateValue('SHIFT_START', 'gu'), 'શિફ્ટ શરૂ');
  assert.equal(toggleLanguage('en'), 'gu');
  assert.equal(toggleLanguage('gu'), 'en');
});

test('shared UI text has a safe original-language fallback', () => {
  assert.equal(translateText('No guards found', 'gu'), 'કોઈ ગાર્ડ મળ્યો નથી');
  assert.equal(translateText('Supervisor custom note', 'gu'), 'Supervisor custom note');
  assert.equal(translateText('No guards found', 'en'), 'No guards found');
});
