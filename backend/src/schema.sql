-- ============================================================
-- ikorka-packaging — схема БД (MVP)
-- PostgreSQL / Railway
-- ============================================================
-- Решение по гранулярности deliveries: храним на уровне
-- "период (декада) × менеджер × сегмент × товарная линия" —
-- это точное зеркало исходной таблицы "Доставки/Возвраты",
-- ничего не теряем при импорте, а месячные/годовые отчёты
-- агрегируем через VIEW (см. низ файла). Если позже понадобится
-- дневная гранулярность — можно сузить periods без смены схемы.
--
-- Файл идемпотентный: безопасно выполнять повторно при каждом
-- старте бэкенда (IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- ============================================================

-- ------------------------------------------------------------
-- СПРАВОЧНИКИ
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sales_channels (
    id          SERIAL PRIMARY KEY,
    code        TEXT NOT NULL UNIQUE,      -- 'HB', 'GB'
    name        TEXT NOT NULL              -- 'ХБ + відмови', 'ГБ'
);

CREATE TABLE IF NOT EXISTS managers (
    id                 SERIAL PRIMARY KEY,
    name               TEXT NOT NULL UNIQUE,
    is_active          BOOLEAN NOT NULL DEFAULT TRUE,
    default_channel_id INT REFERENCES sales_channels(id)  -- який ФОП/канал за замовчуванням у цього менеджера (щоб не вибирати вручну при вводі)
);
ALTER TABLE managers ADD COLUMN IF NOT EXISTS default_channel_id INT REFERENCES sales_channels(id);

CREATE TABLE IF NOT EXISTS product_lines (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,      -- 'Основной', 'Паста', ...
    is_default  BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS box_types (
    id          SERIAL PRIMARY KEY,
    code        TEXT NOT NULL UNIQUE,      -- '1kg','2kg','3kg','5kg','10kg','used_1kg', ...
    name        TEXT NOT NULL,
    weight_kg   NUMERIC(6,2)
);

CREATE TABLE IF NOT EXISTS materials (
    id          SERIAL PRIMARY KEY,
    code        TEXT NOT NULL UNIQUE,      -- 'bubble','filler','tape'
    name        TEXT NOT NULL,
    unit        TEXT NOT NULL              -- 'шт','м','кг'
);

-- ------------------------------------------------------------
-- ЦЕНЫ С ИСТОРИЕЙ
-- действующая цена на дату = запись с max(valid_from) <= дата
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS box_prices (
    id          SERIAL PRIMARY KEY,
    box_type_id INT NOT NULL REFERENCES box_types(id),
    price       NUMERIC(10,2) NOT NULL,
    valid_from  DATE NOT NULL,
    UNIQUE (box_type_id, valid_from)
);

CREATE TABLE IF NOT EXISTS material_prices (
    id          SERIAL PRIMARY KEY,
    material_id INT NOT NULL REFERENCES materials(id),
    price       NUMERIC(10,2) NOT NULL,
    valid_from  DATE NOT NULL,
    UNIQUE (material_id, valid_from)
);

CREATE TABLE IF NOT EXISTS np_tariffs (
    id          SERIAL PRIMARY KEY,
    weight_from NUMERIC(6,2) NOT NULL,
    weight_to   NUMERIC(6,2) NOT NULL,
    price       NUMERIC(10,2) NOT NULL,
    valid_from  DATE NOT NULL
);

-- ------------------------------------------------------------
-- ПЕРИОДЫ (декады, как в исходной таблице)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS periods (
    id          SERIAL PRIMARY KEY,
    date_from   DATE NOT NULL,
    date_to     DATE NOT NULL,
    label       TEXT NOT NULL,             -- '01.05.-10.05.2026'
    UNIQUE (date_from, date_to)
);

-- ------------------------------------------------------------
-- ПЕРВИЧНЫЕ ДАННЫЕ: ДОСТАВКИ / ВОЗВРАТЫ
-- зеркало листов "доставка ХБ" / "доставка ГБ" по менеджерам
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS deliveries (
    id              SERIAL PRIMARY KEY,
    period_id       INT NOT NULL REFERENCES periods(id),
    manager_id      INT NOT NULL REFERENCES managers(id),
    channel_id      INT NOT NULL REFERENCES sales_channels(id),
    product_line_id INT NOT NULL REFERENCES product_lines(id),
    qty_shipped     INT NOT NULL DEFAULT 0,   -- заказы/отправления (оборот)
    amount_uah      NUMERIC(12,2) NOT NULL DEFAULT 0,
    qty_returned    INT NOT NULL DEFAULT 0,   -- "забранные апп"
    qty_damaged     INT NOT NULL DEFAULT 0,   -- утиль (разбитые банки), ручной ввод
    qty_packaging   INT NOT NULL DEFAULT 0,   -- "упаковка" — расход коробок за период
    box_type_id     INT REFERENCES box_types(id),  -- какой тип коробки использован для qty_packaging (для расчёта себестоимости/экономии)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (period_id, manager_id, channel_id, product_line_id)
);

CREATE INDEX IF NOT EXISTS idx_deliveries_period   ON deliveries(period_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_channel  ON deliveries(channel_id);

-- ------------------------------------------------------------
-- СКЛАД: ЗАКУПКИ МАТЕРИАЛОВ (аналог листа "закупка тмц")
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS material_purchases (
    id              SERIAL PRIMARY KEY,
    material_id     INT NOT NULL REFERENCES materials(id),
    purchase_date   DATE NOT NULL,
    supplier        TEXT,
    price           NUMERIC(10,2) NOT NULL,
    qty             NUMERIC(10,2) NOT NULL,
    amount          NUMERIC(12,2) NOT NULL
);

-- ------------------------------------------------------------
-- СКЛАД: ДВИЖЕНИЕ КОРОБОК И МАТЕРИАЛОВ
-- (аналог "Лист3" / "расходы ТМЦ") — приход/возврат/расход с остатком
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS stock_movements (
    id              SERIAL PRIMARY KEY,
    item_type       TEXT NOT NULL CHECK (item_type IN ('box','material')),
    box_type_id     INT REFERENCES box_types(id),
    material_id     INT REFERENCES materials(id),
    movement_date   DATE NOT NULL,
    operation       TEXT NOT NULL CHECK (operation IN ('приход','возврат','расход')),
    qty             NUMERIC(10,2) NOT NULL,
    balance_after   NUMERIC(10,2) NOT NULL,
    note            TEXT,
    CHECK (
        (item_type = 'box' AND box_type_id IS NOT NULL AND material_id IS NULL)
        OR
        (item_type = 'material' AND material_id IS NOT NULL AND box_type_id IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON stock_movements(movement_date);

-- ------------------------------------------------------------
-- ПОЛЬЗОВАТЕЛИ / ДОСТУП (3 уровня, PIN-логин по образцу других панелей)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    pin_hash    TEXT NOT NULL,
    role        TEXT NOT NULL CHECK (role IN ('owner','editor','viewer')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- РАСЧЁТНЫЕ VIEW (не хранятся, считаются на лету)
-- ============================================================

-- Действующая цена коробки на дату периода, по каждой доставке
CREATE OR REPLACE VIEW v_box_price_at AS
SELECT d.id AS delivery_id, bt.id AS box_type_id,
       bp.price, bp.valid_from
FROM deliveries d
JOIN periods p ON p.id = d.period_id
CROSS JOIN box_types bt
JOIN LATERAL (
    SELECT price, valid_from FROM box_prices
    WHERE box_type_id = bt.id AND valid_from <= p.date_to
    ORDER BY valid_from DESC LIMIT 1
) bp ON TRUE;

-- Себестоимость упаковки и экономия против тарифу Нової Пошти по каждой доставке
CREATE OR REPLACE VIEW v_delivery_cost AS
SELECT
    d.id AS delivery_id,
    d.period_id,
    p.date_to,
    d.box_type_id,
    d.qty_packaging,
    own_price.price AS own_box_price,
    ROUND(COALESCE(own_price.price, 0) * d.qty_packaging, 2) AS own_packaging_cost,
    np.price AS np_tariff_price,
    ROUND(COALESCE(np.price, 0) * d.qty_packaging, 2) AS np_equivalent_cost,
    ROUND(
        (COALESCE(np.price, 0) - COALESCE(own_price.price, 0)) * d.qty_packaging,
    2) AS savings_uah
FROM deliveries d
JOIN periods p ON p.id = d.period_id
LEFT JOIN LATERAL (
    SELECT price FROM box_prices
    WHERE box_type_id = d.box_type_id AND valid_from <= p.date_to
    ORDER BY valid_from DESC LIMIT 1
) own_price ON d.box_type_id IS NOT NULL
LEFT JOIN box_types bt ON bt.id = d.box_type_id
LEFT JOIN LATERAL (
    SELECT price FROM np_tariffs
    WHERE valid_from <= p.date_to
      AND bt.weight_kg IS NOT NULL
      AND bt.weight_kg > weight_from AND bt.weight_kg <= weight_to
    ORDER BY valid_from DESC LIMIT 1
) np ON TRUE;

-- Месячный отчёт: период → месяц, сегмент, товарная линия
CREATE OR REPLACE VIEW v_monthly_summary AS
SELECT
    date_trunc('month', p.date_from)::date AS month,
    sc.code AS channel,
    pl.name AS product_line,
    SUM(d.qty_shipped)  AS qty_shipped,
    SUM(d.amount_uah)   AS amount_uah,
    SUM(d.qty_returned) AS qty_returned,
    SUM(d.qty_damaged)  AS qty_damaged,
    SUM(d.qty_packaging) AS qty_packaging,
    ROUND(100.0 * SUM(d.qty_returned) / NULLIF(SUM(d.qty_shipped), 0), 2) AS pct_returns,
    ROUND(100.0 * SUM(d.qty_damaged) / NULLIF(SUM(d.qty_returned), 0), 2) AS pct_damaged_of_returns,
    ROUND(SUM(COALESCE(vc.own_packaging_cost, 0)), 2) AS packaging_cost_uah,
    ROUND(SUM(COALESCE(vc.savings_uah, 0)), 2) AS savings_uah
FROM deliveries d
JOIN periods p ON p.id = d.period_id
JOIN sales_channels sc ON sc.id = d.channel_id
JOIN product_lines pl ON pl.id = d.product_line_id
LEFT JOIN v_delivery_cost vc ON vc.delivery_id = d.id
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;

-- Годовой отчёт: агрегация месячного по году
CREATE OR REPLACE VIEW v_annual_summary AS
SELECT
    date_trunc('year', month)::date AS year,
    channel,
    product_line,
    SUM(qty_shipped)  AS qty_shipped,
    SUM(amount_uah)   AS amount_uah,
    SUM(qty_returned) AS qty_returned,
    SUM(qty_damaged)  AS qty_damaged,
    SUM(qty_packaging) AS qty_packaging,
    ROUND(100.0 * SUM(qty_returned) / NULLIF(SUM(qty_shipped), 0), 2) AS pct_returns,
    ROUND(100.0 * SUM(qty_damaged) / NULLIF(SUM(qty_returned), 0), 2) AS pct_damaged_of_returns,
    ROUND(SUM(packaging_cost_uah), 2) AS packaging_cost_uah,
    ROUND(SUM(savings_uah), 2) AS savings_uah
FROM v_monthly_summary
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;

-- Текущий остаток по каждой коробке/материалу (последнее движение)
CREATE OR REPLACE VIEW v_stock_balance AS
SELECT DISTINCT ON (item_type, COALESCE(box_type_id, -1), COALESCE(material_id, -1))
    item_type, box_type_id, material_id, balance_after AS current_balance, movement_date AS as_of
FROM stock_movements
ORDER BY item_type, COALESCE(box_type_id, -1), COALESCE(material_id, -1), movement_date DESC, id DESC;

-- ============================================================
-- СИД-ДАННЫЕ (справочники — безопасно применять повторно)
-- ============================================================

INSERT INTO sales_channels (code, name) VALUES
    ('HB', 'ХБ + відмови'),
    ('GB', 'ГБ')
ON CONFLICT (code) DO NOTHING;

INSERT INTO product_lines (name, is_default) VALUES
    ('Основной', TRUE),
    ('Паста', FALSE)
ON CONFLICT (name) DO NOTHING;

INSERT INTO box_types (code, name, weight_kg) VALUES
    ('1kg',  'Коробка 1 кг',  1),
    ('2kg',  'Коробка 2 кг',  2),
    ('3kg',  'Коробка 3 кг',  3),
    ('5kg',  'Коробка 5 кг',  5),
    ('10kg', 'Коробка 10 кг', 10),
    ('used', 'Б/у коробка',   NULL)
ON CONFLICT (code) DO NOTHING;

INSERT INTO materials (code, name, unit) VALUES
    ('bubble', 'Пузырь',     'м'),
    ('filler', 'Наполнитель','шт'),
    ('tape',   'Скотч',      'шт')
ON CONFLICT (code) DO NOTHING;
