import type { MongoMigrationStep } from "../../mongo-migrations.js";
export async function careerCoachingSteps(): Promise<MongoMigrationStep[]> {
 return [{ id: "career-coaching:state", async run(db) {
 if(!await db.listCollections({name:"career_coaching"},{nameOnly:true}).hasNext()) await db.createCollection("career_coaching",{validator:{$jsonSchema:{bsonType:"object",required:["_id","userId","state"],properties:{_id:{bsonType:"string"},userId:{bsonType:"string"},state:{bsonType:"object"}}}}});
 await db.collection("career_coaching").createIndex({userId:1},{unique:true,name:"one_coaching_state_per_user"});
 } }];
}
