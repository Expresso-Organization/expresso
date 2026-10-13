import { migrateMongo } from '../../../../packages/database/dist/mongo-migrate.js';
const [url, databaseName] = process.argv.slice(2);
if (!url || !/^expresso_test_(?:b1|prc)_java_[a-f0-9]+$/.test(databaseName ?? '')) throw new Error('disposable test DB name required');
const result = await migrateMongo({ databaseUrl: url, databaseName });
if (!result.applied.some((label) => label.startsWith('0014_'))) throw new Error('compiled forward migration 0014 must be applied');
