# 포트폴리오 사이트 유형 조사

2026-10-21 조사. 구조화 생성 결과가 "웹사이트가 아니라 문서로 보인다"는 평가에서 출발했습니다. 사용자 한 명의 취향이 아니라 실제로 쓰이는 짜임새를 근거로, Expresso가 대응해야 할 포트폴리오 유형을 정하는 것이 목적입니다. 관련 문서: [구조화 생성 파이프라인의 구조적 결함](./portfolio-structured-pipeline-gaps.md).

## 방법

- **표본**: [mejed-alkoutaini/designer-portfolios](https://github.com/mejed-alkoutaini/designer-portfolios)(`master` README)의 주소 114개. 제출 양식 링크 1개는 뺐습니다.
- **캡처**: headless Chrome, 1440×900, 불러온 뒤 3.5초 대기. 첫 화면 · 전체 화면(최대 8,000px)을 찍고 같은 페이지에서 특징을 쟀습니다. 캡처 화면은 다른 사람의 저작물이라 저장소에 올리지 않았습니다.
- **측정 항목**
  - 첫 화면 최대 글자 크기(px): 화면에 보이는 글자 중 가장 큰 `font-size`
  - 첫 화면 글자 수: 화면에 보이는 글자 노드의 글자 수
  - 이미지 링크 카드: 이미지가 든 폭 150px 이상의 링크 수(작업 썸네일의 대리 지표)
  - 전체 글자 수: 본문 전체 글자 수
  - 어두운 배경: 배경 휘도 0.35 미만
- **분류**: 첫 화면을 보고 사람이 유형을 정했고, 측정값으로 유형이 갈리는지 검산했습니다. 분류는 판단이 들어간 결과입니다.
- **제외**: 101곳이 열렸고, 그중 20곳은 도메인 주차 · 404 · 다른 사이트 안내 · 로딩 화면에 멈춤으로 분석에서 뺐습니다. 13곳은 열리지 않았습니다(도메인 소멸 7, 시간 초과 4, 응답 오류 2).

## 유형

| 유형 | 수 | 첫 화면 최대 글자 중앙값 | 첫 화면 글자 수 중앙값 | 이미지 링크 카드 중앙값 | 어두운 배경 비율 | 대표 |
|---|---|---|---|---|---|---|
| A. 거대 타이포 포스터 | 16 | 163px | 196 | 4 | 0.56 | [Wodniack](https://wodniack.dev) · [Colin Moy](https://colin-moy.webflow.io) · [Celia Hazard](https://www.celiahazard.com) · [Niccolò Miranda](https://www.niccolomiranda.com) |
| B. 작업물 격자 | 13 | 36px | 431 | 10 | 0.00 | [Jason Fonseca](https://www.jasonfonseca.com) · [Nick Buzz](https://baked.design) · [Isaac Blankensmith](https://isaacblankensmith.com) |
| C. 인물 사진 중심 | 11 | 80px | 376 | 2 | 0.55 | [Fons Mans](https://fonsmans.com) · [Dennis Snellenberg](https://dennissnellenberg.com) · [Jan Losert](https://www.janlosert.com) |
| D. 3D · 일러스트 · 인터랙티브 | 13 | 60px | 154 | 5 | 0.31 | [Sam Small](https://samsmall.design) · [Sebastien Lempens](https://www.sebastien-lempens.com) · [mousey](https://www.mousey.design) |
| E. 글 · 목록 미니멀 | 18 | 34px | 576 | 0 | 0.28 | [Dan Eden](https://daneden.me) · [Hanson Wu](https://www.hansonwu.com) · [Matt Szyszko](https://shysh.co) |
| F. 제품 랜딩 | 10 | 58px | 310 | 5.5 | 0.10 | [Matt Clark](https://www.narrow.land/matt-clark) · [Kinexa](https://www.kinexa.agency) · [Dmitry Sergushkin](https://www.dmitrysergushkin.com) |

- **A**는 이름이나 역할, 선언문 한 줄을 화면 폭에 가깝게 키우고 색면이나 무늬를 깝니다. 글자가 적고(196자) 가장 큰 글자가 가장 큽니다(163px).
- **B**는 첫 화면부터 작업 썸네일과 목업이 화면을 채웁니다. 이미지 링크 카드가 가장 많고(10) 어두운 배경이 없습니다.
- **C**는 인물 사진 한 장이 첫 화면의 중심이고 이름이 겹쳐 놓입니다.
- **D**는 3D 장면, 일러스트, 움직이는 그래픽이 첫 화면입니다. 대부분 JavaScript로 그립니다.
- **E**는 큰 소개 문장과 연도별 목록으로 짭니다. 글자가 가장 많고(576자) 이미지 카드가 없습니다.
- **F**는 서비스 랜딩처럼 헤드라인 · 행동 버튼 · 수치 · 고객 로고를 둡니다. 전체 글자 수가 가장 많습니다(중앙값 2,803자).

Behance 검색(“graphic design portfolio”) 상위 프로젝트는 웹사이트가 아니라 16:9 슬라이드 이미지 묶음이었습니다. 확인한 1위 프로젝트는 이미지 66장(1401×788), 글 모듈 0개였습니다. 모든 장이 그래픽으로 편집돼 있습니다(오려 낸 인물 사진, 모눈 · 종이 질감, 큰 글자, 로고 격자). Behance는 headless 캡처를 막아 같은 측정은 하지 못했습니다.

## Expresso에 대한 의미

지금 디자인 시스템 38종은 색 · 글꼴 · 간격과 세 가지 배치만 바꾸고, 페이지 짜임새는 하나입니다(첫 화면 → 목차 → 사례 문단과 항목표 → 경력 → 근거 → 연락). 레퍼런스의 차이는 짜임새에서 나옵니다. 그래서 **유형(짜임새)과 디자인 시스템(색 · 글꼴 · 간격)을 두 축으로 나누는 것**을 제안합니다. 유형 6개 × 디자인 38종을 사용자가 조합합니다.

유형마다 필요한 자료와 지금 만들 수 있는지가 다릅니다.

| 유형 | 필요한 자료 | 지금 가능한가 | 필요한 것 |
|---|---|---|---|
| A. 거대 타이포 포스터 | 이름 · 역할 · 한 줄 | 가능 | 화면 폭에 맞춘 이름 글자, 색면 · 무늬 배경(토큰), 선언문, 글자 띠 |
| E. 글 · 목록 미니멀 | 소개 문장 · 경력 · 프로젝트 목록 | 가능(지금 키트와 가장 가까움) | 큰 소개 문장, 연도별 목록, 본문 글꼴 위계 |
| F. 제품 랜딩 | 핵심 수치 · 한 줄 가치 | 수치 추출이 있으면 가능 | 수치 강조 줄, 행동 버튼, 단계 흐름(#97 3·5단계) |
| C. 인물 사진 중심 | 인물 사진 1장 | 사진 업로드가 필요 | 사진 위 이름 배치, 사진 자르기 규칙 |
| B. 작업물 격자 | 작업 이미지 여러 장 | 이미지 확보 경로가 필요 | 썸네일 격자, 프로젝트 링크 캡처, 타이포그래피 커버 |
| D. 3D · 인터랙티브 | 없음(코드로 그림) | 불가 | 공개 지면은 `script`를 실을 수 없습니다(`PAGE_ALLOWED_TAGS`). 정적 그래픽으로 대신하거나 별도 검토 |

자료 없이 바로 대응할 수 있는 A · E · F가 표본 81곳 중 44곳(54%)입니다. 사진 한 장이면 되는 C까지 더하면 55곳(68%)입니다.

## 제안하는 순서

1. **유형 축 도입**: 생성 흐름의 디자인 선택 단계에서 유형과 디자인 시스템을 따로 고르게 합니다. 사용자 자료(이미지 수 · 사진 유무 · 수치 유무)로 만들 수 없는 유형은 거릅니다. 지금 이미지가 없으면 CaseGallery를 빼는 것과 같은 원리입니다.
2. **A · E 먼저**: 자료 없이 가능하고, 둘의 성격이 반대(큰 글자 · 적은 글 대 작은 글자 · 많은 글)라 짜임새 축의 폭을 검증하기 좋습니다.
3. **F**: 내용 계약의 수치 추출(#97 3단계)과 수치 강조 컴포넌트(5단계)에 맞춰 붙입니다.
4. **C**: 프로필 사진 업로드를 생성 흐름에 넣습니다.
5. **B**: 프로젝트 링크 캡처(측정용 headless Chrome 재사용)와 타이포그래피 커버로 작업 이미지를 확보한 뒤 붙입니다.
6. **고를 때는 자기 자료로 본 미리보기**: 유형별 첫 화면을 사용자 본인의 이름과 프로젝트로 그려 보여 줍니다.

## 부록: 분류표

측정값은 1440×900 첫 화면 기준입니다(이미지 링크 카드와 전체 글자 수는 스크롤 뒤 전체 페이지).

| 유형 | 사이트 | 첫 화면 최대 글자(px) | 첫 화면 글자 수 | 이미지 링크 카드 | 전체 글자 수 | 어두운 배경 |
|---|---|---|---|---|---|---|
| A | [Antoine Wodniack](https://wodniack.dev) | 225 | 1097 | 0 | 1294 | 예 |
| A | [JAMES WILLIAMS](https://www.jameswilliams.design) | 150 | 60 | 6 | 370 | 예 |
| A | [Colin Moy](https://colin-moy.webflow.io) | 240 | 756 | 2 | 726 | 아니요 |
| A | [celia hazard](https://www.celiahazard.com) | 59 | 137 | 1 | 1344 | 아니요 |
| A | [Daniel Vaszka](https://www.danielvaszka.com) | 189 | 44 | 0 | 40 | 예 |
| A | [Aabraham James](https://seera.framer.website) | 174 | 165 | 6 | 2040 | 아니요 |
| A | [David](https://www.davidanthonychenault.com) | 221 | 124 | 0 | 1068 | 예 |
| A | [Huy Phan](https://huyml.co) | 220 | 4215 | 19 | 6786 | 아니요 |
| A | [Niccolò Miranda](https://www.niccolomiranda.com) | 533 | 961 | 10 | 2989 | 예 |
| A | [AnnFro](https://annfrol.github.io) | 166 | 54 | 1 | 336 | 예 |
| A | [Tom Parkes](https://www.tparkes.com) | 86 | 409 | 6 | 1553 | 아니요 |
| A | [Jimmy Davies](https://jimmydavies.com) | 80 | 205 | 15 | 545 | 아니요 |
| A | [Johnnie Gomez](https://www.johnnies.life) | 101 | 1221 | 26 | 3011 | 아니요 |
| A | [Inthikhab](https://inthikhab.framer.website) | 160 | 129 | 0 | 552 | 예 |
| A | [Fifty Seven](https://www.fiftyseven.co) | 116 | 275 | 0 | 254 | 예 |
| A | [Seyi Oniyitan](https://seyi.webflow.io) | 72 | 186 | 9 | 2371 | 예 |
| B | [Paula](https://www.paulawrzecionowska.com) | 72 | 643 | 8 | 1136 | 아니요 |
| B | [Daniel](https://danielklopper.com) | 42 | 59 | 26 | 2952 | 아니요 |
| B | [Jeremiah Shaw](https://www.jermshaw.com) | 44 | 74 | 1 | 730 | 아니요 |
| B | [Isaac Blankensmith](https://isaacblankensmith.com) | 13 | 594 | 17 | 1600 | 아니요 |
| B | [Nick Buzz](https://baked.design) | 20 | 431 | 232 | 1706 | 아니요 |
| B | [Jason Fonseca](https://www.jasonfonseca.com) | 26 | 3890 | 7 | 3905 | 아니요 |
| B | [Praveen Juge](https://praveenjuge.com) | 16 | 452 | 13 | 1515 | 아니요 |
| B | [Jordan Hughes](https://jordanhughes.co) | 16 | 176 | 6 | 10174 | 아니요 |
| B | [Manny Uwak](https://www.manny-uwak.com) | 36 | 814 | 0 | 1258 | 아니요 |
| B | [Jeremy Blaze](https://neverbeforeseen.co) | 26 | 752 | 36 | 1998 | 아니요 |
| B | [Andrew Harnois](https://www.andrewharnois.com) | 57 | 355 | 10 | 2399 | 아니요 |
| B | [Anas Alabsi](https://www.anasalabsi.com) | 44 | 254 | 34 | 945 | 아니요 |
| B | [Matthew Brigante](https://www.matthew-brigante.com) | 104 | 152 | 4 | 660 | 아니요 |
| C | [Aabid Ahmed](https://sawad.framer.website) | 110 | 537 | 9 | 1952 | 예 |
| C | [Christina Kosik](https://fonsmans.com) | 20 | 167 | 0 | 149 | 아니요 |
| C | [Mika](https://www.unbearable.design) | 86 | 1365 | 2 | 4008 | 아니요 |
| C | [Dennis Snellenberg](https://dennissnellenberg.com) | 216 | 201 | 0 | 732 | 예 |
| C | [Jan Losert](https://www.janlosert.com) | 60 | 535 | 34 | 5973 | 아니요 |
| C | [Jordan Versluis](https://www.jordanversluis.net) | 56 | 300 | 0 | 1933 | 아니요 |
| C | [Uvindu Harshana](https://itsnue.github.io) | 16 | 264 | 0 | 230 | 예 |
| C | [Elfan](https://melfanza.typedream.app) | 56 | 205 | 0 | 428 | 아니요 |
| C | [Kirill Lipovoi](https://lipovoikirill.work) | 80 | 425 | 11 | 2919 | 예 |
| C | [Quint Bailey](https://www.quint.design) | 90 | 376 | 7 | 1109 | 예 |
| C | [ITS SUDAIS](https://contextual-behavior-041127.framer.app) | 90 | 512 | 6 | 1142 | 예 |
| D | [Sebastien Lempens](https://www.sebastien-lempens.com) | 135 | 69 | 0 | 261 | 예 |
| D | [Gloria Ha](https://www.gloriaha.com) | 36 | 545 | 5 | 956 | 아니요 |
| D | [Yuki](https://www.yukiasakura.com) | 43 | 154 | 1 | 130 | 예 |
| D | [Hhosue Mesias](https://www.jhosuemesias.com) | 154 | 15 | 3 | 537 | 아니요 |
| D | [Sam Small](https://samsmall.design) | 85 | 69 | 8 | 3009 | 예 |
| D | [Alexander Vilinskyy](https://www.vilinskyy.com) | 15 | 1207 | 0 | 2430 | 아니요 |
| D | [mousey](https://www.mousey.design) | 80 | 256 | 23 | 1182 | 아니요 |
| D | [Igor Vensko](https://wizardmode.io) | 166 | 110 | 36 | 2374 | 아니요 |
| D | [Henry](https://henrydesign.framer.website) | 48 | 184 | 21 | 1858 | 아니요 |
| D | [Dave Gruentzel](https://davegruentzel.com) | 60 | 402 | 9 | 7274 | 아니요 |
| D | [DANOSITE](https://www.danosite.com) | 90 | 138 | 0 | 576 | 아니요 |
| D | [Brandon Tucs](https://brandontucs.me) | 52 | 333 | 15 | 984 | 아니요 |
| D | [Alan Brown](https://alanbrown.ca) | 18 | 90 | 0 | 2179 | 예 |
| E | [Corey Snyder](https://tangerineindustries.com) | 66 | 1385 | 0 | 1260 | 아니요 |
| E | [Stefan Hiienurm](https://shiienurm.com) | 104 | 299 | 8 | 1289 | 예 |
| E | [Daniel Eden](https://daneden.me) | 36 | 591 | 0 | 2137 | 예 |
| E | [Bradley Haynes](https://www.bradleyhaynes.com) | 80 | 165 | 0 | 4543 | 아니요 |
| E | [Hanson](https://www.hansonwu.com) | 60 | 168 | 1 | 1126 | 아니요 |
| E | [Iain McConchie](https://www.konch.net) | 19 | 2118 | 0 | 2099 | 아니요 |
| E | [Moritz Oesterlau](https://www.moritzoesterlau.de) | 32 | 622 | 0 | 886 | 아니요 |
| E | [Louis Nguyen](https://louisnguyen.co) | 14 | 556 | 4 | 9614 | 아니요 |
| E | [Osha Helawan](https://oshahelawan.framer.website) | 24 | 751 | 0 | 1387 | 아니요 |
| E | [Jordi Espinosa](https://www.jordiespinosa.com) | 18 | 511 | 2 | 1791 | 예 |
| E | [Facu Montanaro](https://www.facumontanaro.com) | 16 | 901 | 0 | 1696 | 아니요 |
| E | [Sam Stoof](https://www.samstoof.com) | 16 | 837 | 0 | 716 | 아니요 |
| E | [Nick Collins](https://nickcollins.co) | 48 | 640 | 12 | 5012 | 아니요 |
| E | [Software Designer](https://www.johannesgerber.de) | 14 | 202 | 0 | 189 | 예 |
| E | [Practical People](https://practicalpeople.us) | 20 | 106 | 0 | 111 | 아니요 |
| E | [Matt Szyszko](https://shysh.co) | 131 | 713 | 12 | 1226 | 아니요 |
| E | [Eric Gage](https://ericgage.us) | 38 | 560 | 0 | 1590 | 예 |
| E | [Sangaji Pramono](https://archiemons.com/portfolio) | 36 | 417 | 0 | 609 | 아니요 |
| F | [Christopher Walker](https://stabraq.framer.website) | 26 | 364 | 11 | 1225 | 예 |
| F | [Joshuas](https://www.joshuas.world) | 96 | 203 | 0 | 183 | 아니요 |
| F | [Kinexa](https://www.kinexa.agency) | 40 | 268 | 9 | 5485 | 아니요 |
| F | [Kiran Karty](https://kirankarty.designfolio.me) | 24 | 1950 | 0 | 3191 | 아니요 |
| F | [Matt Clark](https://www.narrow.land/matt-clark) | 112 | 259 | 29 | 6325 | 아니요 |
| F | [Dmitry Sergushkin](https://www.dmitrysergushkin.com) | 70 | 647 | 13 | 8813 | 아니요 |
| F | [Seyi Balogun](https://seyidesigns.netlify.app) | 80 | 351 | 0 | 1609 | 아니요 |
| F | [Mohammed Hussaini](https://heylekan.vercel.app) | 56 | 22 | 1 | 2414 | 아니요 |
| F | [Weekend Visuals](https://weekendvisuals.com) | 40 | 398 | 6 | 3574 | 아니요 |
| F | [Bourdonner](https://www.bourdonner.com.br) | 60 | 123 | 5 | 594 | 아니요 |

제외(열렸지만 분석 불가): [Redoyanul Haque(best portfolio)](https://www.redoyanulhaque.me), [Christina Kosik](https://www.bychristinakosik.com), [Mike Fernandez](https://www.mike-fernandez.dev), [Rogier de Boeve](https://rogierdeboeve.com), [Local Studio](https://localstudio.fr), [Sarah Fatmi](https://sarahfatmi.com/en), [Peter Tarka](https://petertarka.com), [Stas Bondar](https://www.stabondar.com), [Andrew Woan](https://www.woanminecraftfolio.com), [Diana Weigandt](https://diweidt.tilda.ws), [Ashish](https://bionicashish.framer.website), [Cam Jordan](https://www.cjpux.com), [Ali Çorak](https://alicorak.com), [Nate](https://natemp.framer.website), [Pascal Zirn](https://icyfeva.webflow.io), [Michael Coburn](https://mic-hael.com), [Jordan Ayson](https://jordancreates.myportfolio.com), [Emily Grimaldi](https://egrimald.myportfolio.com), [Grafiko Labs](https://bento.me/grafikolabs), [Charles Isiofia](https://www.charleschineduisiofia.co.uk)

열리지 않음: [Bruno Simon](https://bruno-simon.com), [Siriveena](https://www.sirirosa.co), [Hugo Morteveille](https://hugomorteveille.fr), [Rosa](https://www.contraztmedia.nl), [Francesco Fagioli](https://www.francescofagioli.me), [Fabrizzio Zampieri](https://fzamp.design), [Kazi Mahbub](https://mahbubuiux.com), [Guillaume Berthonneau](https://bguillaume.fr), [Paulo Bastos](http://www.pvbastos.com), [Kyle Conrad](https://kyleconrad.com), [Mehak Kapoor](https://www.behance.net/mehakkapoor9), [Ahmed Touhami](https://touhami.pages.dev), [Kamal Khan](https://www.behance.net/kamalkhan21)
