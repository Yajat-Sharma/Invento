// ============================================================
// Invento v3 — shared.js
// Multi-user | Multi-shop | Role-based | Full Analytics
// ============================================================

// ── Mobile Stability: Global Error Boundary & Lite Mode Detection ──
window.APP_CONFIG = { isLiteMode: window.innerWidth < 768 };

function showErrorUI(message) {
  let overlay = document.getElementById('error-fallback-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'error-fallback-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#0F172A;color:#F1F5F9;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;text-align:center;';
    overlay.innerHTML = `
      <div style="background:#1E293B;padding:30px;border-radius:12px;max-width:400px;width:100%;box-sizing:border-box;">
        <div style="font-size:40px;margin-bottom:15px;">⚠️</div>
        <h2 style="margin:0 0 10px;font-size:20px;">Something went wrong</h2>
        <p style="margin:0 0 20px;font-size:14px;color:#94A3B8;word-wrap:break-word;">${escapeHtml(message || 'The application encountered an unexpected error.')}</p>
        <button onclick="window.location.reload()" style="background:#3B82F6;color:#fff;border:none;padding:12px 20px;border-radius:6px;font-weight:600;cursor:pointer;width:100%;">Reload App</button>
      </div>
    `;
    document.body.appendChild(overlay);
  }
}

window.addEventListener('error', (e) => {
  console.error("Global Error Caught:", e.error);
  if (window.APP_CONFIG.isLiteMode) showErrorUI(e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error("Unhandled Rejection:", e.reason);
  if (window.APP_CONFIG.isLiteMode) showErrorUI(e.reason?.message || "An async operation failed.");
});

// ── Shop Session ─────────────────────────────────────────────
function getCurrentShopId() {
  return localStorage.getItem('stocksense_current_shop_id') || null;
}
function setCurrentShopId(id) {
  if (id) localStorage.setItem('stocksense_current_shop_id', id);
  else localStorage.removeItem('stocksense_current_shop_id');
}

// ── User-level key (shops list, not shop-scoped) ─────────────
function getUserKey(entity) {
  const u = getCurrentUser();
  return `stocksense_${u?.id || 'guest'}_${entity}`;
}

// ── Shop-level key (products, sales, etc.) ───────────────────
function getShopKey(entity) {
  const u      = getCurrentUser();
  const shopId = getCurrentShopId();
  return `stocksense_${u?.id || 'guest'}_${shopId || 'default'}_${entity}`;
}

// ── v2 → v3 Migration ────────────────────────────────────────
// Moves old stocksense_{userId}_{entity} keys into "My First Shop"
function migrateToMultiShop() {
  const user = getCurrentUser();
  if (!user) return null;

  const shopsKey = getUserKey('shops');
  const existing = (() => { try { return JSON.parse(localStorage.getItem(shopsKey)); } catch { return null; } })();
  if (existing && Array.isArray(existing) && existing.length) {
    // Already migrated — ensure current shop is set
    if (!getCurrentShopId()) setCurrentShopId(existing[0].id);
    return existing;
  }

  // Build default shop
  const defaultShopId = 'shop_def_' + user.id;
  const defaultShop = {
    id:        defaultShopId,
    name:      'My First Shop',
    address:   '',
    phone:     '',
    email:     user.email || '',
    gst:       '',
    currency:  '₹',
    ownerId:   user.id,
    createdAt: new Date().toISOString(),
    members:   [{ userId: user.id, name: user.name || 'Owner', email: user.email || '', role: 'owner', addedAt: new Date().toISOString() }]
  };

  // Migrate old-style keys
  const entities = ['products', 'categories', 'suppliers', 'sales', 'waste', 'settings'];
  entities.forEach(entity => {
    const oldKey  = `stocksense_${user.id}_${entity}`;
    const newKey  = `stocksense_${user.id}_${defaultShopId}_${entity}`;
    const oldData = localStorage.getItem(oldKey);
    if (oldData !== null) {
      localStorage.setItem(newKey, oldData);
      localStorage.removeItem(oldKey);
    }
  });

  const shops = [defaultShop];
  localStorage.setItem(shopsKey, JSON.stringify(shops));
  setCurrentShopId(defaultShopId);
  return shops;
}

// ── DB Layer ─────────────────────────────────────────────────
const DB = {
  _get(key)      { try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; } },
  _getObj(key)   { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } },
  _set(key, val) { localStorage.setItem(key, JSON.stringify(val)); },

  // ── Shops (user-level) ──
  getShops()          { return this._get(getUserKey('shops')); },
  saveShops(s)        { this._set(getUserKey('shops'), s); },
  addShop(shop)       { const s = this.getShops(); s.push(shop); this.saveShops(s); return shop; },
  updateShop(id, f)   { const s = this.getShops(), i = s.findIndex(x => x.id === id); if (i >= 0) { s[i] = { ...s[i], ...f }; this.saveShops(s); } },
  deleteShop(id)      { this.saveShops(this.getShops().filter(x => x.id !== id)); },
  getShopById(id)     { return this.getShops().find(x => x.id === id) || null; },
  getCurrentShop()    { return this.getShopById(getCurrentShopId()); },

  // ── Shop Members ──
  getShopMembers()        { const sh = this.getCurrentShop(); return sh?.members || []; },
  addShopMember(member)   { const sh = this.getCurrentShop(); if (!sh) return; sh.members = sh.members || []; sh.members.push(member); this.updateShop(sh.id, { members: sh.members }); },
  updateShopMember(userId, f) { const sh = this.getCurrentShop(); if (!sh) return; const i = (sh.members || []).findIndex(m => m.userId === userId); if (i >= 0) { sh.members[i] = { ...sh.members[i], ...f }; this.updateShop(sh.id, { members: sh.members }); } },
  removeShopMember(userId) { const sh = this.getCurrentShop(); if (!sh) return; sh.members = (sh.members || []).filter(m => m.userId !== userId); this.updateShop(sh.id, { members: sh.members }); },
  getCurrentUserRole()    {
    const user = getCurrentUser();
    const sh   = this.getCurrentShop();
    if (!user || !sh) return null;
    const m = (sh.members || []).find(m => m.userId === user.id);
    return m?.role || null;
  },

  // ── Products (shop-level) ──
  getProducts()        { return this._get(getShopKey('products')); },
  saveProducts(p)      { this._set(getShopKey('products'), p); },
  addProduct(prod)     { const p = this.getProducts(); p.unshift(prod); this.saveProducts(p); return prod; },
  updateProduct(id, f) { const p = this.getProducts(), i = p.findIndex(x => x.id === id); if (i >= 0) { p[i] = { ...p[i], ...f, updatedAt: now() }; this.saveProducts(p); } },
  deleteProduct(id)    { this.saveProducts(this.getProducts().filter(x => x.id !== id)); },
  getProductById(id)   { return this.getProducts().find(x => x.id === id) || null; },

  // ── Categories (shop-level) ──
  getCategories()         { return this._get(getShopKey('categories')); },
  saveCategories(c)       { this._set(getShopKey('categories'), c); },
  addCategory(cat)        { const c = this.getCategories(); c.push(cat); this.saveCategories(c); return cat; },
  updateCategory(id, f)   { const c = this.getCategories(), i = c.findIndex(x => x.id === id); if (i >= 0) { c[i] = { ...c[i], ...f }; this.saveCategories(c); } },
  deleteCategory(id)      { this.saveCategories(this.getCategories().filter(x => x.id !== id)); },
  getCategoryById(id)     { return this.getCategories().find(x => x.id === id) || null; },

  // ── Suppliers (shop-level) ──
  getSuppliers()          { return this._get(getShopKey('suppliers')); },
  saveSuppliers(s)        { this._set(getShopKey('suppliers'), s); },
  addSupplier(sup)        { const s = this.getSuppliers(); s.push(sup); this.saveSuppliers(s); return sup; },
  updateSupplier(id, f)   { const s = this.getSuppliers(), i = s.findIndex(x => x.id === id); if (i >= 0) { s[i] = { ...s[i], ...f }; this.saveSuppliers(s); } },
  deleteSupplier(id)      { this.saveSuppliers(this.getSuppliers().filter(x => x.id !== id)); },
  getSupplierById(id)     { return this.getSuppliers().find(x => x.id === id) || null; },

  // ── Sales (shop-level) ──
  getSales()              { return this._get(getShopKey('sales')); },
  saveSales(s)            { this._set(getShopKey('sales'), s); },
  addSale(sale)           { const s = this.getSales(); s.unshift(sale); this.saveSales(s); return sale; },
  deleteSale(id)          { this.saveSales(this.getSales().filter(x => x.id !== id)); },

  // ── Waste / Disposed (shop-level) ──
  getWaste()              { return this._get(getShopKey('waste')); },
  saveWaste(w)            { this._set(getShopKey('waste'), w); },
  addWaste(entry)         { const w = this.getWaste(); w.unshift(entry); this.saveWaste(w); return entry; },
  deleteWaste(id)         { this.saveWaste(this.getWaste().filter(x => x.id !== id)); },

  // ── Settings (shop-level) ──
  getSettings()           { return this._getObj(getShopKey('settings')); },
  saveSettings(s)         { this._set(getShopKey('settings'), s); }
};

// ── Utilities ────────────────────────────────────────────────
function genId(prefix = 'id') {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}
function now()      { return new Date().toISOString(); }
function todayStr() { return new Date().toISOString().split('T')[0]; }

function escapeHtml(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(str || ''));
  return d.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatCurrency(amount) {
  const shop = DB.getCurrentShop();
  const sym  = shop?.currency || '₹';
  return sym + Number(amount || 0).toLocaleString('en-IN');
}

// ── Discount / Pricing ────────────────────────────────────────
function isDiscountActive(product) {
  if (!product.discountPrice || !product.discountEnd) return false;
  const today = todayStr();
  const start = product.discountStart || today;
  return today >= start && today <= product.discountEnd;
}

function getEffectivePrice(product) {
  if (isDiscountActive(product)) return Number(product.discountPrice);
  return Number(product.sellingPrice || 0);
}

// ── Expiry & Stock Status ─────────────────────────────────────
function getExpiryStatus(expiryDate) {
  if (!expiryDate) return { status: 'unknown', daysLeft: null, label: '—', badgeClass: 'badge-expired' };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const exp   = new Date(expiryDate + 'T00:00:00');
  const diff  = Math.ceil((exp - today) / 86400000);
  if (diff < 0)   return { status: 'expired',  daysLeft: diff, label: `Expired ${Math.abs(diff)}d ago`, badgeClass: 'badge-expired' };
  if (diff === 0) return { status: 'expiring', daysLeft: 0,    label: 'Expires today',                  badgeClass: 'badge-expiring' };
  if (diff <= 7)  return { status: 'expiring', daysLeft: diff, label: `${diff}d left`,                  badgeClass: 'badge-expiring' };
  if (diff <= 30) return { status: 'warning',  daysLeft: diff, label: `${diff}d left`,                  badgeClass: 'badge-low' };
  return              { status: 'good',     daysLeft: diff, label: `${diff}d left`,                  badgeClass: 'badge-good' };
}

function getStockStatus(qty, minStock) {
  qty = Number(qty); minStock = Number(minStock) || 0;
  if (qty === 0)        return { status: 'out',  label: 'Out of Stock', badgeClass: 'badge-out' };
  if (qty <= minStock)  return { status: 'low',  label: 'Low Stock',    badgeClass: 'badge-low' };
  return                       { status: 'good', label: 'In Stock',     badgeClass: 'badge-good' };
}

function getProductStatus(p) {
  const stock = Number(p.quantity) || 0;
  const min = Number(p.minStockLevel) || 0;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(p.expiryDate ? p.expiryDate + 'T00:00:00' : NaN);
  const diff = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));

  if (isNaN(diff)) {
    if (stock <= min) return { label: 'Low Stock', badgeClass: 'badge-low' };
    return { label: 'In Stock', badgeClass: 'badge-good' };
  }

  if (stock <= min) return { label: 'Low Stock', badgeClass: 'badge-low' };
  if (diff <= 0) return { label: 'Expired', badgeClass: 'badge-expired' };
  if (diff <= 7) return { label: 'Expiring Soon', badgeClass: 'badge-expiring' };
  
  return { label: 'In Stock', badgeClass: 'badge-good' };
}

// ── Alert Counts ─────────────────────────────────────────────
function getAlertCounts() {
  const products = DB.getProducts();
  let expired = 0, exp7 = 0, exp30 = 0, low = 0, out = 0, dead = 0, loss = 0;
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  const recentIds = new Set(DB.getSales().filter(s => s.date >= cutoffStr).map(s => s.productId));

  products.forEach(p => {
    const es = getExpiryStatus(p.expiryDate);
    const ss = getStockStatus(p.quantity, p.minStockLevel);
    if (es.status === 'expired')        expired++;
    else if (es.status === 'expiring')  exp7++;
    else if (es.status === 'warning')   exp30++;
    if (ss.status === 'out')   out++;
    else if (ss.status === 'low') low++;
    if (!recentIds.has(p.id) && Number(p.quantity) > 0) dead++;
  });
  loss = getLossPreventionAlerts().length;
  return { expired, exp7, exp30, low, out, dead, loss, total: expired + exp7 + low + out + loss };
}

// ── Analytics Functions ───────────────────────────────────────
function getStockValue() {
  return DB.getProducts().reduce((s, p) => s + Number(p.costPrice || 0) * Number(p.quantity || 0), 0);
}

function getProfitStats() {
  const sales   = DB.getSales();
  const prodMap = Object.fromEntries(DB.getProducts().map(p => [p.id, p]));
  const today   = todayStr();
  const month   = today.slice(0, 7);
  let todayProfit = 0, monthProfit = 0, totalProfit = 0;
  sales.forEach(s => {
    const cost   = Number(prodMap[s.productId]?.costPrice || 0);
    const profit = (Number(s.sellingPrice || 0) - cost) * Number(s.quantitySold || 0);
    totalProfit += profit;
    if (s.date === today)                 todayProfit += profit;
    if ((s.date || '').startsWith(month)) monthProfit += profit;
  });
  return { todayProfit, monthProfit, totalProfit };
}

function getDeadStockProducts(days = 30) {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  const recentIds = new Set(DB.getSales().filter(s => s.date >= cutoffStr).map(s => s.productId));
  return DB.getProducts().filter(p => !recentIds.has(p.id) && Number(p.quantity) > 0);
}

function getFastMovingProducts(limit = 10) {
  const map = {};
  DB.getSales().forEach(s => { map[s.productId] = (map[s.productId] || { qty: 0, rev: 0 }); map[s.productId].qty += Number(s.quantitySold || 0); map[s.productId].rev += Number(s.totalAmount || 0); });
  return DB.getProducts()
    .filter(p => map[p.id])
    .map(p => ({ ...p, totalSold: map[p.id].qty, totalRev: map[p.id].rev }))
    .sort((a, b) => b.totalSold - a.totalSold)
    .slice(0, limit);
}

function getSlowMovingProducts(limit = 10) {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  const recentMap = {};
  DB.getSales().filter(s => s.date >= cutoffStr).forEach(s => { recentMap[s.productId] = (recentMap[s.productId] || 0) + Number(s.quantitySold || 0); });
  const allSoldIds = new Set(DB.getSales().map(s => s.productId));
  return DB.getProducts()
    .filter(p => allSoldIds.has(p.id) && (recentMap[p.id] || 0) < 5)
    .map(p => ({ ...p, recentSold: recentMap[p.id] || 0 }))
    .sort((a, b) => a.recentSold - b.recentSold)
    .slice(0, limit);
}

function computeABCAnalysis() {
  const salesMap = {};
  DB.getSales().forEach(s => { salesMap[s.productId] = (salesMap[s.productId] || 0) + Number(s.totalAmount || 0); });
  const products = DB.getProducts().map(p => ({ ...p, revenue: salesMap[p.id] || 0 })).sort((a, b) => b.revenue - a.revenue);
  const totalRevenue = products.reduce((s, p) => s + p.revenue, 0);
  let cumulative = 0;
  const A = [], B = [], C = [];
  products.forEach(p => {
    cumulative += p.revenue;
    const pct = totalRevenue > 0 ? cumulative / totalRevenue : 1;
    if (pct <= 0.7)       A.push({ ...p, abc: 'A' });
    else if (pct <= 0.9)  B.push({ ...p, abc: 'B' });
    else                  C.push({ ...p, abc: 'C' });
  });
  const aRev = A.reduce((s, p) => s + p.revenue, 0);
  const bRev = B.reduce((s, p) => s + p.revenue, 0);
  const cRev = C.reduce((s, p) => s + p.revenue, 0);
  return { A, B, C, totalRevenue, aRev, bRev, cRev };
}

function getLossPreventionAlerts() {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  const recentMap = {};
  DB.getSales().filter(s => s.date >= cutoffStr).forEach(s => { recentMap[s.productId] = (recentMap[s.productId] || 0) + Number(s.quantitySold || 0); });
  return DB.getProducts().filter(p => {
    const es = getExpiryStatus(p.expiryDate);
    if (!['expiring', 'warning', 'expired'].includes(es.status)) return false;
    const qty = Number(p.quantity || 0);
    if (qty === 0) return false;
    const recentSold = recentMap[p.id] || 0;
    const salesRatio = qty > 0 ? recentSold / qty : 0;
    return qty > Number(p.minStockLevel || 0) && salesRatio < 0.2;
  });
}

function getSupplierReport() {
  const products = DB.getProducts();
  const sales    = DB.getSales();
  const prodMap  = Object.fromEntries(products.map(p => [p.id, p]));
  const sMap     = {};
  sales.forEach(s => {
    const supId = prodMap[s.productId]?.supplierId || '_none';
    sMap[supId] = sMap[supId] || { qty: 0, revenue: 0 };
    sMap[supId].qty     += Number(s.quantitySold || 0);
    sMap[supId].revenue += Number(s.totalAmount  || 0);
  });
  const pByS = {};
  products.forEach(p => { const sid = p.supplierId || '_none'; pByS[sid] = pByS[sid] || []; pByS[sid].push(p); });
  return DB.getSuppliers().map(s => ({
    ...s,
    productCount: (pByS[s.id] || []).length,
    products:     pByS[s.id] || [],
    salesQty:     (sMap[s.id] || {}).qty || 0,
    salesRevenue: (sMap[s.id] || {}).revenue || 0
  }));
}

// ── Pagination Helper ─────────────────────────────────────────
function paginate(items, page, perPage = 25) {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const pg    = Math.min(Math.max(1, page), pages);
  return { items: items.slice((pg - 1) * perPage, pg * perPage), page: pg, pages, total };
}

function renderPagination(containerId, currentPage, totalPages, onPageChange) {
  const el = document.getElementById(containerId);
  if (!el || totalPages <= 1) { if (el) el.innerHTML = ''; return; }
  let html = `<div class="pagination">`;
  html += `<button class="pg-btn" ${currentPage <= 1 ? 'disabled' : ''} onclick="(${onPageChange.toString()})(${currentPage - 1})">‹ Prev</button>`;
  for (let i = 1; i <= totalPages; i++) {
    if (totalPages > 7 && i > 2 && i < totalPages - 1 && Math.abs(i - currentPage) > 1) {
      if (i === 3 || i === totalPages - 2) html += `<span class="pg-ellipsis">…</span>`;
      continue;
    }
    html += `<button class="pg-btn ${i === currentPage ? 'active' : ''}" onclick="(${onPageChange.toString()})(${i})">${i}</button>`;
  }
  html += `<button class="pg-btn" ${currentPage >= totalPages ? 'disabled' : ''} onclick="(${onPageChange.toString()})(${currentPage + 1})">Next ›</button>`;
  html += `</div>`;
  el.innerHTML = html;
}

// ── Dark Mode ─────────────────────────────────────────────────
function applyDarkMode() {
  const settings = DB.getSettings();
  if (settings.darkMode === false) document.documentElement.setAttribute('data-theme', 'light');
  else document.documentElement.removeAttribute('data-theme');
}

// ── Excel Export ──────────────────────────────────────────────
function exportToExcel(rows, filename, sheetName = 'Sheet1') {
  if (typeof XLSX === 'undefined') { showToast('Excel library not loaded', 'error'); return; }
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename + '.xlsx');
}

// ── Role Guard ────────────────────────────────────────────────
const ROLE_RANK = { owner: 3, manager: 2, staff: 1 };
function hasRole(minRole) {
  const role = DB.getCurrentUserRole();
  return (ROLE_RANK[role] || 0) >= (ROLE_RANK[minRole] || 0);
}
function requireRole(minRole) {
  if (!hasRole(minRole)) {
    showToast('Access denied — insufficient permissions', 'error');
    setTimeout(() => location.href = 'dashboard.html', 1200);
    return false;
  }
  return true;
}

// ── Sidebar ───────────────────────────────────────────────────
const NAV_ITEMS = [
  { href:'dashboard.html',  label:'Dashboard',    page:'dashboard',  icon:`<svg width="16" height="16" fill="none" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.75"/><rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.75"/><rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.75"/><rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.75"/></svg>` },
  { href:'products.html',   label:'Products',     page:'products',   icon:`<svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M20 7l-8-4-8 4m16 0v10l-8 4m-8-4V7m8 4v10M4 7l8 4" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>` },
  { href:'categories.html', label:'Categories',   page:'categories', icon:`<svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>` },
  { href:'suppliers.html',  label:'Suppliers',    page:'suppliers',  icon:`<svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>` },
  { href:'sales.html',      label:'Sales',        page:'sales',      icon:`<svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293A1 1 0 006 17h12M9 21a2 2 0 100-4 2 2 0 000 4zm10 0a2 2 0 100-4 2 2 0 000 4z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>` },
  { href:'alerts.html',     label:'Alerts',       page:'alerts',     icon:`<svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>`, badge: true },
  { href:'reports.html',    label:'Reports',      page:'reports',    icon:`<svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>` },
  { href:'expired.html',    label:'Expired/Waste',page:'expired',    icon:`<svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>` },
  { href:'team.html',       label:'Team',         page:'team',       icon:`<svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>`, ownerOnly: true },
  { href:'settings.html',   label:'Settings',     page:'settings',   icon:`<svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" stroke="currentColor" stroke-width="1.75"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.75"/></svg>` }
];

const ROLE_LABELS = { owner: 'Owner', manager: 'Manager', staff: 'Staff' };
const ROLE_BADGE_CLASS = { owner: 'badge-accent', manager: 'badge-info', staff: 'badge-good' };

function buildSidebar(activePage) {
  const user     = getCurrentUser();
  const alerts   = getAlertCounts();
  const shop     = DB.getCurrentShop();
  const role     = DB.getCurrentUserRole();
  const shopName = shop?.name || 'My Shop';
  const initials = shopName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  const navHTML = NAV_ITEMS
    .filter(item => !item.ownerOnly || role === 'owner')
    .map(item => {
      const isActive  = item.page === activePage;
      const badgeHtml = (item.badge && alerts.total > 0) ? `<span class="nav-badge">${alerts.total}</span>` : '';
      return `<a href="${item.href}" class="nav-item${isActive ? ' active' : ''}" title="${item.label}">
        ${item.icon}<span class="nav-label">${item.label}</span>${badgeHtml}
      </a>`;
    }).join('');

  const shopSwitchHtml = DB.getShops().length > 1
    ? `<a href="shop-select.html" class="shop-switcher-btn sidebar-brand-text" title="Switch Shop"><svg width="14" height="14" fill="none" viewBox="0 0 24 24" style="flex-shrink:0"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><polyline points="9 22 9 12 15 12 15 22" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Switch Shop</a>`
    : '';

  const sidebarHTML = `
    <div class="sidebar-brand">
      <div class="brand-icon"><svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M20 7l-8-4-8 4m16 0v10l-8 4m-8-4V7m8 4v10M4 7l8 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
      <div class="sidebar-brand-text">
        <div class="brand-name">Invento</div>
        <div class="brand-tag">${escapeHtml(shopName)}</div>
      </div>
    </div>
    <nav class="sidebar-nav">
      <div class="nav-section-label">Main Menu</div>
      ${navHTML}
    </nav>
    <div class="sidebar-footer">
      ${shopSwitchHtml}
      <div class="user-card">
        <div class="user-avatar">${initials}</div>
        <div class="user-info sidebar-brand-text">
          <span class="user-name">${escapeHtml(user?.name || 'User')}</span>
          <span class="user-role">${ROLE_LABELS[role] || '—'}</span>
        </div>
        <button class="logout-btn sidebar-brand-text" onclick="logoutUser()" title="Logout">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    </div>`;

  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.innerHTML = sidebarHTML;

  const tAvatar = document.getElementById('topbarAvatar');
  if (tAvatar) tAvatar.textContent = initials;

  const dot = document.getElementById('notifDot');
  if (dot) dot.style.display = alerts.total > 0 ? 'block' : 'none';
  const alertBadge = document.getElementById('alertBadge');
  if (alertBadge) alertBadge.textContent = alerts.total > 0 ? alerts.total : '';

  // ── Mobile toggle ──
  const toggle   = document.getElementById('sidebarToggle');
  const backdrop = document.getElementById('sidebarBackdrop');
  const sb       = document.getElementById('sidebar');
  if (toggle && backdrop && sb) {
    toggle.addEventListener('click', () => { sb.classList.toggle('open'); backdrop.classList.toggle('visible'); });
    backdrop.addEventListener('click', () => { sb.classList.remove('open'); backdrop.classList.remove('visible'); });
  }

  // ── Desktop collapse ──
  const collapseBtn = document.getElementById('sidebarCollapseBtn');
  const mainWrapper = document.querySelector('.main-wrapper');
  const collapsed   = localStorage.getItem('stocksense_sidebar_collapsed') === 'true';
  if (collapsed && sb) { sb.classList.add('collapsed'); if (mainWrapper) mainWrapper.classList.add('sidebar-collapsed'); }
  if (collapseBtn && sb) {
    collapseBtn.addEventListener('click', () => {
      const isCollapsed = sb.classList.toggle('collapsed');
      if (mainWrapper) mainWrapper.classList.toggle('sidebar-collapsed', isCollapsed);
      localStorage.setItem('stocksense_sidebar_collapsed', isCollapsed);
    });
  }

  applyDarkMode();
}

// ── Toast System ──────────────────────────────────────────────
function showToast(message, type = 'success', duration = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) { container = document.createElement('div'); container.id = 'toast-container'; document.body.appendChild(container); }
  const icons = {
    success: `<svg width="15" height="15" fill="none" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><polyline points="22 4 12 14.01 9 11.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    error:   `<svg width="15" height="15" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><line x1="15" y1="9" x2="9" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="9" y1="9" x2="15" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    warning: `<svg width="15" height="15" fill="none" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    info:    `<svg width="15" height="15" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="16" x2="12.01" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`
  };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span class="toast-msg">${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.transition = 'all .3s ease'; toast.style.opacity = '0'; toast.style.transform = 'translateX(40px)'; setTimeout(() => toast.remove(), 300); }, duration);
}

// ── Confirm Dialog ────────────────────────────────────────────
function showConfirm(title, message, onConfirm, confirmLabel = 'Delete') {
  let overlay = document.getElementById('confirm-overlay');
  if (!overlay) {
    overlay = document.createElement('div'); overlay.id = 'confirm-overlay'; overlay.className = 'confirm-overlay';
    overlay.innerHTML = `<div class="confirm-box"><div class="confirm-icon"><svg width="28" height="28" fill="none" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></div><h3 id="confirm-title"></h3><p id="confirm-msg"></p><div class="confirm-actions"><button class="btn btn-secondary" id="confirm-cancel">Cancel</button><button class="btn btn-danger" id="confirm-ok">Delete</button></div></div>`;
    document.body.appendChild(overlay);
  }
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-msg').textContent   = message;
  document.getElementById('confirm-ok').textContent    = confirmLabel;
  overlay.classList.add('active');
  const close = () => overlay.classList.remove('active');
  document.getElementById('confirm-ok').onclick     = () => { close(); onConfirm(); };
  document.getElementById('confirm-cancel').onclick = () => close();
  overlay.onclick = e => { if (e.target === overlay) close(); };
}

// ── Init Page ─────────────────────────────────────────────────
function initPage(pageName) {
  try {
    migrateToMultiShop();
    buildSidebar(pageName);
    // Auto-fire notification check once per browser session
    if (!sessionStorage.getItem('stocksense_notif_checked')) {
      sessionStorage.setItem('stocksense_notif_checked', '1');
      if (!window.APP_CONFIG.isLiteMode) {
        setTimeout(() => NotifEngine.checkAndNotify(), 1500);
      }
      // EmailJS per-product alerts — run silently in background (DISABLED FOR MOBILE PERF)
      // setTimeout(() => EmailJSEngine.run(), 3000);
    }
    // Inject Quick Actions FAB (skip on login/signup/landing/shop-select)
    const noFabPages = ['login', 'signup', 'landing', 'shop-select'];
    if (!noFabPages.includes(pageName)) {
      initQuickFAB(pageName);
    }
  } catch (error) {
    console.error("Initialization Failed:", error);
    showErrorUI("Failed to initialize the page.");
  }
}

// ── Quick Actions FAB ─────────────────────────────────────────
function initQuickFAB(activePage) {
  // Don't duplicate
  if (document.getElementById('quickFab')) return;

  const items = [
    { icon: `<svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M20 7l-8-4-8 4m16 0v10l-8 4m-8-4V7m8 4v10M4 7l8 4" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>`, label: 'Add Product',  href: 'products.html', page: 'products' },
    { icon: `<svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293A1 1 0 006 17h12M9 21a2 2 0 100-4 2 2 0 000 4zm10 0a2 2 0 100-4 2 2 0 000 4z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>`, label: 'Record Sale',  href: 'sales.html',    page: 'sales'    },
    { icon: `<svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>`, label: 'View Alerts',  href: 'alerts.html',   page: 'alerts'   },
    { icon: `<svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>`, label: 'View Reports', href: 'reports.html',  page: 'reports'  },
  ].filter(i => i.page !== activePage);

  const itemsHTML = items.map(i => `
    <a href="${i.href}" class="fab-item" title="${i.label}">
      <span class="fab-item-label">${i.label}</span>
      <span class="fab-item-icon">${i.icon}</span>
    </a>`).join('');

  // Backdrop (click outside to close)
  const backdrop = document.createElement('div');
  backdrop.className = 'fab-backdrop';
  backdrop.id = 'fabBackdrop';
  document.body.appendChild(backdrop);

  // FAB container
  const fab = document.createElement('div');
  fab.className = 'quick-fab';
  fab.id = 'quickFab';
  fab.innerHTML = `
    <button class="fab-main" id="fabMainBtn" title="Quick Actions" aria-label="Quick Actions">
      <span class="fab-main-icon">＋</span>
    </button>
    <div class="fab-menu" id="fabMenu">${itemsHTML}</div>`;
  document.body.appendChild(fab);

  let isOpen = false;
  function openFab()  { isOpen = true;  fab.classList.add('open');    backdrop.classList.add('visible'); }
  function closeFab() { isOpen = false; fab.classList.remove('open'); backdrop.classList.remove('visible'); }
  function toggleFab() { isOpen ? closeFab() : openFab(); }

  document.getElementById('fabMainBtn').addEventListener('click', e => { e.stopPropagation(); toggleFab(); });
  backdrop.addEventListener('click', closeFab);

  // Close on any fab item click
  fab.querySelectorAll('.fab-item').forEach(el => el.addEventListener('click', closeFab));

  // Keyboard: Escape
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen) closeFab(); });
}


// ══════════════════════════════════════════════════════════════
// NOTIFICATION ENGINE  (Google Apps Script + Browser Notifs)
// ══════════════════════════════════════════════════════════════
const NotifEngine = {

  // ── Config helpers ───────────────────────────────────────────
  getConfig() {
    const s = DB.getSettings();
    return s.notifConfig || {};
  },
  saveConfig(cfg) {
    const s = DB.getSettings();
    s.notifConfig = { ...(s.notifConfig || {}), ...cfg };
    DB.saveSettings(s);
  },

  // ── Build the alert summary ───────────────────────────────────
  buildAlertSummary() {
    const products = DB.getProducts();
    const cats     = Object.fromEntries(DB.getCategories().map(c => [c.id, c]));
    const expired = [], exp7 = [], exp30 = [], low = [], out = [];

    products.forEach(p => {
      const es = getExpiryStatus(p.expiryDate);
      const ss = getStockStatus(p.quantity, p.minStockLevel);
      if (es.status === 'expired')  expired.push({ ...p, _es: es, _ss: ss, _cat: cats[p.categoryId] });
      else if (es.status === 'expiring') exp7.push({ ...p, _es: es, _ss: ss, _cat: cats[p.categoryId] });
      else if (es.status === 'warning')  exp30.push({ ...p, _es: es, _ss: ss, _cat: cats[p.categoryId] });
      if (ss.status === 'out') out.push({ ...p, _es: es, _ss: ss, _cat: cats[p.categoryId] });
      else if (ss.status === 'low') low.push({ ...p, _es: es, _ss: ss, _cat: cats[p.categoryId] });
    });

    return { expired, exp7, exp30, low, out, total: expired.length + exp7.length + low.length + out.length };
  },

  // ── Build plain-text body ─────────────────────────────────────
  buildEmailText(summary, shop) {
    const lines = [];
    const ts    = new Date().toLocaleString('en-IN');
    lines.push(`Invento Alert Report — ${shop?.name || 'Your Shop'}`);
    lines.push(`Generated: ${ts}`);
    lines.push('');

    const section = (title, items) => {
      if (!items.length) return;
      lines.push(`== ${title} (${items.length}) ==`);
      items.forEach(p => lines.push(`  • ${p.name}  |  Stock: ${p.quantity}  |  ${p._es.label !== '—' ? p._es.label : p._ss.label}`));
      lines.push('');
    };

    section('🔴 EXPIRED — Needs immediate removal', summary.expired);
    section('🟠 Expiring Within 7 Days', summary.exp7);
    section('🟡 Expiring Within 30 Days', summary.exp30);
    section('📦 Low Stock', summary.low);
    section('⛔ Out of Stock', summary.out);

    if (!summary.total) lines.push('✅ All products are in good shape! No urgent alerts.');
    lines.push('---');
    lines.push('Manage alerts: open Invento → Alerts page');
    return lines.join('\n');
  },

  // ── Build HTML body ───────────────────────────────────────────
  buildEmailHtml(summary, shop) {
    const ts    = new Date().toLocaleString('en-IN');
    const shopName = escapeHtml(shop?.name || 'Your Shop');

    const row = (p, lvl) => {
      const colors = { danger: '#EF4444', warning: '#F59E0B', low: '#3B82F6', out: '#8B5CF6' };
      const c = colors[lvl] || '#6B7280';
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #2D3748;font-size:14px;">${escapeHtml(p.name)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #2D3748;font-size:13px;color:#9CA3AF;">${escapeHtml(p._cat?.name || 'Unknown')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #2D3748;font-size:13px;">${p.quantity}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #2D3748;"><span style="background:${c}22;color:${c};padding:2px 8px;border-radius:20px;font-size:12px;font-weight:600;">${escapeHtml(p._es.label !== '—' ? p._es.label : p._ss.label)}</span></td>
      </tr>`;
    };

    const section = (icon, title, items, lvl) => {
      if (!items.length) return '';
      return `
        <div style="background:#1E293B;border-radius:12px;padding:20px;margin-bottom:16px;border:1px solid #334155;">
          <h3 style="margin:0 0 12px;font-size:15px;color:#F1F5F9;">${icon} ${escapeHtml(title)} <span style="font-size:13px;background:#334155;padding:2px 10px;border-radius:20px;margin-left:6px;">${items.length}</span></h3>
          <table style="width:100%;border-collapse:collapse;">
            <thead><tr>
              <th style="text-align:left;padding:6px 12px;font-size:12px;color:#64748B;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Product</th>
              <th style="text-align:left;padding:6px 12px;font-size:12px;color:#64748B;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Category</th>
              <th style="text-align:left;padding:6px 12px;font-size:12px;color:#64748B;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Qty</th>
              <th style="text-align:left;padding:6px 12px;font-size:12px;color:#64748B;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Status</th>
            </tr></thead>
            <tbody>${items.map(p => row(p, lvl)).join('')}</tbody>
          </table>
        </div>`;
    };

    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#0F172A;font-family:'Inter',system-ui,sans-serif;">
<div style="max-width:640px;margin:0 auto;padding:32px 16px;">
  <div style="text-align:center;margin-bottom:28px;">
    <div style="display:inline-block;background:linear-gradient(135deg,#6366F1,#8B5CF6);padding:12px 24px;border-radius:12px;margin-bottom:12px;">
      <span style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.5px;">📦 Invento</span>
    </div>
    <h1 style="margin:0;font-size:20px;font-weight:700;color:#F1F5F9;">Inventory Alert Report</h1>
    <p style="color:#64748B;font-size:13px;margin:4px 0 0;">${shopName} · ${escapeHtml(ts)}</p>
  </div>

  ${summary.total === 0 ? `
    <div style="background:#14532D22;border:1px solid #16A34A44;border-radius:12px;padding:24px;text-align:center;">
      <div style="font-size:32px;margin-bottom:8px;">✅</div>
      <h3 style="color:#4ADE80;margin:0 0 6px;">All Clear!</h3>
      <p style="color:#64748B;margin:0;font-size:14px;">All your products are in good condition. No urgent alerts.</p>
    </div>` : `
    ${section('🔴', 'Expired — Remove Immediately', summary.expired, 'danger')}
    ${section('🟠', 'Expiring Within 7 Days', summary.exp7, 'danger')}
    ${section('🟡', 'Expiring Within 30 Days', summary.exp30, 'warning')}
    ${section('📦', 'Low Stock', summary.low, 'low')}
    ${section('⛔', 'Out of Stock', summary.out, 'out')}
  `}

  <div style="text-align:center;margin-top:24px;padding:16px;border-top:1px solid #1E293B;">
    <p style="color:#475569;font-size:12px;margin:0;">You are receiving this because email alerts are enabled in Invento Settings.</p>
    <p style="color:#475569;font-size:12px;margin:4px 0 0;">Open Invento → Settings → Email Alerts to manage preferences.</p>
  </div>
</div>
</body></html>`;
  },

  // ── Send via GAS ──────────────────────────────────────────
  async sendViaGAS(to, subject, textBody, htmlBody) {
    const cfg = this.getConfig();
    if (!cfg.gasUrl) {
      return { ok: false, error: 'Web App URL not configured. Go to Settings → Email Alerts.' };
    }

    try {
      const response = await fetch(cfg.gasUrl, {
        method: 'POST',
        body: JSON.stringify({
            to: to,
            toName: DB.getCurrentShop()?.name || 'Shop Owner',
            subject: subject,
            message: textBody,
            htmlBody: htmlBody,
            fromName: DB.getCurrentShop()?.name || 'Invento',
            replyTo: to
        })
      });

      const result = await response.json();
      if (result.success) {
        return { ok: true, status: 200 };
      } else {
        throw new Error(result.error || 'Unknown server error');
      }
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  },

  // ── Send browser notification ─────────────────────────────────
  sendBrowserNotif(title, body, tag = 'stocksense-alert') {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      new Notification(title, {
        body,
        tag,
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📦</text></svg>'
      });
    } catch (_) { /* ignore */ }
  },

  // ── Main: check products and send notifications if due ────────
  async checkAndNotify(force = false) {
    const cfg  = this.getConfig();
    const shop = DB.getCurrentShop();
    if (!shop) return;

    // Throttle: only once per day unless forced
    const today     = todayStr();
    const lastCheck = cfg.lastNotifiedDate;
    if (!force && lastCheck === today) return;

    const summary = this.buildAlertSummary();
    const enabled = {
      expired:  cfg.alertExpired  !== false,
      exp7:     cfg.alertExp7     !== false,
      exp30:    cfg.alertExp30    !== false,
      low:      cfg.alertLow      !== false,
      out:      cfg.alertOut      !== false,
    };

    const filtered = {
      expired: enabled.expired ? summary.expired : [],
      exp7:    enabled.exp7    ? summary.exp7    : [],
      exp30:   enabled.exp30   ? summary.exp30   : [],
      low:     enabled.low     ? summary.low     : [],
      out:     enabled.out     ? summary.out     : [],
    };
    filtered.total = filtered.expired.length + filtered.exp7.length + filtered.low.length + filtered.out.length;

    // Browser notification
    if (filtered.total > 0) {
      const parts = [];
      if (filtered.expired.length) parts.push(`${filtered.expired.length} expired`);
      if (filtered.exp7.length)    parts.push(`${filtered.exp7.length} expiring soon`);
      if (filtered.low.length)     parts.push(`${filtered.low.length} low stock`);
      if (filtered.out.length)     parts.push(`${filtered.out.length} out of stock`);
      this.sendBrowserNotif(`⚠️ Invento Alert — ${shop.name}`, parts.join(', ') + '. Open Alerts page for details.');
    }

    // Email notification
    const toEmail = cfg.notifEmail || getCurrentUser()?.email;
    if (toEmail && cfg.emailEnabled && (cfg.gasUrl || force)) {
      const subject  = `[Invento] ${filtered.total} Inventory Alert${filtered.total !== 1 ? 's' : ''} — ${shop.name}`;
      const textBody = this.buildEmailText(filtered, shop);
      const htmlBody = this.buildEmailHtml(filtered, shop);
      const result   = await this.sendViaGAS(toEmail, subject, textBody, htmlBody);
      this.saveConfig({ lastNotifiedDate: today, lastEmailResult: result.ok ? 'sent' : result.error });
      return result;
    }

    this.saveConfig({ lastNotifiedDate: today });
  }
};

// ══════════════════════════════════════════════════════════════
// EMAILJS ENGINE  — Per-Product Real-Time Expiry Alerts
// Deduplication: tracks {productId}_{status} in localStorage.
// Re-sends when status escalates (e.g. warning → urgent).
// Never sends for SAFE products.
// ══════════════════════════════════════════════════════════════
const EmailJSEngine = {

  // ── Status rank (higher = more urgent) ───────────────────────
  _rank: { safe: 0, warning: 1, urgent: 2, expired: 3 },

  // ── Sent-state key (per user + shop) ─────────────────────────
  _stateKey() {
    return getShopKey('ejs_alert_state');
  },

  // ── Load sent-state map from localStorage ────────────────────
  _loadState() {
    try { return JSON.parse(localStorage.getItem(this._stateKey())) || {}; } catch { return {}; }
  },

  // ── Persist sent-state map ───────────────────────────────────
  _saveState(state) {
    localStorage.setItem(this._stateKey(), JSON.stringify(state));
  },

  // ── Config helpers ───────────────────────────────────────────
  // Defaults are pre-seeded so fields auto-populate on first use.
  // Any saved value in localStorage takes precedence over defaults.
  getConfig() {
    const s        = DB.getSettings();
    const saved    = s.ejsConfig || {};
    const defaults = {
      ejsServiceId:  'service_ydqwptg',
      ejsTemplateAlert: 'template_73kfz4a',
      ejsTemplateSummary: 'template_zezouqc',
      ejsPublicKey:  'erxLyJs0D_TClA-j2',
    };
    return { ...defaults, ...saved };
  },

  saveConfig(patch) {
    const s = DB.getSettings();
    s.ejsConfig = { ...(s.ejsConfig || {}), ...patch };
    DB.saveSettings(s);
  },

  // ── Map getExpiryStatus → canonical alert level ──────────────
  _toLevel(esStatus) {
    if (esStatus === 'expired')  return 'expired';
    if (esStatus === 'expiring') return 'urgent';   // ≤ 7 days
    if (esStatus === 'warning')  return 'warning';  // ≤ 30 days
    return 'safe';
  },

  // ── Human status label ───────────────────────────────────────
  _statusLabel(level) {
    return { expired: '🔴 EXPIRED', urgent: '🟠 URGENT', warning: '🟡 WARNING', safe: '✅ SAFE' }[level] || level;
  },

  // ── Build alert message ──────────────────────────────────────
  _buildMessage(product, level, daysLeft) {
    if (level === 'expired')
      return `${product.name} has expired. Remove immediately or mark as waste.`;
    if (level === 'urgent')
      return `${product.name} expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}. Apply a discount now to clear stock.`;
    if (level === 'warning')
      return `${product.name} expires in ${daysLeft} days. Monitor stock closely.`;
    return '';
  },

  // ── Should we email this product right now? ──────────────────
  // Returns true if: (a) level is urgent/expired, (b) not already
  // sent for this level, (c) status escalated since last send.
  _shouldSend(productId, level, state, cfg) {
    if (level === 'safe') return false;
    if (level === 'warning' && !cfg.ejsSendWarning) return false;

    const prev = state[productId]; // { level, sentAt }
    if (!prev) return true;                          // first time
    if (prev.level === level) return false;          // same status, already sent
    return this._rank[level] > this._rank[prev.level]; // escalated → resend
  },

  // ── Load EmailJS SDK lazily from CDN ─────────────────────────
  async _ensureSDK() {
    if (window.emailjs) return true;
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
      script.onload  = () => resolve(true);
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
  },

  // ── Send a single product alert via EmailJS ──────────────────
  async _sendOne(product, level, daysLeft, cfg) {
    const loaded = await this._ensureSDK();
    if (!loaded) return { ok: false, error: 'EmailJS SDK failed to load' };

    try {
      emailjs.init({ publicKey: cfg.ejsPublicKey });
      const shop    = DB.getCurrentShop();
      const toEmail = cfg.ejsToEmail || getCurrentUser()?.email;
      if (!toEmail) return { ok: false, error: 'No recipient email configured' };

      const params = {
        to_email:     toEmail,
        to_name:      shop?.name || 'Shop Owner',
        shop_name:    shop?.name || 'Your Shop',
        product_name: product.name,
        days_left:    level === 'expired' ? 'EXPIRED' : String(daysLeft),
        status_label: this._statusLabel(level),
        alert_message: this._buildMessage(product, level, daysLeft),
        quantity:     String(product.quantity || 0),
        category:     product._catName || '—',
        sent_at:      new Date().toLocaleString('en-IN'),
        action_link:  (typeof location !== 'undefined') ? location.origin + '/alerts.html' : 'Invento → Alerts',
      };

      const result = await emailjs.send(cfg.ejsServiceId, cfg.ejsTemplateAlert, params);
      return { ok: result.status === 200, status: result.status };
    } catch (err) {
      return { ok: false, error: err?.text || err?.message || String(err) };
    }
  },

  // ── Core: scan all products, queue & send alerts ─────────────
  async run(opts = {}) {
    const cfg   = this.getConfig();
    const force = opts.force === true;

    // Guard: must be configured and enabled
    if (!cfg.ejsEnabled)    return { skipped: 'EmailJS disabled' };
    if (!cfg.ejsServiceId)  return { skipped: 'No Service ID' };
    if (!cfg.ejsTemplateAlert) return { skipped: 'No Alert Template ID' };
    if (!cfg.ejsPublicKey)  return { skipped: 'No Public Key' };

    const products = DB.getProducts();
    const cats     = Object.fromEntries(DB.getCategories().map(c => [c.id, c]));
    const state    = this._loadState();
    const queue    = [];    // products that need an email
    const today    = todayStr();

    for (const p of products) {
      const es    = getExpiryStatus(p.expiryDate);
      const level = this._toLevel(es.status);

      if (!this._shouldSend(p.id, level, state, cfg)) continue;

      queue.push({
        product:  { ...p, _catName: cats[p.categoryId]?.name || '—' },
        level,
        daysLeft: Math.max(0, es.daysLeft ?? 0),
      });
    }

    if (!queue.length) return { sent: 0, skipped: 'No new alerts to send' };

    // Throttle: send max N emails in one run to avoid spam
    const MAX_PER_RUN = opts.max || 5;
    const batch = queue.slice(0, MAX_PER_RUN);

    let sent = 0, failed = 0;
    const results = [];

    for (const item of batch) {
      const res = await this._sendOne(item.product, item.level, item.daysLeft, cfg);
      if (res.ok) {
        state[item.product.id] = { level: item.level, sentAt: today };
        sent++;
      } else {
        failed++;
      }
      results.push({ productId: item.product.id, name: item.product.name, level: item.level, ...res });
      // Small delay between sends to avoid rate-limiting
      if (batch.length > 1) await new Promise(r => setTimeout(r, 350));
    }

    this._saveState(state);
    this.saveConfig({ ejsLastRunDate: today, ejsLastRunSent: sent, ejsLastRunFailed: failed });
    return { sent, failed, results };
  },

  // ── Convenience: run after product add/edit/delete ───────────
  async runAfterProductChange() {
    const cfg = this.getConfig();
    if (!cfg.ejsEnabled) return;
    // Small delay so DB write finishes first
    setTimeout(() => this.run({ max: 3 }), 500);
  },

  // ── Convenience: run after sale recorded ─────────────────────
  async runAfterSale() {
    const cfg = this.getConfig();
    if (!cfg.ejsEnabled) return;
    setTimeout(() => this.run({ max: 3 }), 400);
  },

  // ── Send a test email ─────────────────────────────────────────
  async sendTest(cfg) {
    const loaded = await this._ensureSDK();
    if (!loaded) return { ok: false, error: 'EmailJS SDK failed to load from CDN' };

    try {
      emailjs.init({ publicKey: cfg.ejsPublicKey });
      const shop = DB.getCurrentShop();
      const params = {
        to_email:      cfg.ejsToEmail || getCurrentUser()?.email || '',
        to_name:       shop?.name || 'Shop Owner',
        shop_name:     shop?.name || 'Your Shop',
        product_name:  'Sample Milk (Test Product)',
        days_left:     '3',
        status_label:  '🟠 URGENT',
        alert_message: 'Sample Milk expires in 3 days. Apply a discount now to clear stock.',
        quantity:       '24',
        category:       'Dairy',
        sent_at:        new Date().toLocaleString('en-IN'),
        action_link:    (typeof location !== 'undefined') ? location.origin + '/alerts.html' : 'Invento → Alerts',
      };
      const result = await emailjs.send(cfg.ejsServiceId, cfg.ejsTemplateAlert, params);
      return { ok: result.status === 200, status: result.status };
    } catch (err) {
      return { ok: false, error: err?.text || err?.message || String(err) };
    }
  },

  // ── Send Full Inventory Summary Email ────────────────────────
  async sendInventorySummary() {
    const cfg = this.getConfig();
    const loaded = await this._ensureSDK();
    if (!loaded) return { ok: false, error: 'EmailJS SDK failed to load' };

    try {
      emailjs.init({ publicKey: cfg.ejsPublicKey });
      const shop = DB.getCurrentShop();
      const products = DB.getProducts();

      let totalQty = 0;
      let totalValue = 0;
      let expiredCount = 0;
      let expSoonCount = 0;
      let warningCount = 0;
      let lowStockCount = 0;
      let outOfStockCount = 0;

      let tableRows = '';

      products.forEach(p => {
        const qty = Number(p.quantity || 0);
        const minStock = Number(p.minStockLevel || 0);
        totalQty += qty;
        totalValue += qty * Number(p.costPrice || p.sellingPrice || 0);

        const es = getExpiryStatus(p.expiryDate);
        if (es.status === 'expired') expiredCount++;
        else if (es.status === 'expiring') expSoonCount++;
        else if (es.status === 'warning') warningCount++;

        if (qty === 0) outOfStockCount++;
        else if (qty <= minStock && minStock > 0) lowStockCount++;

        // Status logic for table as requested
        let rowStatus = 'In Stock';
        let rowStatusColor = '#22c55e'; // green

        if (es.status === 'expired') {
          rowStatus = 'Expired';
          rowStatusColor = '#ef4444'; // red
        } else if (qty <= minStock && minStock > 0 || qty === 0) {
          rowStatus = 'Low Stock';
          rowStatusColor = '#f59e0b'; // orange
        }

        tableRows += `
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 10px; font-family: sans-serif; font-size: 14px; color: #111827;">${escapeHtml(p.name)}</td>
            <td style="padding: 10px; font-family: sans-serif; font-size: 14px; color: #4b5563; text-align: center;">${qty}</td>
            <td style="padding: 10px; font-family: sans-serif; font-size: 14px; font-weight: 600; color: ${rowStatusColor}; text-align: center;">${rowStatus}</td>
          </tr>
        `;
      });

      const currency = shop?.currency || '₹';
      const attentionCount = expiredCount + expSoonCount + lowStockCount + outOfStockCount;
      const headerMsg = attentionCount > 0 
        ? `⚠️ ${attentionCount} products require attention` 
        : `✅ All products are in good condition`;

      const htmlTable = `
        <div style="margin-top: 20px;">
          <h3 style="font-family: sans-serif; color: #111827; margin-bottom: 15px;">Product Details</h3>
          <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; background: #fff;">
            <thead>
              <tr style="background: #f9fafb; border-bottom: 2px solid #e5e7eb;">
                <th style="padding: 12px 10px; text-align: left; font-family: sans-serif; font-size: 12px; text-transform: uppercase; color: #6b7280;">Name</th>
                <th style="padding: 12px 10px; text-align: center; font-family: sans-serif; font-size: 12px; text-transform: uppercase; color: #6b7280;">Qty</th>
                <th style="padding: 12px 10px; text-align: center; font-family: sans-serif; font-size: 12px; text-transform: uppercase; color: #6b7280;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows || '<tr><td colspan="3" style="padding: 15px; text-align: center; color: #6b7280; font-family: sans-serif;">No products found</td></tr>'}
            </tbody>
          </table>
        </div>
      `;

      const params = {
        to_email: cfg.ejsToEmail || getCurrentUser()?.email || '',
        to_name: shop?.name || 'Shop Owner',
        shop_name: shop?.name || 'Your Shop',
        total_products: products.length,
        total_quantity: totalQty,
        total_value: `${currency}${totalValue.toLocaleString('en-IN')}`,
        expired_count: expiredCount,
        expiring_soon_count: expSoonCount,
        low_stock_count: lowStockCount,
        out_of_stock_count: outOfStockCount,
        warning_count: warningCount,
        product_table: htmlTable,
        summary_header: headerMsg,
        sent_at: new Date().toLocaleString('en-IN'),
        action_link: (typeof location !== 'undefined') ? location.origin + '/dashboard.html' : 'Invento Dashboard',
      };

      const result = await emailjs.send(cfg.ejsServiceId, cfg.ejsTemplateSummary, params);
      return { ok: result.status === 200, status: result.status };
    } catch (err) {
      return { ok: false, error: err?.text || err?.message || String(err) };
    }
  },

  // ── Clear all sent-state (reset deduplication) ───────────────
  clearState() {
    localStorage.removeItem(this._stateKey());
  },
};
