const { scryptSync, randomBytes } = require('node:crypto');
const db = require('../src/db');
const hash=p=>{const salt=randomBytes(16).toString('hex');return `${salt}:${scryptSync(p,salt,64).toString('hex')}`};
(async()=>{await db.migrate();for(const u of [['Администратор','admin@ege.local','Admin123!','admin'],['Александра','student@ege.local','Student123!','student']])if(!await db.row('SELECT id FROM users WHERE email=?',u[1]))await db.run('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)',u[0],u[1],hash(u[2]),u[3]);console.log('Seed complete (local demo users only).');await db.close()})().catch(e=>{console.error(e);process.exitCode=1});
