import { readAccessToken } from "@/lib/session";
export async function POST(_request:Request,{params:_params}:{params:Promise<{recordId:string;proposalId:string}>}){const token=await readAccessToken();if(!token)return new Response(null,{status:401});return new Response(null,{status:404});}
