export const defaultState = () => {
  const today = new Date();
  const day = (offset, hour = 10) => { const d = new Date(today); d.setDate(d.getDate() - offset); const actualHour=offset===0?Math.min(hour,today.getHours()):hour;const minute=offset===0&&actualHour===today.getHours()?Math.min(30,today.getMinutes()):30;d.setHours(actualHour,minute,0,0);return d.toISOString(); };
  const products = [
    { id: "p20", name: "20L Refill", category: "Refills", size: "20 L", price: 35, cost: 9, stock: 180, lowAt: 30, unit: "refills", icon: "◉", tint: "blue" },
    { id: "p10", name: "10L Refill", category: "Refills", size: "10 L", price: 22, cost: 6, stock: 96, lowAt: 25, unit: "refills", icon: "◉", tint: "blue" },
    { id: "p5", name: "5L Refill", category: "Refills", size: "5 L", price: 14, cost: 4, stock: 62, lowAt: 20, unit: "refills", icon: "◉", tint: "blue" },
    { id: "p1", name: "1L Purified Water", category: "Refills", size: "1 L", price: 8, cost: 2.5, stock: 9, lowAt: 20, unit: "bottles", icon: "◉", tint: "blue" },
    { id: "p500", name: "500ml Purified Water", category: "Refills", size: "500 ml", price: 5, cost: 2, stock: 16, lowAt: 24, unit: "bottles", icon: "◉", tint: "blue" },
    { id: "bottle20", name: "20L Bottle (new)", category: "Bottles", size: "20 L", price: 180, cost: 125, stock: 12, lowAt: 5, unit: "pcs", icon: "♧", tint: "green" },
    { id: "cap", name: "Bottle cap & seal", category: "Accessories", size: "Standard", price: 5, cost: 1.5, stock: 88, lowAt: 30, unit: "pcs", icon: "◌", tint: "orange" },
    { id: "dispenser", name: "Countertop dispenser", category: "Accessories", size: "Standard", price: 450, cost: 320, stock: 5, lowAt: 3, unit: "pcs", icon: "▥", tint: "purple" }
  ];
  const customers = [
    { id: "c1", name: "Maria Santos", phone: "0917 555 0182", address: "Poblacion, Makati", business: "", outstanding: 2, depositBalance: 0 },
    { id: "c2", name: "Brew & Bean Cafe", phone: "0920 440 1210", address: "Legazpi Village, Makati", business: "Brew & Bean Cafe", outstanding: 4, depositBalance: 0 },
    { id: "c3", name: "Juan Dela Cruz", phone: "0918 262 4470", address: "San Antonio, Makati", business: "", outstanding: 1, depositBalance: 0 },
    { id: "c4", name: "Northstar Dental", phone: "0917 114 9033", address: "Salcedo Village, Makati", business: "Northstar Dental Clinic", outstanding: 3, depositBalance: 0 }
  ];
  const sales = [
    { id: "CS-1042", date: day(0, 10), customerId: "c1", customer: "Maria Santos", cashier: "Alex Morgan", items: [{ productId: "p20", name: "20L Refill", qty: 2, price: 35, cost: 9 }], subtotal: 70, discount: 0, total: 70, payments: [{ method: "Cash", amount: 100, status: "Paid" }], change: 30, status: "Paid" },
    { id: "CS-1041", date: day(0, 9), customerId: "c2", customer: "Brew & Bean Cafe", cashier: "Alex Morgan", items: [{ productId: "p20", name: "20L Refill", qty: 4, price: 35, cost: 9 }, { productId: "cap", name: "Bottle cap & seal", qty: 4, price: 5, cost: 1.5 }], subtotal: 160, discount: 0, total: 160, payments: [{ method: "GCash · manual", amount: 160, status: "Pending confirmation" }], change: 0, status: "Pending confirmation" },
    { id: "CS-1040", date: day(0, 8), customerId: "c3", customer: "Juan Dela Cruz", cashier: "Alex Morgan", items: [{ productId: "p10", name: "10L Refill", qty: 2, price: 22, cost: 6 }], subtotal: 44, discount: 0, total: 44, payments: [{ method: "Cash", amount: 44, status: "Paid" }], change: 0, status: "Paid" },
    { id: "CS-1039", date: day(1, 16), customerId: "c4", customer: "Northstar Dental", cashier: "Alex Morgan", items: [{ productId: "p20", name: "20L Refill", qty: 3, price: 35, cost: 9 }], subtotal: 105, discount: 5, total: 100, payments: [{ method: "Bank transfer", amount: 100, status: "Paid" }], change: 0, status: "Paid" },
    { id: "CS-1038", date: day(1, 13), customerId: "c1", customer: "Maria Santos", cashier: "Alex Morgan", items: [{ productId: "p5", name: "5L Refill", qty: 3, price: 14, cost: 4 }], subtotal: 42, discount: 0, total: 42, payments: [{ method: "Cash", amount: 42, status: "Paid" }], change: 0, status: "Paid" },
    { id: "CS-1037", date: day(2, 14), customerId: "c2", customer: "Brew & Bean Cafe", cashier: "Alex Morgan", items: [{ productId: "p20", name: "20L Refill", qty: 5, price: 35, cost: 9 }], subtotal: 175, discount: 0, total: 175, payments: [{ method: "Cash", amount: 175, status: "Paid" }], change: 0, status: "Paid" },
    { id: "CS-1036", date: day(3, 11), customerId: "c3", customer: "Juan Dela Cruz", cashier: "Alex Morgan", items: [{ productId: "p10", name: "10L Refill", qty: 3, price: 22, cost: 6 }], subtotal: 66, discount: 0, total: 66, payments: [{ method: "Cash", amount: 66, status: "Paid" }], change: 0, status: "Paid" },
    { id: "CS-1035", date: day(4, 15), customerId: "c4", customer: "Northstar Dental", cashier: "Alex Morgan", items: [{ productId: "p20", name: "20L Refill", qty: 2, price: 35, cost: 9 }], subtotal: 70, discount: 0, total: 70, payments: [{ method: "Cash", amount: 70, status: "Paid" }], change: 0, status: "Paid" }
  ];
  return {
    business: { name: "ClearSpring Water Station", address: "24 Mabini Street, Poblacion, Makati City", phone: "(02) 8555 0198", tax: "VAT not registered" },
    products, customers, sales, deliveries: [], supplierDeliveries: [], expenses: [
      { id: "EX-1004", date: day(0, 8), category: "Transport & delivery", description: "Morning delivery fuel", amount: 450, approvedBy: "Alex Morgan" },
      { id: "EX-1003", date: day(1, 12), category: "Electricity", description: "Monthly electricity bill", amount: 3250, approvedBy: "Alex Morgan" },
      { id: "EX-1002", date: day(2, 9), category: "Treatment & filtration", description: "Sediment filter replacement", amount: 860, approvedBy: "Alex Morgan" },
      { id: "EX-1001", date: day(5, 10), category: "Rent", description: "Station rent", amount: 8500, approvedBy: "Alex Morgan" }
    ],
    movements: [], auditLogs: [], nextSale: 1043, nextExpense: 1005, bottleLedger: [], bottleInventory: { filled: 12, empty: 24 },
    nextDelivery: 1001,
    settings: { managerPin: "2468", currency: "PHP", bottleDeposit: 50, receiptThanks: "Thank you for choosing clean, refreshing water!" }
  };
};
export function normalizeState(parsed) {
  if (!Array.isArray(parsed.products) || !Array.isArray(parsed.sales)) throw new Error("The saved workspace data is incomplete.");
  const base = defaultState();
  return {
    ...base,
    ...parsed,
    business: { ...base.business, ...(parsed.business || {}) },
    settings: { ...base.settings, ...(parsed.settings || {}) },
    customers: Array.isArray(parsed.customers) ? parsed.customers : base.customers,
    deliveries: Array.isArray(parsed.deliveries) ? parsed.deliveries.filter(delivery => !delivery.supplier) : [],
    supplierDeliveries: [
      ...(Array.isArray(parsed.supplierDeliveries) ? parsed.supplierDeliveries : []),
      ...(Array.isArray(parsed.deliveries) ? parsed.deliveries.filter(delivery => delivery.supplier && !delivery.customerId) : [])
    ],
    nextDelivery: Number.isInteger(parsed.nextDelivery) ? parsed.nextDelivery : base.nextDelivery,
    expenses: Array.isArray(parsed.expenses) ? parsed.expenses : base.expenses,
    movements: Array.isArray(parsed.movements) ? parsed.movements : [],
    auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
    bottleLedger: Array.isArray(parsed.bottleLedger) ? parsed.bottleLedger : [],
    bottleInventory: parsed.bottleInventory || base.bottleInventory
  };
}
