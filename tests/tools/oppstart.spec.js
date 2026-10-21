import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { sjekk3D } from '../helpers/oppstart.js';

// Kontrollene i den felles oppstarten (docs/specs/testoppstart.md, AK12) som ikke kan nås gjennom appen.

test('sjekk3D feiler når terrenget mangler etter start med med3D: true', () => {
  expect(() => sjekk3D(false)).toThrow(/med3D: true.*map\.getTerrain\(\) er tom/s);
  expect(() => sjekk3D(true)).not.toThrow();
});

test('startLocal bruker sjekk3D når med3D er på', () => {
  expect(readFileSync('tests/helpers/oppstart.js', 'utf8')).toMatch(/if \(tre\) return sjekk3D\(await page\.evaluate\(\(\) => !!map\.getTerrain\(\)\)\);/);
});
