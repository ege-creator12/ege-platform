'use strict';

const database = require('./src/db');
const { rows, row } = database;

const json = (res, status, data) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
};

async function userFor(req) {
  const token = (req.headers.cookie || '').match(/(?:^|; )session=([^;]+)/)?.[1];
  if (!token) return null;
  return row('SELECT u.id,u.name,u.email,u.role,u.xp FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>CURRENT_TIMESTAMP', token);
}

async function requireUser(req, res) {
  const user = await userFor(req);
  if (!user) { json(res, 401, { error: 'Войдите в аккаунт' }); return null; }
  return user;
}

async function requireTeacher(req, res) {
  const user = await requireUser(req, res);
  if (!user) return null;
  const teacher = await row('SELECT user_id FROM teacher_users WHERE user_id=?', user.id).catch(() => null);
  if (!teacher && user.role !== 'admin') { json(res, 403, { error: 'Кабинет доступен только учителю' }); return null; }
  return user;
}

function lateState(dueAt, finishedAt, status) {
  if (!dueAt) return false;
  const due = new Date(dueAt).getTime();
  if (!Number.isFinite(due)) return false;
  const compare = status === 'completed' && finishedAt ? new Date(finishedAt).getTime() : Date.now();
  return Number.isFinite(compare) && compare > due;
}

const gradeJoin = `
  LEFT JOIN (
    SELECT tsq.session_id,
      SUM(
        CASE
          WHEN thr.score IS NOT NULL THEN thr.score
          WHEN COALESCE(att.correct,0) <> 0 THEN CASE WHEN COALESCE(q.max_score,q.points,1) < 1 THEN 1 ELSE COALESCE(q.max_score,q.points,1) END
          ELSE 0
        END
      ) AS score_points,
      SUM(CASE WHEN COALESCE(q.max_score,q.points,1) < 1 THEN 1 ELSE COALESCE(q.max_score,q.points,1) END) AS max_points
    FROM training_session_questions tsq
    JOIN questions q ON q.id=tsq.question_id
    LEFT JOIN attempts att ON att.id=tsq.attempt_id
    LEFT JOIN teacher_homework_reviews thr ON thr.session_id=tsq.session_id AND thr.question_id=tsq.question_id
    GROUP BY tsq.session_id
  ) hg ON hg.session_id=ts.id`;

async function fastTeacherResults(teacherId) {
  const data = await rows(`SELECT a.id assignment_id,a.title,a.subject_slug,a.exam_line,a.question_count,a.due_at,a.created_at,
      c.id class_id,c.name class_name,u.id user_id,u.name student_name,u.email student_email,
      tas.training_session_id,tas.started_at,ts.status training_status,ts.answered_count,ts.correct_count,ts.started_at session_started_at,ts.finished_at,
      COALESCE(hg.score_points,0) score_points,
      COALESCE(hg.max_points,a.question_count) max_points
    FROM teacher_assignments a
    JOIN teacher_classes c ON c.id=a.class_id
    JOIN teacher_assignment_students tas ON tas.assignment_id=a.id
    JOIN users u ON u.id=tas.user_id
    LEFT JOIN training_sessions ts ON ts.id=tas.training_session_id
    ${gradeJoin}
    WHERE a.teacher_id=?
    ORDER BY a.created_at DESC,a.id DESC,u.name,u.id`, teacherId);

  return data.map(item => {
    const status = item.training_status === 'completed' ? 'completed' : item.training_status === 'active' ? 'active' : 'assigned';
    const maxPoints = Math.max(1, Number(item.max_points || item.question_count || 1));
    const scorePoints = Math.max(0, Number(item.score_points || 0));
    return {
      ...item,
      assignment_id: Number(item.assignment_id),
      class_id: Number(item.class_id),
      user_id: Number(item.user_id),
      exam_line: Number(item.exam_line),
      question_count: Number(item.question_count),
      training_session_id: item.training_session_id ? Number(item.training_session_id) : null,
      answered_count: Number(item.answered_count || 0),
      correct_count: Number(item.correct_count || 0),
      score_points: scorePoints,
      max_points: maxPoints,
      accuracy: Math.round(scorePoints / maxPoints * 100),
      status,
      late: lateState(item.due_at, item.finished_at, status),
    };
  });
}

async function fastStudentPayload(userId) {
  const memberships = await rows(`SELECT c.id,c.name,c.join_code,u.name teacher_name,cs.joined_at
    FROM teacher_class_students cs
    JOIN teacher_classes c ON c.id=cs.class_id
    JOIN users u ON u.id=c.teacher_id
    WHERE cs.user_id=? ORDER BY cs.joined_at DESC`, userId);

  const assignments = await rows(`SELECT a.id,a.title,a.subject_slug,a.exam_line,a.question_count,a.due_at,a.created_at,c.name class_name,u.name teacher_name,
      tas.training_session_id,ts.status training_status,ts.answered_count,ts.correct_count,ts.finished_at,
      COALESCE(hg.score_points,0) score_points,
      COALESCE(hg.max_points,a.question_count) max_points
    FROM teacher_assignment_students tas
    JOIN teacher_assignments a ON a.id=tas.assignment_id
    JOIN teacher_classes c ON c.id=a.class_id
    JOIN users u ON u.id=a.teacher_id
    LEFT JOIN training_sessions ts ON ts.id=tas.training_session_id
    ${gradeJoin}
    WHERE tas.user_id=?
    ORDER BY CASE WHEN ts.status='completed' THEN 1 ELSE 0 END,a.due_at NULLS LAST,a.created_at DESC,a.id DESC`, userId).catch(async () => rows(`SELECT a.id,a.title,a.subject_slug,a.exam_line,a.question_count,a.due_at,a.created_at,c.name class_name,u.name teacher_name,
      tas.training_session_id,ts.status training_status,ts.answered_count,ts.correct_count,ts.finished_at,
      COALESCE(hg.score_points,0) score_points,
      COALESCE(hg.max_points,a.question_count) max_points
    FROM teacher_assignment_students tas
    JOIN teacher_assignments a ON a.id=tas.assignment_id
    JOIN teacher_classes c ON c.id=a.class_id
    JOIN users u ON u.id=a.teacher_id
    LEFT JOIN training_sessions ts ON ts.id=tas.training_session_id
    ${gradeJoin}
    WHERE tas.user_id=?
    ORDER BY a.created_at DESC,a.id DESC`, userId));

  return {
    memberships: memberships.map(x => ({ ...x, id: Number(x.id) })),
    assignments: assignments.map(item => {
      const status = item.training_status === 'completed' ? 'completed' : item.training_status === 'active' ? 'active' : 'assigned';
      const maxPoints = Math.max(1, Number(item.max_points || item.question_count || 1));
      const scorePoints = Math.max(0, Number(item.score_points || 0));
      return {
        ...item,
        id: Number(item.id),
        exam_line: Number(item.exam_line),
        question_count: Number(item.question_count),
        training_session_id: item.training_session_id ? Number(item.training_session_id) : null,
        answered_count: Number(item.answered_count || 0),
        correct_count: Number(item.correct_count || 0),
        score_points: scorePoints,
        max_points: maxPoints,
        grade_percent: Math.round(scorePoints / maxPoints * 100),
        status,
        late: lateState(item.due_at, item.finished_at, status),
      };
    }),
  };
}

async function handle(req, res, url) {
  const path = url.pathname;
  try {
    if (path === '/api/teacher/results' && req.method === 'GET') {
      const teacher = await requireTeacher(req, res); if (!teacher) return true;
      json(res, 200, { results: await fastTeacherResults(teacher.id) });
      return true;
    }
    if (path === '/api/teacher/student' && req.method === 'GET') {
      const user = await requireUser(req, res); if (!user) return true;
      json(res, 200, await fastStudentPayload(user.id));
      return true;
    }
  } catch (error) {
    json(res, Number(error?.status || 500), { error: error?.message || 'Не удалось загрузить данные' });
    return true;
  }
  return false;
}

module.exports = { handle, fastTeacherResults, fastStudentPayload };
