# ikorka-packaging

MVP-застосунок для автоматизації аналітики упаковки/доставок IkorkaShop —
заміна ручних Google Sheets "аналітика доставок+упаковки" і "Склад 2026".

Архітектура — за тим самим паттерном, що й інші внутрішні панелі
(ikorka-sysadmin, ikorka-luiza, ikorka-coo): React-фронтенд на GitHub
Pages + Node/Postgres бекенд на Railway, PIN-логін на 3 ролі.

```
backend/    Node + TypeScript + Express + Postgres (Railway)
frontend/   React + Vite (GitHub Pages)
```

## Що реалізовано (MVP)

- Довідники: менеджери, сегменти (ХБ/ГБ), товарні лінії, типи коробок, матеріали, періоди (декади)
- Ціни з історією (коробки, матеріали) і тарифи Нової Пошти по вазі
- Ввід доставок за декаду (менеджер × сегмент × лінія): відправлення, сума, повернення, утиль, упаковка
- **Авторозрахунок**: собівартість упаковки (ціна коробки × к-сть) і економія проти еквівалентного тарифу НП — одразу в таблиці записів і в звітах
- Склад: прихід/повернення/витрата коробок і матеріалів з автоматичним залишком, закупівлі матеріалів
- Місячний і річний звіт: обороти, % повернень, % утилю з повернень, собівартість упаковки, економія
- PIN-логін, 3 ролі (owner / editor / viewer — viewer тільки читає)

Не входить в цей MVP (Stage 2-3 з ТЗ): прогноз-калькулятор, інтеграція з
Nova Poshta API та Odoo, дашборд з графіками, історія цін у самому UI
звіту. Додати їх можна поверх цієї ж схеми БД.

## Відхилення від присланої схеми

В `deliveries` додано поле `box_type_id` (яким типом коробки
відвантажено запис) — без нього неможливо порахувати собівартість і
економію. Все інше — один в один із присланого `ikorka_packaging_schema.sql`.
Файл схеми зроблено ідемпотентним (`IF NOT EXISTS` / `ON CONFLICT DO
NOTHING`), щоб бекенд міг безпечно накатувати його при кожному старті —
так само, як у ваших інших проєктах.

## Локальний запуск

```bash
# backend
cd backend
cp .env.example .env   # прописати DATABASE_URL локального Postgres
npm install
npm run dev             # http://localhost:3000

# створити першого користувача (owner)
npm run seed:user -- "Луіза" 1234 owner

# frontend, в іншому терміналі
cd frontend
cp .env.example .env    # VITE_API_URL=http://localhost:3000/api
npm install
npm run dev              # http://localhost:5173
```

## Деплой (Railway + GitHub Pages) — за вашим звичним паттерном

### 1. Два репозиторії на GitHub

Розбийте `backend/` і `frontend/` на два репозиторії (як у інших
панелей): наприклад `ikorka-packaging-backend` і `ikorka-packaging` (для
GitHub Pages назва репо стає частиною URL — зараз фронтенд налаштований
на `lyizacarenko-spec.github.io/ikorka-packaging`, за потреби зміните
`base` в `frontend/vite.config.ts` і назву репо на однакову).

```bash
cd backend && git init && git add -A && git commit -m "init" \
  && git remote add origin git@github.com:lyizacarenko-spec/ikorka-packaging-backend.git \
  && git push -u origin main

cd ../frontend && git init && git add -A && git commit -m "init" \
  && git remote add origin git@github.com:lyizacarenko-spec/ikorka-packaging.git \
  && git push -u origin main
```

### 2. Backend → Railway

1. New Project → Deploy from GitHub repo → `ikorka-packaging-backend`
2. Add a Postgres database (Railway сам підставить `DATABASE_URL`)
3. Variables: `JWT_SECRET` (довгий випадковий рядок), `CORS_ORIGIN`
   (`https://lyizacarenko-spec.github.io`)
4. Перший деплой сам застосує схему (`ensureSchema()` виконується при
   старті). Далі одноразово виконати локально проти продакшн
   `DATABASE_URL`:
   ```bash
   DATABASE_URL=<railway-url> npm run seed:user -- "Луіза" 1234 owner
   ```
   Готовий пошкоджений webhook / кеш деплою — відомі граблі з ваших
   інших проєктів (перепідключити GitHub App, або порожній коміт).

### 3. Frontend → GitHub Pages

1. `frontend/.env` → `VITE_API_URL=https://<ваш-backend>.up.railway.app/api`
2. `npm run deploy` (скрипт `gh-pages -d dist` вже в `package.json`)
3. Settings → Pages → переконатись, що джерело — гілка `gh-pages` (за
   вашим досвідом, цей вибір іноді не зберігається з першого разу —
   перевірити після збереження)

## Дані

Реальні дані по доставках/поверненнях/цінах не комітяться в репозиторій
— вносяться через UI або довантажуються окремим скриптом напряму в
Postgres, як і в інших ваших панелях.
