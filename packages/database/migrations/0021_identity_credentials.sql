alter table "user"
  add column password_hash text,
  add constraint user_password_hash_format check (
    password_hash is null
    or password_hash ~ '^scrypt\$[0-9]+\$[0-9]+\$[0-9]+\$[0-9a-f]{32}\$[0-9a-f]{128}$'
  );

comment on column "user".password_hash is
  'scrypt$N$r$p$salt$derivedKey. null means the account has no password credential (social sign-in only).';
