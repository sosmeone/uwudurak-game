# 🃏 Дурак — Telegram Mini App

Карткова гра Дурак для Telegram з онлайн-мультиплеєром (1 vs 1 в реальному часі).

## Структура проєкту

```
durak/
├── frontend/
│   └── index.html       ← Mini App (гра у браузері)
├── server/
│   ├── index.js         ← WebSocket сервер + матчмейкінг
│   └── package.json
├── bot/
│   ├── index.js         ← Telegram бот
│   ├── package.json
│   └── .env.example     ← Шаблон змінних середовища
└── README.md
```

---

## Крок 1 — Створити Telegram бота

1. Відкрийте `@BotFather` в Telegram
2. Напишіть `/newbot`
3. Введіть назву: `Дурак Гра`
4. Введіть username: `YourDurakBot`
5. Скопіюйте **токен** — він знадобиться далі

---

## Крок 2 — Розгорнути фронтенд (Vercel — безкоштовно)

1. Зареєструйтесь на [vercel.com](https://vercel.com)
2. Встановіть Vercel CLI:
   ```bash
   npm i -g vercel
   ```
3. Перейдіть у папку frontend:
   ```bash
   cd frontend
   vercel
   ```
4. Після деплою отримаєте URL типу `https://durak-xxx.vercel.app`

**Або** використовуйте [Netlify](https://netlify.com) — перетягніть папку `frontend` у браузері.

---

## Крок 3 — Розгорнути сервер (Railway — безкоштовно)

1. Зареєструйтесь на [railway.app](https://railway.app)
2. New Project → Deploy from GitHub (або Local)
3. Виберіть папку `server`
4. Railway автоматично запустить `npm start`
5. Отримаєте URL типу `https://durak-server-xxx.railway.app`
6. **Важливо:** Railway підтримує WebSocket — це потрібно для гри!

**Альтернатива:** [Render.com](https://render.com) (також безкоштовно, підтримує WS)

---

## Крок 4 — Налаштувати змінні середовища

У папці `bot` скопіюйте `.env.example` в `.env`:
```bash
cp .env.example .env
```

Відредагуйте `.env`:
```
BOT_TOKEN=1234567890:AAF...ваш_токен
WEBAPP_URL=https://durak-xxx.vercel.app
PORT=3000
```

---

## Крок 5 — Оновити URL сервера у фронтенді

У файлі `frontend/index.html` знайдіть рядок:
```js
return `wss://${h}`;
```

Якщо фронтенд і сервер на **різних доменах** — вкажіть URL сервера явно:
```js
return 'wss://durak-server-xxx.railway.app';
```

---

## Крок 6 — Запустити бота

```bash
cd bot
npm install
node index.js
```

---

## Крок 7 — Підключити Mini App до бота

У `@BotFather`:
1. `/mybots` → виберіть вашого бота
2. `Bot Settings` → `Menu Button` → `Configure menu button`
3. Введіть URL: `https://durak-xxx.vercel.app`
4. Введіть текст: `🎮 Грати`

**Або через `/newapp`:**
1. `/newapp` → виберіть бота
2. Заповніть назву, опис
3. Вкажіть URL фронтенду

---

## Запуск локально (для розробки)

```bash
# Сервер
cd server && npm install && node index.js

# Бот (в окремому терміналі)
cd bot && npm install && node index.js

# Фронтенд — просто відкрийте frontend/index.html в браузері
# або через LiveServer у VS Code
```

---

## Як грати

1. Відкрийте бота в Telegram
2. Натисніть `/start`
3. Натисніть **🎮 Грати в Дурака**
4. Очікуйте суперника (хтось інший теж має відкрити гру)
5. Грайте!

### Правила (коротко)
- Колода 36 карт (6–Туз)
- Кожному 6 карт, козир — остання карта колоди
- Атакуючий кидає карту → захисник б'є старшою тієї масті або козирем
- Не можеш відбити → береш усі карти
- Підкидати можна карти тих самих рангів що вже на столі
- Хто першим позбувся карт — переможець!

---

## Технології

| Компонент | Технологія |
|-----------|-----------|
| Frontend | HTML + CSS + Vanilla JS |
| Real-time | WebSocket (ws library) |
| Backend | Node.js + Express |
| Bot | node-telegram-bot-api |
| Hosting (frontend) | Vercel / Netlify |
| Hosting (server) | Railway / Render |

---

## Можливі покращення

- [ ] Рейтингова система (ELO)
- [ ] Статистика перемог у БД (PostgreSQL)
- [ ] Підкидний дурак (кілька атакуючих)
- [ ] Анімації карт (GSAP)
- [ ] Звукові ефекти
- [ ] Кімнати з паролем
- [ ] Турніри
