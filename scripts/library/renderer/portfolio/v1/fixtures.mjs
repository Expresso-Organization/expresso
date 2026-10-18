import {fixture as originalFixture,scenarios} from '../fixtures.mjs';
import {sceneDemos} from './showcase-fixtures.mjs';
export {scenarios};
export function fixture(scenario='standard'){
  const data=originalFixture(scenario);
  // 가상 루멘 노트와 같은 내용을 가진 확장 사례에 과정 참조를 부여합니다. 문장을 새로 만들지 않습니다.
  data.projects=data.projects.map(p=>{
    const kind=p.tags.includes('Information Architecture')?'network':p.tags.includes('Accessibility')?'wayfinding':'map';
    return {...p,process:p.tags.includes('Information Architecture')?['problem','contribution','outcome']:[],showcase:{kind,...structuredClone(sceneDemos[kind])}};
  });
  return data;
}
