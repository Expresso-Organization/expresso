"use client";
import { useEffect, useRef, useState } from "react";
import type { CoachingState, ExplorationInput, CoachingFeedback } from "@expresso/contracts";
import { Button } from "@/components/ui/button";
import { coachingAction } from "./coaching-actions";
import CoachingResourcePicker from "./CoachingResourcePicker";
import styles from "./CareerWorkflow.module.css";
const initial:ExplorationInput={experience:"",interests:"",constraints:"",weeklyHours:5};
export default function CareerCoaching({conversationId,disabled,onSend}:{conversationId:string;disabled:boolean;onSend:(text:string)=>void}) {
 const [state,setState]=useState<CoachingState|null>(null),[profile,setProfile]=useState(initial),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const [kind,setKind]=useState<CoachingFeedback["kind"]>("condition"),[target,setTarget]=useState(""),[reason,setReason]=useState(""),[portfolioId,setPortfolioId]=useState("");
 const [targetLabel,setTargetLabel]=useState(""),[portfolioLabel,setPortfolioLabel]=useState("");
 const [lastAction,setLastAction]=useState<Parameters<typeof coachingAction>[1]>("load"),[analyticsNotice,setAnalyticsNotice]=useState("");
 const lock=useRef(false);
 useEffect(()=>{let live=true;void coachingAction(conversationId,"load").then(r=>{if(!live)return;if(r.ok){setState(r.data);setProfile(r.data.profile??initial);}else setError(r.error);}).catch(()=>{if(live)setError("저장 상태를 불러오지 못했습니다. 다시 불러오세요.");});return()=>{live=false;};},[conversationId]);
 async function act(action:Parameters<typeof coachingAction>[1],value?:unknown){if(lock.current)return;lock.current=true;setBusy(true);setLastAction(action);setError("");setAnalyticsNotice("");try{const r=await coachingAction(conversationId,action,value);if(r.ok){setState(r.data);setProfile(r.data.profile??initial);if(action==="analytics"){const count=r.data.improvements.filter(p=>p.portfolioId===portfolioId).length;setAnalyticsNotice(count?`개선 초안 ${count}개를 불러왔습니다. 아래 내용을 검토하세요.`:"반환된 개선 초안이 없습니다. 저장 상태를 다시 불러와 확인하세요.");}}else setError(r.error);}catch{setError("요청 결과를 확인하지 못했습니다. 다시 불러오세요.");}finally{lock.current=false;setBusy(false);}}
 const off=disabled||busy||!state;
 return <section className={styles.root} aria-label="직무 탐색과 개인화·개선 행동">
 <h2>직무 탐색과 개인화·개선 행동</h2>
 <p>입력과 피드백은 본인 계정에 저장되어 다른 대화에도 적용됩니다. 직무 후보는 적성 진단 결과가 아닙니다.</p>
 <Button variant="outline" disabled={disabled||busy} onClick={()=>void act("load")}>저장 상태 다시 불러오기</Button>
 {error&&lastAction!=="analytics"&&lastAction!=="decision"?<p role="alert" className={styles.error}>{error}</p>:null}
 <fieldset disabled={off}><legend>목표 공고 없이 직무 탐색</legend>
 {([['experience','직접 해본 경험과 본인 역할'],['interests','관심 있는 업무'],['constraints','지역·근무 방식 등 제약']] as const).map(([key,label])=><label key={key}>{label}<textarea value={profile[key]} maxLength={key==='experience'?4000:1000} onChange={e=>setProfile({...profile,[key]:e.target.value})}/></label>)}
 <label>주당 준비 가능 시간<input type="number" min={1} max={40} value={profile.weeklyHours} onChange={e=>setProfile({...profile,weeklyHours:Number(e.target.value)})}/></label>
 <Button onClick={()=>void act("explore",{expectedVersion:state!.version,profile})}>입력 저장·직무 후보 보기</Button>
 </fieldset>
 {state?.candidates.map(c=><article className={styles.card} key={c.role}><h3>{c.role} · 확신도 낮음</h3><ul>{c.reasons.map(t=><li key={t}>{t}</li>)}</ul><p>{c.nextQuestion}</p><Button disabled={off} onClick={()=>onSend(`${c.role}을 목표 후보로 탐색하고 싶어. 저장한 경험·선호·제약을 참고해서 실제 경험과 비선호 조건을 확인하는 질문부터 해줘.`)}>이 직무를 대화에서 탐색</Button></article>)}
 <fieldset disabled={off}><legend>추천과 계획에 반영할 피드백</legend>
 <label>종류<select value={kind} onChange={e=>{setKind(e.target.value as CoachingFeedback['kind']);setTarget("");setTargetLabel("");}}><option value="condition">비선호 조건·직무</option><option value="job">관심 없는 공고</option><option value="plan">비현실적인 계획</option></select></label>
 <label>대상 조건·직무 또는 계획{kind==='job'?<><span>{targetLabel||"아래 목록에서 공고를 선택하세요."}</span><CoachingResourcePicker kind="jobs" disabled={off} onSelect={(id,title)=>{setTarget(id);setTargetLabel(title);}}/></>:<input maxLength={200} value={target} onChange={e=>setTarget(e.target.value)}/>}</label>
 <label>이유<textarea maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
 <Button onClick={()=>void act("feedback",{expectedVersion:state!.version,feedback:{id:crypto.randomUUID(),kind,target,label:targetLabel,reason,active:true}})}>피드백 저장</Button>
 </fieldset>
 {state?.feedback.map(f=><div className={styles.card} key={f.id}><p>{f.label||f.target}: {f.reason} · {f.active?'반영 중':'반영 중지'}</p><Button disabled={off} variant="outline" onClick={()=>void act("feedback",{expectedVersion:state!.version,feedback:{...f,active:!f.active}})}>{f.active?'반영 중지':'다시 반영'}</Button></div>)}
 {state?.appliedFeedback.length?<div><h3>추천·계획에 전달한 조건</h3><ul>{state.appliedFeedback.map((t,i)=><li key={i}>{t}</li>)}</ul><p>관심 없는 공고는 검색에서 제외하며, 나머지 조건은 Agent가 확인하고 초안에 반영합니다.</p></div>:null}
 <fieldset disabled={off}><legend>방문 분석에서 개선 행동 제안</legend>
 <p>집계가 완료되고 표본이 충분한 포트폴리오의 최근 30일 지표를 읽습니다. 방문 수치로 역량이나 이탈 원인을 단정하지 않습니다.</p>
 <p>선택한 포트폴리오: {portfolioLabel||"아직 선택하지 않았습니다."}</p><CoachingResourcePicker kind="portfolios" disabled={off} onSelect={(id,title)=>{setPortfolioId(id);setPortfolioLabel(title);}}/>
 <Button disabled={off||!portfolioId} onClick={()=>void act("analytics",{expectedVersion:state!.version,portfolioId,period:"30d"})}>{busy&&lastAction==="analytics"?"방문 분석 확인 중…":"분석 근거로 개선 초안 만들기"}</Button>
 </fieldset>
 <div aria-live="polite" aria-atomic="true" aria-label="방문 분석 요청 결과">
 {error&&(lastAction==="analytics"||lastAction==="decision")?<p role="alert" className={styles.error}>{error}</p>:null}
 {busy&&lastAction==="analytics"?<p role="status">포트폴리오의 배포 이력과 방문 집계를 확인하고 있습니다.</p>:analyticsNotice?<p role="status">{analyticsNotice}</p>:null}
 {!portfolioId?<p>분석할 포트폴리오를 목록에서 먼저 선택해 주세요.</p>:disabled?<p>진행 중인 대화나 자료 미리보기를 마친 뒤 분석할 수 있습니다.</p>:null}
 </div>
 {state?.improvements.map(p=><article className={styles.card} key={p.id}><h3>{p.title}</h3><ul>{p.evidence.map(t=><li key={t}>{t}</li>)}</ul><p className={styles.source}>{p.prompt}</p><p>상태: {p.status==='pending'?'검토 대기':p.status==='approved'?'승인됨':'거절됨'}</p>
 {p.status==='pending'?<div className={styles.actions}>{(['approved','rejected'] as const).map(decision=><Button disabled={off} key={decision} onClick={()=>void act("decision",{expectedVersion:state!.version,id:p.id,decision})}>{decision==='approved'?'이 개선 요청 승인':'거절'}</Button>)}</div>:null}
 {p.status==='approved'?<Button disabled={off} onClick={()=>onSend(p.prompt)}>승인한 요청을 대화로 보내기</Button>:null}
 </article>)}
 <p>승인은 개선 요청을 대화로 전달할 준비를 마칩니다. 경력·계획 저장, 포트폴리오 수정·배포는 기존 화면에서 별도로 확인합니다.</p>
 </section>;
}
