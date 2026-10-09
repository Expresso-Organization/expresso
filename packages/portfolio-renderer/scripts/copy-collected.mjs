import fs from 'node:fs';
fs.cpSync(new URL('../src/collected/',import.meta.url),new URL('../dist/collected/',import.meta.url),{recursive:true});
