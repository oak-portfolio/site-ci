import { mergeConfig } from 'astro/config';
import base from '../../astro.config.mjs';
import { parityRoot } from './release-boundary.mjs';

export default mergeConfig(base, { cacheDir: `${parityRoot}/caches/check/astro`,
  vite: { cacheDir: `${parityRoot}/caches/check/vite` } });
