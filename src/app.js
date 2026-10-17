import { money, dateLabel, esc } from "./utils/format.js";
import { normalizeState } from "./data/default-state.js";
import { state, initializeDatabase, persist, replaceState, setErrorNotifier } from "./data/indexeddb.js";
import { heading, statCard, salesTable, modal } from "./components/shared.js";
import { logoutUser } from "./data/users.js";

setErrorNotifier((message) => toast(message, "error"));

const loginRoot = document.getElementById("login-root");
const appShell = document.getElementById("app-shell");
const DEFAULT_USER = { username: "admin", name: "Alex Morgan", role: "Administrator" };
let currentUser = null;
const ui = { page: "dashboard", period: "week", category: "All products", search: "", cart: [], customerId: "", payment: "Cash", reportPeriod: "week", reportFrom: new Date(new Date().getFullYear(),new Date().getMonth(),1).toISOString().slice(0,10), reportTo: new Date().toISOString().slice(0,10), discountAuthorized: false, discountValue: "", cashReceived: "", issueBottle: false };
const pageNames = { dashboard: "Overview", pos: "Point of sale", inventory: "Inventory", bottles: "Bottle tracking", customers: "Customers", expenses: "Expenses", reports: "Reports", settings: "Settings" };
function toast(message, kind = "success") {
  const region = document.getElementById("toast-region");
  if (!region) return;
  const el = document.createElement("div"); el.className = "toast"; el.textContent = message;
  if (kind === "error") { el.style.color = "#b9424a"; el.style.borderColor = "#f4d5d7"; }
  region.appendChild(el); setTimeout(() => el.remove(), 3500);
}
function showLogin() {
  showMain(DEFAULT_USER);
}
function showMain(user) {
  currentUser = user;
  loginRoot.hidden = true;
  appShell.hidden = false;
  const initials = user.name.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();
  document.getElementById("profile-name").textContent = user.name;
  document.getElementById("profile-role").textContent = user.role;
  document.getElementById("profile-initials").textContent = initials;
  document.getElementById("top-avatar").textContent = initials;
  render();
}
function getCustomer(id) { return state.customers.find(c => c.id === id); }
function startOfDay(date = new Date()) { const d = new Date(date); d.setHours(0,0,0,0); return d; }
function saleRevenue(sale) { return sale.status === "Refunded" ? 0 : sale.total - Number(sale.depositAmount||0); }
function filteredSales(period = "today") {
  const now = new Date(); const from = startOfDay(now);
  if (period === "week") from.setDate(from.getDate() - 6);
  if (period === "month") from.setDate(1);
  return state.sales.filter(s => new Date(s.date) >= from && new Date(s.date) <= now);
}
function sumSales(sales) { return sales.reduce((sum, sale) => sum + saleRevenue(sale), 0); }
function paidSales(sales) { return sales.filter(s => s.status === "Paid"); }
function recognizedSales(sales) { return sales.filter(s => s.status !== "Refunded"); }
function soldUnits(sales) { return recognizedSales(sales).reduce((n,s) => n + s.items.reduce((m,i) => m + (i.category === "Refills" ? i.qty : 0), 0), 0); }
function go(page) { ui.page = page; ui.search = ""; window.scrollTo(0,0);document.querySelectorAll(".nav-item[data-page]").forEach(b => b.classList.toggle("active", b.dataset.page === page)); document.getElementById("page-crumb").textContent = pageNames[page]; document.getElementById("sidebar").classList.remove("open"); render(); }
function render() {
  const root = document.getElementById("page-container");
  const pages = { dashboard: renderDashboard, pos: renderPos, inventory: renderInventory, bottles: renderBottles, customers: renderCustomers, expenses: renderExpenses, reports: renderReports, settings: renderSettings };
  root.innerHTML = (pages[ui.page] || renderDashboard)();
  document.getElementById("low-count").textContent=state.products.filter(p=>p.stock<=p.lowAt).length;
  if (ui.page === "dashboard") drawChart();
  if (ui.page === "reports") drawReportChart();
}
function dashboardChartPanel() {
  return `<section class="panel"><div class="panel-heading"><div><h2>Sales overview</h2><p>Revenue performance over time</p></div><div class="chart-legend"><span><i class="legend-dot"></i>Revenue</span><select class="select-control" id="chart-period"><option value="week" ${ui.period === "week" ? "selected" : ""}>Last 7 days</option><option value="fortnight" ${ui.period === "fortnight" ? "selected" : ""}>Last 14 days</option><option value="month" ${ui.period === "month" ? "selected" : ""}>This month</option></select></div></div><div class="chart-wrap"><canvas id="sales-chart" aria-label="Daily sales revenue chart"></canvas></div></section>`;
}
function renderDashboard() {
  const todaySales = filteredSales("today"); const weekSales = filteredSales("week"); const monthSales = filteredSales("month");
  const grossProfit = recognizedSales(todaySales).reduce((total,s) => total + s.items.reduce((sum,i) => sum + (i.price - i.cost) * i.qty,0) - s.discount,0);
  const expenses = state.expenses.filter(e => new Date(e.date) >= startOfDay()).reduce((sum,e) => sum + Number(e.amount),0);
  const best = {};
  recognizedSales(weekSales).forEach(s => s.items.forEach(i => {
    best[i.name] ??= { qty: 0, total: 0 };
    best[i.name].qty += i.qty;
    best[i.name].total += i.qty * i.price;
  }));
  const top = Object.entries(best).sort((a,b) => b[1].qty-a[1].qty).slice(0,4);
  const low = state.products.filter(p => p.stock <= p.lowAt);
  const actions = `<button class="btn secondary" data-action="export-sales">⇩ Export</button><button class="btn" data-page="pos">＋ New sale</button>`;
  return `${heading("Good morning, Alex 👋","Here’s what’s happening at your station today.",actions)}
    <div class="stats-grid">
      ${statCard("Sales today",recognizedSales(todaySales).length.toLocaleString(),"non-refunded transactions","▣")}
      ${statCard("Revenue today",money(sumSales(todaySales)),"vs. previous day","₱","","↑ 12.8%")}
      ${statCard("Revenue this week",money(sumSales(weekSales)),"last 7 days","↗","green","↑ 8.2%")}
      ${statCard("Revenue this month",money(sumSales(monthSales)),"month to date","▤","purple","↑ 5.4%")}
      ${statCard("Refills sold today",soldUnits(todaySales).toLocaleString(),"units across all sizes","◉","orange","")}
    </div>
    <div class="dashboard-grid">${dashboardChartPanel()}
      <section class="panel"><div class="panel-heading"><div><h2>Best-selling products</h2><p>Top products this week</p></div><button class="text-button" data-page="reports">View report →</button></div>
        <div class="best-list">${top.length ? top.map(([name,value],i)=>`<div class="best-row"><div class="product-thumb ${i===1?"green":i===2?"orange":""}">${i===0?"◉":i===1?"♧":"◌"}</div><div class="product-meta"><strong>${esc(name)}</strong><small>${value.qty} sold this week</small></div><span class="best-amount">${money(value.total)}</span></div>`).join("") : `<div class="empty-state">No sales yet this week.</div>`}</div>
        ${low.length?`<div class="notice" style="margin-top:17px"><span>⚠</span><span><strong>${low.length} low-stock alert${low.length>1?"s":""}</strong><br>${low.map(p=>`${esc(p.name)} (${p.stock} ${esc(p.unit)})`).join(" · ")}</span></div>`:`<div class="notice blue" style="margin-top:17px"><span>✓</span><span>All products are above their low-stock threshold.</span></div>`}
      </section>
    </div>
    <section class="table-panel"><div class="table-heading"><div class="table-title"><h2>Recent transactions</h2><p>Your latest customer orders</p></div><button class="text-button" data-page="reports">View all transactions →</button></div>${salesTable(state.sales.slice().sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,5),false)}</section>
    <div class="stat-foot" style="padding:12px 3px 0">Estimated gross profit today: <strong style="color:#405365">${money(grossProfit)}</strong> · Recorded expenses: <strong style="color:#405365">${money(expenses)}</strong> · Estimated net: <strong style="color:#405365">${money(grossProfit-expenses)}</strong></div>`;
}
function drawChart() {
  const canvas = document.getElementById("sales-chart"); if (!canvas) return;
  const rect = canvas.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1; canvas.width = rect.width*dpr; canvas.height = rect.height*dpr;
  const ctx = canvas.getContext("2d"); ctx.scale(dpr,dpr); const w=rect.width,h=rect.height,pad={l:39,r:10,t:12,b:28},days=ui.period==="week"?7:ui.period==="month"?new Date().getDate():14;
  const now=new Date(),values=[]; for(let i=days-1;i>=0;i--){const d=startOfDay(now);d.setDate(d.getDate()-i);values.push({date:d,value:sumSales(state.sales.filter(s=>startOfDay(new Date(s.date)).getTime()===d.getTime()))});}
  const max=Math.max(100,...values.map(v=>v.value))*1.2,innerW=w-pad.l-pad.r,innerH=h-pad.t-pad.b;
  ctx.clearRect(0,0,w,h);ctx.font="10px DM Sans";ctx.textAlign="right";ctx.textBaseline="middle";
  for(let i=0;i<4;i++){const y=pad.t+innerH*i/3;ctx.strokeStyle="#edf1f5";ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();ctx.fillStyle="#a0acb7";ctx.fillText(i===0?money(max).replace(".00",""):money(max*(1-i/3)).replace(".00",""),pad.l-7,y);}
  const points=values.map((v,i)=>({x:pad.l+(days===1?0.5:i/(days-1))*innerW,y:pad.t+innerH-(v.value/max)*innerH}));
  const gradient=ctx.createLinearGradient(0,pad.t,0,h-pad.b);gradient.addColorStop(0,"rgba(35,133,232,.20)");gradient.addColorStop(1,"rgba(35,133,232,.01)");
  ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.lineTo(points.at(-1).x,h-pad.b);ctx.lineTo(points[0].x,h-pad.b);ctx.closePath();ctx.fillStyle=gradient;ctx.fill();
  ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.strokeStyle="#2b8be8";ctx.lineWidth=2.5;ctx.stroke();
  const step=Math.max(1,Math.ceil(days/7));ctx.textAlign="center";ctx.textBaseline="top";points.forEach((p,i)=>{if(i%step===0||i===days-1){ctx.fillStyle="#98a5b1";ctx.fillText(values[i].date.toLocaleDateString("en-PH",{weekday:"short"}),p.x,h-pad.b+9);}});
}
function renderPos() {
  const categories=["All products",...new Set(state.products.map(p=>p.category))];
  const products=state.products.filter(p=>(ui.category==="All products"||p.category===ui.category)&&p.name.toLowerCase().includes(ui.search.toLowerCase()));
  const customerOptions=state.customers.map(c=>`<option value="${esc(c.id)}" ${ui.customerId===c.id?"selected":""}>${esc(c.name)} · ${esc(c.phone)}</option>`).join("");
  const cart=ui.cart.map(line=>{const p=state.products.find(x=>x.id===line.productId);return p?{...line,product:p}:null;}).filter(Boolean);
  if(!cart.some(line=>line.product.id==="p20"))ui.issueBottle=false;
  const subtotal=cart.reduce((sum,line)=>sum+line.product.price*line.qty,0);
  const discount=Number(ui.discountValue)||0;
  const bottleCount=ui.issueBottle?cart.filter(line=>line.product.id==="p20").reduce((sum,line)=>sum+line.qty,0):0;
  const depositAmount=bottleCount*Number(state.settings.bottleDeposit??50);
  const total=Math.max(0,subtotal-discount)+depositAmount;
  const cash=Number(ui.cashReceived)||0;
  return `${heading("Point of sale","Select products, add a customer, and check out in seconds.",`<button class="btn secondary" data-action="reset-cart">↺ Clear cart</button>`)}
    <div class="pos-layout"><section>
      <div class="toolbar"><label class="search-wrap"><span>⌕</span><input class="input-control" id="product-search" placeholder="Search products..." value="${esc(ui.search)}"></label><button class="btn secondary" data-action="add-product">＋ Add product</button></div>
      <div class="category-row">${categories.map(c=>`<button class="chip ${ui.category===c?"active":""}" data-category="${esc(c)}">${esc(c)}</button>`).join("")}</div>
      <div class="product-grid">${products.map(p=>`<button class="pos-product" data-add-cart="${esc(p.id)}" ${p.stock<1?"disabled":""}><span class="product-symbol ${esc(p.tint)}">${esc(p.icon)}</span><strong>${esc(p.name)}</strong><small>${p.stock} ${esc(p.unit)} in stock</small><span class="product-price">${money(p.price)}</span></button>`).join("")||`<div class="empty-state">No products match your search.</div>`}</div>
    </section><section class="panel cart-panel"><div class="cart-header"><h2>Current order <span class="cart-count">${cart.reduce((n,l)=>n+l.qty,0)}</span></h2><button class="text-button" data-action="reset-cart">Clear</button></div>
      <div class="cart-items">${cart.length?cart.map(line=>`<div class="cart-line"><div><strong>${esc(line.product.name)}</strong><small>${money(line.product.price)} each</small><div class="qty-controls"><button data-qty="${esc(line.productId)}" data-delta="-1" aria-label="Decrease quantity">−</button><span>${line.qty}</span><button data-qty="${esc(line.productId)}" data-delta="1" aria-label="Increase quantity">+</button></div></div><span class="cart-line-total">${money(line.product.price*line.qty)}</span></div>`).join(""):`<div class="cart-empty">Your order is empty.<br>Add products to get started.</div>`}</div>
      <div class="cart-form"><label class="field-label" for="customer-select">Customer</label><select class="form-input full-input" id="customer-select"><option value="">Walk-in customer</option>${customerOptions}</select>
      ${cart.some(line=>line.product.id==="p20")?`<label class="field-label" style="display:flex;align-items:center;gap:7px"><input id="bottle-deposit-check" type="checkbox" ${ui.issueBottle?"checked":""}> Issue one filled 20L returnable bottle per refill (${money(Number(state.settings.bottleDeposit??50))} deposit each)</label>`:""}
      <div style="display:flex;gap:8px;align-items:end"><div style="flex:1"><label class="field-label" for="discount-input">Discount (₱)</label><input class="form-input full-input" type="number" min="0" max="${subtotal}" step=".01" id="discount-input" placeholder="0.00" value="${esc(ui.discountValue)}" ${ui.discountAuthorized?"":"disabled"}></div><button class="btn secondary small" data-action="authorize-discount" style="margin-bottom:1px">${ui.discountAuthorized?"Authorized ✓":"Authorize"}</button></div>
      <div class="totals"><div class="total-row"><span>Subtotal</span><strong id="subtotal-amount">${money(subtotal)}</strong></div><div class="total-row"><span>Discount</span><strong id="discount-amount">− ${money(discount)}</strong></div><div class="total-row" id="deposit-row" style="${depositAmount?"":"display:none"}"><span>Bottle deposit · ${bottleCount} bottle${bottleCount===1?"":"s"}</span><strong id="deposit-amount">${money(depositAmount)}</strong></div><div class="total-row grand"><span>Total due</span><strong id="total-amount">${money(total)}</strong></div></div>
      <label class="field-label">Payment method</label><div class="payment-options">${["Cash","GCash","Maya","Bank","Split","Credit"].map(x=>`<button class="pay-option ${ui.payment===x?"active":""}" data-payment="${x}">${x}</button>`).join("")}</div>
      ${ui.payment==="Cash"||ui.payment==="Split"?`<label class="field-label" for="cash-input">Cash received (₱)</label><input class="form-input full-input" type="number" min="0" step=".01" id="cash-input" placeholder="0.00" value="${esc(ui.cashReceived)}"><div id="change-info">${cash>total?`<div class="change-note" style="margin-top:8px">Change due: <strong>${money(cash-total)}</strong></div>`:""}</div>`:""}
      ${["GCash","Maya","Bank"].includes(ui.payment)?`<label class="field-label" for="payment-reference">Reference number (optional)</label><input class="form-input full-input" id="payment-reference" placeholder="Enter transaction reference"><div class="notice blue" style="margin-top:9px"><span>ℹ</span><span>Manual confirmation required. No payment is assumed successful.</span></div>`:""}
      ${ui.payment==="Split"?`<div class="form-grid"><div><label class="field-label" for="split-cash">Cash amount (₱)</label><input class="form-input" id="split-cash" type="number" min="0" step=".01" placeholder="0.00"></div><div><label class="field-label" for="split-other">Other amount (₱)</label><input class="form-input" id="split-other" type="number" min="0" step=".01" placeholder="0.00"></div></div><label class="field-label" for="split-method">Other payment method</label><select class="form-input full-input" id="split-method"><option>GCash · manual</option><option>Maya · manual</option><option>Bank transfer</option></select><label class="field-label" for="split-reference">Other payment reference (optional)</label><input class="form-input full-input" id="split-reference" placeholder="Transaction reference"><div class="notice blue" style="margin-top:9px"><span>ℹ</span><span>Confirm mobile or bank transfers manually after checking with the provider.</span></div>`:""}
      ${ui.payment==="Credit"?`<div class="notice" style="margin-top:9px"><span>ℹ</span><span>Customer credit is recorded as an outstanding balance. A customer account is required.</span></div>`:""}
      <button class="btn checkout-btn" data-action="checkout" ${cart.length?"":"disabled"}>Complete sale · ${money(total)}</button></div>
    </section></div>`;
}
function renderInventory() {
  state.bottleInventory??={filled:12,empty:0};
  const low=state.products.filter(p=>p.stock<=p.lowAt);
  const actions=`<button class="btn secondary" data-action="export-movements">⇩ Export movements</button><button class="btn secondary" data-action="export-inventory">⇩ Export stock</button><button class="btn" data-action="add-product">＋ Add product</button>`;
  return `${heading("Inventory","Track refill capacity, bottles, supplies, and selling prices.",actions)}
    ${low.length?`<div class="notice" style="margin-bottom:15px"><span>⚠</span><span><strong>${low.length} products need attention:</strong> ${low.map(p=>`${esc(p.name)} — ${p.stock} ${esc(p.unit)}`).join(" · ")}</span></div>`:""}
    <section class="panel" style="margin-bottom:15px"><div class="panel-heading"><div><h2>Returnable 20L containers</h2><p>Filled stock, empty returns, and customer balances.</p></div><button class="text-button" data-page="bottles">Open bottle tracking →</button></div><div class="stats-grid" style="margin:0">${statCard("Filled",state.bottleInventory.filled.toLocaleString(),"ready to issue","♧","green")}${statCard("Empty",state.bottleInventory.empty.toLocaleString(),"ready to refill","↩","orange")}${statCard("With customers",state.customers.reduce((sum,c)=>sum+Number(c.outstanding||0),0).toLocaleString(),"outstanding bottles","◉","purple")}</div></section>
    <section class="table-panel"><div class="table-heading"><div class="table-title"><h2>Stock on hand</h2><p>Stock levels update automatically after each sale.</p></div><div class="toolbar" style="margin:0"><label class="search-wrap"><span>⌕</span><input class="input-control" id="inventory-search" placeholder="Search inventory..."></label></div></div>
    <table class="data-table"><thead><tr><th>Product</th><th>Category</th><th>On hand</th><th>Reorder at</th><th>Unit cost</th><th>Selling price</th><th>Stock status</th><th>Actions</th></tr></thead><tbody id="inventory-rows">${inventoryRows(state.products)}</tbody></table>
    <div class="table-footer"><span>${state.products.length} products · ${low.length} low-stock alerts</span><span>Last updated just now</span></div></section>
    <div class="dashboard-grid" style="margin-top:16px"><section class="panel"><div class="panel-heading"><div><h2>Recent stock movements</h2><p>Purchases, sales, and adjustments</p></div></div>${movementsTable()}</section>
    <section class="panel"><div class="panel-heading"><div><h2>Inventory actions</h2><p>Record a purchase or correct stock.</p></div></div><button class="btn secondary" style="width:100%;margin-bottom:9px" data-action="stock-purchase">＋ Record stock purchase</button><button class="btn secondary" style="width:100%" data-action="stock-adjust">↕ Adjust stock</button><div class="notice blue" style="margin-top:14px"><span>ℹ</span><span>Every stock change is recorded in the movement log. Manager authorization is required in production.</span></div></section></div>`;
}
function inventoryRows(products) {
  if(!products.length) return `<tr><td colspan="8" class="empty-state">No inventory items found.</td></tr>`;
  return products.map(p=>`<tr><td><strong>${esc(p.name)}</strong></td><td>${esc(p.category)}</td><td><strong>${p.stock} ${esc(p.unit)}</strong></td><td>${p.lowAt} ${esc(p.unit)}</td><td>${money(p.cost)}</td><td>${money(p.price)}</td><td><span class="status ${p.stock<=p.lowAt?"low":""}">${p.stock<=p.lowAt?"Low stock":"In stock"}</span></td><td><div class="inline-actions"><button class="text-button" data-edit-product="${esc(p.id)}">Edit</button><button class="text-button" data-adjust-product="${esc(p.id)}">Adjust</button></div></td></tr>`).join("");
}
function movementsTable() {
  const list=state.movements.slice().sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,5);
  return `<table class="data-table"><thead><tr><th>Date</th><th>Item</th><th>Movement</th><th>Qty</th></tr></thead><tbody>${list.length?list.map(m=>`<tr><td>${dateLabel(m.date)}</td><td><strong>${esc(m.name)}</strong></td><td>${esc(m.type)}</td><td>${m.qty>0?"+":""}${m.qty}</td></tr>`).join(""):`<tr><td colspan="4" class="empty-state">No stock movements recorded yet.</td></tr>`}</tbody></table>`;
}
function renderBottles() {
  const outstanding=state.customers.reduce((sum,c)=>sum+Number(c.outstanding||0),0);
  state.bottleInventory??={filled:12,empty:0};
  return `${heading("Bottle tracking","Keep filled and empty containers moving through your station.",`<button class="btn secondary" data-action="bottle-fill">＋ Fill returned bottles</button><button class="btn secondary" data-action="bottle-issue">↗ Issue filled bottles</button><button class="btn" data-action="bottle-return">↩ Record bottle return</button>`)}
    <div class="stats-grid">${statCard("Filled bottles on hand",state.bottleInventory.filled.toLocaleString(),"20L bottles ready to issue","♧","green")}${statCard("Outstanding bottles",outstanding.toLocaleString(),"containers with customers","◉","orange")}${statCard("Deposits held",money(state.customers.reduce((sum,c)=>sum+Number(c.depositBalance||0),0)),"refundable customer deposits","₱","orange")}${statCard("Active customers",state.customers.length.toLocaleString(),"with tracked accounts","♙","")}${statCard("Empty bottles",state.bottleInventory.empty.toLocaleString(),"ready to be refilled","↩","purple")}</div>
    <div class="dashboard-grid"><section class="table-panel"><div class="table-heading"><div class="table-title"><h2>Customer bottle balances</h2><p>Outstanding returnable 20L containers</p></div><button class="text-button" data-page="customers">Manage customers →</button></div><table class="data-table"><thead><tr><th>Customer</th><th>Phone</th><th>Outstanding</th><th>Last activity</th><th>Actions</th></tr></thead><tbody>${state.customers.map(c=>`<tr><td><strong>${esc(c.name)}</strong></td><td>${esc(c.phone)}</td><td><span class="status ${c.outstanding?"pending":""}">${c.outstanding||0} bottles</span></td><td>${dateLabel(state.sales.find(s=>s.customerId===c.id)?.date||new Date())}</td><td><button class="text-button" data-return-customer="${esc(c.id)}">Record return</button></td></tr>`).join("")||`<tr><td colspan="5" class="empty-state">Add customers to track bottle balances.</td></tr>`}</tbody></table></section>
    <section class="panel"><div class="panel-heading"><div><h2>Container ledger</h2><p>Recent bottle issues and returns</p></div></div>${state.bottleLedger.length?`<table class="data-table"><thead><tr><th>Customer</th><th>Activity</th><th>Qty</th></tr></thead><tbody>${state.bottleLedger.slice(-6).reverse().map(x=>`<tr><td>${esc(x.customer)}</td><td>${esc(x.type)}</td><td>${x.qty}</td></tr>`).join("")}</tbody></table>`:`<div class="empty-state">Bottle returns and issues will appear here.</div>`}<div class="notice blue" style="margin-top:12px"><span>ℹ</span><span>Refill sales are not automatically treated as bottle exchanges. Record the handover or return explicitly.</span></div></section></div>`;
}
function renderCustomers() {
  const actions=`<button class="btn secondary" data-action="export-customers">⇩ Export</button><button class="btn" data-action="add-customer">＋ Add customer</button>`;
  return `${heading("Customers","Know your regulars and keep track of every refill.",actions)}
    <div class="stats-grid">${statCard("Total customers",state.customers.length.toLocaleString(),"registered accounts","♙")}${statCard("Outstanding bottles",state.customers.reduce((sum,c)=>sum+(Number(c.outstanding)||0),0).toLocaleString(),"across all customers","♧","orange")}${statCard("Customer sales",money(sumSales(state.sales.filter(s=>s.customerId))),"all recorded time","₱","green")}${statCard("Today's walk-ins",state.sales.filter(s=>!s.customerId&&startOfDay(new Date(s.date)).getTime()===startOfDay().getTime()).length.toLocaleString(),"unregistered purchases","♧","purple")}</div>
    <section class="table-panel"><div class="table-heading"><div class="table-title"><h2>Customer directory</h2><p>Purchase history and returnable bottle balances.</p></div><label class="search-wrap" style="max-width:220px"><span>⌕</span><input class="input-control" id="customer-search" placeholder="Search customers..."></label></div>
    <table class="data-table"><thead><tr><th>Customer</th><th>Phone</th><th>Business</th><th>Address</th><th>Purchases</th><th>Spend</th><th>Bottles owed</th><th>Actions</th></tr></thead><tbody id="customer-rows">${customerRows(state.customers)}</tbody></table><div class="table-footer"><span>${state.customers.length} customer records</span><span>Data stored in this browser</span></div></section>`;
}
function customerRows(customers) {
  return customers.length?customers.map(c=>{const sales=state.sales.filter(s=>s.customerId===c.id);return `<tr><td><strong>${esc(c.name)}</strong></td><td>${esc(c.phone)}</td><td>${esc(c.business||"—")}</td><td>${esc(c.address||"—")}</td><td>${sales.length}</td><td><strong>${money(sumSales(sales))}</strong></td><td>${c.outstanding||0}</td><td><button class="text-button" data-customer-history="${esc(c.id)}">History</button></td></tr>`;}).join(""):`<tr><td colspan="8" class="empty-state">No customer records found.</td></tr>`;
}
function renderExpenses() {
  const expenseTotal=state.expenses.reduce((sum,e)=>sum+Number(e.amount),0);
  const sales=recognizedSales(state.sales);
  const gross=sales.reduce((sum,s)=>sum+s.items.reduce((n,i)=>n+(i.price-i.cost)*i.qty,0)-s.discount,0);
  const net=gross-expenseTotal;
  return `${heading("Expenses & profit","Understand your operating costs and estimated business performance.",`<button class="btn secondary" data-action="export-expenses">⇩ Export</button><button class="btn" data-action="add-expense">＋ Record expense</button>`)}
    <div class="stats-grid">${statCard("Recorded revenue",money(sumSales(state.sales)),"includes pending payment sales","₱","")}${statCard("Cost of goods sold",money(sales.reduce((sum,s)=>sum+s.items.reduce((n,i)=>n+i.cost*i.qty,0),0)),"non-refunded sales","↘","orange")}${statCard("Gross profit",money(gross),"revenue less product costs","↗","green")}${statCard("Estimated net profit",money(net),"gross profit less expenses","◇",net<0?"orange":"purple")}</div>
    <div class="dashboard-grid"><section class="table-panel"><div class="table-heading"><div class="table-title"><h2>Expense records</h2><p>${state.expenses.length} recorded expenses · ${money(expenseTotal)} total</p></div></div><table class="data-table"><thead><tr><th>Expense no.</th><th>Date</th><th>Category</th><th>Description</th><th>Approved by</th><th>Amount</th></tr></thead><tbody>${state.expenses.length?state.expenses.slice().sort((a,b)=>new Date(b.date)-new Date(a.date)).map(e=>`<tr><td class="id-cell">${esc(e.id)}</td><td>${dateLabel(e.date)}</td><td>${esc(e.category)}</td><td><strong>${esc(e.description)}</strong></td><td>${esc(e.approvedBy||"Pending")}</td><td><strong>${money(e.amount)}</strong></td></tr>`).join(""):`<tr><td colspan="6" class="empty-state">No expenses recorded yet.</td></tr>`}</tbody></table></section>
    <section class="panel"><div class="panel-heading"><div><h2>Profit breakdown</h2><p>All-time estimate · excludes taxes</p></div></div><div class="bar-list"><div><div class="bar-row-head"><span>Paid sales revenue</span><strong>${money(sumSales(sales))}</strong></div><div class="bar-track"><div class="bar-fill" style="width:100%"></div></div></div><div><div class="bar-row-head"><span>Product costs</span><strong>− ${money(sales.reduce((n,s)=>n+s.items.reduce((m,i)=>m+i.cost*i.qty,0),0))}</strong></div><div class="bar-track"><div class="bar-fill" style="width:${sales.length?Math.min(100,sales.reduce((n,s)=>n+s.items.reduce((m,i)=>m+i.cost*i.qty,0),0)/Math.max(sumSales(sales),1)*100):0}%;background:#e8a43a"></div></div></div><div><div class="bar-row-head"><span>Operating expenses</span><strong>− ${money(expenseTotal)}</strong></div><div class="bar-track"><div class="bar-fill" style="width:${Math.min(100,expenseTotal/Math.max(sumSales(sales),1)*100)}%;background:#eb7980"></div></div></div></div><div class="notice blue" style="margin-top:18px"><span>ℹ</span><span>Profit is an estimate based on recorded unit costs and expenses. Pending payment transactions are excluded. Review actual costs and tax treatment with your accountant.</span></div></section></div>`;
}
function renderReports() {
  const range=ui.reportPeriod;
  const sales=range==="all"?state.sales.slice():range==="custom"?customReportSales():filteredSales(range);
  const paid=paidSales(sales); const recognized=recognizedSales(sales); const revenue=sumSales(sales);
  const cash=sales.reduce((sum,s)=>sum+s.payments.filter(p=>p.status==="Paid"&&p.method.includes("Cash")).reduce((n,p)=>n+Number(p.amount),0)-Number(s.change||0),0)-state.bottleLedger.filter(entry=>(range==="all"||new Date(entry.date)>=periodStart(range))).reduce((sum,entry)=>sum+Number(entry.depositRefund||0),0);
  const credit=sales.filter(s=>s.status==="Credit").reduce((n,s)=>n+Number(s.balanceDue??s.total),0);
  const expenses=state.expenses.filter(e=>range==="all"||range==="custom"?range==="all"||isWithinCustomReport(e.date):new Date(e.date)>=periodStart(range)).reduce((n,e)=>n+Number(e.amount),0);
  const cogs=recognized.reduce((n,s)=>n+s.items.reduce((m,i)=>m+i.cost*i.qty,0),0);
  const gross=recognized.reduce((n,s)=>n+s.items.reduce((m,i)=>m+(i.price-i.cost)*i.qty,0)-s.discount,0);
  return `${heading("Reports","Review sales, payment mix, and product performance.",`<select class="select-control" id="report-period"><option value="today" ${range==="today"?"selected":""}>Today</option><option value="week" ${range==="week"?"selected":""}>Last 7 days</option><option value="month" ${range==="month"?"selected":""}>This month</option><option value="all" ${range==="all"?"selected":""}>All time</option><option value="custom" ${range==="custom"?"selected":""}>Custom dates</option></select>${range==="custom"?`<input class="select-control" id="report-from" type="date" aria-label="Start date" value="${esc(ui.reportFrom)}"><input class="select-control" id="report-to" type="date" aria-label="End date" value="${esc(ui.reportTo)}">`:""}<button class="btn secondary" data-action="export-report">⇩ Export CSV</button>`)}
    <div class="stats-grid">${statCard("Revenue",money(revenue),`${sales.length} transactions`,"₱")}${statCard("Cash received",money(cash),"cash tenders less change","◉","green")}${statCard("Credit sales",money(credit),"unpaid customer balances","↗","orange")}${statCard("Net profit (est.)",money(gross-expenses),"after COGS & recorded expenses","◇","purple")}</div>
    <div class="dashboard-grid"><section class="panel"><div class="panel-heading"><div><h2>Sales trend</h2><p>Daily revenue for the selected period</p></div><span class="status">${range==="today"?"Today":range==="all"?"All time":range==="week"?"7 days":"This month"}</span></div><div class="chart-wrap"><canvas id="report-chart" aria-label="Sales trend chart"></canvas></div></section>
    <section class="panel"><div class="panel-heading"><div><h2>Payment methods</h2><p>Recorded tender totals</p></div></div>${paymentBreakdown(sales)}</section></div>
    <div class="dashboard-grid"><section class="panel"><div class="panel-heading"><div><h2>Sales by product / size</h2><p>Quantity sold and sales value</p></div></div>${productBreakdown(recognized)}</section><section class="panel"><div class="panel-heading"><div><h2>Sales by cashier</h2><p>Cashier totals for the selected period</p></div></div>${cashierBreakdown(recognized)}</section><section class="panel"><div class="panel-heading"><div><h2>Profit summary</h2><p>Selected period</p></div></div><div class="bar-list"><div class="bar-row-head"><span>Revenue (non-refunded)</span><strong>${money(sumSales(recognized))}</strong></div><div class="bar-row-head"><span>Product costs</span><strong>− ${money(cogs)}</strong></div><div class="bar-row-head"><span>Discounts</span><strong>− ${money(recognized.reduce((n,s)=>n+s.discount,0))}</strong></div><div class="bar-row-head"><span>Operating expenses</span><strong>− ${money(expenses)}</strong></div><div class="total-row grand" style="border-top:1px solid var(--line)"><span>Estimated net</span><strong>${money(gross-expenses)}</strong></div></div></section></div>
    <section class="table-panel"><div class="table-heading"><div class="table-title"><h2>Transactions</h2><p>Filter: ${range==="all"?"All time":range==="today"?"Today":range==="week"?"Last 7 days":range==="custom"?`${esc(ui.reportFrom)} to ${esc(ui.reportTo)}`:"This month"} · Cashier Alex Morgan</p></div><button class="btn secondary small" data-action="print-report">Print / Save PDF</button></div>${salesTable(sales.slice().sort((a,b)=>new Date(b.date)-new Date(a.date)))}</section>
    <div class="notice blue" style="margin-top:13px"><span>ℹ</span><span>Revenue and estimated profit include non-refunded sales, including customer credit. Cash received counts completed cash tenders only; mobile payments marked pending are not confirmed deposits.</span></div>`;
}
function periodStart(range) { const d=startOfDay(); if(range==="week")d.setDate(d.getDate()-6);else if(range==="month")d.setDate(1);return d; }
function isWithinCustomReport(value) {
  const date=new Date(value);const from=new Date(`${ui.reportFrom}T00:00:00`),to=new Date(`${ui.reportTo}T23:59:59.999`);
  return Number.isFinite(date.getTime())&&Number.isFinite(from.getTime())&&Number.isFinite(to.getTime())&&from<=to&&date>=from&&date<=to;
}
function customReportSales() { return ui.reportFrom<=ui.reportTo?state.sales.filter(s=>isWithinCustomReport(s.date)):[]; }
function cashierBreakdown(sales) {
  const totals={};sales.forEach(s=>{const cashier=s.cashier||"Unassigned";totals[cashier]=(totals[cashier]||0)+saleRevenue(s);});
  const entries=Object.entries(totals).sort((a,b)=>b[1]-a[1]),max=Math.max(1,...entries.map(([,value])=>value));
  return entries.length?`<div class="bar-list">${entries.map(([cashier,total])=>`<div><div class="bar-row-head"><span>${esc(cashier)}</span><strong>${money(total)}</strong></div><div class="bar-track"><div class="bar-fill" style="width:${total/max*100}%"></div></div></div>`).join("")}</div>`:`<div class="empty-state">No sales for this period.</div>`;
}
function paymentBreakdown(sales) {
  const totals={};sales.forEach(s=>(s.payments||[]).filter(p=>p.status!=="Refunded").forEach(p=>{const name=p.method.replace(" · manual","");totals[name]=(totals[name]||0)+Number(p.amount);}));
  const all=Object.values(totals).reduce((a,b)=>a+b,0)||1;
  return `<div class="bar-list">${Object.entries(totals).length?Object.entries(totals).map(([method,amount])=>`<div><div class="bar-row-head"><span>${esc(method)}</span><strong>${money(amount)}</strong></div><div class="bar-track"><div class="bar-fill" style="width:${Math.min(100,amount/all*100)}%"></div></div></div>`).join(""):`<div class="empty-state">No payment data for this period.</div>`}</div>`;
}
function productBreakdown(sales) {
  const entries={};sales.forEach(s=>s.items.forEach(i=>{entries[i.name]??={qty:0,total:0};entries[i.name].qty+=i.qty;entries[i.name].total+=i.qty*i.price;}));
  const ordered=Object.entries(entries).sort((a,b)=>b[1].qty-a[1].qty);
  return ordered.length?`<div class="bar-list">${ordered.slice(0,7).map(([name,v])=>`<div><div class="bar-row-head"><span>${esc(name)} · ${v.qty} sold</span><strong>${money(v.total)}</strong></div><div class="bar-track"><div class="bar-fill" style="width:${v.qty/ordered[0][1].qty*100}%"></div></div></div>`).join("")}</div>`:`<div class="empty-state">No product sales for this period.</div>`;
}
function drawReportChart() {
  const canvas=document.getElementById("report-chart");if(!canvas)return;
  const rect=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;canvas.width=rect.width*dpr;canvas.height=rect.height*dpr;
  const ctx=canvas.getContext("2d");ctx.scale(dpr,dpr);const w=rect.width,h=rect.height,p={l:42,r:10,t:12,b:27},days=ui.reportPeriod==="today"?1:ui.reportPeriod==="month"?new Date().getDate():ui.reportPeriod==="all"?30:ui.reportPeriod==="custom"?Math.max(1,Math.min(31,Math.floor((new Date(`${ui.reportTo}T00:00:00`)-new Date(`${ui.reportFrom}T00:00:00`))/86400000)+1)):7;
  const vals=[],chartEnd=ui.reportPeriod==="custom"?new Date(`${ui.reportTo}T12:00:00`):new Date();
  for(let i=days-1;i>=0;i--){
    const d=startOfDay(chartEnd);d.setDate(d.getDate()-i);
    const matches=state.sales.filter(s=>startOfDay(new Date(s.date)).getTime()===d.getTime()&&(ui.reportPeriod!=="custom"||isWithinCustomReport(s.date)));
    vals.push({d,v:sumSales(matches)});
  }
  const max=Math.max(...vals.map(x=>x.v),100)*1.2,iw=w-p.l-p.r,ih=h-p.t-p.b;ctx.font="10px DM Sans";
  for(let i=0;i<4;i++){const y=p.t+ih*i/3;ctx.strokeStyle="#edf1f5";ctx.beginPath();ctx.moveTo(p.l,y);ctx.lineTo(w-p.r,y);ctx.stroke();ctx.textAlign="right";ctx.fillStyle="#9aa6b1";ctx.fillText(money(max*(1-i/3)).replace(".00",""),p.l-7,y+3);}
  const bw=Math.min(27,iw/(days*1.8));vals.forEach((x,i)=>{const bh=x.v/max*ih,xx=p.l+(i+.5)*iw/days;ctx.fillStyle="#55a7ef";ctx.beginPath();ctx.roundRect(xx-bw/2,p.t+ih-bh,bw,bh,4);ctx.fill();ctx.textAlign="center";ctx.textBaseline="top";ctx.fillStyle="#99a6b1";ctx.fillText(x.d.toLocaleDateString("en-PH",{weekday:"short"}),xx,h-p.b+8);});
}
function renderSettings() {
  return `${heading("Settings","Manage station details, products, and receipt information.")}
    <div class="page-grid"><div>
      <section class="panel settings-card"><h3>Business & receipt details</h3><p>These details appear on printed receipts.</p><form id="business-form"><div class="form-grid"><div><label class="field-label">Business name</label><input class="form-input" name="name" value="${esc(state.business.name)}" required></div><div><label class="field-label">Phone</label><input class="form-input" name="phone" value="${esc(state.business.phone)}"></div><div><label class="field-label">Business address</label><input class="form-input" name="address" value="${esc(state.business.address)}"></div><div><label class="field-label">Tax details</label><input class="form-input" name="tax" value="${esc(state.business.tax)}"></div><div><label class="field-label">20L refundable deposit (₱)</label><input class="form-input" name="bottleDeposit" type="number" min="0" step=".01" value="${esc(state.settings.bottleDeposit??50)}"></div><div><label class="field-label">Receipt thank-you message</label><input class="form-input" name="receiptThanks" value="${esc(state.settings.receiptThanks)}"></div></div><button class="btn" style="margin-top:15px">Save business details</button></form></section>
      <section class="panel settings-card"><h3>Products & pricing</h3><p>Configure custom bottle sizes, unit costs, prices, and reorder thresholds.</p><button class="btn secondary" data-action="add-product">＋ Add custom product size</button><div style="margin-top:13px">${state.products.map(p=>`<div class="best-row" style="padding:8px 0;border-bottom:1px solid #f0f3f5"><span class="product-thumb ${esc(p.tint)}">${esc(p.icon)}</span><span class="product-meta"><strong>${esc(p.name)}</strong><small>${esc(p.size)} · Cost ${money(p.cost)} · Sell ${money(p.price)}</small></span><button class="text-button" data-edit-product="${esc(p.id)}">Edit</button></div>`).join("")}</div></section>
    </div><aside>    <section class="panel settings-card"><h3>Access & authorization</h3><p>This single-device demo has no secure user accounts.</p><div class="notice"><span>⚠</span><span>Role enforcement, password hashing, server-side sessions, and audit logs are not secure in a static browser app. A backend is required before real business use.</span></div><p style="margin-top:12px">Authorization dialogs use a demo PIN stored in this browser. This is a workflow preview, not production access control.</p></section>
      ${currentUser?.role==="Administrator"?`<section class="panel settings-card"><h3>Data & storage</h3><p>Products, customers, sales, expenses, stock movements, bottle records, and settings are stored in this browser's local database.</p><button class="btn secondary" style="width:100%;margin-bottom:9px" data-action="export-backup">⇩ Download data backup</button><button class="btn secondary" style="width:100%" data-action="import-backup">⇧ Restore data backup</button><div class="notice blue" style="margin-top:13px"><span>ℹ</span><span>Use the export feature regularly. Browser data is not a substitute for a backed-up production database.</span></div></section>`:""}
      <section class="panel settings-card"><h3>Mobile payment workflow</h3><p>GCash and Maya receipts are stored as pending manual confirmation. This demo does not connect to provider APIs or simulate payment success.</p></section>
      <section class="panel settings-card"><h3>Recent audit activity</h3><p>Local activity log for demonstration only.</p>${(state.auditLogs||[]).slice(-6).reverse().map(log=>`<div class="bar-row-head"><span>${esc(log.action)} · ${esc(log.reference||"")}</span><small>${dateLabel(log.date)}</small></div>`).join("")||`<div class="empty-state">No audit events recorded.</div>`}</section></aside></div>`;
}
function openProductModal(product) {
  const p=product||{id:"",name:"",category:"Refills",size:"",price:"",cost:"",stock:0,lowAt:10,unit:"pcs",icon:"◉",tint:"blue"};
  modal(product?"Edit product":"Add product","Configure product size, stock, unit cost, and selling price. Manager PIN is required for this demo.",`<form id="product-form" data-id="${esc(p.id)}"><div class="form-grid"><div style="grid-column:1/-1"><label class="field-label">Product name</label><input class="form-input" name="name" required value="${esc(p.name)}" placeholder="e.g. 3L refill"></div><div><label class="field-label">Category</label><select class="form-input" name="category"><option ${p.category==="Refills"?"selected":""}>Refills</option><option ${p.category==="Bottles"?"selected":""}>Bottles</option><option ${p.category==="Accessories"?"selected":""}>Accessories</option><option ${p.category==="Packaging"?"selected":""}>Packaging</option></select></div><div><label class="field-label">Size / description</label><input class="form-input" name="size" value="${esc(p.size)}" placeholder="e.g. 3 L"></div><div><label class="field-label">Selling price (₱)</label><input class="form-input" name="price" type="number" min="0" step=".01" required value="${esc(p.price)}"></div><div><label class="field-label">Unit cost (₱)</label><input class="form-input" name="cost" type="number" min="0" step=".01" required value="${esc(p.cost)}"></div><div><label class="field-label">Stock on hand</label><input class="form-input" name="stock" type="number" min="0" required value="${esc(p.stock)}"></div><div><label class="field-label">Low-stock alert at</label><input class="form-input" name="lowAt" type="number" min="0" required value="${esc(p.lowAt)}"></div><div style="grid-column:1/-1"><label class="field-label">Manager PIN</label><input class="form-input" name="pin" type="password" required autocomplete="off"></div></div></form>`);
}
function authorizeDiscount() {
  const html=`<form id="auth-form"><label class="field-label">Manager authorization PIN</label><input class="form-input full-input" name="pin" type="password" inputmode="numeric" required autocomplete="off"><p class="modal-subtitle">Demo PIN: 2468 · Replace with secure server-side authorization in production.</p></form>`;
  modal("Authorize discount","A manager must approve price reductions.",html,"Authorize");
  document.querySelector('[data-action="modal-submit"]').dataset.action="authorize-submit";
}
function openCustomerModal() {
  modal("Add customer","Create a customer account to track orders and bottles.",`<form id="customer-form"><div class="form-grid"><div style="grid-column:1/-1"><label class="field-label">Customer name</label><input class="form-input" name="name" required></div><div><label class="field-label">Phone number</label><input class="form-input" name="phone" required placeholder="09xx xxx xxxx"></div><div><label class="field-label">Business name (optional)</label><input class="form-input" name="business"></div><div style="grid-column:1/-1"><label class="field-label">Address</label><input class="form-input" name="address"></div></div></form>`);
}
function openExpenseModal() {
  modal("Record an expense","Authorize this expense using the demo manager PIN. Production approvals must be server-side.",`<form id="expense-form"><div class="form-grid"><div><label class="field-label">Category</label><select class="form-input" name="category"><option>Electricity</option><option>Treatment & filtration</option><option>Rent</option><option>Salaries</option><option>Transport & delivery</option><option>Repairs & maintenance</option><option>Packaging materials</option><option>Other operating costs</option></select></div><div><label class="field-label">Amount (₱)</label><input class="form-input" name="amount" type="number" min=".01" step=".01" required></div><div style="grid-column:1/-1"><label class="field-label">Description</label><input class="form-input" name="description" required placeholder="What was this expense for?"></div><div><label class="field-label">Date</label><input class="form-input" name="date" type="date" required value="${new Date().toISOString().slice(0,10)}"></div><div><label class="field-label">Manager PIN</label><input class="form-input" name="pin" type="password" required autocomplete="off"></div></div></form>`);
}
function openBottleReturn(customerId="") {
  const opts=state.customers.map(c=>`<option value="${esc(c.id)}" ${customerId===c.id?"selected":""}>${esc(c.name)} · ${c.outstanding||0} outstanding</option>`).join("");
  modal("Record bottle return","Record returned 20L bottles and update the customer balance. Any recorded bottle deposit is refunded in cash automatically.",`<form id="return-form"><label class="field-label">Customer</label><select class="form-input full-input" name="customerId" required>${opts}</select><label class="field-label">Number of empty bottles returned</label><input class="form-input full-input" name="qty" type="number" min="1" step="1" required value="1"></form>`);
}
function openBottleIssue() {
  const opts=state.customers.map(c=>`<option value="${esc(c.id)}">${esc(c.name)} · ${c.outstanding||0} outstanding</option>`).join("");
  modal("Issue filled bottles",`Filled 20L containers on hand: ${state.bottleInventory?.filled??12}. This adds bottles to the selected customer's balance.`,`<form id="bottle-issue-form"><label class="field-label">Customer</label><select class="form-input full-input" name="customerId" required>${opts}</select><label class="field-label">Filled bottles issued</label><input class="form-input full-input" name="qty" type="number" min="1" step="1" required value="1"></form>`);
}
function openBottleFill() {
  modal("Refill returned bottles",`Transfer empty 20L bottles into filled bottle stock. Empty stock: ${state.bottleInventory?.empty??0}.`,`<form id="bottle-fill-form"><label class="field-label">Quantity filled</label><input class="form-input full-input" name="qty" type="number" min="1" max="${state.bottleInventory?.empty??0}" step="1" required value="1"><label class="field-label">Manager PIN</label><input class="form-input full-input" name="pin" type="password" required autocomplete="off"></form>`);
}
function openCustomerHistory(customerId) {
  const customer=getCustomer(customerId);
  if(!customer)return;
  const sales=state.sales.filter(s=>s.customerId===customer.id).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const rows=sales.map(s=>`<tr><td>${esc(s.id)}</td><td>${dateLabel(s.date)}</td><td>${s.items.map(i=>`${esc(i.name)} × ${i.qty}`).join("<br>")}</td><td>${money(s.total)}</td><td>${esc(s.status)}</td></tr>`).join("");
  document.getElementById("modal-root").innerHTML=`<div class="modal-backdrop" data-modal-backdrop><section class="modal" role="dialog" aria-modal="true"><h2>${esc(customer.name)} · purchase history</h2><p class="modal-subtitle">${esc(customer.phone)} · ${sales.length} purchase(s) · ${money(sumSales(sales))} recorded sales</p><div class="table-panel" style="max-height:55vh;overflow:auto"><table class="data-table"><thead><tr><th>Receipt</th><th>Date</th><th>Items</th><th>Total</th><th>Status</th></tr></thead><tbody>${rows||`<tr><td colspan="5" class="empty-state">No purchases recorded.</td></tr>`}</tbody></table></div><div class="modal-actions"><button class="btn secondary" data-action="close-modal">Close</button></div></section></div>`;
}
function openSaleActionModal(saleId, action) {
  const sale=state.sales.find(s=>s.id===saleId);
  if(!sale)return;
  if(action==="confirm") {
    modal("Confirm external payment",`Verify receipt ${sale.id} directly in the ${sale.payments.map(p=>p.method).join(" / ")} provider or bank before confirming.`, `<form id="sale-action-form" data-sale-id="${esc(sale.id)}" data-mode="confirm"><p class="notice blue"><span>ℹ</span><span>This is a manual attestation only. The app does not contact the provider or verify a transaction reference.</span></p><label class="field-label">Verified reference / note</label><input class="form-input full-input" name="reference" required value="${esc(sale.payments.find(p=>p.status==="Pending confirmation")?.reference||"")}"><label class="field-label">Manager PIN</label><input class="form-input full-input" name="pin" type="password" required autocomplete="off"></form>`,"Confirm payment");
  } else if(action==="refund") {
    modal("Refund transaction",`Full refund for ${sale.id} · ${money(sale.total)}. This restores sold stock.`, `<form id="sale-action-form" data-sale-id="${esc(sale.id)}" data-mode="refund"><label class="field-label">Refund reason</label><input class="form-input full-input" name="reason" required placeholder="Reason for refund"><label class="field-label">Manager PIN</label><input class="form-input full-input" name="pin" type="password" required autocomplete="off"></form>`,"Authorize refund");
  } else if(action==="collect") {
    modal("Collect customer balance",`Record cash received against ${sale.id}. Remaining balance: ${money(sale.balanceDue??sale.total)}.`, `<form id="sale-action-form" data-sale-id="${esc(sale.id)}" data-mode="collect"><label class="field-label">Cash received (₱)</label><input class="form-input full-input" name="amount" type="number" min=".01" max="${Number(sale.balanceDue??sale.total)}" step=".01" required><label class="field-label">Manager PIN</label><input class="form-input full-input" name="pin" type="password" required autocomplete="off"></form>`,"Record collection");
  }
}
function openStockModal(productId="", mode="adjust") {
  const opts=state.products.map(p=>`<option value="${esc(p.id)}" ${productId===p.id?"selected":""}>${esc(p.name)} · current ${p.stock}</option>`).join("");
  modal(mode==="purchase"?"Record stock purchase":"Adjust stock",mode==="purchase"?"Add purchased inventory and update average unit cost.":"Authorize and record a stock correction.",`<form id="stock-form" data-mode="${mode}"><label class="field-label">Product</label><select class="form-input full-input" name="productId">${opts}</select><label class="field-label">${mode==="purchase"?"Quantity purchased":"Quantity change (+ or −)"}</label><input class="form-input full-input" name="qty" type="number" ${mode==="purchase"?'min="1"':""} step="1" required><label class="field-label">Reason / supplier</label><input class="form-input full-input" name="reason" required placeholder="${mode==="purchase"?"Supplier or purchase reference":"Reason for adjustment"}">${mode==="purchase"?`<label class="field-label">Purchase cost per unit (₱)</label><input class="form-input full-input" name="cost" type="number" min="0" step=".01" required>`:""}<label class="field-label">Manager PIN</label><input class="form-input full-input" name="pin" type="password" required autocomplete="off"></form>`);
}
function checkout() {
  const lines=ui.cart.map(l=>{const p=state.products.find(x=>x.id===l.productId);return p?{product:p,qty:l.qty}:null;}).filter(Boolean);
  if(!lines.length){toast("Add at least one product to the order.","error");return;}
  const subtotal=lines.reduce((n,l)=>n+l.product.price*l.qty,0);
  const discount=Number(ui.discountValue)||0;
  if(discount<0||discount>subtotal){toast("Discount must be between zero and the order subtotal.","error");return;}
  if(discount>0&&!ui.discountAuthorized){toast("A manager must authorize this discount first.","error");return;}
  const bottleCount=ui.issueBottle?lines.filter(l=>l.product.id==="p20").reduce((sum,l)=>sum+l.qty,0):0;
  const depositAmount=bottleCount*Number(state.settings.bottleDeposit??50);
  state.bottleInventory??={filled:12,empty:0};
  if(bottleCount&&(!ui.customerId||bottleCount>state.bottleInventory.filled)){toast(!ui.customerId?"Select a customer to issue returnable bottles.":"Not enough filled bottles are available for that order.","error");return;}
  const total=subtotal-discount+depositAmount;
  let payments=[],status="Paid",change=0;
  if(ui.payment==="Cash"){const tender=Number(ui.cashReceived);if(!Number.isFinite(tender)||tender<total){toast("Cash received must cover the total due.","error");return;}change=tender-total;payments=[{method:"Cash",amount:tender,status:"Paid"}];}
  else if(ui.payment==="Split"){const c=Number(document.getElementById("split-cash")?.value)||0,o=Number(document.getElementById("split-other")?.value)||0;if(Math.abs(c+o-total)>.009){toast("Split payment amounts must add up to the total due.","error");return;}const method=document.getElementById("split-method").value,reference=document.getElementById("split-reference")?.value.trim()||"";payments=[...(c?[{method:"Cash",amount:c,status:"Paid"}]:[]),...(o?[{method,reference,status:"Pending confirmation",amount:o}]:[])];status=o?"Pending confirmation":"Paid";}
  else if(ui.payment==="Credit"){if(!ui.customerId){toast("Select a customer account for a credit sale.","error");return;}status="Credit";payments=[];}
  else {const ref=document.getElementById("payment-reference")?.value.trim()||"";payments=[{method:ui.payment==="Bank"?"Bank transfer":`${ui.payment} · manual`,reference:ref,amount:total,status:"Pending confirmation"}];status="Pending confirmation";}
  const customer=getCustomer(ui.customerId);
  const sale={id:`CS-${state.nextSale++}`,date:new Date().toISOString(),customerId:customer?.id||"",customer:customer?.name||"Walk-in customer",cashier:"Alex Morgan",items:lines.map(l=>({productId:l.product.id,name:l.product.name,category:l.product.category,qty:l.qty,price:l.product.price,cost:l.product.cost})),subtotal,discount,depositAmount,bottleCount,total,balanceDue:status==="Credit"?total:0,payments,change,status};
  lines.forEach(l=>{l.product.stock-=l.qty;state.movements.push({date:sale.date,name:l.product.name,type:"Sale",qty:-l.qty,reference:sale.id});});
  if(bottleCount&&customer){state.bottleInventory.filled-=bottleCount;customer.outstanding=(customer.outstanding||0)+bottleCount;customer.depositBalance=(customer.depositBalance||0)+depositAmount;state.bottleLedger.push({date:sale.date,customer:customer.name,type:"Bottle issued",qty:bottleCount,deposit:depositAmount,reference:sale.id});}
  state.auditLogs??=[];state.auditLogs.push({date:sale.date,user:"Alex Morgan",action:"Sale created",reference:sale.id});
  state.sales.push(sale);persist();ui.cart=[];ui.customerId="";ui.payment="Cash";ui.discountAuthorized=false;ui.discountValue="";ui.cashReceived="";ui.issueBottle=false;render();openReceipt(sale);
}
function openReceipt(sale) {
  const paymentStatus=sale.status==="Pending confirmation"?"Pending manual confirmation":sale.status==="Credit"?"Customer credit · balance due":sale.payments.map(p=>p.method).join(" + ");
  const paidLabel=sale.status==="Credit"?`Outstanding balance: ${money(sale.balanceDue??sale.total)}`:`Amount recorded: ${money(sale.payments.reduce((n,p)=>n+Number(p.amount),0))}`;
  const html=`<div class="receipt" id="print-area"><div class="receipt-head"><h2>${esc(state.business.name)}</h2><p>${esc(state.business.address)}<br>${esc(state.business.phone)}<br>${esc(state.business.tax)}</p></div><div class="receipt-meta"><span>Receipt<br><strong>${esc(sale.id)}</strong></span><span style="text-align:right">${new Date(sale.date).toLocaleString("en-PH")}<br>Cashier: ${esc(sale.cashier)}</span></div><p style="font-size:10px">Customer: ${esc(sale.customer)}</p><table class="receipt-table"><tbody>${sale.items.map(i=>`<tr><td>${esc(i.name)} × ${i.qty}<br><small>${money(i.price)} each</small></td><td>${money(i.price*i.qty)}</td></tr>`).join("")}${sale.depositAmount?`<tr><td>Returnable bottle deposit × ${sale.bottleCount}</td><td>${money(sale.depositAmount)}</td></tr>`:""}</tbody></table><div class="receipt-total">Subtotal ${money(sale.subtotal)}${sale.discount?`<br>Discount − ${money(sale.discount)}`:""}<strong>Total ${money(sale.total)}</strong><div style="margin-top:7px;font-size:10px">Payment: ${esc(paymentStatus)}<br>${paidLabel}${sale.change?`<br>Change due: ${money(sale.change)}`:""}</div></div><p class="receipt-foot" style="text-align:center;margin-top:14px">${esc(state.settings.receiptThanks)}</p></div>`;
  const message=sale.status==="Paid"?"Payment recorded successfully.":sale.status==="Credit"?"Sale recorded on customer credit.":"Payment recorded as pending. Confirm with your provider before marking paid.";
  modal("Sale complete",message,html,"Print receipt");
  document.querySelector('[data-action="modal-submit"]').dataset.action="print-receipt";
}
function downloadCsv(filename, rows) {
  const csv=rows.map(row=>row.map(value=>{const text=String(value??"");const safe=typeof value==="string"&&/^[\s\u0000-\u001f]*[=+\-@]/.test(text)?`'${text}`:text;return `"${safe.replace(/"/g,'""')}"`;}).join(",")).join("\r\n");
  const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);
}
function downloadJson(filename, data) {
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);
}
function exportSales(sales=state.sales) {
  downloadCsv("clearspring-sales.csv",[["Receipt","Date","Customer","Cashier","Payment","Status","Subtotal PHP","Discount PHP","Total PHP"],...sales.map(s=>[s.id,new Date(s.date).toISOString(),s.customer,s.cashier,s.payments.map(p=>p.method).join(" + "),s.status,s.subtotal,s.discount,s.total])]);
}
function handleAction(action, target) {
  if(action==="close-modal"){document.getElementById("modal-root").innerHTML="";return;}
  if(action==="reset-cart"){ui.cart=[];ui.discountValue="";ui.discountAuthorized=false;ui.cashReceived="";render();return;}
  if(action==="add-product"){openProductModal();return;}
  if(action==="edit-product"){openProductModal(state.products.find(p=>p.id===target.dataset.editProduct));return;}
  if(action==="authorize-discount"){authorizeDiscount();return;}
  if(action==="authorize-submit"){
    const pin=new FormData(document.getElementById("auth-form")).get("pin");
    if(pin!==state.settings.managerPin){toast("Authorization denied. PIN not recognized.","error");return;}
    document.getElementById("modal-root").innerHTML="";ui.discountAuthorized=true;render();document.getElementById("discount-input").focus();toast("Discount authorization granted for this order.");return;
  }
  if(action==="checkout"){checkout();return;}
  if(action==="modal-submit"){submitModal();return;}
  if(action==="add-customer"){openCustomerModal();return;}
  if(action==="add-expense"){openExpenseModal();return;}
  if(action==="stock-adjust"){openStockModal("","adjust");return;}
  if(action==="stock-purchase"){openStockModal("","purchase");return;}
  if(action==="bottle-return"){openBottleReturn();return;}
  if(action==="bottle-issue"){openBottleIssue();return;}
  if(action==="bottle-fill"){openBottleFill();return;}
  if(action==="export-sales"||action==="export-report"){exportSales(ui.page==="reports"?filteredReportSales():state.sales);toast("Sales report exported.");return;}
  if(action==="export-inventory"){downloadCsv("clearspring-inventory.csv",[["Product","Category","Size","Stock","Unit","Cost PHP","Price PHP","Reorder at"],...state.products.map(p=>[p.name,p.category,p.size,p.stock,p.unit,p.cost,p.price,p.lowAt])]);toast("Inventory exported.");return;}
  if(action==="export-movements"){downloadCsv("clearspring-stock-movements.csv",[["Date","Product","Movement","Quantity","Reference"],...state.movements.map(m=>[m.date,m.name,m.type,m.qty,m.reference])]);toast("Stock movement report exported.");return;}
  if(action==="export-customers"){downloadCsv("clearspring-customers.csv",[["Name","Phone","Business","Address","Outstanding bottles"],...state.customers.map(c=>[c.name,c.phone,c.business,c.address,c.outstanding||0])]);toast("Customer list exported.");return;}
  if(action==="export-expenses"){downloadCsv("clearspring-expenses.csv",[["ID","Date","Category","Description","Amount PHP","Approved by"],...state.expenses.map(e=>[e.id,e.date,e.category,e.description,e.amount,e.approvedBy])]);toast("Expense report exported.");return;}
  if(action==="export-backup"||action==="import-backup"){
    if(currentUser?.role!=="Administrator"){toast("Only an administrator can manage data backups.","error");return;}
    if(action==="export-backup"){downloadJson("clearspring-data-backup.json",state);toast("Workspace backup downloaded.");return;}
    const input=document.createElement("input");input.type="file";input.accept=".json,application/json";input.onchange=async()=>{try{const f=input.files[0];if(!f)return;const data=normalizeState(JSON.parse(await f.text()));if(!confirm("Replace current browser data with this backup?"))return;replaceState(data);if(!await persist())return;render();toast("Workspace backup restored.");}catch(error){console.error(error);toast("Could not restore backup: invalid or unreadable file.","error");}};input.click();return;
  }
  if(action==="print-receipt"){window.print();return;}
  if(action==="print-report"){document.body.classList.add("print-report");window.addEventListener("afterprint",()=>document.body.classList.remove("print-report"),{once:true});window.print();return;}
}
function filteredReportSales(){if(ui.reportPeriod==="all")return state.sales;return filteredSales(ui.reportPeriod);}
function submitModal() {
  const saleActionForm=document.getElementById("sale-action-form");
  if(saleActionForm){
    if(!saleActionForm.reportValidity())return;
    const f=new FormData(saleActionForm),sale=state.sales.find(s=>s.id===saleActionForm.dataset.saleId),mode=saleActionForm.dataset.mode;
    if(!sale||f.get("pin")!==state.settings.managerPin){toast("Authorization denied. PIN not recognized.","error");return;}
    const date=new Date().toISOString();state.auditLogs??=[];
    if(mode==="confirm"&&sale.status==="Pending confirmation"){
      for(const payment of sale.payments)if(payment.status==="Pending confirmation"){payment.status="Paid";payment.confirmedReference=String(f.get("reference")).trim();}
      sale.status="Paid";sale.confirmedBy="Alex Morgan";sale.confirmedAt=date;
      state.auditLogs.push({date,user:"Alex Morgan",action:"Manual payment confirmation",reference:sale.id});
    }else if(mode==="refund"&&(sale.status==="Paid"||sale.status==="Credit")){
      sale.items.forEach(item=>{const product=state.products.find(p=>p.id===item.productId);if(product){product.stock+=item.qty;state.movements.push({date,name:product.name,type:"Refund",qty:item.qty,reference:sale.id});}});
      if(sale.bottleCount){state.bottleInventory??={filled:12,empty:0};state.bottleInventory.filled+=sale.bottleCount;const customer=getCustomer(sale.customerId);if(customer){customer.outstanding=Math.max(0,(customer.outstanding||0)-sale.bottleCount);customer.depositBalance=Math.max(0,(customer.depositBalance||0)-Number(sale.depositAmount||0));}state.bottleLedger.push({date,customer:sale.customer,type:"Sale refunded",qty:-sale.bottleCount,depositRefund:0,reference:sale.id});}
      sale.payments.forEach(payment=>payment.status="Refunded");
      sale.status="Refunded";sale.refundedAt=date;sale.refundReason=String(f.get("reason")).trim();
      state.auditLogs.push({date,user:"Alex Morgan",action:"Sale refunded",reference:sale.id,reason:sale.refundReason});
    }else if(mode==="collect"&&sale.status==="Credit"){
      const amount=Number(f.get("amount")),due=Number(sale.balanceDue??sale.total);
      if(!Number.isFinite(amount)||amount<=0||amount>due){toast("Collection must be greater than zero and no more than the balance due.","error");return;}
      sale.payments??=[];sale.payments.push({method:"Cash",amount,status:"Paid",date});
      sale.balanceDue=Math.max(0,Math.round((due-amount)*100)/100);
      if(sale.balanceDue===0)sale.status="Paid";
      state.auditLogs.push({date,user:"Alex Morgan",action:"Credit payment collected",reference:sale.id});
    }else {toast("This transaction is no longer eligible for that action.","error");return;}
    persist();document.getElementById("modal-root").innerHTML="";render();toast(mode==="confirm"?"Payment manually confirmed.":mode==="refund"?"Refund recorded and stock restored.":"Customer payment recorded.");return;
  }
  const productForm=document.getElementById("product-form");
  if(productForm){if(!productForm.reportValidity())return;const f=new FormData(productForm),id=productForm.dataset.id;if(f.get("pin")!==state.settings.managerPin){toast("Authorization denied. PIN not recognized.","error");return;}const data={id:id||`p${Date.now()}`,name:String(f.get("name")).trim(),category:f.get("category"),size:String(f.get("size")).trim(),price:Number(f.get("price")),cost:Number(f.get("cost")),stock:Number(f.get("stock")),lowAt:Number(f.get("lowAt")),unit:f.get("category")==="Refills"?"refills":"pcs",icon:f.get("category")==="Bottles"?"♧":"◉",tint:f.get("category")==="Bottles"?"green":"blue"};if(!data.name||data.price<0||data.cost<0||data.stock<0){toast("Enter valid product details.","error");return;}const date=new Date().toISOString();state.auditLogs??=[];if(id){const index=state.products.findIndex(p=>p.id===id);const old=state.products[index];if(old.stock!==data.stock){state.movements.push({date,name:data.name,type:"Adjustment",qty:data.stock-old.stock,reference:"Product edit"});}state.products[index]=data;}else state.products.push(data);state.auditLogs.push({date,user:"Alex Morgan",action:id?"Product updated":"Product created",reference:data.id});persist();document.getElementById("modal-root").innerHTML="";render();toast(id?"Product updated.":"Product added.");return;}
  const customerForm=document.getElementById("customer-form");
  if(customerForm){if(!customerForm.reportValidity())return;const f=new FormData(customerForm);state.customers.push({id:`c${Date.now()}`,name:String(f.get("name")).trim(),phone:String(f.get("phone")).trim(),business:String(f.get("business")).trim(),address:String(f.get("address")).trim(),outstanding:0,depositBalance:0});persist();document.getElementById("modal-root").innerHTML="";render();toast("Customer added.");return;}
  const expenseForm=document.getElementById("expense-form");
  if(expenseForm){if(!expenseForm.reportValidity())return;const f=new FormData(expenseForm);if(f.get("pin")!==state.settings.managerPin){toast("Authorization denied. PIN not recognized.","error");return;}const expense={id:`EX-${state.nextExpense++}`,date:new Date(`${f.get("date")}T12:00:00`).toISOString(),category:f.get("category"),description:String(f.get("description")).trim(),amount:Number(f.get("amount")),approvedBy:"Alex Morgan"};state.expenses.push(expense);state.auditLogs??=[];state.auditLogs.push({date:expense.date,user:expense.approvedBy,action:"Expense approved",reference:expense.id});persist();document.getElementById("modal-root").innerHTML="";render();toast("Expense recorded and approved.");return;}
  const returnForm=document.getElementById("return-form");
  if(returnForm){if(!returnForm.reportValidity())return;const f=new FormData(returnForm),customer=getCustomer(f.get("customerId")),qty=Number(f.get("qty"));if(!customer||qty<1||qty>(customer.outstanding||0)){toast("Return quantity must be between one and the customer's outstanding balance.","error");return;}state.bottleInventory??={filled:12,empty:0};customer.outstanding-=qty;state.bottleInventory.empty+=qty;const depositRefund=Math.min(Number(customer.depositBalance||0),qty*Number(state.settings.bottleDeposit??50));customer.depositBalance=Math.max(0,Number(customer.depositBalance||0)-depositRefund);const date=new Date().toISOString();state.bottleLedger.push({date,customer:customer.name,type:"Return",qty,depositRefund});state.movements.push({date,name:"20L Empty Bottle",type:"Bottle return",qty,reference:customer.id});state.auditLogs??=[];state.auditLogs.push({date,user:"Alex Morgan",action:"Bottle return recorded",reference:customer.id,depositRefund});persist();document.getElementById("modal-root").innerHTML="";render();toast(`${qty} bottle${qty>1?"s":""} returned for ${customer.name}. Deposit refund: ${money(depositRefund)}.`);return;}
  const issueForm=document.getElementById("bottle-issue-form");
  if(issueForm){if(!issueForm.reportValidity())return;const f=new FormData(issueForm),customer=getCustomer(f.get("customerId")),qty=Number(f.get("qty"));state.bottleInventory??={filled:12,empty:0};if(!customer||qty<1||qty>state.bottleInventory.filled){toast("Choose a customer and a quantity within filled-bottle stock.","error");return;}state.bottleInventory.filled-=qty;customer.outstanding=(customer.outstanding||0)+qty;const date=new Date().toISOString();state.bottleLedger.push({date,customer:customer.name,type:"Bottle issued",qty});state.auditLogs??=[];state.auditLogs.push({date,user:"Alex Morgan",action:"Filled bottles issued",reference:customer.id});persist();document.getElementById("modal-root").innerHTML="";render();toast(`${qty} filled bottle${qty>1?"s":""} issued to ${customer.name}.`);return;}
  const fillForm=document.getElementById("bottle-fill-form");
  if(fillForm){if(!fillForm.reportValidity())return;const f=new FormData(fillForm),qty=Number(f.get("qty"));state.bottleInventory??={filled:12,empty:0};if(f.get("pin")!==state.settings.managerPin){toast("Authorization denied. PIN not recognized.","error");return;}if(qty<1||qty>state.bottleInventory.empty){toast("Quantity must not exceed available empty bottles.","error");return;}state.bottleInventory.empty-=qty;state.bottleInventory.filled+=qty;const date=new Date().toISOString();state.bottleLedger.push({date,customer:"Station stock",type:"Bottles refilled",qty});state.auditLogs??=[];state.auditLogs.push({date,user:"Alex Morgan",action:"Returned bottles refilled",reference:`${qty} bottle(s)`});persist();document.getElementById("modal-root").innerHTML="";render();toast(`${qty} bottle${qty>1?"s":""} refilled and ready.`);return;}
  const stockForm=document.getElementById("stock-form");
  if(stockForm){if(!stockForm.reportValidity())return;const f=new FormData(stockForm),p=state.products.find(x=>x.id===f.get("productId")),qty=Number(f.get("qty"));if(f.get("pin")!==state.settings.managerPin){toast("Authorization denied. PIN not recognized.","error");return;}if(!p||!Number.isInteger(qty)||qty===0){toast("Choose a product and enter a valid non-zero quantity.","error");return;}if(stockForm.dataset.mode==="purchase"){if(qty<1){toast("Purchase quantity must be at least one.","error");return;}const cost=Number(f.get("cost"));p.cost=(p.cost*p.stock+cost*qty)/(p.stock+qty);p.stock+=qty;}else {if(p.stock+qty<0){toast("Adjustment would result in negative stock.","error");return;}p.stock+=qty;}const date=new Date().toISOString();state.movements.push({date,name:p.name,type:stockForm.dataset.mode==="purchase"?"Purchase":"Adjustment",qty,reference:String(f.get("reason")).trim()});state.auditLogs??=[];state.auditLogs.push({date,user:"Alex Morgan",action:stockForm.dataset.mode==="purchase"?"Stock purchase":"Stock adjustment",reference:p.id,reason:String(f.get("reason")).trim()});persist();document.getElementById("modal-root").innerHTML="";render();toast("Inventory updated and movement recorded.");return;}
}
document.addEventListener("click",event=>{
  const page=event.target.closest("[data-page]");if(page){event.preventDefault();go(page.dataset.page);return;}
  const category=event.target.closest("[data-category]");if(category){ui.category=category.dataset.category;render();return;}
  const add=event.target.closest("[data-add-cart]");if(add){const p=state.products.find(x=>x.id===add.dataset.addCart);if(!p||p.stock<1){toast("This item is out of stock.","error");return;}const line=ui.cart.find(x=>x.productId===p.id);if(line){if(line.qty>=p.stock){toast("Not enough stock for that quantity.","error");return;}line.qty++;}else ui.cart.push({productId:p.id,qty:1});render();return;}
  const qty=event.target.closest("[data-qty]");if(qty){const line=ui.cart.find(x=>x.productId===qty.dataset.qty),p=state.products.find(x=>x.id===qty.dataset.qty);if(line){line.qty+=Number(qty.dataset.delta);if(line.qty<1)ui.cart=ui.cart.filter(x=>x!==line);else if(line.qty>p.stock){line.qty=p.stock;toast("Quantity capped at current stock.","error");}}render();return;}
  const pay=event.target.closest("[data-payment]");if(pay){ui.payment=pay.dataset.payment;render();return;}
  const adjust=event.target.closest("[data-adjust-product]");if(adjust){openStockModal(adjust.dataset.adjustProduct,"adjust");return;}
  const edit=event.target.closest("[data-edit-product]");if(edit){openProductModal(state.products.find(p=>p.id===edit.dataset.editProduct));return;}
  const ret=event.target.closest("[data-return-customer]");if(ret){openBottleReturn(ret.dataset.returnCustomer);return;}
  const issue=event.target.closest("[data-confirm-payment]");if(issue){openSaleActionModal(issue.dataset.confirmPayment,"confirm");return;}
  const refund=event.target.closest("[data-refund-sale]");if(refund){openSaleActionModal(refund.dataset.refundSale,"refund");return;}
  const collect=event.target.closest("[data-collect-credit]");if(collect){openSaleActionModal(collect.dataset.collectCredit,"collect");return;}
  const hist=event.target.closest("[data-customer-history]");if(hist){openCustomerHistory(hist.dataset.customerHistory);return;}
  const action=event.target.closest("[data-action]");if(action){handleAction(action.dataset.action,action);return;}
  if(event.target.matches("[data-modal-backdrop]"))document.getElementById("modal-root").innerHTML="";
});
document.addEventListener("input",event=>{
  if(event.target.id==="product-search"){ui.search=event.target.value;const cursor=event.target.selectionStart;render();const field=document.getElementById("product-search");field.focus();field.setSelectionRange(cursor,cursor);}
  if(event.target.id==="inventory-search"){const q=event.target.value.toLowerCase();document.getElementById("inventory-rows").innerHTML=inventoryRows(state.products.filter(p=>`${p.name} ${p.category}`.toLowerCase().includes(q)));}
  if(event.target.id==="customer-search"){const q=event.target.value.toLowerCase();document.getElementById("customer-rows").innerHTML=customerRows(state.customers.filter(c=>`${c.name} ${c.phone} ${c.business}`.toLowerCase().includes(q)));}
  if(event.target.id==="discount-input"||event.target.id==="cash-input"){
    if(event.target.id==="discount-input")ui.discountValue=event.target.value;else ui.cashReceived=event.target.value;
      const subtotal=ui.cart.reduce((sum,line)=>sum+(state.products.find(p=>p.id===line.productId)?.price||0)*line.qty,0),discount=Number(ui.discountValue)||0,bottleCount=ui.issueBottle?ui.cart.filter(line=>line.productId==="p20").reduce((sum,line)=>sum+line.qty,0):0,depositAmount=bottleCount*Number(state.settings.bottleDeposit??50),total=Math.max(0,subtotal-discount)+depositAmount,cash=Number(ui.cashReceived)||0;
    document.getElementById("subtotal-amount").textContent=money(subtotal);document.getElementById("discount-amount").textContent=`− ${money(discount)}`;document.getElementById("total-amount").textContent=money(total);
      const depositRow=document.getElementById("deposit-row"),depositLabel=depositRow?.querySelector("span");if(depositRow){depositRow.style.display=depositAmount?"flex":"none";depositLabel.textContent=`Bottle deposit · ${bottleCount} bottle${bottleCount===1?"":"s"}`;document.getElementById("deposit-amount").textContent=money(depositAmount);}
    const checkoutButton=document.querySelector(".checkout-btn");checkoutButton.textContent=`Complete sale · ${money(total)}`;
    const changeInfo=document.getElementById("change-info");if(changeInfo)changeInfo.innerHTML=cash>total?`<div class="change-note" style="margin-top:8px">Change due: <strong>${money(cash-total)}</strong></div>`:"";
  }
});
document.addEventListener("change",event=>{
  if(event.target.id==="chart-period"){ui.period=event.target.value;render();}
  if(event.target.id==="report-period"){ui.reportPeriod=event.target.value;render();}
  if(event.target.id==="report-from"){ui.reportFrom=event.target.value;ui.reportPeriod="custom";render();}
  if(event.target.id==="report-to"){ui.reportTo=event.target.value;ui.reportPeriod="custom";render();}
  if(event.target.id==="customer-select"){ui.customerId=event.target.value;}
  if(event.target.id==="bottle-deposit-check"){ui.issueBottle=event.target.checked;render();}
});
document.addEventListener("submit",event=>{
  if(event.target.id==="business-form"){event.preventDefault();const f=new FormData(event.target),deposit=Number(f.get("bottleDeposit"));if(!Number.isFinite(deposit)||deposit<0){toast("Enter a valid, non-negative bottle deposit.","error");return;}state.business.name=String(f.get("name")).trim();state.business.phone=String(f.get("phone")).trim();state.business.address=String(f.get("address")).trim();state.business.tax=String(f.get("tax")).trim();state.settings.bottleDeposit=deposit;state.settings.receiptThanks=String(f.get("receiptThanks")).trim();persist();toast("Business and receipt details saved.");}
  if(event.target.id==="auth-form"){event.preventDefault();handleAction("authorize-submit");}
});
document.getElementById("mobile-menu").addEventListener("click",()=>document.getElementById("sidebar").classList.toggle("open"));
document.getElementById("help-btn").addEventListener("click",()=>toast("Help center documentation is not connected in this offline demo."));
document.getElementById("profile-menu").addEventListener("click",async()=>{try{await logoutUser();showMain(DEFAULT_USER);}catch(error){console.error("Could not sign out.",error);toast("Could not sign out. Check the server connection and try again.","error");}});
document.getElementById("alerts-btn").addEventListener("click",()=>{const low=state.products.filter(p=>p.stock<=p.lowAt);toast(low.length?`${low.length} low-stock item(s): ${low.map(p=>p.name).join(", ")}`:"You're all caught up — no inventory alerts.");});
document.addEventListener("keydown",event=>{if(event.key==="Escape")document.getElementById("modal-root").innerHTML="";if(event.key==="F2"){event.preventDefault();go("pos");}});
const today=new Date();document.getElementById("today-label").textContent=today.toLocaleDateString("en-PH",{weekday:"short",month:"short",day:"numeric",year:"numeric"});
document.querySelectorAll(".nav-item[data-page]").forEach(button=>button.addEventListener("click",()=>go(button.dataset.page)));
window.addEventListener("resize",()=>{if(ui.page==="dashboard")drawChart();if(ui.page==="reports")drawReportChart();});
document.getElementById("page-container").innerHTML = '<div class="panel" role="status">Opening local database…</div>';
initializeDatabase().then(async () => {
  showMain(DEFAULT_USER);
}).catch(error => {
  console.error("Could not initialize the POS database.", error);
  loginRoot.innerHTML = '<main class="login-page"><section class="login-card" role="alert"><h1>Could not open the workspace</h1><p>Your POS data or login session could not be loaded. Check that browser storage is enabled, then reload this page.</p></section></main>';
});
