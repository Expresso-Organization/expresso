const replicaSetName = process.env.MONGO_REPLICA_SET_NAME || "rs0";
const memberHost = process.env.MONGO_REPLICA_SET_MEMBER_HOST || "localhost:57017";
const databaseName = process.env.MONGO_DATABASE || "expresso";
const adminUsername = process.env.MONGO_INITDB_ROOT_USERNAME;
const adminPassword = process.env.MONGO_INITDB_ROOT_PASSWORD;
const runtimeUsername = process.env.MONGO_RUNTIME_USERNAME;
const runtimePassword = process.env.MONGO_RUNTIME_PASSWORD;
const migrationUsername = process.env.MONGO_MIGRATION_USERNAME;
const migrationPassword = process.env.MONGO_MIGRATION_PASSWORD;

if (!adminUsername || !adminPassword || !runtimeUsername || !runtimePassword
  || !migrationUsername || !migrationPassword) {
  throw new Error("MongoDB initialization credentials are incomplete");
}
if (new Set([adminUsername, runtimeUsername, migrationUsername]).size !== 3) {
  throw new Error("MongoDB initialization accounts must be distinct");
}

const adminDb = db.getSiblingDB("admin");
const authenticated = adminDb.auth(adminUsername, adminPassword);
if (authenticated !== 1 && authenticated?.ok !== 1) {
  throw new Error("MongoDB administrator authentication failed");
}

const replicaSet = rs;
let configured = false;
try {
  const status = replicaSet.status();
  configured = status.ok === 1;
} catch (error) {
  const code = error && typeof error === "object" ? error.code : undefined;
  if (code !== 94) {
    throw new Error("MongoDB replica-set status check failed");
  }
}

if (!configured) {
  const initiated = replicaSet.initiate({
    _id: replicaSetName,
    members: [{ _id: 0, host: memberHost }],
  });
  if (initiated.ok !== 1) {
    throw new Error("MongoDB replica-set initialization failed");
  }
}

function readReplicaConfig() {
  const status = replicaSet.status();
  const config = replicaSet.conf();
  if (status.set !== replicaSetName || config._id !== replicaSetName) {
    throw new Error("MongoDB replica-set name conflicts with rs0");
  }
  if (config.members.length !== 1 || config.members[0].host !== memberHost) {
    throw new Error("MongoDB replica-set members conflict with the local setup");
  }
  return status;
}

let primary = false;
for (let attempt = 0; attempt < 60; attempt += 1) {
  const hello = adminDb.runCommand({ hello: 1 });
  primary = hello.setName === replicaSetName && hello.isWritablePrimary === true;
  if (primary) break;
  sleep(500);
}
if (!primary) {
  throw new Error("MongoDB rs0 primary is unavailable");
}
readReplicaConfig();

const applicationDb = db.getSiblingDB(databaseName);
const runtimeRole = "expressoRuntime";
const runtimePrivileges = [{
  resource: { db: databaseName, collection: "" },
  actions: [
    "collStats",
    "dbHash",
    "dbStats",
    "find",
    "killCursors",
    "listCollections",
    "listIndexes",
    "remove",
    "insert",
    "update",
  ],
}];
const currentRole = applicationDb.getRole(runtimeRole, { showPrivileges: true });
function normalizePrivileges(privileges) {
  return privileges.map((privilege) => ({
    resource: {
      db: privilege.resource.db,
      collection: privilege.resource.collection,
    },
    actions: [...privilege.actions].sort(),
  })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}
if (!currentRole) {
  applicationDb.createRole({ role: runtimeRole, privileges: runtimePrivileges, roles: [] });
} else if (JSON.stringify(normalizePrivileges(currentRole.privileges))
  !== JSON.stringify(normalizePrivileges(runtimePrivileges))) {
  throw new Error("MongoDB runtime role conflicts with the restricted local role");
}

function ensureUser(username, password, roles) {
  const currentUser = applicationDb.getUser(username);
  if (!currentUser) {
    applicationDb.createUser({ user: username, pwd: password, roles });
    return;
  }
  const roleKeys = (items) => items.map(({ role, db }) => `${db}:${role}`).sort();
  if (JSON.stringify(roleKeys(currentUser.roles)) !== JSON.stringify(roleKeys(roles))) {
    throw new Error("MongoDB existing user roles conflict with the local setup");
  }
}

ensureUser(runtimeUsername, runtimePassword, [{ role: runtimeRole, db: databaseName }]);
ensureUser(migrationUsername, migrationPassword, [{ role: "dbOwner", db: databaseName }]);
print("MongoDB rs0 primary and local roles are ready");
