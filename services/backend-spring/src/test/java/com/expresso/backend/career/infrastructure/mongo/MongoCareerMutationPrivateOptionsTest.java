package com.expresso.backend.career.infrastructure.mongo;
import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import com.expresso.backend.career.application.*;
import com.expresso.backend.career.application.CareerCommandRepository.MutationJob;
import com.expresso.backend.career.domain.*;
class MongoCareerMutationPrivateOptionsTest {
    String id(int n){return "00000000-0000-4000-8000-"+String.format("%012d",n);}
    MutationJob job(String raw,String hash){var target=new PropertyDefinition(id(3),"tags","tags",PropertyDefinitionType.MULTI_SELECT,false,false,Map.of("legacyFreeformTags",true,"options",List.of()),0,1,null);return new MutationJob(id(4),id(2),1,1,"[]","conversion",target,target,null,false,List.of(id(5)),"a".repeat(64),raw,hash);}
    @Test void strictSnapshotRejectsDuplicatesUnsortedRowsAndTrailingJson(){
        var row="{\"categoryId\":\""+id(2)+"\",\"optionId\":\""+id(6)+"\",\"propertyId\":\""+id(3)+"\",\"rawLabel\":\" A \",\"userId\":\""+id(1)+"\",\"version\":1}";
        var valid="["+row+"]";assertEquals(" A ",MongoCareerMutationPrivateOptions.rows(id(1),job(valid,CareerMoveTokens.hash(valid))).getFirst().getString("rawLabel"));
        for(var invalid:List.of("["+row+","+row+"]",valid+" []","["+row.replace("\"version\":1","\"version\":1,\"version\":1")+"]","["+row.replace("\"version\":1","\"version\":1.0")+"]"))assertThrows(CareerCommandException.class,()->MongoCareerMutationPrivateOptions.rows(id(1),job(invalid,CareerMoveTokens.hash(invalid))));
        var second=row.replace(id(6),id(7)).replace(" A "," B ");var unsorted="["+second+","+row+"]";assertThrows(CareerCommandException.class,()->MongoCareerMutationPrivateOptions.rows(id(1),job(unsorted,CareerMoveTokens.hash(unsorted))));
    }
    @Test void exactSnapshotRequiresCanonicalObjectKeysWhitespaceAndEscaping(){
        var row="{\"categoryId\":\""+id(2)+"\",\"optionId\":\""+id(6)+"\",\"propertyId\":\""+id(3)+"\",\"rawLabel\":\"A/한글\",\"userId\":\""+id(1)+"\",\"version\":1}";
        var valid="["+row+"]";assertEquals("A/한글",MongoCareerMutationPrivateOptions.rows(id(1),job(valid,CareerMoveTokens.hash(valid))).getFirst().getString("rawLabel"));
        for(var raw:List.of(valid.replace("[", "[ "),valid.replace("A/", "\\u0041/"),valid.replace("A/", "A\\/"),valid.replace("\"version\":1", "\"version\":1e0"),"[{\"version\":1,"+row.substring(1,row.length()-13)+"}]"))assertThrows(CareerCommandException.class,()->MongoCareerMutationPrivateOptions.rows(id(1),job(raw,CareerMoveTokens.hash(raw))),raw);
    }
    MutationJob residualTextJob(String kind,String raw,String hash){
        var source=new PropertyDefinition(id(3),"tags","tags",PropertyDefinitionType.TEXT,false,false,Map.of(),0,2,kind.equals("restoration")?java.time.Instant.EPOCH:null);
        var target=new PropertyDefinition(id(3),"tags","tags",PropertyDefinitionType.TEXT,false,false,Map.of(),0,3,kind.equals("deletion")?java.time.Instant.EPOCH:null);
        return new MutationJob(id(4),id(2),3,3,"[]",kind,source,target,null,false,List.of(id(5)),"a".repeat(64),raw,hash);
    }
    @Test void textFollowupMutationAcceptsFrozenResidualLedgerWithoutDependingOnCurrentSelectType(){
        var raw="[{\"categoryId\":\""+id(2)+"\",\"optionId\":\""+id(6)+"\",\"propertyId\":\""+id(3)+"\",\"rawLabel\":\" Own \",\"userId\":\""+id(1)+"\",\"version\":1}]";
        for(var kind:List.of("deletion","restoration")) {
            var rows=MongoCareerMutationPrivateOptions.rows(id(1),residualTextJob(kind,raw,CareerMoveTokens.hash(raw)));
            assertEquals(1,rows.size());assertEquals(id(6),rows.getFirst().getString("optionId"));assertEquals(" Own ",rows.getFirst().getString("rawLabel"));
        }
    }
    @Test void residualTextSnapshotStillRejectsForeignScopeInvalidUuidMetadataAndChangedBytes(){
        var raw="[{\"categoryId\":\""+id(2)+"\",\"optionId\":\""+id(6)+"\",\"propertyId\":\""+id(3)+"\",\"rawLabel\":\" Own \",\"userId\":\""+id(1)+"\",\"version\":1}]";
        for(var invalid:List.of(raw.replace(id(1),id(9)),raw.replace(id(2),id(9)),raw.replace(id(3),id(9)),raw.replace(id(6),"not-a-uuid"),raw.replace("\"version\":1","\"metadata\":{},\"version\":1"),raw.replace(" Own ","Own"))) {
            var hash=invalid.equals(raw.replace(" Own ","Own"))?CareerMoveTokens.hash(raw):CareerMoveTokens.hash(invalid);
            var error=assertThrows(CareerCommandException.class,()->MongoCareerMutationPrivateOptions.rows(id(1),residualTextJob("deletion",invalid,hash)));
            assertEquals("PRIVATE_OPTION_SNAPSHOT_CHANGED",error.getMessage());
        }
    }
}