// Builds .design-sync/compiled.css = brand @font-face rules + compiled Tailwind v4.
//
// Two things this handles that a bare `tailwindcss -i app/globals.css` does not:
//  1. Tailwind v4 skips dot-directories during source detection, so the classes
//     used only in .design-sync/previews/*.tsx would be missing. An explicit
//     @source pulls them in.
//  2. The brand @font-face rules are prepended - the DS ships the fonts that
//     app/layout.tsx otherwise loads at runtime via next/font/google.
//
// Re-run this after authoring or editing any preview, then rebuild the bundle.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const CACHE = '.design-sync/.cache';
mkdirSync(CACHE, { recursive: true });

const ENTRY = `${CACHE}/tw-entry.css`;
writeFileSync(
  ENTRY,
  // Both @imports must precede @source - a CSS @import after another at-rule
  // is invalid and Tailwind then only partly applies the safelist.
  '@import "../../app/globals.css";\n' +
    '@import "../safelist.css";\n' +
    '@source "../previews/**/*.tsx";\n',
);

const TW = `${CACHE}/tailwind.css`;
execFileSync('npx', ['--yes', '@tailwindcss/cli@4', '-i', ENTRY, '-o', TW], {
  stdio: 'inherit',
  shell: true,
});

writeFileSync(
  '.design-sync/compiled.css',
  readFileSync('.design-sync/font-face.css', 'utf8') + '\n' + readFileSync(TW, 'utf8'),
);
console.log('wrote .design-sync/compiled.css');
