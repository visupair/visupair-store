# 📚 Visupair Store - Техническая Документация

**Последнее обновление:** 13 марта 2026  
**Версия:** 1.0

---

## 🚀 Быстрый старт

### Запуск проекта

```bash
# Клонирование и установка
git clone <repo-url>
cd visupair-store
npm install

# Настройка окружения
cp .env.example .env
# Заполните все переменные окружения

# Запуск dev-сервера
npm run dev

# Сборка для production
npm run build
npm run preview
```

### Деплой на Cloudflare

Современный Astro 6 + `@astrojs/cloudflare` собирает Worker и статику в `dist/`; деплой — через **Workers** (`wrangler deploy`), а не `pages deploy dist`.

```bash
npm run build
npx wrangler deploy
```

Либо одной командой: `npm run deploy`. Переменные окружения для продакшена задайте в дашборде Cloudflare для этого Worker или через `wrangler secret put`.

---

## 🏗️ Архитектура проекта

### Hybrid Rendering

```
Astro Hybrid Mode
├─ STATIC (prerender: true)
│  ├─ / (Homepage) → CDN, мгновенная загрузка
│  └─ /about → CDN
│
└─ SSR (default)
   ├─ /store/* → Edge Worker
   ├─ /account/* → Edge Worker
   └─ /api/* → Edge Worker
```

---

## 🎨 Hero Section - Анимированный градиент

### Анимация

**Плавающие световые эффекты:**
- 2 больших радиальных градиента (violet + lime)
- Плавное случайное движение (20s / 25s циклы)
- Адаптация под светлую/тёмную тему
- GPU-ускорение (CSS animations)

**Lottie анимация:**
- Динамическая загрузка при появлении в viewport
- Легкая версия `lottie_light` (~60KB)
- Для устройств < 400px: статические изображения

### Оптимизация

- Статический HTML (prerender)
- WebP изображения с eager loading
- Разделение кода (code splitting)
- Плавные переходы между темами

---

## 🔐 Авторизация

### Better Auth + D1 Database

**SSR страницы:**
- Middleware проверяет сессию на сервере
- `Astro.locals.user` доступен в компонентах

**Static страницы:**
- JavaScript проверяет сессию на клиенте
- `/api/auth/get-session` endpoint
- `window.updateAccountSidebar(user)` для обновления UI

**Безопасность:**
- HttpOnly cookies (защита от XSS)
- CSRF protection
- Encrypted session tokens

---

## 💰 Dual Currency System

### Автоматическое определение

**Cloudflare Geolocation:**
```typescript
const country = request.headers.get("cf-ipcountry");
const currency = getCurrencyByCountry(country); // PLN / EUR
```

**Обменный курс:**
- Фиксированный rate из `.env`
- Реальная валюта (PLN) хранится в Sanity
- EUR рассчитывается на лету
- Отображение с правильными символами (zł / €)

### Checkout Flow

```
Cart → Адрес → Доставка → Платёж
       ↓          ↓          ↓
    Currency  Furgonetka  Stripe
   Detection    API      PaymentIntent
```

---

## 📦 Доставка (Furgonetka Integration)

### Обязательные данные в Sanity CMS

Для каждого физического продукта:
```
Shipping Details (required)
├─ Weight (kg)
├─ Width (cm)
├─ Height (cm)
└─ Length (cm)
```

### API Flow

1. **Получение тарифов:**
   ```typescript
   POST /api/shipping/rates
   {
     parcel: { weight, width, height, length },
     receiver: { city, zip, country }
   }
   ```

2. **Создание заказа:**
   ```typescript
   POST /api/shipping/create-order
   {
     shipping_id: "uuid",
     quote_id: "selected_service_id"
   }
   ```

### Настройка окружения

```env
FURGONETKA_API_KEY=your_api_key
FURGONETKA_SANDBOX=true          # Для разработки
FURGONETKA_SHOP_NAME="Visupair"
FURGONETKA_SHOP_EMAIL="shop@visupair.com"
FURGONETKA_SHOP_PHONE="+48123456789"
FURGONETKA_SHOP_STREET="Ulica 123"
FURGONETKA_SHOP_CITY="Warszawa"
FURGONETKA_SHOP_ZIP="00-001"
FURGONETKA_SHOP_COUNTRY="PL"
```

---

## 💳 Оплата (Stripe)

### Setup

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Payment Flow

1. **Создание PaymentIntent:**
   ```typescript
   POST /api/stripe/create-payment-intent
   {
     amount: totalAmount,
     currency: "pln" | "eur",
     metadata: { orderId, items, shipping }
   }
   ```

2. **Webhook обработка:**
   ```typescript
   POST /api/stripe/webhook
   // Stripe отправляет события:
   // - payment_intent.succeeded
   // - payment_intent.payment_failed
   ```

3. **Обновление заказа в D1:**
   - Статус: "pending" → "paid" / "failed"
   - Создание заказа в Furgonetka (если paid)

---

## 🗄️ База данных (D1)

### Таблицы

**users** - Better Auth
**sessions** - Better Auth
**accounts** - Better Auth
**verifications** - Better Auth

**orders:**
```sql
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  total_amount REAL,
  currency TEXT,
  status TEXT, -- pending, paid, shipped, delivered
  shipping_id TEXT,
  stripe_payment_intent_id TEXT,
  created_at INTEGER
);
```

**order_items:**
```sql
CREATE TABLE order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT,
  product_id TEXT,
  quantity INTEGER,
  price REAL,
  currency TEXT
);
```

---

## 📊 Производительность

### Метрики

| Страница | LCP | FID | CLS |
|----------|-----|-----|-----|
| Homepage | ~500ms | < 100ms | < 0.1 |
| Store | ~800ms | < 100ms | < 0.1 |
| Checkout | ~1000ms | < 100ms | < 0.1 |

### Оптимизации

- ✅ Static pages из CDN
- ✅ Code splitting (Lottie, React, vendor)
- ✅ Lazy loading для изображений
- ✅ Prefetch для навигации
- ✅ WebP/AVIF через Cloudflare
- ✅ Минификация CSS/JS

---

## 🛠️ Разработка

### Структура проекта

```
visupair-store/
├─ src/
│  ├─ pages/          # Роуты
│  ├─ layouts/        # Layout components
│  ├─ components/     # UI components
│  ├─ lib/            # Утилиты и сервисы
│  │  ├─ auth.ts      # Better Auth config
│  │  ├─ sanity.ts    # Sanity client
│  │  ├─ stripe.ts    # Stripe helpers
│  │  └─ shipping/    # Furgonetka integration
│  ├─ styles/         # Global CSS
│  └─ middleware.ts   # Astro middleware
│
├─ public/
│  ├─ images/         # Статические изображения
│  └─ fonts/          # Web fonts
│
└─ astro.config.mjs   # Astro config
```

### Полезные команды

```bash
# Проверка типов
npm run astro check

# Форматирование
npm run format

# Проверка линтера
npm run lint

# Очистка кэша
rm -rf .astro/ dist/ node_modules/.vite
```

---

## 🐛 Troubleshooting

### Проблема: Dev-сервер не запускается

**Ошибка:** `EACCES: permission denied, mkdir .wrangler`

**Решение:**
```bash
rm -rf ~/.config/.wrangler
mkdir -p ~/.config/.wrangler/logs
npm run dev
```

### Проблема: Авторизация не работает локально

**Причина:** `platformProxy` отключен в `astro.config.mjs`

**Решение:**
```javascript
adapter: cloudflare({
  platformProxy: {
    enabled: true // Включить для локальной разработки
  }
})
```

### Проблема: Изображения не загружаются

**Проверьте:**
1. Файлы существуют в `public/images/`
2. Пути начинаются с `/` (например, `/images/hero/bg-dark.webp`)
3. Правильное расширение файла (`.webp`, а не `.png`)

---

## 📝 TODO / Roadmap

- [ ] PWA с offline поддержкой
- [ ] Notifications для restock
- [ ] Wishlist функционал
- [ ] Product reviews
- [ ] Multi-language support
- [ ] Advanced analytics dashboard

---

## 📧 Контакты

**Email:** support@visupair.com  
**Repo:** [GitHub Repository]  
**Docs:** Этот файл

---

**Сделано с ❤️ для Visupair Store**
