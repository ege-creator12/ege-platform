'use strict';

const moderator = require('./server-moderator');
const teacher = require('./server-teacher');
const teacherV2 = require('./server-teacher-v2');
const teacherV3 = require('./server-teacher-v3');
const teacherBatch = require('./server-teacher-batch');
const teacherHomeworkRelaxed = require('./server-teacher-homework-relaxed');
const teacherFinalizeGuard = require('./server-teacher-finalize-guard');
const teacherFastRead = require('./server-teacher-fast-read');

if (!moderator.__teacherConsolePatched) {
  const originalEnsureSchema = moderator.ensureSchema.bind(moderator);
  const originalHandle = moderator.handle.bind(moderator);

  moderator.ensureSchema = async function ensureSchemaWithTeacher() {
    await originalEnsureSchema();
    await teacher.ensureSchema();
    await teacherV3.ensureSchema();
    await teacherBatch.ensureSchema();
  };

  moderator.handle = async function handleWithTeacher(req, res, url) {
    if (await teacherFastRead.handle(req, res, url)) return true;
    if (await teacherFinalizeGuard.handle(req, res, url)) return true;
    if (await teacherHomeworkRelaxed.handle(req, res, url)) return true;
    if (await teacherBatch.handle(req, res, url)) return true;
    if (await teacherV3.handle(req, res, url)) return true;
    if (await teacherV2.handle(req, res, url)) return true;
    if (await teacher.handle(req, res, url)) return true;
    return originalHandle(req, res, url);
  };

  Object.defineProperty(moderator, '__teacherConsolePatched', { value: true });
}

module.exports = teacher;
