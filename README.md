# ОСНОВА · ЕГЭ

Образовательная full-stack платформа подготовки к ЕГЭ-2027 по биологии и химии. Интерфейс — vanilla HTML/CSS/JS, API — Node.js, production-хранилище — PostgreSQL через `pg.Pool`.

## Архитектура

- `server.js` — HTTP/API, аутентификация, безопасная валидация ID, тренировки и единый JSON error handler.
- `src/db.js` — параметризованный PostgreSQL/SQLite adapter, миграции и транзакции.
- `migrations/postgres/` — production PostgreSQL schema; `migrations/` — локальная SQLite schema для быстрых тестов.
- `content/{biology,chemistry}/course.json` — версионируемый оригинальный контент отдельно от application code.
- `src/bootstrap.js` — идемпотентный upsert предметов, разделов, тем, уроков, блоков, вопросов и навыков.
- `public/` — SPA и собственные SVG-схемы; бинарные данные в БД не хранятся.

Модель контента: `subjects → sections → topics` (с `parent_id` для неограниченной вложенности и подтем) `→ lessons → lesson_blocks`. Банк заданий связывает вопрос с предметом, темой и уроком, хранит структурированные answer/explanation payload и поддерживает несколько skills с весом.

Контроль программы отделён от дерева подачи: `exam_spec_items` хранит год, код кодификатора, линии, навыки, сложность, обязательность, версию источника и редакционный статус; `content_coverage` связывает пункт с теоретическими блоками и заданиями. `coverageReport` считает проверенные блоки, задания и представленные линии и помечает пункты, где нет теории либо меньше двух заданий. Данные доступны будущей админ-панели через `GET /api/admin/coverage?subject=biology&year=2027`.

Урок поддерживает блоки `heading`, `text`, `definition`, `remember`, `table`, `comparison`, `example`, `algorithm`, `exam_trap`, `image`, `diagram`, `experiment`, `ege_example`, `deep_dive`, `summary`, `quiz`. `deep_dive` маркируется «Глубже ЕГЭ» и отделяется от обязательного покрытия. Задания поддерживают `multiple_answer`, `sequence`, `matching`, `table`, `image`, `diagram`, `graph`, `experiment`, `calculation`, `genetics_problem`, `biological_process_analysis`, `text_analysis`, `short_answer`, `extended_answer`.

`media_assets` содержит только путь, MIME (`SVG`, `PNG`, `WebP`), alt-текст, размеры и JSON metadata; бинарные файлы остаются в `public/images`. Отсутствующий файл выявляется валидатором до записи в БД.

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

Чтобы добавить предмет, создайте `content/<slug>/course.json` и включите файл в список импортера. Новый раздел/урок добавляется в `sections[].topics[].lesson`; новый вопрос — в `questions` темы с уникальным `key`. Импорт валидирует типы, ключи и изображения, делает upsert по slug/external key и не создаёт дубликаты. Биология маркирована `exam_year=2027`, `source_version="FIPI EGE 2027 project"`; mapping можно обновлять независимо от дерева уроков. Старые черновые вопросы не удаляются: они получают статус `legacy`, продолжают работать в тренировках, но не считаются проверенным покрытием.

## Проверки

```bash
npm run check
npm test
```

Integration suite проверяет повторные миграции/bootstrap, регистрацию и session persistence, content navigation, чтение урока, полный training answer flow, XP/statistics, bigint-safe recursive queries, 4xx edge cases, logout и rollback транзакции.

## API

Основные маршруты: `/api/health`, `/api/register`, `/api/login`, `/api/logout`, `/api/me`, `/api/subjects`, `/api/subjects/:slug`, `/api/sections/:id`, `/api/topics/:id`, `/api/lessons/:id`, `/api/lesson-progress/:id`, `/api/training/sessions` и маршруты `next/answer/finish`.

## Следующий этап

Карта биологии уже содержит все крупные разделы программы, но намеренно не выдаёт каркас за готовый курс. Проверенными эталонами служат уроки по эксперименту, реализации генетической информации и моногибридному скрещиванию с оригинальными заданиями разных механик. Следующий PR может пакетно добавлять редакционно проверенные уроки и задания: coverage-отчёт покажет оставшиеся пробелы, а стабильные ключи обеспечат безопасный повторный импорт без воздействия на пользователей, XP, attempts и progress.
