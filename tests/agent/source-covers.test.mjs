import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import { parse } from 'yaml';
import { oakSiteOpenGraph, oakSiteOpenGraphPreview, oakSourceCoverFor, oakSourceCoverMap, oakWorkOpenGraph } from '../../src/lib/oakSourceCovers.ts';
import { legacyFramerCaseStudies } from '../../src/data/legacyWork.ts';
import { careerTimelineItems } from '../../src/data/careerTimeline.ts';
import { media } from '../../src/data/homePage.ts';
import snapshot from '../../src/data/generated/knowledgeSnapshot.json' with { type: 'json' };

// R11: real inputs, so the test proves the sources the agent actually cites.
const workDir = new URL('../../src/content/work/', import.meta.url);
const work = readdirSync(workDir).filter(name => name.endsWith('.mdx')).map(name => ({
  ...parse(readFileSync(new URL(name, workDir), 'utf8').split(/^---$/m)[1]), slug: name.replace(/\.mdx$/, ''),
}));
const optimized = readFileSync(new URL('../../src/data/generated/optimizedImages.ts', import.meta.url), 'utf8');
const smallest = src => optimized.includes(`"${src}": {`) ? `${src}#small` : undefined;
const roles = careerTimelineItems.map(item => ({ id: item.id, image: item.media.webpSrcSet.split(',')[0].trim().split(/\s+/)[0] }));
const covers = oakSourceCoverMap({ work, legacy: legacyFramerCaseStudies, roles, smallest });
const resolve = url => oakSourceCoverFor(url, covers);
const avatarOrFavicon = /favicon|oak-icon|oak-profile|welcome|avatar|portrait|brand-icons|apple-touch/i;

test('the home and profile source wears the site Open Graph cover, the same one BaseLayout publishes', () => {
  assert.equal(oakSiteOpenGraph, media.openGraph);
  assert.equal(oakSiteOpenGraphPreview, media.sitePreview);
  assert.ok(readFileSync(new URL('../../src/layouts/BaseLayout.astro', import.meta.url), 'utf8').includes('ogImage = media.openGraph'));
  for (const url of ['https://steveoak.com/', 'https://steveoak.com', 'https://steveoak.com/about/', 'https://steveoak.com/posts/']) {
    assert.deepEqual(resolve(url), { ogImage: '/assets/brand/steve-oak-open-graph.png', cover: '/assets/brand/steve-oak-open-graph.webp' }, url);
  }
});

test('a case study source wears its own og:image', () => {
  assert.equal(resolve('https://steveoak.com/work/agentic-brain/').ogImage, '/assets/work/agentic-brain/agentic-brain-cover.png');
  assert.equal(resolve('https://steveoak.com/work/ecosmartloop/').ogImage, '/assets/work/ecosmartloop/ecosmartloop-cover-og.png');
  // The -og crop has no generated variant, so the face uses the card's small WebP of the same artwork.
  assert.equal(resolve('https://steveoak.com/work/ecosmartloop/').cover, '/assets/work/ecosmartloop/ecosmartloop-cover.png#small');
  for (const study of work) assert.equal(resolve(`https://steveoak.com/work/${study.slug}/`).ogImage, oakWorkOpenGraph(study), study.slug);
  assert.equal(resolve('https://steveoak.com/apps/kusala-daily/support/').ogImage, '/assets/apps/kusala-daily/social-preview.png');
  const oaklabs = roles.find(role => role.id === 'oaklabs');
  assert.equal(resolve('https://steveoak.com/work#oaklabs').cover, oaklabs.image);
});

test('no cited source wears an avatar or favicon, and other hosts without a known cover show none', () => {
  for (const { canonicalUrl } of snapshot.documents) {
    const cover = resolve(canonicalUrl);
    if (new URL(canonicalUrl).hostname === 'steveoak.com') assert.ok(cover, canonicalUrl);
    if (!cover) continue;
    assert.doesNotMatch(cover.ogImage, avatarOrFavicon, canonicalUrl);
    assert.doesNotMatch(cover.cover, avatarOrFavicon, canonicalUrl);
    assert.ok(existsSync(new URL(`../../public${cover.ogImage}`, import.meta.url)), cover.ogImage);
  }
  for (const url of ['https://www.coursera.org/account/accomplishments/professional-cert/UJEHHCJ3AKXK', 'https://steveoak.com.evil.test/', 'not a url']) {
    assert.equal(resolve(url), undefined, url);
  }
});
