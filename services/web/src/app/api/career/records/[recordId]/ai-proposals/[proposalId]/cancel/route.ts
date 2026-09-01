import { API_PREFIX } from "@expresso/contracts";
import { API_BASE_URL } from "@/lib/api/client";
import { readAccessToken } from "@/lib/session";
export async function POST(_request:Request,{params}:{params:Promise<{recordId:string;proposalId:string}>}){const token=await readAccessToken();if(!token)return new Response(null,{status:401});const {recordId,proposalId}=await params;const upstream=await fetch(`${API_BASE_URL}${API_PREFIX}/career/records/${encodeURIComponent(recordId)}/ai-proposals/${encodeURIComponent(proposalId)}/cancel`,{method:"POST",headers:{authorization:`Bearer ${token}`,accept:"application/json"},cache:"no-store"});return new Response(null,{status:upstream.status});}
