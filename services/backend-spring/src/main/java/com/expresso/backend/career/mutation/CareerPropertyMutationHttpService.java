package com.expresso.backend.career.mutation;

import java.time.Clock;
import java.util.Set;
import tools.jackson.databind.JsonNode;
import com.expresso.backend.career.application.*;
import com.expresso.backend.career.dto.CareerPropertyMutationData;
import com.expresso.backend.career.http.CareerBusinessInput;
import com.expresso.backend.career.infrastructure.mongo.MongoCareerCommandRepository;

public final class CareerPropertyMutationHttpService {
    private static final Set<String> SCOPE=Set.of("mutationId","recordId","operationFingerprint");
    private static final Set<String> READ=Set.of("mutationId","recordId","operationFingerprint","leaseToken");
    private static final Set<String> RELATION_COMMIT=Set.of("mutationId","recordId","operationFingerprint","leaseToken","expectedVersion","relationChanges");
    private static final Set<String> COMMIT=Set.of("mutationId","recordId","operationFingerprint","leaseToken","expectedVersion","propertyValues");
    private final MongoCareerCommandRepository repository;
    private final CareerPropertyMutationService mutations;
    public CareerPropertyMutationHttpService(MongoCareerCommandRepository repository,Clock clock) {this.repository=repository;this.mutations=new CareerPropertyMutationService(repository,clock);}
    public CareerPropertyMutationData.Result receipt(MutationServiceActor actor,JsonNode request) {
        actor.scope().requireRequest(request,SCOPE);var scope=actor.scope();
        var result=repository.serviceTransaction(actor,tx->mutations.receipt(tx,scope.mutationId(),scope.recordId(),scope.operationFingerprint()));
        return result==null?null:CareerPropertyMutationData.Result.from(result);
    }
    public CareerPropertyMutationData.Read read(MutationServiceActor actor,JsonNode request) {
        actor.scope().requireRequest(request,READ);var scope=actor.scope();var lease=CareerBusinessInput.uuid(request.get("leaseToken"));
        return CareerPropertyMutationData.Read.from(repository.serviceTransaction(actor,tx->mutations.read(tx,scope.mutationId(),scope.recordId(),lease,scope.operationFingerprint())));
    }
    public CareerPropertyMutationData.Result commit(MutationServiceActor actor,JsonNode request,String ifMatch) {
        actor.scope().requireRequest(request,request.has("relationChanges")?RELATION_COMMIT:COMMIT);var scope=actor.scope();var version=request.get("expectedVersion");
        if(!version.isIntegralNumber()||!version.canConvertToLong())throw new IllegalArgumentException("version 정수가 필요합니다");
        var expected=version.asLong();if(CareerBusinessInput.version(ifMatch)!=expected)throw new IllegalArgumentException("If-Match와 expectedVersion이 일치해야 합니다");
        if(request.has("relationChanges")) {
            var changes=request.get("relationChanges");CareerBusinessInput.fields(changes,Set.of("targetRecordIds","targetRecordVersions"),Set.of("targetRecordIds","targetRecordVersions"));
            var versions=changes.get("targetRecordVersions");if(!versions.isObject()||versions.size()>1000)throw new IllegalArgumentException("version map이 필요합니다");
            var parsed=new java.util.LinkedHashMap<String,Long>();for(var id:versions.propertyNames()){CareerBusinessInput.uuid(id);var value=versions.get(id);if(!value.isIntegralNumber()||!value.canConvertToLong())throw new IllegalArgumentException("version 정수가 필요합니다");parsed.put(id,value.asLong());}
            var command=new CareerRelationPropertyMutationCommand(scope.mutationId(),scope.recordId(),expected,CareerBusinessInput.uuid(request.get("leaseToken")),scope.operationFingerprint(),CareerBusinessInput.ids(changes.get("targetRecordIds"),1000),parsed);
            return CareerPropertyMutationData.Result.from(repository.serviceTransaction(actor,tx->mutations.commitRelation(tx,command)));
        }
        var propertyValues=request.get("propertyValues");CareerBusinessInput.fields(propertyValues,Set.of("set","unsetPropertyIds"),Set.of("set","unsetPropertyIds"));
        var delta=new PatchCareerBusinessCommand.PropertyDelta(CareerBusinessInput.values(propertyValues.get("set")),CareerBusinessInput.ids(propertyValues.get("unsetPropertyIds"),50));
        var command=new CareerPropertyMutationCommand(scope.mutationId(),scope.recordId(),expected,CareerBusinessInput.uuid(request.get("leaseToken")),scope.operationFingerprint(),delta);
        return CareerPropertyMutationData.Result.from(repository.serviceTransaction(actor,tx->mutations.commit(tx,command)));
    }
}
