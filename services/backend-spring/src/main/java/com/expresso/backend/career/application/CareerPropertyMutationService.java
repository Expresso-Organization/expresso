package com.expresso.backend.career.application;

import java.time.Clock;
import java.util.*;
import com.expresso.backend.career.application.CareerCommandRepository.*;
import com.expresso.backend.career.domain.*;

/** 사용자와 scoped 서비스 경로가 동일한 transaction 내부의 mutation 불변식을 재사용합니다. */
public final class CareerPropertyMutationService {
    private final CareerCommandRepository repository;
    private final Clock clock;
    public CareerPropertyMutationService(CareerCommandRepository repository,Clock clock) {this.repository=repository;this.clock=clock;}
    public record Result(CareerRecord record,boolean changed,boolean replayed) {}
    public record Read(CareerRecord record,PropertyValue tombstone,Map<String,Object> relation) {
        public Read(CareerRecord record,PropertyValue tombstone) {this(record,tombstone,null);}
    }
    public Result receipt(Actor actor,String mutationId,String recordId,String fingerprint) {
        return repository.transaction(actor,tx -> receipt(tx,mutationId,recordId,fingerprint));
    }
    public Result receipt(Operations tx,String mutationId,String recordId,String fingerprint) {
        var receipt=tx.mutationReceipt(mutationId,recordId);
        if(receipt==null) return null;
        if(!receipt.operationFingerprint().equals(fingerprint)) throw new CareerCommandException(409,"MUTATION_PLAN_CHANGED");
        return new Result(receipt.record(),receipt.changed(),true);
    }
    public Read read(Actor actor,String mutationId,String recordId,String lease,String fingerprint) {
        return repository.transaction(actor,tx -> read(tx,mutationId,recordId,lease,fingerprint));
    }
    public Read read(Operations tx,String mutationId,String recordId,String lease,String fingerprint) {
        var job=tx.mutationJob(mutationId,lease,fingerprint);
        if(!job.recordIds().contains(recordId)) throw new CareerCommandException(409,"RECORD_NOT_IN_MUTATION");
        var record=tx.record(recordId,false).business();
        if(!record.categoryId().equals(job.categoryId())) throw new CareerCommandException(409,"MUTATION_RECORD_MOVED");
        tx.mutationCategory(job);
        if(job.target().type()==PropertyDefinitionType.RELATION)return new Read(record,null,tx.relationMutationRead(recordId,job));
        return new Read(record,tx.mutationTombstone(recordId,job));
    }
    public Result commit(Actor actor,CareerPropertyMutationCommand command) {
        return repository.transaction(actor,tx -> commit(tx,command));
    }
    public Result commit(Operations tx,CareerPropertyMutationCommand command) {
        var job=tx.mutationJob(command.mutationId(),command.leaseToken(),command.operationFingerprint());
        if(!job.recordIds().contains(command.recordId())) throw new CareerCommandException(409,"RECORD_NOT_IN_MUTATION");
        var receipt=tx.mutationReceipt(job.id(),command.recordId());
        if(receipt!=null) {
            if(!receipt.operationFingerprint().equals(job.operationFingerprint())) throw new CareerCommandException(409,"MUTATION_PLAN_CHANGED");
            return new Result(receipt.record(),receipt.changed(),true);
        }
        var stored=tx.record(command.recordId(),false);
        if(!stored.business().categoryId().equals(job.categoryId())) throw new CareerCommandException(409,"MUTATION_RECORD_MOVED");
        if(stored.business().version()!=command.expectedVersion()) throw CareerCommandException.stale();
        var category=tx.mutationCategory(job);
        if(category.categoryVersion()!=job.categoryVersion() || category.schemaVersion()!=job.schemaVersion()) throw new CareerCommandException(409,"CATEGORY_SCHEMA_CHANGED");
        var tombstone=tx.mutationTombstone(command.recordId(),job);
        // 원본 계획과 tombstone 출처는 유지하고 옵션 변환에는 소유자 범위의 검증 정의를 사용합니다.
        var effectiveTarget=category.business().propertyDefinitions().stream().filter(definition->definition.id().equals(job.target().id())).findFirst().orElseThrow(()->new CareerCommandException(409,"CATEGORY_SCHEMA_CHANGED"));
        var delta=CareerPropertyMutationValues.delta(job.kind(),job.source(),effectiveTarget,job.defaultValue(),job.confirmLossy(),stored.business().propertyValues(),tombstone);
        if(!delta.equals(command.propertyValues())) throw new CareerCommandException(409,"MUTATION_DELTA_MISMATCH");
        CareerValueValidation.validate(category.business(),delta.set());
        // 최종 delta도 B1 merge를 거쳐 누락된 ID와 배열 순서를 보존합니다.
        var patch=new PatchCareerBusinessCommand(Optional.empty(),Optional.of(delta),Optional.empty());
        var after=stored.business().apply(patch.changesFor(stored.business()),clock.instant());
        tx.guardCategory(category);tx.guardMutation(job,command.leaseToken());
        if(after!=stored.business()) {
            tx.save(stored,after,null,null,stored.unmapped(),false);
            var old=stored.business().propertyValues().stream().filter(value -> value.propertyDefinitionId().equals(job.target().id())).findFirst().orElse(null);
            if(job.kind().equals("deletion") && old!=null) tx.mutationTombstone(after,job,old);
            tx.computation(after,List.of(job.target().id()),Map.of(job.target().id(),job.target().version()),"mutation:"+job.id());
        }
        // 새 canonical 값이 있어도 검증한 삭제 세대의 보관 값은 같은 transaction에서 소비합니다.
        if(job.kind().equals("restoration") && tombstone!=null) tx.mutationTombstone(after,job,null);
        tx.rememberMutation(job,after,after!=stored.business());
        return new Result(after,after!=stored.business(),false);
    }
    public Result commitRelation(Operations tx,CareerRelationPropertyMutationCommand command) {
        var job=tx.mutationJob(command.mutationId(),command.leaseToken(),command.operationFingerprint());
        if(!job.recordIds().contains(command.recordId()))throw new CareerCommandException(409,"RECORD_NOT_IN_MUTATION");
        var receipt=tx.mutationReceipt(job.id(),command.recordId());
        if(receipt!=null){if(!receipt.operationFingerprint().equals(job.operationFingerprint()))throw new CareerCommandException(409,"MUTATION_PLAN_CHANGED");return new Result(receipt.record(),receipt.changed(),true);}
        if(job.target().type()!=PropertyDefinitionType.RELATION||job.target().system()||!Set.of("deletion","restoration").contains(job.kind()))throw new CareerCommandException(409,"MUTATION_DELTA_MISMATCH");
        return tx.commitRelationMutation(job,command);
    }
}
