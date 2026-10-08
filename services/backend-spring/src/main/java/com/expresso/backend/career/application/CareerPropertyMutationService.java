package com.expresso.backend.career.application;

import java.time.Clock;
import java.util.*;
import com.expresso.backend.career.application.CareerCommandRepository.*;
import com.expresso.backend.career.domain.*;

/** 내부 command port입니다. Controller·runtime bean으로 등록하지 않습니다. */
public final class CareerPropertyMutationService {
    private final CareerCommandRepository repository;
    private final Clock clock;
    public CareerPropertyMutationService(CareerCommandRepository repository,Clock clock) {this.repository=repository;this.clock=clock;}
    public record Result(CareerRecord record,boolean changed,boolean replayed) {}
    public record Read(CareerRecord record,PropertyValue tombstone) {}
    public Result receipt(Actor actor,String mutationId,String recordId,String fingerprint) {
        return repository.transaction(actor,tx -> {
            var receipt=tx.mutationReceipt(mutationId,recordId);
            if(receipt==null) return null;
            if(!receipt.operationFingerprint().equals(fingerprint)) throw new CareerCommandException(409,"MUTATION_PLAN_CHANGED");
            return new Result(receipt.record(),receipt.changed(),true);
        });
    }
    public Read read(Actor actor,String mutationId,String recordId,String lease,String fingerprint) {
        return repository.transaction(actor,tx -> {
            var job=tx.mutationJob(mutationId,lease,fingerprint);
            if(!job.recordIds().contains(recordId)) throw new CareerCommandException(409,"RECORD_NOT_IN_MUTATION");
            var record=tx.record(recordId,false).business();
            if(!record.categoryId().equals(job.categoryId())) throw new CareerCommandException(409,"MUTATION_RECORD_MOVED");
            return new Read(record,tx.mutationTombstone(recordId,job));
        });
    }
    public Result commit(Actor actor,CareerPropertyMutationCommand command) {
        return repository.transaction(actor,tx -> {
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
            var category=tx.category(job.categoryId());
            if(category.categoryVersion()!=job.categoryVersion() || category.schemaVersion()!=job.schemaVersion()) throw new CareerCommandException(409,"CATEGORY_SCHEMA_CHANGED");
            var tombstone=tx.mutationTombstone(command.recordId(),job);
            var delta=CareerPropertyMutationValues.delta(job.kind(),job.source(),job.target(),job.defaultValue(),job.confirmLossy(),stored.business().propertyValues(),tombstone);
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
        });
    }
}
