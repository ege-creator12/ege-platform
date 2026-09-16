'use strict';

const moderator = require('./server-moderator');
const teacher = require('./server-teacher');
const teacherV2 = require('./server-teacher-v2');

if (!moderator.__teacherConsolePatched) {
  const originalEnsureSchema = moderator.ensureSchema.bind(moderator);
  const originalHandle = moderator.handle.bind(moderator);

  moderator.ensureSchema = async function ensureSchemaWithTeacher() {
    await originalEnsureSchema();
    await teacher.ensureSchema();
  };

  moderator.handle = async function handleWithTeacher(req, res, url) {
    if (await teacherV2.handle(req, res, url)) return true;
    if (await teacher.handle(req, res, url)) return true;
    return originalHandle(req, res, url);
  };

  Object.defineProperty(moderator, '__teacherConsolePatched', { value: true });
}

module.exports = teacher;
