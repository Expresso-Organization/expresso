import type { Route } from "next";
import { notFound } from "next/navigation";
import { AppBody, DocumentHeader } from "@/components/shell/AppShell";
import { CareerDocumentEditor } from "@/features/career-editor/editor/CareerDocumentEditor";
import { career } from "@/lib/api/endpoints"; import { requireSession } from "@/lib/require-session";
import styles from "./page.module.css";
export default async function CareerRecordPage({params}:{params:Promise<{recordId:string}>}){const {recordId}=await params;const session=await requireSession();let response;try{response=await career.record(session.accessToken,recordId)}catch{notFound()}const category=session.categories.find(item=>item.id===response.data.categoryId);if(!category)notFound();const record={...response.data,categoryKey:category.key,isEmpty:response.data.title===""&&response.data.bodyMd===""&&Object.keys(response.data.properties).length===0,periodFrom:null,periodTo:null,linkCount:0,usedInCount:0};return <><DocumentHeader crumbs={[{label:"내 커리어",href:"/career/experience" as Route},{label:category.name,href:`/career/${category.key}` as Route},record.title||"제목 없음"]}/><AppBody><main className={styles.page}><CareerDocumentEditor recordId={record.id} mode="page" record={record} category={category}/></main></AppBody></>}
