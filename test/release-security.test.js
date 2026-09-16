'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const security = require('../server-release-security-preload');

test('release security permanently blocks legacy owner-claim routes', () => {
  assert.equal(security.blockedPrivilegedPath('/api/owner-claim/anything'), true);
  assert.equal(security.blockedPrivilegedPath('/api/owner-claim'), true);
  assert.equal(security.blockedPrivilegedPath('/api/admin-console/overview'), false);
});

test('teacher API sanitizer removes all email fields recursively', () => {
  const input = {
    email: 'teacher@example.invalid',
    student_email: 'student@example.invalid',
    studentEmail: 'student2@example.invalid',
    name: 'Ученик',
    nested: {
      email: 'nested@example.invalid',
      rows: [{ student_email: 'hidden@example.invalid', score: 7 }],
    },
  };
  const output = security.sanitizeTeacherPayload(input);
  assert.equal(output.email, undefined);
  assert.equal(output.student_email, undefined);
  assert.equal(output.studentEmail, undefined);
  assert.equal(output.nested.email, undefined);
  assert.equal(output.nested.rows[0].student_email, undefined);
  assert.equal(output.nested.rows[0].score, 7);
  assert.equal(output.name, 'Ученик');
});
