package com.expresso.backend.career.application;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import com.expresso.backend.career.domain.*;

public interface CareerCommandRepository {
    record Actor(String userId, String tokenHash) {}
    record StoredRecord(CareerRecord business, Instant deletedAt, Instant purgeAfter, long referenceVersion,
                        Map<String, CareerUnmappedPropertyEnvelope> unmapped) {}
    record Category(CareerCategory business, long schemaVersion, long categoryVersion) {}
    record Replay(String requestHash, CareerRecord record) {}
    record RecordLink(String id,String fromRecordId,String toRecordId,String relation) {}
    record Edge(String sourceRecordId, String sourcePropertyId, String targetRecordId, String inversePropertyId,
                String cardinality, String deletePolicy) {}
    record MutationJob(String id,String categoryId,long categoryVersion,long schemaVersion,String definitionsJson,
                       String kind,PropertyDefinition source,PropertyDefinition target,PropertyValue defaultValue,
                       boolean confirmLossy,List<String> recordIds,String operationFingerprint,String privateOptionSnapshotJson,String privateOptionSnapshotFingerprint) {}
    record MutationReceipt(String operationFingerprint,CareerRecord record,boolean changed) {}
    <T> T transaction(Actor actor, Function<Operations, T> work);
    interface Operations {
        StoredRecord record(String id, boolean deleted);
        Category category(String id);
        Category mutationCategory(MutationJob job);
        void guardCategory(Category category);
        void guardActive(List<String> ids);
        void insert(CareerRecord record);
        default void validateUnmappedMove(StoredRecord before, Map<String, CareerUnmappedPropertyEnvelope> unmapped) {}
        void save(StoredRecord before, CareerRecord after, Instant deletedAt, Instant purgeAfter,
                  Map<String, CareerUnmappedPropertyEnvelope> unmapped, boolean move);
        Replay replay(String key);
        void remember(String key, String requestHash, CareerRecord record);
        void computation(CareerRecord record, List<String> changedIds, Map<String, Long> definitionVersions, String suffix);
        RecordLink recordLink(String fromRecordId,String toRecordId,String relation);
        List<RecordLink> recordLinks(String recordId);
        void insertRecordLink(RecordLink link);
        List<Edge> edges(String recordId, String propertyId);
        void removeEdge(Edge edge);
        void insertEdge(Edge edge);
        Map<String,Object> relationMutationRead(String recordId,MutationJob job);
        CareerPropertyMutationService.Result commitRelationMutation(MutationJob job,CareerRelationPropertyMutationCommand command);
        MutationJob mutationJob(String id,String lease,String fingerprint);
        MutationReceipt mutationReceipt(String mutationId,String recordId);
        void guardMutation(MutationJob job,String lease);
        PropertyValue mutationTombstone(String recordId,MutationJob job);
        void mutationTombstone(CareerRecord record,MutationJob job,PropertyValue value);
        void rememberMutation(MutationJob job,CareerRecord record,boolean changed);
    }
}
