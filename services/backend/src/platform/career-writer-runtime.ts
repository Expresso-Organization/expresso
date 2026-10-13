import {CareerProducerScopeSchema,type CareerProducerScope,type CareerProducerIntent} from "@expresso/contracts";
import type {RuntimeConfig} from "../config/runtime-config.js";
import type {MongoContext} from "./mongodb.js";
import {
 CanonicalCareerReadService,CanonicalPropertyMutationWorker,CareerError,CareerProducerCoordinator,PreparedCareerProductWrites,
 MongoCanonicalCareerPropertySchemaService,createCareerProductFacade,createSpringCareerProducerPort,createCareerProducerCredential,
 createSpringPropertyMutationPort,createSpringPropertyMutationHttpTransport,createCareerPropertyMutationCredential,
 type CareerProducerRecoveryPolicy,type RecordCleaner,
} from "../modules/career/index.js";
import {CareerDocumentService,PreparedCareerDocumentWriter,ProductAiProposalIntegration} from "../modules/career-editor/index.js";
import {InterviewProductCareerIntegration,PreparedInterviewCareerWriter} from "../modules/interview/index.js";
import type {ConsentApi} from "../modules/consent/index.js";

export interface CareerWriterRuntimeOptions {
 transport?:(url:string,init:RequestInit)=>Promise<Response>;
 cleaner?:RecordCleaner|null;
 consent?:ConsentApi|null;
}
/** API/Worker 모두 같은 owner graph를 사용하며 업무 Mongo fallback을 구성하지 않습니다. */
export function createCareerWriterRuntime(context:MongoContext,config:RuntimeConfig,documents:CareerDocumentService,options:CareerWriterRuntimeOptions={}) {
 // 미설정 주소는 네트워크에 사용하지 않습니다. 모든 business 호출 전에 명시적으로 거부합니다.
 const base=config.careerSpringBaseUrl??"http://unconfigured.invalid";
 const keyFor=(producer:CareerProducerScope["producer"])=>producer==="career-product"?config.careerProductServiceSecret:producer==="ai-proposal"?config.careerIntegrationAiSecret:config.careerIntegrationInterviewSecret;
 const requireOwner=(producer:CareerProducerScope["producer"])=>{const key=keyFor(producer);if(!config.careerSpringBaseUrl||!key||Buffer.byteLength(key)<32)throw new CareerError(503,"Career business owner configuration is unavailable");};
 const transport=async(url:string,init:RequestInit)=>{if(!config.careerSpringBaseUrl)throw new CareerError(503,"Career business owner configuration is unavailable");return(options.transport??fetch)(url,init);};
 const spring=createSpringCareerProducerPort(context,base,scope=>{requireOwner(scope.producer);return createCareerProducerCredential(scope,Buffer.from(keyFor(scope.producer)!));},transport);
 const recovery:CareerProducerRecoveryPolicy={maxAttempts:5,classify:error=>{
  const status=(error as {statusCode?:number})?.statusCode;
  return status!==undefined&&[400,401,403,404,409,412,422].includes(status)?"blocked":"retry";
 }};
 const document=new PreparedCareerDocumentWriter(context);
 const coordinator=new CareerProducerCoordinator(context,{commit:request=>{requireOwner(request.producer);return spring.commit(request);}},document,recovery);
 const preparedProduct=new PreparedCareerProductWrites(context,coordinator),reads=new CanonicalCareerReadService(context);
 const preparedWrites={
  findPrepared:preparedProduct.findPrepared.bind(preparedProduct),
  prepareWithStatus:(...args:Parameters<PreparedCareerProductWrites["prepareWithStatus"]>)=>{if(args[3])requireOwner("career-product");return preparedProduct.prepareWithStatus(...args);},
  execute:preparedProduct.execute.bind(preparedProduct),
 };
 const career=createCareerProductFacade(context,{springBaseUrl:base,transport,preparedWrites,...(config.careerSchemaPreviewSecret?{schemaPreviewSecret:config.careerSchemaPreviewSecret}:{})});
 const ai=new ProductAiProposalIntegration(context,documents,coordinator,reads,{requireBusinessOwner:()=>requireOwner("ai-proposal")});
 documents.setProductAiIntegration(ai);
 const schemas=config.careerSchemaPreviewSecret?new MongoCanonicalCareerPropertySchemaService(context,config.careerSchemaPreviewSecret):null;
 const interview=new InterviewProductCareerIntegration(context,new PreparedInterviewCareerWriter(context,coordinator),reads,{
  ...options,requireBusinessOwner:()=>requireOwner("interview"),registerOption:(userId,categoryId,propertyId,input)=>{if(!schemas)throw new CareerError(503,"Career option registration is unavailable");return schemas.registerOption(userId,categoryId,propertyId,input);},
 });
 const mutationTransport=createSpringPropertyMutationHttpTransport(base,scope=>{
  if(!config.careerSpringBaseUrl||!config.careerPropertyMutationSecret)throw new CareerError(503,"Career mutation owner configuration is unavailable");
  return createCareerPropertyMutationCredential(scope,Buffer.from(config.careerPropertyMutationSecret));
 },transport);
 const mutation=new CanonicalPropertyMutationWorker(context,createSpringPropertyMutationPort({invoke:(...args)=>{
  if(!config.careerSpringBaseUrl||!config.careerPropertyMutationSecret)throw new CareerError(503,"Career mutation owner configuration is unavailable");return mutationTransport.invoke(...args);
 }}));
 return {career,ai,interview,mutation,coordinator,documents,reads,async execute(raw:CareerProducerScope):Promise<CareerProducerIntent>{
  const scope=CareerProducerScopeSchema.parse(raw);
  if(scope.producer==="career-product")return preparedProduct.execute(scope);
  if(scope.producer==="ai-proposal")return ai.execute(scope);
  await interview.execute(scope);return coordinator.pending(scope);
 }};
}