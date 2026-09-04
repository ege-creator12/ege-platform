const db=require('../src/db');
const dryRun=process.argv.includes('--dry-run');
(async()=>{if(dryRun){for(const name of ['biology','chemistry']){const c=require(`../content/${name}/course.json`);console.log(`${name}: ${c.sections.length} sections, ${c.sections.reduce((n,s)=>n+s.topics.length,0)} topics`)}return}await db.migrate();console.log('Content import completed (idempotent upsert).');await db.close()})().catch(e=>{console.error(e);process.exitCode=1});
