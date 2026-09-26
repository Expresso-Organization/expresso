// 원본 registry 경로·예제 구성과 파일명 계열을 함께 검토한 탐색 분류입니다.
// 개별 항목의 제품 품질·이식 가능 여부는 기존 후보 검토가 담당합니다.
const names = text => new Set(text.split(/\s+/).filter(Boolean));
const pages = names(`agndex-dashboard astrix-dashboard business-management business-operations-dashboard
 demostack-dashboard e-commerce-dashboard erp-dashboard gridline-dashboard hrm incident-management
 invoice-generator-dashboard invoice-manager-dashboard issue-tracking jobtracker-dashboard landing-01
 lead-dashboard library-dashboard mail-dashboard medesk-dashboard meetings-dashboard payment-operations-dashboard
 portfolio-dashboard project-management-dashboard sales-dashboard tallie-dashboard task-management-dashboard
 web3-dashboard workflow-management-dashboard luminia-luxe-realestate bionis-dashboard capitalio-dashboard
 product-waitlist-funnel saas-launch-stack`);
const sections = names(`hero bento blog career contact cta faq feature footer integrations newsletter pricing stats team testimonials navigation announcement changeable-pricing-section`);
const content = names(`activities-card audio-player audio-player-with-waveform availability award book browser budget-card
 calendar-widget card-cue card-split-accordion card-split-accordian card-swipe chart code code-block code-tabs
 collection-grid-disclosure credit-usage-card data-table deployment-card device event-reminders
 expandable-event-card expandable-profile-card family-wallet files flip-card flip-clock fund-widget gauge
 github-stars github-stars-wheel integration-card license-key licence-key list-stack marquee meeting-card
 minimal-carousel mobile-video-player motion-carousel notification-list onboarding-checklist pin-list playful-todolist
 preview-link-card pricing-widget profile-card radial-carousel radial-intro returns-calculator-snippet revealing-cards
 run-widget show-qr subscription-calendar swap-currency-card table tags task-widget-disclosure terminal timeline
 trade-summary transaction-list user-presence-avatar view-on-map voice-note voice-transcribe waveform-scrub
 weight-widget widget wiggling-cards x-post`);
const kobraContent = names(`attachment chart code-block conversation crm-table file-diff image-generation inline-citations
 item logo-carousel marker message message-scroller plan-card question-card reasoning-steps streaming-text table task-list video`);
const family = value => value.replace(/-base$/, '').replace(/-\d+$/, '');

export function componentClassification(item) {
  const id=item.sourceItemId, base=family(id);
  let type='basic-ui', evidence='입력·조작·상태·레이아웃을 구성하는 UI 부품 계열';
  if(item.sourceSite==='watermelon') {
    if(pages.has(id) || ['auth','error','onboarding-screen','onboarding-setup'].includes(base)) {
      type='page-examples';evidence=pages.has(id)?'원본 페이지·대시보드 디렉터리 또는 공급자의 전체 화면 예제':'인증·오류·온보딩 전체 화면 계열';
    } else if(sections.has(base)) {
      type='sections';evidence='제목·본문·목록·행동 요소를 묶는 원본 섹션 계열';
    } else if(content.has(base)) {
      type='content-elements';evidence='정보·미디어·목록·수치를 표시하는 원본 카드·위젯 계열';
    }
  } else if(item.sourceSite==='magic-portfolio' || item.sourceSite==='shadcn-timeline') {
    type=['magic-portfolio-work','magic-portfolio-projects'].includes(item.id)?'sections':'content-elements';
    evidence=type==='sections'?'원본 section 파일의 경력·프로젝트 목록':'원본 프로젝트 카드·타임라인 구성 요소';
  } else if(item.sourceSite==='codedvisuals') {
    type=item.categories.includes('sections') && !['components','backgrounds'].includes(id.split('/').at(-1))?'sections':'content-elements';
    evidence='공급자의 시각 자료 분류에 따른 임시 배치';
  } else if(item.sourceSite==='kobra' && kobraContent.has(id.split('/').at(-1))) {
    type='content-elements';evidence='공급자의 정보·미디어 표시 요소 분류';
  }
  const provisional=item.acquisitionStatus!=='source_ready';
  return {type,evidence,provisional};
}
