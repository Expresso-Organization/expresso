import assert from 'node:assert/strict';
import { MongoClient } from '../../../backend/node_modules/mongodb/lib/index.js';
import { migrateMongo } from '../../../../packages/database/dist/mongo-migrate.js';
import { loadMongoMigrations } from '../../../../packages/database/dist/mongo-migrations.js';

const [url, databaseName, userId, recordId] = process.argv.slice(2);
if (!url || !/^expresso_test_pr153_legacy_[a-f0-9]{32}$/.test(databaseName ?? '')) throw new Error('disposable PR153 DB required');
const migrations = await loadMongoMigrations();
await migrateMongo({ databaseUrl: url, databaseName, migrations: migrations.filter(item => item.version < '0017') });
const client = new MongoClient(url);
await client.connect();
try {
  const db = client.db(databaseName), now = new Date('2026-10-30T00:00:00Z');
  const shared = await db.collection('career_categories').findOne({ key: 'project', userId: null });
  assert.ok(shared);
  const plan = await db.collection('plans').findOne({ code: 'free' });
  assert.ok(plan);
  await db.collection('users').insertOne({ _id: userId, email: 'pr153-legacy@example.test', displayName: 'Legacy fixture', planId: plan._id, createdAt: now, deletionRequestedAt: null, lifecycleVersion: 0 });
  await db.collection('career_records').insertOne({ _id: recordId, userId, categoryId: shared._id, title: 'Legacy record', status: 'draft', origin: 'manual', properties: { role: { type: 'number', value: 42 }, historicalKey: { type: 'text', value: ' 원본 ' } }, unmappedProperties: { pastScalar: 'unchanged', pastNull: null, pastList: [1, 'two'] }, bodyMd: '', version: 1, referenceVersion: 0, createdAt: now, updatedAt: now, deletedAt: null, purgeAfter: null }, { bypassDocumentValidation: true });
  await migrateMongo({ databaseUrl: url, databaseName });
  const record = await db.collection('career_records').findOne({ _id: recordId });
  const category = await db.collection('career_categories').findOne({ _id: record.categoryId });
  const role = category.propertySchemaV2.find(definition => definition.key === 'role');
  assert.deepEqual(record.unmappedProperties[role.id], { type: 'number', value: 42 });
  assert.deepEqual(record.unmappedProperties.historicalKey, { type: 'text', value: ' 원본 ' });
  assert.deepEqual(record.propertyValues, []);
  assert.equal(await db.collection('schema_migrations').countDocuments({ state: 'applied' }), 25);
  console.log('PR153 fixture: actual 0017 raw keys and canonical forward preparation complete');
} finally { await client.close(); }
