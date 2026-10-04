import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { findDuplicateSlugs, parsePortfolioYml } from '../src/lib/portfolio-yml.mjs';
import { parseReadme, SECTIONS } from '../src/lib/readme.mjs';

const projectsDir = new URL('./fixtures/projects/', import.meta.url);
const slugs = readdirSync(projectsDir);
const read = (slug, file) => readFileSync(new URL(`${slug}/${file}`, projectsDir), 'utf8');

test('there are two fixture projects', () => {
  assert.equal(slugs.length, 2);
});

for (const slug of slugs) {
  test(`fixture project "${slug}" is valid and only warns about TODOs`, () => {
    const source = `fixture/${slug}`;
    const yml = parsePortfolioYml(read(slug, 'portfolio.yml'), { source });
    const readme = parseReadme(read(slug, 'README.md'), { source });

    assert.deepEqual(yml.errors, []);
    assert.equal(yml.data.slug, slug);
    assert.equal(readme.hasMarkers, true);
    for (const { key, required } of SECTIONS) {
      if (required) assert.ok(readme.sections[key], `missing ${key}`);
    }
    for (const warning of [...yml.warnings, ...readme.warnings]) assert.match(warning, /TODO/);
  });
}

test('fixture slugs are unique', () => {
  const projects = slugs.map((slug) => ({
    source: slug,
    slug: parsePortfolioYml(read(slug, 'portfolio.yml'), { source: slug }).data.slug,
  }));
  assert.deepEqual(findDuplicateSlugs(projects), []);
});
