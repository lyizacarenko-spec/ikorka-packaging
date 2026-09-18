export interface Manager {
  id: number;
  name: string;
  is_active: boolean;
  default_channel_id: number | null;
  has_np_key: boolean;
}
export interface SalesChannel {
  id: number;
  code: string;
  name: string;
}
export interface ProductLine {
  id: number;
  name: string;
  is_default: boolean;
}
export interface BoxType {
  id: number;
  code: string;
  name: string;
  weight_kg: number | null;
}
export interface Material {
  id: number;
  code: string;
  name: string;
  unit: string;
}
export interface Period {
  id: number;
  date_from: string;
  date_to: string;
  label: string;
}
export interface DeliveryBoxUsage {
  box_type_id: number;
  code: string;
  name: string;
  weight_kg: string | null;
  qty: number;
  synced_at: string;
}
export interface Delivery {
  id: number;
  period_id: number;
  manager_id: number;
  channel_id: number;
  product_line_id: number;
  qty_shipped: number;
  amount_uah: string;
  qty_returned: number;
  qty_damaged: number;
  qty_packaging: number;
  box_type_id: number | null;
  qty_packaging_free: number;
  qty_np_sender_paid: number;
  qty_np_recipient_paid: number;
  period_label: string;
  manager_name: string;
  channel_code: string;
  product_line_name: string;
  own_packaging_cost: string | null;
  np_equivalent_cost: string | null;
  savings_uah: string | null;
}
export interface BoxPriceCurrent {
  box_type_id: number;
  code: string;
  name: string;
  price: string | null;
  valid_from: string | null;
}
export interface MaterialPriceCurrent {
  material_id: number;
  code: string;
  name: string;
  unit: string;
  price: string | null;
  valid_from: string | null;
}
export interface NpTariff {
  id: number;
  weight_from: string;
  weight_to: string;
  price: string;
  valid_from: string;
}
export interface StockBalance {
  item_type: "box" | "material";
  box_type_id: number | null;
  box_type_name: string | null;
  material_id: number | null;
  material_name: string | null;
  current_balance: string;
  as_of: string;
}
export interface StockMovement {
  id: number;
  item_type: "box" | "material";
  box_type_id: number | null;
  material_id: number | null;
  movement_date: string;
  operation: "приход" | "возврат" | "расход";
  qty: string;
  balance_after: string;
  note: string | null;
}
export interface MonthlySummary {
  month: string;
  channel: string;
  product_line: string;
  qty_shipped: string;
  amount_uah: string;
  qty_returned: string;
  qty_damaged: string;
  qty_packaging: string;
  pct_returns: string | null;
  pct_damaged_of_returns: string | null;
  packaging_cost_uah: string;
  savings_uah: string;
}
export interface AnnualSummary extends Omit<MonthlySummary, "month"> {
  year: string;
}
