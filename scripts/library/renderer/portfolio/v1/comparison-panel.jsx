import React from 'react';
import {Card,CardContent,CardHeader,CardTitle,CardDescription,CardFooter} from '@collected/card';

// 개발용 비교 영역입니다. 생성된 포트폴리오 본문은 카드 아래에 그대로 둡니다.
export function ComparisonPanel({items,pureHref}){
  return <details className="portfolio-comparison" open>
    <summary><span className="comparison-summary-title">세 디자인 비교</span><span className="comparison-summary-hint">같은 가상 입력 · 모델 생성 Spec 3개</span><span className="comparison-summary-toggle" aria-hidden="true">접기</span></summary>
    <div className="comparison-content"><p className="comparison-intro">첫 화면을 나란히 살펴보고 카드를 선택해 전체 포트폴리오를 확인하세요.</p><p className="comparison-swipe-note">카드를 옆으로 넘겨 세 디자인을 볼 수 있습니다.</p>
      <nav aria-label="모델 생성 디자인 비교"><ul className="comparison-grid">{items.map(item=><li key={item.id}>
        <a href={item.href} target="_blank" rel="noopener noreferrer" aria-label={`${item.title} 전체 페이지 새 탭에서 열기`}><Card className="comparison-card">
          <CardContent><img src={item.image} alt={`${item.title} 포트폴리오 첫 화면`} width="1440" height="900"/></CardContent>
          <CardHeader><CardTitle>{item.title}</CardTitle><CardDescription>{item.description}</CardDescription></CardHeader>
          <CardFooter>전체 페이지 열기 <span aria-hidden="true">↗</span></CardFooter>
        </Card></a>
      </li>)}</ul></nav>
      <a className="comparison-pure-link" href={pureHref}>이 포트폴리오만 보기 ↗</a>
    </div>
  </details>;
}
