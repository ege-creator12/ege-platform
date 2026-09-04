# ОСНОВА · ЕГЭ

Образовательная full-stack платформа подготовки к ЕГЭ-2027 по биологии и химии. Интерфейс — vanilla HTML/CSS/JS, API — Node.js, production-хранилище — PostgreSQL через `pg.Pool`.

## Архитектура

- `server.js` — HTTP/API, аутентификация, безопасная валидация ID, тренировки и единый JSON error handler.
- `src/db.js` — параметризованный PostgreSQL/SQLite adapter, миграции и транзакции.
- `migrations/postgres/` — production PostgreSQL schema; `migrations/` — локальная SQLite schema для быстрых тестов.
- `content/{biology,chemistry}/course.json` — версионируемый оригинальный контент отдельно от application code.
- `src/bootstrap.js` — идемпотентный upsert предметов, разделов, тем, уроков, блоков, вопросов и навыков.
- `public/` — SPA и собственные SVG-схемы; бинарные данные в БД не хранятся.

Модель контента: `subjects → sections → topics → lessons → lesson_blocks`. Банк заданий связывает вопрос с предметом, темой и уроком, хранит структурированные answer/explanation payload и поддерживает несколько skills с весом.

## Локальная разработка

```bash
npm install
npm run import-content   # применяет миграции и выполняет идемпотентный импорт
npm start
```

Без `DATABASE_URL` создаётся `./data/ege.sqlite`. `npm run seed` дополнительно создаёт только локальные демонстрационные аккаунты; не используйте его в production.

## PostgreSQL и Render

Задайте `DATABASE_URL` только в environment Render — строка подключения и пароли никогда не должны попадать в Git. Build command: `npm install`; start command: `npm start`; `NODE_ENV=production`. При старте миграции применяются транзакционно один раз и отмечаются в `schema_migrations`; повторный запуск не удаляет пользователей, attempts, XP или progress. Health Check Path: `/api/health` проверяет БД и наличие применённых миграций, не раскрывая реквизиты подключения.

Cookies имеют `HttpOnly`, `SameSite=Lax` и `Secure` в production. Пароли хешируются `scrypt`, session tokens создаются криптографическим генератором. API body ограничен 1 МБ.

## Контент и импорт

```bash
npm run import-content -- --dry-run
npm run import-content
```

Чтобы добавить предмет, создайте `content/<slug>/course.json` и включите файл в список импортера. Новый раздел/урок добавляется в `sections[].topics[].lesson`; новый вопрос — в `questions` темы с уникальным `key`. Импорт делает upsert по slug/external key и не создаёт дубликаты. `exam_year`, `source_version`, `content_version` и `updated_at` позволяют точечно обновлять материалы после публикации финальных документов ФИПИ.

## Проверки

```bash
npm run check
npm test
```

Integration suite проверяет повторные миграции/bootstrap, регистрацию и session persistence, content navigation, чтение урока, полный training answer flow, XP/statistics, bigint-safe recursive queries, 4xx edge cases, logout и rollback транзакции.

## API

Основные маршруты: `/api/health`, `/api/register`, `/api/login`, `/api/logout`, `/api/me`, `/api/subjects`, `/api/subjects/:slug`, `/api/sections/:id`, `/api/topics/:id`, `/api/lessons/:id`, `/api/lesson-progress/:id`, `/api/training/sessions` и маршруты `next/answer/finish`.

## Следующий этап

Текущая база даёт широкое покрытие программы (119 уроков и 238 стартовых заданий), но тексты являются опорными конспектами. Следующий редакционный этап — углубление каждого урока предметными таблицами/задачами, независимая экспертная проверка формулировок и расширение типов matching/sequence/number/image-based. Также нужны email verification, CSRF-защита админских операций, rate limiting на reverse proxy и регулярные backups PostgreSQL.
