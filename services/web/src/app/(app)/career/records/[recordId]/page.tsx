import type { Route } from "next";
import { notFound } from "next/navigation";
import { AppBody, DocumentHeader } from "@/components/shell/AppShell";
import { CareerDocumentEditor } from "@/features/career-editor/editor/CareerDocumentEditor";
import { ApiError } from "@/lib/api/client";
import { career } from "@/lib/api/endpoints"; import { requireSession } from "@/lib/require-session";
import styles from "./page.module.css";
import { RecordPageMenu } from "./RecordPageMenu";
export default async function CareerRecordPage({params}:{params:Promise<{recordId:string}>}){const {recordId}=await params;const session=await requireSession();let response;try{response=await career.record(session.accessToken,recordId)}catch(error){/* 없는 기록(휴지통 포함)만 404 화면입니다. 서버 오류를 「찾을 수 없음」으로 바꾸지 않고 오류 화면에 맡깁니다. */if(error instanceof ApiError&&error.status===404)notFound();throw error}const category=session.categories.find(item=>item.id===response.data.categoryId);if(!category)notFound();const record={...response.data,categoryKey:category.key,isEmpty:response.data.title===""&&response.data.bodyMd===""&&Object.keys(response.data.properties).length===0,periodFrom:null,periodTo:null,linkCount:0,usedInCount:0};return <><DocumentHeader crumbs={[{label:"내 커리어",href:"/career" as Route},{label:category.name,href:`/career/${category.key}` as Route},record.title||"제목 없음"]} actions={<RecordPageMenu recordId={record.id} recordTitle={record.title} categoryKey={category.key}/>}/><AppBody><div className={styles.scroll}><main className={styles.page}><CareerDocumentEditor recordId={record.id} mode="page" record={record} category={category}/></main></div></AppBody></>}
