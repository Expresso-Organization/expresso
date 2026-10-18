import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {portfolioProjects,portfolioFixtureNames} from './renderer/componentry-portfolio-data.mjs';
import {componentryFixtures} from './renderer/componentry-fixtures.mjs';

test('포트폴리오 예제에 독립적인 가상 프로젝트와 로컬 화면을 제공한다',()=>{
  assert.equal(portfolioProjects.length,3);
  assert.equal(new Set(portfolioProjects.map(project=>project.title)).size,3);
  for(const project of portfolioProjects){
    assert.match(project.category,/가상 프로젝트/);
    assert.ok(project.description.length>=45);
    assert.match(project.image,/^\.\/assets\/portfolio-[a-z-]+\.svg$/);
    assert.ok(existsSync(fileURLToPath(new URL('../../docs/library/previews/componentry/'+project.image.slice(2),import.meta.url))));
    assert.match(project.imageAlt,/가상 프로젝트/);
  }
  for(const name of portfolioFixtureNames){
    const fixture=componentryFixtures[name];
    assert.ok(fixture,name);
    assert.ok(portfolioProjects.some(project=>fixture.includes(project.title)||fixture.includes(project.image)),name);
  }
  const source=readFileSync(new URL('./renderer/componentry-portfolio-data.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/42%|@|https?:\/\//);
});
