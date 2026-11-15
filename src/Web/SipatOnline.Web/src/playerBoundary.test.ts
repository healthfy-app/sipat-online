import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = process.cwd();
const packageRoot = resolve(appRoot, '..', 'SipatVideoPlayer');

function sourceFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((entry) => {
    if (entry === 'node_modules' || entry === 'dist') return [];
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}

function importsOf(path: string): string[] {
  const text = readFileSync(path, 'utf8');
  const found: string[] = [];
  for (const match of text.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)) found.push(match[1]);
  return found;
}

describe('player package boundary', () => {
  it('keeps the player package free of app imports', () => {
    expect(existsSync(packageRoot)).toBe(true);
    const files = [...sourceFiles(join(packageRoot, 'src')), ...sourceFiles(join(packageRoot, 'playground'))];
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      for (const specifier of importsOf(file)) {
        expect(specifier.startsWith('@/'), `${file} imports ${specifier}`).toBe(false);
        expect(specifier.includes('SipatOnline.Web'), `${file} imports ${specifier}`).toBe(false);
        if (specifier.startsWith('.')) {
          const target = resolve(dirname(file), specifier);
          expect(target === packageRoot || target.startsWith(packageRoot + sep), `${file} imports ${specifier}`).toBe(true);
        }
      }
    }
  });

  it('keeps the player core free of React and Media Chrome', () => {
    const files = sourceFiles(join(packageRoot, 'src', 'core'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      for (const specifier of importsOf(file)) {
        expect(['react', 'react-dom', 'media-chrome', 'lucide-react'].some((name) => specifier === name || specifier.startsWith(`${name}/`)), `${file} imports ${specifier}`).toBe(false);
        expect(specifier.includes('../react'), `${file} imports ${specifier}`).toBe(false);
      }
    }
  });

  it('uses the player only through its package entry', () => {
    for (const file of sourceFiles(join(appRoot, 'src'))) {
      for (const specifier of importsOf(file)) {
        expect(specifier.startsWith('@sipat/video-player/'), `${file} imports ${specifier}`).toBe(false);
        expect(specifier.includes('SipatVideoPlayer'), `${file} imports ${specifier}`).toBe(false);
      }
    }
  });
});
