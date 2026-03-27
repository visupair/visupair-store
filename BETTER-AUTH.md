# Better Auth — Система аутентификации Visupair Store

> **Стек:** Better Auth v1.4.18 · Astro v6 (SSR) · Cloudflare D1 (SQLite) · Drizzle ORM · Resend · @cloudflare/vite-plugin (Miniflare/Workerd в dev)

---

## Содержание

1. [Архитектура](#1-архитектура)
2. [Файлы и их назначение](#2-файлы-и-их-назначение)
3. [Конфигурация сервера — `auth.ts`](#3-конфигурация-сервера--authts)
4. [Конфигурация клиента — `auth-client.ts`](#4-конфигурация-клиента--auth-clientts)
5. [API Route Handler — `[...all].ts`](#5-api-route-handler--allts)
6. [Middleware — `middleware.ts`](#6-middleware--middlewarets)
7. [Dev-среда: Vite plugin `auth-dev-error-recovery`](#7-dev-среда-vite-plugin-auth-dev-error-recovery)
8. [База данных — D1 Schema](#8-база-данных--d1-schema)
9. [Страницы аутентификации](#9-страницы-аутентификации)
10. [Environment Variables](#10-environment-variables)
11. [Безопасность — что сделано](#11-безопасность--что-сделано)
12. [Что работает ✅](#12-что-работает-)
13. [Что НЕ работает / нужно доделать ❌](#13-что-не-работает--нужно-доделать-)
14. [Известные особенности dev-среды](#14-известные-особенности-dev-среды)

---

## 1. Архитектура

```
┌─────────────┐         ┌──────────────────┐         ┌──────────────┐
│   Browser   │ ──fetch──▶  Astro SSR       │ ──D1──▶  Cloudflare   │
│  (client)   │◀──JSON── │  + Better Auth   │◀────── │  D1 Database │
└─────────────┘         └──────────────────┘         └──────────────┘
       │                        │
       │ (OAuth)                │ (email)
       ▼                        ▼
┌─────────────┐         ┌──────────────┐
│  Google     │         │   Resend     │
│  OAuth 2.0  │         │   Email API  │
└─────────────┘         └──────────────┘
```

**Поток аутентификации:**

1. Браузер отправляет POST на `/api/auth/sign-in/email` (или Google OAuth)
2. Astro route `src/pages/api/auth/[...all].ts` получает request
3. Создаёт Better Auth instance через `createAuth(d1Binding, env)`
4. Better Auth обрабатывает запрос (проверка пароля через scrypt, создание сессии)
5. Возвращает JSON ответ с session cookie

---

## 2. Файлы и их назначение

| Файл | Назначение |
|------|-----------|
| `src/lib/auth.ts` | **Серверная конфигурация** Better Auth (D1, Resend, Google OAuth, trustedOrigins) |
| `src/lib/auth-client.ts` | **Клиентская конфигурация** Better Auth (baseURL, signIn, signOut) |
| `src/lib/auth-schema.ts` | **Drizzle ORM схема** таблиц: user, session, account, verification |
| `src/pages/api/auth/[...all].ts` | **API Route Handler** — обрабатывает ВСЕ auth endpoints |
| `src/middleware.ts` | **Astro Middleware** — резолвит сессию, пропускает `/api/auth/*` |
| `src/pages/login/index.astro` | **Страница логина/регистрации** (email + Google OAuth) |
| `src/pages/forgot-password/index.astro` | **Запрос сброса пароля** (отправка email) |
| `src/pages/reset-password/index.astro` | **Установка нового пароля** (по токену из email) |
| `src/pages/account/profile.astro` | **Профиль пользователя** (смена имени, email, пароля) |
| `astro.config.mjs` | **Vite plugin** для перехвата `fetch failed` в dev |
| `wrangler.toml` | **Cloudflare конфигурация** (D1 binding: `visupair_store`) |
| `migrations/001_better_auth_initial.sql` | **Миграция** — таблицы user, session, account, verification |

---

## 3. Конфигурация сервера — `auth.ts`

**Путь:** `src/lib/auth.ts`

```typescript
export function createAuth(dbBinding: D1Database, env?: Record<string, string>) {
  return betterAuth({
    baseURL,                        // BETTER_AUTH_URL или "http://localhost:4321"
    basePath: "/api/auth",          // Все auth endpoints под /api/auth/*
    secret,                         // BETTER_AUTH_SECRET (≥ 32 символов)
    database: drizzleAdapter(db, { provider: "sqlite" }),  // Cloudflare D1

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      sendResetPassword: async ({ user, url }) => { /* Resend integration */ },
    },

    socialProviders: {
      google: { clientId, clientSecret },
    },

    trustedOrigins: ["http://localhost:4321", "http://localhost:8787", baseURL],
    trustHost: true,  // Обязательно для Cloudflare Workers
  });
}
```

### Ключевые параметры

| Параметр | Значение | Зачем |
|----------|---------|-------|
| `trustedOrigins` | `[localhost:4321, localhost:8787, baseURL]` | Защита от CSRF; без этого запросы отклоняются с `MISSING_OR_NULL_ORIGIN` |
| `trustHost: true` | `true` | Обязательно для Cloudflare Workers (нет прямого доступа к `Host` header) |
| `sendResetPassword` | Resend callback | Отправляет email со ссылкой сброса пароля |
| `requireEmailVerification` | `false` | Выключено для dev-окружения |

---

## 4. Конфигурация клиента — `auth-client.ts`

**Путь:** `src/lib/auth-client.ts`

```typescript
export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined"
    ? window.location.origin                    // В браузере: origin (без /api/auth!)
    : (import.meta.env.BETTER_AUTH_URL || "http://localhost:4321"),
});
```

### ⚠️ ВАЖНО: `baseURL` — это origin, НЕ полный путь

- ✅ Правильно: `http://localhost:4321`
- ❌ Неправильно: `http://localhost:4321/api/auth` (клиент добавит `/api/auth` автоматически → двойной путь)

`basePath` по умолчанию `/api/auth` — указывать НЕ нужно, если сервер использует такой же.

---

## 5. API Route Handler — `[...all].ts`

**Путь:** `src/pages/api/auth/[...all].ts`

Этот catch-all route обрабатывает ВСЕ auth API запросы Better Auth:

| Endpoint | Метод | Назначение |
|----------|-------|-----------|
| `/api/auth/sign-in/email` | POST | Вход по email + пароль |
| `/api/auth/sign-up/email` | POST | Регистрация |
| `/api/auth/sign-out` | POST | Выход (удаление session cookie) |
| `/api/auth/get-session` | GET | Получить текущую сессию |
| `/api/auth/forget-password` | POST | Запросить сброс пароля |
| `/api/auth/reset-password` | POST | Установить новый пароль по токену |
| `/api/auth/change-password` | POST | Сменить пароль (authenticated) |
| `/api/auth/change-email` | POST | Сменить email (authenticated) |
| `/api/auth/update-user` | POST | Обновить имя/данные (authenticated) |
| `/api/auth/callback/google` | GET | Google OAuth callback |

### Принцип работы

1. Получает D1 binding через `import("cloudflare:workers")`
2. Создаёт auth instance: `createAuth(dbBinding, env)`
3. Передаёт request: `auth.handler(request)` — **только Request, без второго аргумента**
4. Ошибки: `console.error` на сервер, клиенту — только `{"error": "Internal server error"}`

---

## 6. Middleware — `middleware.ts`

**Путь:** `src/middleware.ts`

### Что делает

1. **Пропускает** статические пути (`/`, `/about`) — `return next()`
2. **Пропускает** `/api/auth/*` — предотвращает циклический fetch в Miniflare
3. **Определяет валюту** через Cloudflare `CF-IPCountry` header
4. **Резолвит сессию** через `auth.api.getSession()` → записывает в `context.locals`

### ⚠️ Почему `/api/auth/*` пропускается

Если middleware вызовет `auth.api.getSession()` для auth routes, это создаст **циклический internal fetch**:

```
request → middleware → auth.api.getSession() → /api/auth/get-session → middleware → ...
```

В Miniflare это вызывает `Internal server error: fetch failed`.

---

## 7. Dev-среда: Vite plugin `auth-dev-error-recovery`

**Путь:** `astro.config.mjs`

### Проблема

В dev-окружении (Miniflare/Workerd) при неправильном пароле:

1. Better Auth хеширует пароль через `scryptAsync` (~64 MB RAM)
2. Возвращает HTTP 401
3. Workerd **рвёт TCP соединение** из-за memory pressure
4. `undici` бросает `TypeError: fetch failed`
5. `@cloudflare/vite-plugin` вызывает `next(err)` в Connect
6. Vite's `viteErrorMiddleware` перехватывает → показывает error overlay

### Решение

Vite plugin вставляет наш error handler **перед** `viteErrorMiddleware` через `stack.splice`:

```
Connect middleware stack:
[...] → [cloudflare plugin] → [...] → [authDevErrorHandler] → [viteErrorMiddleware]
```

Когда cloudflare plugin вызывает `next(fetchFailedError)`:
- Connect находит `authDevErrorHandler` **первым** (до Vite)
- Для auth routes + `fetch failed` → возвращает JSON `{"message": "Invalid email or password"}`
- Для остальных ошибок → `next(err)` → Vite обрабатывает нормально

### ⚠️ Эта проблема только в DEV

В продакшене (Cloudflare Workers) `scryptAsync` работает нативно и проблемы нет.

---

## 8. База данных — D1 Schema

**Путь:** `src/lib/auth-schema.ts`  
**Binding:** `visupair_store` (wrangler.toml)

### Таблицы Better Auth

| Таблица | Назначение |
|---------|-----------|
| `user` | Пользователи (id, name, email, emailVerified, image) |
| `session` | Активные сессии (token, expiresAt, userId, ipAddress, userAgent) |
| `account` | Аккаунты провайдеров (providerId: "credential" / "google", password hash) |
| `verification` | Токены верификации (email verification, password reset) |

### Дополнительные таблицы (не Better Auth)

| Таблица | Назначение |
|---------|-----------|
| `review` | Отзывы к продуктам |
| `favorite` | Избранные продукты |

### Миграции

```
migrations/
├── 001_better_auth_initial.sql   — user, session, account, verification
├── 002_add_favorites_table.sql   — favorite
└── 003_add_reviews.sql           — review
```

**Как применить миграции:**
```bash
npx wrangler d1 execute visupair-store --local --file=./migrations/001_better_auth_initial.sql
```

---

## 9. Страницы аутентификации

### `/login` — Вход / Регистрация

- **Вход:** POST на `/api/auth/sign-in/email` с `{ email, password }`
- **Регистрация:** POST на `/api/auth/sign-up/email` с `{ email, password, name }`
- **Google OAuth:** `authClient.signIn.social({ provider: "google" })`
- **Обработка ошибок:** проверка `Content-Type` → если не JSON → fallback message
- **Маппинг ошибок:** "Invalid email or password" → показ под полями формы

### `/forgot-password` — Запрос сброса пароля

- Отправляет POST на `/api/auth/forget-password` с `{ email, redirectTo }`
- Показывает "Check your email" при успехе (всегда, даже если email не существует — security)
- Better Auth создаёт токен в таблице `verification`, отправляет email через `sendResetPassword`

### `/reset-password` — Установка нового пароля (по токену)

- Получает `?token=...` из URL (из ссылки в email)
- Отправляет POST на `/api/auth/reset-password` с `{ token, newPassword }`
- Показывает success/error состояние

### `/account/profile` — Профиль пользователя

- **Защита:** SSR проверяет сессию → redirect на `/login` если не авторизован
- **Profile Form:** Смена имени
- **Email Form:** Смена email
- **Password Form:** Смена пароля (current + new + confirm)
- **Delete Account:** Удаление аккаунта

---

## 10. Environment Variables

**Файл:** `.env` (не коммитится в git!)

| Переменная | Обязательна | Назначение |
|-----------|------------|-----------|
| `BETTER_AUTH_SECRET` | ✅ | JWT секрет (≥ 32 символов). Генерация: `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | ✅ | Base URL сервера (`http://localhost:4321` для dev) |
| `GOOGLE_CLIENT_ID` | ✅ | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | ✅ | Google OAuth Client Secret |
| `RESEND_API_KEY` | ✅ | Resend API ключ для отправки email |
| `STRIPE_SECRET_KEY` | ✅ | Stripe секретный ключ |
| `STRIPE_PUBLISHABLE_KEY` | ✅ | Stripe публичный ключ |

---

## 11. Безопасность — что сделано

### ✅ Исправлено

| Проблема | Решение |
|----------|---------|
| `/api/test.ts` выводил env variables (секреты, ключи) | Файл удалён |
| Stack traces отправлялись клиенту в `[...all].ts` | Generic `{"error": "Internal server error"}` |
| Hardcoded `BETTER_AUTH_SECRET` в `setup-test-user.mjs` | Чтение из `process.env` + throw if missing |
| Сырые Stripe ошибки шли клиенту | Маппинг на user-friendly messages |
| `restock-notification.ts` выводил internal details | Убрано поле `details` из error response |
| Не было `trustedOrigins` | Добавлено: `[localhost:4321, localhost:8787, baseURL]` |
| `auth-client.ts` baseURL включал `/api/auth` | Исправлено: только origin |
| Middleware вызывал circular fetch для auth routes | Добавлен skip для `/api/auth/*` |
| `auth.handler()` с лишним вторым аргументом | Убран — только `auth.handler(request)` |
| Vite error overlay при неправильном пароле | `stack.splice` перед `viteErrorMiddleware` |
| `alert()` для ошибок оплаты | Toast notifications с поддержкой тем |

### Принципы безопасности

1. **Никогда** не отправлять `error.message`, `error.stack`, env variables клиенту
2. **Всегда** логировать детали только через `console.error` (серверная сторона)
3. **Никогда** не хардкодить секреты — только через `.env`
4. **Всегда** проверять `trustedOrigins` для Cloudflare Workers
5. **Никогда** не создавать публичные debug/test endpoints в production

---

## 12. Что работает ✅

- [x] **Регистрация** по email + пароль (POST `/api/auth/sign-up/email`)
- [x] **Вход** по email + пароль (POST `/api/auth/sign-in/email`)
- [x] **Выход** (POST `/api/auth/sign-out`)
- [x] **Google OAuth** (sign-in + sign-up)
- [x] **Сессии** — cookie-based, автоматическое продление
- [x] **Получение сессии** — `auth.api.getSession()` через middleware
- [x] **Защита страниц** — `/account/*` редиректит на `/login` без сессии
- [x] **Dev-среда** — `fetch failed` перехватывается, показывается JSON ошибка
- [x] **Forgot password UI** — форма отправляет запрос на `/api/auth/forget-password`
- [x] **Reset password UI** — форма отправляет запрос на `/api/auth/reset-password`
- [x] **sendResetPassword callback** — интеграция с Resend для отправки email

---

## 13. Что НЕ работает / нужно доделать ❌

### 13.1. ❌ Forgot Password — не отправляет email в dev

**Проблема:** Страница `/forgot-password` отправляет запрос на `/api/auth/forget-password`, но в dev-среде email фактически не доходит, потому что:
1. `RESEND_API_KEY` может быть не настроен или домен `visupair.com` не верифицирован в Resend
2. Better Auth в dev + Miniflare может столкнуться с тем же `fetch failed` при обращении к Resend API
3. Ошибки email отправки логируются на сервер, но НЕ сообщаются пользователю (by design — чтобы не раскрывать существование аккаунтов)

**Что нужно сделать:**
- [ ] Проверить, что `RESEND_API_KEY` в `.env` корректный
- [ ] Проверить, что домен `visupair.com` верифицирован в Resend dashboard
- [ ] Для тестирования можно временно использовать `from: "onboarding@resend.dev"` (Resend sandbox)
- [ ] Добавить dev-only логирование URL сброса: `console.log("[DEV] Reset URL:", url)` в `sendResetPassword` callback — чтобы можно было перейти по ссылке вручную без email

### 13.2. ❌ Reset Password — может не работать из-за `fetch failed` в dev

**Проблема:** Страница `/reset-password` отправляет POST на `/api/auth/reset-password` с `{ token, newPassword }`. Better Auth снова вызывает `scryptAsync` для хеширования нового пароля → может возникнуть та же проблема `fetch failed` в dev.

**Что нужно сделать:**
- [ ] Наш Vite error handler уже покрывает `/reset-password` маршрут (статус 503, сообщение "Password reset service temporarily unavailable") — нужно проверить, работает ли это
- [ ] На frontend'е заменить `alert()` на inline error messages (как на странице login)

### 13.3. ❌ Account Profile — Change Password НЕ работает (заглушка)

**Проблема:** На странице `/account/profile` форма "Change Password" **полностью заглушена** — она НЕ вызывает Better Auth API. Вместо этого:
```javascript
// Better Auth Integration:
// await authClient.changePassword({
//   currentPassword: currentPassword,
//   newPassword: newPassword
// });

// Simulate API call
await new Promise((r) => setTimeout(r, 1000));
alert("Password changed successfully.");
```

**Что нужно сделать:**
- [ ] Раскомментировать и реализовать вызов `authClient.changePassword()` или прямой `fetch('/api/auth/change-password', { method: 'POST', body: ... })`
- [ ] Обработать ошибки (неправильный текущий пароль, слишком короткий новый пароль)
- [ ] Заменить `alert()` на inline toast/message
- [ ] Учесть `fetch failed` в dev-среде

### 13.4. ❌ Account Profile — Update Name НЕ работает (заглушка)

**Проблема:** Форма "Profile" (имя/фамилия) тоже заглушена:
```javascript
// Better Auth Integration:
// await authClient.updateUser({
//   name: `${firstName} ${lastName}`
// });

// Simulate API call
await new Promise((r) => setTimeout(r, 800));
alert("Profile updated successfully.");
```

**Что нужно сделать:**
- [ ] Реализовать вызов `authClient.updateUser({ name })` или `fetch('/api/auth/update-user', ...)`
- [ ] Заменить `alert()` на inline toast/message

### 13.5. ❌ Account Profile — Change Email НЕ работает (заглушка)

**Проблема:** Форма смены email тоже заглушена:
```javascript
// Better Auth Integration:
// await authClient.changeEmail({
//   newEmail: email,
//   callbackURL: '/account/profile'
// });

// Simulate API call
await new Promise((r) => setTimeout(r, 800));
alert(`Verification email sent to ${email}.`);
```

**Что нужно сделать:**
- [ ] Реализовать вызов `authClient.changeEmail()` или прямой fetch
- [ ] Для смены email Better Auth требует верификацию — нужен email callback в `auth.ts`
- [ ] Заменить `alert()` на inline toast/message

### 13.6. ❌ Account Profile — Delete Account НЕ работает (заглушка)

**Проблема:** Кнопка "Delete Account" тоже заглушена:
```javascript
// Better Auth Integration:
// await authClient.deleteUser();

// Simulate API call
await new Promise((r) => setTimeout(r, 1500));
alert("Account deleted.");
```

**Что нужно сделать:**
- [ ] Реализовать вызов `authClient.deleteUser()` или прямой fetch
- [ ] Добавить подтверждение (ввод пароля или "type DELETE to confirm")
- [ ] После удаления — очистить cookies и redirect на `/`

### 13.7. ⚠️ Login page — Forgot Password ссылка

**Статус:** Ссылка "Forgot password?" на странице `/login` ведёт на `/forgot-password` — это работает. Но сам flow сброса не проверен end-to-end.

---

## 14. Известные особенности dev-среды

### `fetch failed` при неправильном пароле

**Причина:** Miniflare/Workerd + scryptAsync (~64 MB) → TCP connection drop.  
**Решение:** Vite plugin `auth-dev-error-recovery` в `astro.config.mjs`.  
**В продакшене:** Проблемы нет — Cloudflare Workers обрабатывают scrypt нативно.

### `Expected miniflare to be defined`

**Причина:** Запрос пришёл во время перезапуска dev-сервера (miniflare ещё не инициализирован).  
**Решение:** Просто подождать, пока сервер полностью запустится (`astro v6.0.5 ready in Xms`).

### Двойной `Re-optimizing dependencies`

**Причина:** Vite пересканирует зависимости после HMR или изменения конфига.  
**Решение:** Нормальное поведение, не ошибка.

### Session check в middleware вызывает circular fetch

**Причина:** `auth.api.getSession()` делает internal fetch → проходит через тот же middleware → бесконечный цикл.  
**Решение:** Middleware пропускает `/api/auth/*` routes (уже сделано).

---

## Как запустить

```bash
# 1. Установить зависимости
npm install

# 2. Создать .env файл
cp .env.example .env
# Заполнить все переменные (см. раздел 10)

# 3. Применить миграции
npx wrangler d1 execute visupair-store --local --file=./migrations/001_better_auth_initial.sql
npx wrangler d1 execute visupair-store --local --file=./migrations/002_add_favorites_table.sql
npx wrangler d1 execute visupair-store --local --file=./migrations/003_add_reviews.sql

# 4. Запустить dev сервер
npm run dev

# 5. Открыть http://localhost:4321/login
```

## Как тестировать аутентификацию

```bash
# Регистрация нового пользователя
curl -X POST http://localhost:4321/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:4321" \
  -d '{"email":"test@example.com","password":"testpass123","name":"Test User"}'

# Вход
curl -X POST http://localhost:4321/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:4321" \
  -d '{"email":"test@example.com","password":"testpass123"}'

# Неправильный пароль (проверка error handling)
curl -X POST http://localhost:4321/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:4321" \
  -d '{"email":"test@example.com","password":"wrongpassword"}'
# Ожидаемый ответ: {"message":"Invalid email or password"} HTTP 401
```

---

*Последнее обновление: март 2026*
