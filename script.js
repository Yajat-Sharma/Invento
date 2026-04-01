// ===== FreshAlert — script.js =====
// localStorage CRUD, modal, form validation, items list, filters, dashboard

// =====================
// 1. LOCALSTORAGE HELPERS  (per-user data isolation)
// =====================

/**
 * Returns the localStorage key for the current user's items.
 * Falls back to a guest key if somehow no user is in session.
 */
function getStorageKey() {
    const user = getCurrentUser();
    return user ? ('items_user_' + user.id) : 'items_user_guest';
}

function getItems() {
    try {
        return JSON.parse(localStorage.getItem(getStorageKey())) || [];
    } catch {
        return [];
    }
}

function saveItems(items) {
    localStorage.setItem(getStorageKey(), JSON.stringify(items));
}

function addItem(item) {
    const items = getItems();
    items.unshift(item); // newest first
    saveItems(items);
    rebuildAnalytics();  // keep aggregated analytics up to date
}

function deleteItem(id) {
    const items = getItems().filter(item => item.id !== id);
    saveItems(items);
    rebuildAnalytics();
}

function updateItem(id, updatedFields) {
    const items = getItems();
    const index = items.findIndex(item => item.id === id);
    if (index !== -1) {
        items[index] = { ...items[index], ...updatedFields };
        saveItems(items);
        rebuildAnalytics();
    }
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// =====================
// 2. CATEGORY CONFIG
// =====================
const CATEGORIES = {
    medicine: { icon: '💊', label: 'Medicine', badge: 'badge-medicine', color: '#8B5CF6' },
    dairy: { icon: '🥛', label: 'Dairy', badge: 'badge-dairy', color: '#2563EB' },
    vegetables: { icon: '🥬', label: 'Vegetables', badge: 'badge-vegetables', color: '#059669' },
    fruits: { icon: '🍎', label: 'Fruits', badge: 'badge-fruits', color: '#DC2626' },
    snacks: { icon: '🍪', label: 'Snacks', badge: 'badge-snacks', color: '#D97706' },
    vitamins: { icon: '💊', label: 'Vitamins', badge: 'badge-vitamins', color: '#0D9488' },
    other: { icon: '📦', label: 'Other', badge: 'badge-other', color: '#6B7280' }
};

function getCategoryInfo(category) {
    return CATEGORIES[category] || { icon: '📦', label: category, badge: 'badge-other', color: '#6B7280' };
}

// Pill selection handler
function selectCategoryPill(value) {
    document.querySelectorAll('.category-pill').forEach(p => p.classList.remove('selected'));
    const target = document.querySelector(`.category-pill[data-category="${value}"]`);
    if (target) target.classList.add('selected');
    document.getElementById('itemCategory').value = value;
    document.getElementById('categoryPills')?.classList.remove('error');
    clearFieldError('itemCategory');
}

document.getElementById('categoryPills')?.addEventListener('click', (e) => {
    const pill = e.target.closest('.category-pill');
    if (!pill) return;
    selectCategoryPill(pill.dataset.category);
});

// =====================
// 2. EXPIRY HELPERS
// =====================
function getExpiryInfo(expiryDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDate);
    expiry.setHours(0, 0, 0, 0);
    const diffMs = expiry - today;
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
        return { status: 'expired', label: `Expired ${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? 's' : ''} ago`, class: 'status-expired' };
    } else if (diffDays === 0) {
        return { status: 'expiring', label: 'Expires today!', class: 'status-expiring' };
    } else if (diffDays <= 7) {
        return { status: 'expiring', label: `Expires in ${diffDays} day${diffDays !== 1 ? 's' : ''}`, class: 'status-expiring' };
    } else {
        return { status: 'fresh', label: `Expires in ${diffDays} days`, class: 'status-fresh' };
    }
}

function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// =====================
// 3. TOAST NOTIFICATION
// =====================
function showToast(message, type = 'success') {
    // Remove existing toasts
    document.querySelectorAll('.toast').forEach(t => t.remove());

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

// =====================
// 4. MOBILE MENU
// =====================
const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
const navMenu = document.querySelector('.nav-menu');

if (mobileMenuToggle) {
    mobileMenuToggle.addEventListener('click', () => {
        mobileMenuToggle.classList.toggle('active');
        navMenu.classList.toggle('active');
    });
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.navbar-container')) {
        mobileMenuToggle?.classList.remove('active');
        navMenu?.classList.remove('active');
    }
});

// =====================
// 5. NAV HIGHLIGHTING
// =====================
const navLinks = document.querySelectorAll('.nav-link');
const currentPath = window.location.hash || '#dashboard';
navLinks.forEach(link => {
    link.classList.toggle('active', link.getAttribute('href') === currentPath);
});

window.addEventListener('hashchange', () => {
    const newPath = window.location.hash;
    navLinks.forEach(link => {
        link.classList.toggle('active', link.getAttribute('href') === newPath);
    });
});

// Close mobile menu on nav link click
navLinks.forEach(link => {
    link.addEventListener('click', () => {
        mobileMenuToggle?.classList.remove('active');
        navMenu?.classList.remove('active');
    });
});

// =====================
// 6. MODAL HANDLERS
// =====================
const modal = document.getElementById('addItemModal');
const openModalBtn = document.getElementById('openAddItemModal');
const closeModalBtn = document.getElementById('closeModal');
const cancelModalBtn = document.getElementById('cancelModal');
const addItemForm = document.getElementById('addItemForm');
const modalTitle = document.querySelector('.modal-title');
const submitBtnText = document.querySelector('.btn-submit');

let editingItemId = null; // null = add mode, string = edit mode

function openModal(editItem = null) {
    if (editItem) {
        // Edit mode — pre-fill the form
        editingItemId = editItem.id;
        modalTitle.textContent = 'Edit Item';
        submitBtnText.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Save Changes`;
        document.getElementById('itemName').value = editItem.name;
        selectCategoryPill(editItem.category);
        document.getElementById('itemQuantity').value = editItem.quantity;
        document.getElementById('itemExpiry').value = editItem.expiryDate;
        document.getElementById('itemNotes').value = editItem.notes || '';
    } else {
        // Add mode
        editingItemId = null;
        modalTitle.textContent = 'Add New Item';
        submitBtnText.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg> Add Item`;
    }
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    document.getElementById('itemName').focus();
}

function closeModal() {
    modal.classList.remove('active');
    document.body.style.overflow = '';
    editingItemId = null;
    resetForm();
}

openModalBtn?.addEventListener('click', openModal);
const navAddItemBtn = document.getElementById('navAddItemBtn');
navAddItemBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    openModal();
});
closeModalBtn?.addEventListener('click', closeModal);
cancelModalBtn?.addEventListener('click', closeModal);

// Close on overlay click
modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
});

// Close on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) {
        closeModal();
    }
});

// =====================
// 6.5 SETTINGS MODAL HANDLERS
// =====================
const settingsModal = document.getElementById('settingsModal');
const openSettingsBtn = document.getElementById('openSettingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsModal');
const cancelSettingsBtn = document.getElementById('cancelSettingsModal');
const settingsForm = document.getElementById('settingsForm');
const userEmailInput = document.getElementById('userEmail');

function openSettings() {
    // Load existing email if any
    const savedEmail = localStorage.getItem('freshalert_user_email');
    if (savedEmail) {
        userEmailInput.value = savedEmail;
    }
    settingsModal.classList.add('active');
    document.body.style.overflow = 'hidden';
    userEmailInput.focus();
}

function closeSettings() {
    settingsModal.classList.remove('active');
    document.body.style.overflow = '';
}

openSettingsBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    openSettings();
});
closeSettingsBtn?.addEventListener('click', closeSettings);
cancelSettingsBtn?.addEventListener('click', closeSettings);

settingsModal?.addEventListener('click', (e) => {
    if (e.target === settingsModal) closeSettings();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && settingsModal?.classList.contains('active')) {
        closeSettings();
    }
});

settingsForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = userEmailInput.value.trim();
    if (email) {
        localStorage.setItem('freshalert_user_email', email);
        showToast('⚙️ Email settings saved!', 'success');
    } else {
        localStorage.removeItem('freshalert_user_email');
        showToast('⚙️ Email removed. Reminders disabled.', 'success');
    }
    closeSettings();
});

// =====================
// 7. FORM VALIDATION & SUBMIT
// =====================
const fields = {
    itemName: { errorId: 'itemNameError', message: 'Item name is required' },
    itemCategory: { errorId: 'itemCategoryError', message: 'Please select a category' },
    itemQuantity: { errorId: 'itemQuantityError', message: 'Enter a valid quantity' },
    itemExpiry: { errorId: 'itemExpiryError', message: 'Expiry date is required' }
};

function validateForm() {
    let isValid = true;

    // Item Name
    const name = document.getElementById('itemName');
    if (!name.value.trim()) {
        showFieldError('itemName', fields.itemName.message);
        isValid = false;
    } else {
        clearFieldError('itemName');
    }

    // Category (hidden input set by pills)
    const category = document.getElementById('itemCategory');
    if (!category.value) {
        showFieldError('itemCategory', fields.itemCategory.message);
        document.getElementById('categoryPills').classList.add('error');
        isValid = false;
    } else {
        clearFieldError('itemCategory');
        document.getElementById('categoryPills').classList.remove('error');
    }

    // Quantity
    const quantity = document.getElementById('itemQuantity');
    if (!quantity.value || parseInt(quantity.value) < 1) {
        showFieldError('itemQuantity', fields.itemQuantity.message);
        isValid = false;
    } else {
        clearFieldError('itemQuantity');
    }

    // Expiry Date
    const expiry = document.getElementById('itemExpiry');
    if (!expiry.value) {
        showFieldError('itemExpiry', fields.itemExpiry.message);
        isValid = false;
    } else {
        clearFieldError('itemExpiry');
    }

    return isValid;
}

function showFieldError(fieldId, message) {
    const input = document.getElementById(fieldId);
    const error = document.getElementById(fields[fieldId].errorId);
    input.classList.add('error');
    error.textContent = message;
}

function clearFieldError(fieldId) {
    const input = document.getElementById(fieldId);
    const error = document.getElementById(fields[fieldId].errorId);
    input.classList.remove('error');
    error.textContent = '';
}

// Clear error on input
Object.keys(fields).forEach(fieldId => {
    const el = document.getElementById(fieldId);
    if (el) {
        el.addEventListener('input', () => clearFieldError(fieldId));
        el.addEventListener('change', () => clearFieldError(fieldId));
    }
});

function resetForm() {
    addItemForm.reset();
    document.getElementById('itemCategory').value = '';
    document.querySelectorAll('.category-pill').forEach(p => p.classList.remove('selected'));
    document.getElementById('categoryPills').classList.remove('error');
    Object.keys(fields).forEach(clearFieldError);
}

// Form submit
addItemForm?.addEventListener('submit', (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    const name = document.getElementById('itemName').value.trim();
    const category = document.getElementById('itemCategory').value;
    const quantity = parseInt(document.getElementById('itemQuantity').value);
    const expiryDate = document.getElementById('itemExpiry').value;
    const notes = document.getElementById('itemNotes').value.trim();

    if (editingItemId) {
        // Update existing item
        updateItem(editingItemId, { name, category, quantity, expiryDate, notes });
        closeModal();
        renderItems();
        updateDashboardCards();
        renderCalendar();
        showToast(`✏️ "${name}" updated successfully!`);
    } else {
        // Add new item
        const item = {
            id: generateId(),
            name, category, quantity, expiryDate, notes,
            createdAt: new Date().toISOString()
        };
        addItem(item);
        closeModal();
        renderItems();
        updateDashboardCards();
        renderCalendar();
        showToast(`✅ "${name}" added successfully!`);
    }
});

// =====================
// 8. ITEMS LIST RENDERING
// =====================
let currentFilter = 'all';
let searchQuery = '';

function renderItems() {
    const itemsList = document.getElementById('itemsList');
    const emptyState = document.getElementById('emptyState');
    const itemsCount = document.getElementById('itemsCount');
    let items = getItems();

    // Apply search
    let filtered = items;
    if (searchQuery) {
        filtered = filtered.filter(i =>
            i.name.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }

    // Apply category/status filter
    filtered = filterItems(filtered, currentFilter);

    itemsCount.textContent = `${items.length} item${items.length !== 1 ? 's' : ''}`;

    if (items.length === 0) {
        itemsList.innerHTML = '';
        emptyState.classList.add('visible');
        return;
    }

    emptyState.classList.remove('visible');

    if (filtered.length === 0) {
        itemsList.innerHTML = `<div class="empty-state visible" style="grid-column:1/-1;padding:2rem"><div class="empty-icon">🔍</div><h3>No matching items</h3><p>Try a different filter</p></div>`;
        return;
    }

    itemsList.innerHTML = filtered.map((item, i) => {
        const expiry = getExpiryInfo(item.expiryDate);
        const cat = getCategoryInfo(item.category);

        return `
        <div class="item-card" style="animation-delay: ${i * 0.06}s">
            <div class="item-card-header">
                <span class="item-card-name">${escapeHtml(item.name)}</span>
                <div class="item-card-actions">
                    <button class="item-edit-btn" data-id="${item.id}" title="Edit item" aria-label="Edit ${escapeHtml(item.name)}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>
                    <button class="item-delete-btn" data-id="${item.id}" title="Delete item" aria-label="Delete ${escapeHtml(item.name)}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>
                </div>
            </div>
            <div class="item-card-meta">
                <div class="item-meta-row">
                    <span class="category-badge ${cat.badge}">${cat.icon} ${cat.label}</span>
                    <span class="expiry-status ${expiry.class}">${expiry.label}</span>
                </div>
                <div class="item-meta-row">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" stroke-width="2"/><path d="M3 9h18" stroke="currentColor" stroke-width="2"/></svg>
                    <span>Qty: ${item.quantity}</span>
                    <span>·</span>
                    <span>Exp: ${formatDate(item.expiryDate)}</span>
                </div>
            </div>
            ${item.notes ? `<div class="item-notes">📝 ${escapeHtml(item.notes)}</div>` : ''}
        </div>`;
    }).join('');

    // Attach edit handlers
    itemsList.querySelectorAll('.item-edit-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const item = getItems().find(i => i.id === id);
            if (item) openModal(item);
        });
    });

    // Attach delete handlers (with confirmation)
    itemsList.querySelectorAll('.item-delete-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const item = getItems().find(i => i.id === id);
            if (item) showDeleteConfirm(item);
        });
    });
}

function filterItems(items, filter) {
    if (filter === 'expiring') {
        return items.filter(i => {
            const info = getExpiryInfo(i.expiryDate);
            return info.status === 'expiring' || info.status === 'expired';
        });
    }
    if (filter !== 'all' && CATEGORIES[filter]) {
        return items.filter(i => i.category === filter);
    }
    return items;
}

// Filter buttons
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        renderItems();
    });
});

// Search input handler
const searchInput = document.getElementById('searchInput');
const searchClear = document.getElementById('searchClear');

searchInput?.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim();
    searchClear.style.display = searchQuery ? 'flex' : 'none';
    renderItems();
});

searchClear?.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    searchClear.style.display = 'none';
    searchInput.focus();
    renderItems();
});

// =====================
// 9. DELETE CONFIRMATION
// =====================
const confirmDialog = document.getElementById('confirmDialog');
const confirmItemName = document.getElementById('confirmItemName');
const confirmDeleteBtn = document.getElementById('confirmDelete');
const confirmCancelBtn = document.getElementById('confirmCancel');
let pendingDeleteId = null;

function showDeleteConfirm(item) {
    pendingDeleteId = item.id;
    confirmItemName.textContent = `"${item.name}"`;
    confirmDialog.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function hideDeleteConfirm() {
    confirmDialog.classList.remove('active');
    document.body.style.overflow = '';
    pendingDeleteId = null;
}

confirmDeleteBtn?.addEventListener('click', () => {
    if (pendingDeleteId) {
        const item = getItems().find(i => i.id === pendingDeleteId);
        deleteItem(pendingDeleteId);
        hideDeleteConfirm();
        renderItems();
        updateDashboardCards();
        renderCalendar();
        showToast(`🗑️ "${item?.name || 'Item'}" deleted`, 'error');
    }
});

confirmCancelBtn?.addEventListener('click', hideDeleteConfirm);

// Close confirm dialog on overlay click
confirmDialog?.addEventListener('click', (e) => {
    if (e.target === confirmDialog) hideDeleteConfirm();
});

// Close confirm on Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && confirmDialog?.classList.contains('active')) {
        hideDeleteConfirm();
    }
});

// =====================
// 10. DASHBOARD CARDS + ANALYTICS
// =====================
let categoryChart = null;
let expiryChart = null;

function updateDashboardCards() {
    const items = getItems();
    const totalItems = items.length;

    let freshCount = 0, expiringCount = 0, expiredCount = 0;
    items.forEach(i => {
        const info = getExpiryInfo(i.expiryDate);
        if (info.status === 'fresh') freshCount++;
        else if (info.status === 'expiring') expiringCount++;
        else expiredCount++;
    });

    const medicines = items.filter(i => i.category === 'medicine').length;
    const points = totalItems * 50 + freshCount * 10;

    // Count per category
    const categoryCounts = {};
    Object.keys(CATEGORIES).forEach(k => categoryCounts[k] = 0);
    items.forEach(i => { if (categoryCounts[i.category] !== undefined) categoryCounts[i.category]++; });

    // Update summary cards
    animateValue('.card-purple .card-value', totalItems);
    animateValue('.card-orange .card-value', expiringCount + expiredCount);
    animateValue('.card-blue .card-value', medicines);
    animateValue('.card-green .card-value', points.toLocaleString());

    // Update analytics stat cards
    animateValue('#statTotal', totalItems);
    animateValue('#statFresh', freshCount);
    animateValue('#statExpiring', expiringCount);
    animateValue('#statExpired', expiredCount);

    // Update charts
    updateCharts(categoryCounts, freshCount, expiringCount, expiredCount);
}

function animateValue(selector, value) {
    const el = document.querySelector(selector);
    if (el) el.textContent = value;
}

function updateCharts(categoryCounts, fresh, expiring, expired) {
    const chartsGrid = document.querySelector('.charts-grid');
    const chartEmpty = document.getElementById('chartEmpty');
    const total = Object.values(categoryCounts).reduce((a, b) => a + b, 0);

    if (total === 0) {
        chartsGrid.style.display = 'none';
        chartEmpty.style.display = 'flex';
        return;
    }

    chartsGrid.style.display = 'grid';
    chartEmpty.style.display = 'none';

    const chartFont = { family: "'Inter', sans-serif" };

    // Build category chart data dynamically from CATEGORIES config
    const catLabels = [];
    const catData = [];
    const catColors = [];
    Object.entries(CATEGORIES).forEach(([key, cfg]) => {
        if (categoryCounts[key] > 0) {
            catLabels.push(`${cfg.icon} ${cfg.label}`);
            catData.push(categoryCounts[key]);
            catColors.push(cfg.color);
        }
    });

    // Category Distribution Chart
    if (categoryChart) categoryChart.destroy();
    const catCtx = document.getElementById('categoryChart').getContext('2d');
    categoryChart = new Chart(catCtx, {
        type: 'doughnut',
        data: {
            labels: catLabels,
            datasets: [{
                data: catData,
                backgroundColor: catColors,
                borderColor: catColors.map(() => '#fff'),
                borderWidth: 3,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: '62%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 16,
                        font: { ...chartFont, size: 13, weight: '500' },
                        usePointStyle: true,
                        pointStyleWidth: 10
                    }
                },
                tooltip: {
                    backgroundColor: '#1F2937',
                    titleFont: { ...chartFont, size: 13 },
                    bodyFont: { ...chartFont, size: 12 },
                    padding: 12,
                    cornerRadius: 10,
                    callbacks: {
                        label: ctx => ` ${ctx.label}: ${ctx.raw} item${ctx.raw !== 1 ? 's' : ''}`
                    }
                }
            }
        }
    });

    // Expiry Status Chart
    if (expiryChart) expiryChart.destroy();
    const expCtx = document.getElementById('expiryChart').getContext('2d');
    expiryChart = new Chart(expCtx, {
        type: 'doughnut',
        data: {
            labels: ['✅ Fresh', '⚠️ Expiring', '❌ Expired'],
            datasets: [{
                data: [fresh, expiring, expired],
                backgroundColor: ['#10B981', '#F59E0B', '#EF4444'],
                borderColor: ['#fff', '#fff', '#fff'],
                borderWidth: 3,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: '62%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 16,
                        font: { ...chartFont, size: 13, weight: '500' },
                        usePointStyle: true,
                        pointStyleWidth: 10
                    }
                },
                tooltip: {
                    backgroundColor: '#1F2937',
                    titleFont: { ...chartFont, size: 13 },
                    bodyFont: { ...chartFont, size: 12 },
                    padding: 12,
                    cornerRadius: 10,
                    callbacks: {
                        label: ctx => ` ${ctx.label}: ${ctx.raw} item${ctx.raw !== 1 ? 's' : ''}`
                    }
                }
            }
        }
    });
}

// =====================
// 10. SCROLL ANIMATIONS
// =====================
const observerOptions = { threshold: 0.1, rootMargin: '0px 0px -50px 0px' };
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

const animatedElements = document.querySelectorAll('.summary-card, .cta-container, .items-section');
animatedElements.forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(el);
});

// =====================
// 11. GREETING
// =====================
function updateGreeting() {
    const welcomeTitle = document.querySelector('.welcome-title');
    if (!welcomeTitle) return;
    const hour = new Date().getHours();
    let greeting = 'Welcome back';
    if (hour < 12) greeting = 'Good morning';
    else if (hour < 17) greeting = 'Good afternoon';
    else greeting = 'Good evening';
    welcomeTitle.textContent = `${greeting}! Let's stay healthy and reduce waste 💚`;
}

updateGreeting();

// Card ripple effect
document.querySelectorAll('.summary-card').forEach(card => {
    card.addEventListener('click', function (e) {
        const ripple = document.createElement('span');
        const rect = this.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        ripple.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - rect.left - size / 2}px;top:${e.clientY - rect.top - size / 2}px`;
        ripple.classList.add('ripple');
        this.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
    });
});

// Add ripple CSS
const rippleStyle = document.createElement('style');
rippleStyle.textContent = `.summary-card{position:relative;overflow:hidden}.ripple{position:absolute;border-radius:50%;background:currentColor;opacity:.3;transform:scale(0);animation:ripple-animation .6s ease-out;pointer-events:none}@keyframes ripple-animation{to{transform:scale(2);opacity:0}}`;
document.head.appendChild(rippleStyle);

// =====================
// 12. UTILITY
// =====================
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// Smooth scroll
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
});

// =====================
// 13. NOTIFICATIONS
// =====================
const NOTIF_KEY = 'freshalert_last_notif_date';

// Request browser notification permission
async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        console.log('⚠️ Browser does not support notifications');
        return false;
    }
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;

    const permission = await Notification.requestPermission();
    return permission === 'granted';
}

// Send a browser notification
function sendNotification(title, body, icon = '⚠️') {
    if (Notification.permission !== 'granted') return;

    const notif = new Notification(title, {
        body: body,
        icon: 'assets/logo.png',
        badge: 'assets/logo.png',
        tag: 'freshalert-expiry',
        requireInteraction: false
    });

    // Auto-close after 6 seconds
    setTimeout(() => notif.close(), 6000);
}

// Check items and notify for expiring ones
function checkExpiringItems() {
    const items = getItems();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiringItems = items.filter(item => {
        const expiry = new Date(item.expiryDate);
        expiry.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
        return diffDays >= 0 && diffDays <= 3;
    });

    if (expiringItems.length === 0) return;

    // Send individual notifications (max 3 to avoid spam)
    expiringItems.slice(0, 3).forEach((item, index) => {
        const expiry = new Date(item.expiryDate);
        expiry.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
        const icon = item.category === 'medicine' ? '💊' : '🛒';

        let message;
        if (diffDays === 0) {
            message = `${icon} Your ${item.name} expires today!`;
        } else if (diffDays === 1) {
            message = `${icon} Your ${item.name} expires tomorrow!`;
        } else {
            message = `${icon} Your ${item.name} expires in ${diffDays} days!`;
        }

        // Stagger notifications slightly
        setTimeout(() => {
            sendNotification('FreshAlert ⏰', message);
        }, index * 1500);
    });

    // If more than 3, show a summary
    if (expiringItems.length > 3) {
        setTimeout(() => {
            sendNotification(
                'FreshAlert ⏰',
                `You have ${expiringItems.length} items expiring soon. Open the app to check!`
            );
        }, 5000);
    }

    // Also show an in-app toast for the first expiring item
    const first = expiringItems[0];
    const firstExpiry = new Date(first.expiryDate);
    firstExpiry.setHours(0, 0, 0, 0);
    const firstDiff = Math.ceil((firstExpiry - today) / (1000 * 60 * 60 * 24));
    const firstIcon = first.category === 'medicine' ? '💊' : '🛒';

    if (firstDiff === 0) {
        showToast(`${firstIcon} "${first.name}" expires today!`, 'error');
    } else if (firstDiff === 1) {
        showToast(`${firstIcon} "${first.name}" expires tomorrow!`, 'error');
    } else {
        showToast(`⚠️ ${expiringItems.length} item${expiringItems.length > 1 ? 's' : ''} expiring soon`, 'error');
    }
}

// Run daily check (avoid spamming — once per session)
function runDailyNotificationCheck() {
    const todayStr = new Date().toDateString();
    const lastCheck = sessionStorage.getItem(NOTIF_KEY);

    if (lastCheck === todayStr) return; // Already checked today this session

    sessionStorage.setItem(NOTIF_KEY, todayStr);

    // Delay the check to let the page load first
    setTimeout(() => {
        checkExpiringItems();
        checkExpiryAndSendEmails(); // Trigger email reminders check
    }, 2000);
}

// Initialize notifications
async function initNotifications() {
    const granted = await requestNotificationPermission();
    if (granted) {
        console.log('🔔 Notifications enabled');
        runDailyNotificationCheck();
    } else {
        console.log('🔕 Notifications not permitted');
        // Even if browser notifications fail, try to run email check once per session.
        runDailyNotificationCheck();
    }

    // Also re-check every 6 hours if tab stays open
    setInterval(() => {
        sessionStorage.removeItem(NOTIF_KEY); // Reset for next check
        runDailyNotificationCheck();
    }, 6 * 60 * 60 * 1000);
}

// =====================
// 13.5 EMAIL REMINDER SYSTEM
// =====================

// Function to send the email via EmailJS
function sendExpiryEmail(item) {
    const userEmail = localStorage.getItem('freshalert_user_email');
    if (!userEmail) return; // Cannot send without an email provided

    // These parameters must match your EmailJS Template structure
    const templateParams = {
        item_name: item.name,
        expiry_date: formatDate(item.expiryDate),
        to_email: userEmail
    };

    // Replace "SERVICE_ID" and "TEMPLATE_ID" with real IDs from the EmailJS dashboard.
    emailjs.send("SERVICE_ID", "TEMPLATE_ID", templateParams)
        .then(function (response) {
            console.log('SUCCESS! Email sent for', item.name, response.status, response.text);

            // Mark the item as email sent to prevent spam
            updateItem(item.id, { emailSent: true });

        }, function (error) {
            console.log('FAILED to send email for', item.name, error);
            // On failure we DO NOT mark it as sent, so it might retry on next load.
        });
}

// Function to check all items and dispatch emails if close to expiry
function checkExpiryAndSendEmails() {
    const items = getItems();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    items.forEach(item => {
        // Skip items that already triggered an email warning
        if (item.emailSent) return;

        const expiry = new Date(item.expiryDate);
        expiry.setHours(0, 0, 0, 0);

        const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));

        // If it expires in 2 days or less, and we haven't sent an email yet
        if (diffDays >= 0 && diffDays <= 2) {
            sendExpiryEmail(item);
        }
    });
}

// =====================
// 14. EXPIRY CALENDAR
// =====================
const calGrid = document.getElementById('calGrid');
const calMonthLabel = document.getElementById('calMonthLabel');
const calPrev = document.getElementById('calPrev');
const calNext = document.getElementById('calNext');
const calDetailPanel = document.getElementById('calDetailPanel');
const calDetailTitle = document.getElementById('calDetailTitle');
const calDetailList = document.getElementById('calDetailList');

let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
let calSelectedDate = null;

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

function buildExpiryMap() {
    const items = getItems();
    const map = {};
    items.forEach(item => {
        const key = item.expiryDate; // "YYYY-MM-DD"
        if (!map[key]) map[key] = [];
        map[key].push(item);
    });
    return map;
}

function getDateStatus(dateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const date = new Date(dateStr);
    date.setHours(0, 0, 0, 0);
    const diff = Math.ceil((date - today) / (1000 * 60 * 60 * 24));
    if (diff < 0) return 'expired';
    if (diff <= 3) return 'expiring';
    return 'fresh';
}

function renderCalendar() {
    const expiryMap = buildExpiryMap();
    calMonthLabel.textContent = `${MONTH_NAMES[calMonth]} ${calYear}`;

    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const today = new Date();

    let html = '';

    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) {
        html += '<div class="cal-day empty"></div>';
    }

    // Day cells
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const items = expiryMap[dateStr] || [];
        const isToday = d === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear();
        const isSelected = calSelectedDate === dateStr;

        let classes = 'cal-day';
        if (isToday) classes += ' today';
        if (isSelected) classes += ' selected';
        if (items.length > 0) classes += ' has-expiry';
        if (items.length > 1) classes += ' has-multi';

        let dotHtml = '';
        if (items.length > 0) {
            const status = getDateStatus(dateStr);
            dotHtml = `<span class="cal-dot dot-${status}"></span>`;
        }

        const clickAttr = items.length > 0 ? `data-date="${dateStr}"` : '';

        html += `<div class="${classes}" ${clickAttr}>${d}${dotHtml}</div>`;
    }

    calGrid.innerHTML = html;

    // Attach click handlers to expiry days
    calGrid.querySelectorAll('.cal-day.has-expiry').forEach(cell => {
        cell.addEventListener('click', () => {
            const dateStr = cell.dataset.date;
            calSelectedDate = calSelectedDate === dateStr ? null : dateStr;
            renderCalendar();
            if (calSelectedDate) {
                showCalendarDetail(dateStr, expiryMap[dateStr]);
            } else {
                calDetailPanel.style.display = 'none';
            }
        });
    });

    // If a date is selected but not clicked again, keep the panel
    if (calSelectedDate && expiryMap[calSelectedDate]) {
        showCalendarDetail(calSelectedDate, expiryMap[calSelectedDate]);
    } else {
        calDetailPanel.style.display = 'none';
    }
}

function showCalendarDetail(dateStr, items) {
    const d = new Date(dateStr + 'T00:00:00');
    const formatted = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    calDetailTitle.textContent = `📋 Items expiring on ${formatted}`;

    calDetailList.innerHTML = items.map(item => {
        const cat = getCategoryInfo(item.category);
        return `
        <div class="cal-detail-item">
            <span class="cal-detail-name">${cat.icon} ${escapeHtml(item.name)}</span>
            <span class="cal-detail-category category-badge ${cat.badge}">${cat.label}</span>
        </div>`;
    }).join('');

    calDetailPanel.style.display = 'block';
}

calPrev?.addEventListener('click', () => {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    calSelectedDate = null;
    renderCalendar();
});

calNext?.addEventListener('click', () => {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    calSelectedDate = null;
    renderCalendar();
});

// =====================
// 15. THEME TOGGLE
// =====================
const themeToggle = document.getElementById('themeToggle');
const currentTheme = localStorage.getItem('freshalert_theme') || 'light';

if (currentTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    themeToggle.textContent = '☀️';
} else {
    themeToggle.textContent = '🌙';
}

themeToggle?.addEventListener('click', () => {
    let theme = document.documentElement.getAttribute('data-theme');
    if (theme === 'dark') {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('freshalert_theme', 'light');
        themeToggle.textContent = '🌙';
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('freshalert_theme', 'dark');
        themeToggle.textContent = '☀️';
    }
});

renderItems();
updateDashboardCards();
renderCalendar();
initNotifications();

console.log('🌿 FreshAlert Dashboard initialized successfully!');
console.log('📱 Mobile-first responsive design active');
console.log('♿ Accessibility features enabled');
console.log('🔔 Expiry notifications system active');
console.log('📅 Expiry calendar active');

// =====================
// 17. BARCODE SCANNER
// =====================
(function BarcodeScanner() {
    // ── DOM References ──
    const scannerOverlay = document.getElementById('scannerModal');
    const openScannerBtn = document.getElementById('openScannerBtn');
    const closeScannerBtn = document.getElementById('closeScannerBtn');
    const cancelScannerBtn = document.getElementById('cancelScannerBtn');
    const useBarcodeBtn = document.getElementById('useBarcodeBtn');
    const scannerFrame = document.getElementById('scannerFrame');
    const scannerFlash = document.getElementById('scannerSuccessFlash');
    const scannerStatus = document.getElementById('scannerStatus');
    const statusIcon = document.getElementById('scannerStatusIcon');
    const statusText = document.getElementById('scannerStatusText');
    const resultPanel = document.getElementById('scannerResult');
    const scannedCodeEl = document.getElementById('scannedCode');
    const productNameRow = document.getElementById('productNameRow');
    const productNameEl = document.getElementById('scannedProductName');
    const scannerViewport = document.getElementById('scannerViewport');

    // Guard: only run if all elements exist (dashboard page only)
    if (!scannerOverlay || !openScannerBtn) return;

    // ── State ──
    let quaggaRunning = false;
    let lastCode = null;     // most recently confirmed barcode string
    let detectedName = null;     // product name from OpenFoodFacts
    let detectionBuffer = {};       // barcode → detection count (debounce)
    const DETECT_THRESHOLD = 4;    // require N consecutive detections before accepting

    // ── Audio beep (Web Audio API — no file needed) ──
    function playBeep() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(820, ctx.currentTime);
            gain.gain.setValueAtTime(0.25, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.25);
        } catch (_) { /* AudioContext not available — silent fail */ }
    }

    // ── Vibration ──
    function vibrate() {
        if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
    }

    // ── Status helpers ──
    function setStatus(icon, text, state = '') {
        statusIcon.textContent = icon;
        statusText.textContent = text;
        scannerStatus.className = 'scanner-status' + (state ? ' ' + state : '');
    }

    // ── Open Scanner ──
    function openScanner() {
        scannerOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';
        resetScannerUI();
        startQuagga();
    }

    // ── Close Scanner ──
    function closeScanner() {
        stopQuagga();
        scannerOverlay.classList.remove('active');
        document.body.style.overflow = '';
    }

    // ── Reset UI to initial state ──
    function resetScannerUI() {
        lastCode = null;
        detectedName = null;
        detectionBuffer = {};
        scannerFrame.classList.remove('detected');
        scannerFlash.classList.remove('flash');
        setStatus('🔍', 'Point camera at a barcode');
        resultPanel.style.display = 'none';
        productNameRow.style.display = 'none';
        useBarcodeBtn.style.display = 'none';
        scannedCodeEl.textContent = '—';
        productNameEl.textContent = '—';
    }

    // ── Remove old no-camera message if present ──
    function clearNoCameraMsg() {
        const existing = scannerViewport.querySelector('.scanner-no-camera');
        if (existing) existing.remove();
    }

    // ── Show camera-unavailable fallback ──
    function showNoCameraError(msg) {
        clearNoCameraMsg();
        const el = document.createElement('div');
        el.className = 'scanner-no-camera';
        el.innerHTML = `<div class="no-cam-icon">📷</div><p>${msg}</p>`;
        scannerViewport.appendChild(el);
        setStatus('❌', 'Camera unavailable', 'status-error');
    }

    // ── QuaggaJS Init ──
    function startQuagga() {
        if (!window.Quagga) {
            showNoCameraError('QuaggaJS library failed to load. Check your connection.');
            return;
        }

        setStatus('⏳', 'Requesting camera access…');
        clearNoCameraMsg();

        Quagga.init({
            inputStream: {
                name: 'Live',
                type: 'LiveStream',
                target: document.getElementById('scanner'),
                constraints: {
                    facingMode: 'environment',  // rear camera
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            },
            locator: {
                patchSize: 'medium',
                halfSample: true
            },
            numOfWorkers: navigator.hardwareConcurrency > 1 ? 2 : 1,
            frequency: 10,
            decoder: {
                readers: [
                    'ean_reader',
                    'ean_8_reader',
                    'upc_reader',
                    'upc_e_reader',
                    'code_128_reader',
                    'code_39_reader'
                ]
            },
            locate: true
        }, function (err) {
            if (err) {
                console.error('Quagga init error:', err);
                const msg = err.name === 'NotAllowedError'
                    ? 'Camera permission denied. Please allow camera access and try again.'
                    : err.name === 'NotFoundError'
                        ? 'No camera found on this device.'
                        : 'Camera error: ' + (err.message || err);
                showNoCameraError(msg);
                return;
            }
            Quagga.start();
            quaggaRunning = true;
            setStatus('🔍', 'Point camera at a barcode');
        });

        // Barcode detected callback
        Quagga.onDetected(function (data) {
            const code = data.codeResult.code;
            if (!code) return;

            // Debounce: require DETECT_THRESHOLD hits before accepting
            detectionBuffer[code] = (detectionBuffer[code] || 0) + 1;
            if (detectionBuffer[code] < DETECT_THRESHOLD) return;

            // Avoid re-processing the same code
            if (code === lastCode) return;

            onBarcodeConfirmed(code);
        });
    }

    // ── Stop Quagga ──
    function stopQuagga() {
        if (quaggaRunning) {
            try { Quagga.stop(); } catch (_) { }
            quaggaRunning = false;
        }
    }

    // ── Barcode confirmed ──
    function onBarcodeConfirmed(code) {
        lastCode = code;
        detectionBuffer = {};  // reset buffer

        // Feedback
        playBeep();
        vibrate();

        // Visual feedback
        scannerFrame.classList.add('detected');
        scannerFlash.classList.remove('flash');
        void scannerFlash.offsetWidth; // reflow to restart animation
        scannerFlash.classList.add('flash');

        // Display result
        scannedCodeEl.textContent = code;
        resultPanel.style.display = 'block';
        productNameRow.style.display = 'none';
        productNameEl.textContent = '—';

        // Pause scanning
        stopQuagga();

        // Fetch product info
        fetchProduct(code);
    }

    // ── OpenFoodFacts lookup ──
    async function fetchProduct(barcode) {
        setStatus('⏳', 'Looking up product…', 'status-loading');

        // Append a spinner to status text
        const spinner = document.createElement('span');
        spinner.className = 'scanner-fetching';
        statusText.appendChild(spinner);

        try {
            const url = `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`;
            const response = await fetch(url, { signal: AbortSignal.timeout(8000) });

            if (!response.ok) throw new Error('Network response not OK');

            const data = await response.json();

            if (data.status === 1 && data.product) {
                const product = data.product;
                // Try several name fields in priority order
                const name =
                    product.product_name_en ||
                    product.product_name ||
                    product.generic_name_en ||
                    product.generic_name ||
                    '';

                if (name.trim()) {
                    detectedName = name.trim();
                    productNameEl.textContent = detectedName;
                    productNameRow.style.display = 'flex';
                    setStatus('✅', `Found: ${detectedName}`, 'status-success');
                } else {
                    detectedName = null;
                    setStatus('⚠️', 'Product found but no name available. Enter manually.', '');
                }
            } else {
                detectedName = null;
                setStatus('📦', 'Product not in database. Enter name manually.', '');
            }
        } catch (err) {
            console.warn('OpenFoodFacts fetch error:', err);
            detectedName = null;
            const msg = err.name === 'TimeoutError'
                ? 'Lookup timed out. Enter name manually.'
                : 'Could not fetch product info. Enter name manually.';
            setStatus('⚠️', msg, '');
        } finally {
            // Show "Use This Item" button regardless
            useBarcodeBtn.style.display = 'inline-flex';
        }
    }

    // ── Apply result to Add Item form ──
    function applyToForm() {
        const nameInput = document.getElementById('itemName');
        if (!nameInput) return;

        if (detectedName) {
            nameInput.value = detectedName;
        } else if (lastCode) {
            // Fallback: use barcode number so user knows what was scanned
            nameInput.value = `Product ${lastCode}`;
        }

        // Trigger input event so any listeners (error clearing) fire
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));

        closeScanner();

        // Open Add Item modal if not already open
        const addItemModal = document.getElementById('addItemModal');
        if (addItemModal && !addItemModal.classList.contains('active')) {
            openModal();
        }

        // Focus name field and move cursor to end
        setTimeout(() => {
            nameInput.focus();
            nameInput.selectionStart = nameInput.selectionEnd = nameInput.value.length;
        }, 150);

        showToast(
            detectedName
                ? `📷 Scanned: "${detectedName}"`
                : `📷 Barcode scanned — enter product name`,
            'success'
        );
    }

    // ── Event Listeners ──
    openScannerBtn.addEventListener('click', openScanner);
    closeScannerBtn.addEventListener('click', closeScanner);
    cancelScannerBtn.addEventListener('click', closeScanner);
    useBarcodeBtn.addEventListener('click', applyToForm);

    // Close on overlay click
    scannerOverlay.addEventListener('click', (e) => {
        if (e.target === scannerOverlay) closeScanner();
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && scannerOverlay.classList.contains('active')) {
            closeScanner();
        }
    });

    console.log('📷 Barcode scanner module initialized');
})();

// =====================
// 18. SCANNER TAB SWITCHER
// =====================
(function ScannerTabSwitcher() {
    const tabBarcode = document.getElementById('tabBarcode');
    const tabExpiry = document.getElementById('tabExpiry');
    const panelBarcode = document.getElementById('panelBarcode');
    const panelExpiry = document.getElementById('panelExpiry');

    if (!tabBarcode || !tabExpiry) return;

    function switchTab(mode) {
        const isBarcode = mode === 'barcode';

        tabBarcode.classList.toggle('active', isBarcode);
        tabExpiry.classList.toggle('active', !isBarcode);

        // Stop camera stream when switching away from barcode tab
        if (!isBarcode && typeof Quagga !== 'undefined') {
            try { Quagga.stop(); } catch (_) { }
        }

        panelBarcode.style.display = isBarcode ? '' : 'none';
        panelExpiry.style.display = isBarcode ? 'none' : '';
    }

    tabBarcode.addEventListener('click', () => switchTab('barcode'));
    tabExpiry.addEventListener('click', () => switchTab('expiry'));
})();

// =====================
// 19. EXPIRY DATE OCR SCANNER (Tesseract.js)
// =====================
(function ExpiryScanner() {
    // ── DOM refs ──
    const fileInput = document.getElementById('expiryPhoto');
    const cameraBtn = document.getElementById('ocrCameraBtn');
    const fileBtn = document.getElementById('ocrFileBtn');
    const retakeBtn = document.getElementById('ocrRetakeBtn');
    const cancelOcrBtn = document.getElementById('cancelOcrBtn');
    const applyBtn = document.getElementById('ocrApplyBtn');

    const uploadContent = document.getElementById('ocrUploadContent');
    const previewWrap = document.getElementById('ocrPreviewWrap');
    const previewImg = document.getElementById('ocrPreviewImg');

    const resultArea = document.getElementById('ocrResultArea');
    const progressWrap = document.getElementById('ocrProgressWrap');
    const progressLabel = document.getElementById('ocrProgressLabel');
    const progressPct = document.getElementById('ocrProgressPct');
    const progressFill = document.getElementById('ocrProgressFill');

    const detectedDate = document.getElementById('ocrDetectedDate');
    const dateValueEl = document.getElementById('ocrDateValue');
    const rawDetail = document.getElementById('ocrRawDetail');
    const rawTextEl = document.getElementById('ocrRawText');
    const noDateEl = document.getElementById('ocrNoDate');

    const scannerOverlay = document.getElementById('scannerModal');

    if (!fileInput || !cameraBtn) return;  // only on dashboard

    let extractedIsoDate = null;  // YYYY-MM-DD result

    // ── Expiry Date Extraction ──
    // Handles all real-world label formats:
    //   07/2026  |  07-2026  |  2026-07  |  2026/07
    //   07/07/2026  |  07-07-2026  |  2026-07-07
    //   15 AUG 2025  |  AUG 2025  |  AUG 15 2025
    //   EXP: ...  |  BEST BEFORE ...  |  USE BY ...  |  BB: ...
    const MONTH_ABBR = {
        jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
        jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
        january: 1, february: 2, march: 3, april: 4, june: 6,
        july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
    };

    function parseMonthName(m) {
        return MONTH_ABBR[m.toLowerCase()] || null;
    }

    /**
     * Attempt to extract an expiry date from OCR text.
     * Returns { isoDate, display } on success, or null.
     */
    function extractExpiryDate(text) {
        // Clean up the text: normalise spacing and case
        const clean = text.replace(/\r\n/g, '\n')
            .replace(/[''`]/g, '')
            .replace(/\s+/g, ' ');

        // Strip keywords that precede the date so regex anchors work
        const stripped = clean.replace(
            /\b(exp(?:iry|iry date)?|best ?before|use ?by|bb|expiration date?|sell ?by)[\s:./–-]*/gi, ''
        );

        const candidates = [];

        // Pattern 1: MM/YYYY  or  MM-YYYY
        const p1 = /\b(0?[1-9]|1[0-2])[\/\-](20[2-9]\d)\b/g;
        let m;
        while ((m = p1.exec(stripped)) !== null) {
            candidates.push({ month: +m[1], year: +m[2], day: 1, src: m[0] });
        }

        // Pattern 2: YYYY/MM  or  YYYY-MM
        const p2 = /\b(20[2-9]\d)[\/\-](0?[1-9]|1[0-2])\b/g;
        while ((m = p2.exec(stripped)) !== null) {
            candidates.push({ year: +m[1], month: +m[2], day: 1, src: m[0] });
        }

        // Pattern 3: DD/MM/YYYY  or  DD-MM-YYYY
        const p3 = /\b(0?[1-9]|[12]\d|3[01])[\/\-\.](0?[1-9]|1[0-2])[\/\-\.](20[2-9]\d)\b/g;
        while ((m = p3.exec(stripped)) !== null) {
            candidates.push({ day: +m[1], month: +m[2], year: +m[3], src: m[0] });
        }

        // Pattern 4: YYYY-MM-DD  (ISO-ish)
        const p4 = /\b(20[2-9]\d)[\/\-\.](0?[1-9]|1[0-2])[\/\-\.](0?[1-9]|[12]\d|3[01])\b/g;
        while ((m = p4.exec(stripped)) !== null) {
            candidates.push({ year: +m[1], month: +m[2], day: +m[3], src: m[0] });
        }

        // Pattern 5: DD MON YYYY  (15 AUG 2025, 3 JANUARY 2026)
        const p5 = /\b(0?[1-9]|[12]\d|3[01])\s+([a-zA-Z]{3,9})\s+(20[2-9]\d)\b/g;
        while ((m = p5.exec(stripped)) !== null) {
            const mo = parseMonthName(m[2]);
            if (mo) candidates.push({ day: +m[1], month: mo, year: +m[3], src: m[0] });
        }

        // Pattern 6: MON YYYY  (AUG 2025)
        const p6 = /\b([a-zA-Z]{3,9})\s+(20[2-9]\d)\b/g;
        while ((m = p6.exec(stripped)) !== null) {
            const mo = parseMonthName(m[1]);
            if (mo) candidates.push({ day: 1, month: mo, year: +m[2], src: m[0] });
        }

        // Pattern 7: MON DD YYYY  (AUG 15 2025)
        const p7 = /\b([a-zA-Z]{3,9})\s+(0?[1-9]|[12]\d|3[01])\s+(20[2-9]\d)\b/g;
        while ((m = p7.exec(stripped)) !== null) {
            const mo = parseMonthName(m[1]);
            if (mo) candidates.push({ day: +m[2], month: mo, year: +m[3], src: m[0] });
        }

        if (candidates.length === 0) return null;

        // Validate and pick the most specific (furthest future or latest)
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        const valid = candidates.filter(c => {
            if (c.month < 1 || c.month > 12) return false;
            if (c.day < 1 || c.day > 31) return false;
            const d = new Date(c.year, c.month - 1, c.day || 1);
            return !isNaN(d.getTime());
        });

        if (valid.length === 0) return null;

        // Prefer latest date
        valid.sort((a, b) =>
            new Date(b.year, b.month - 1, b.day || 1) -
            new Date(a.year, a.month - 1, a.day || 1)
        );

        const best = valid[0];
        const day = String(best.day || 1).padStart(2, '0');
        const month = String(best.month).padStart(2, '0');
        const isoDate = `${best.year}-${month}-${day}`;

        // Human-friendly display
        const d = new Date(best.year, best.month - 1, best.day || 1);
        const display = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: best.day && best.day > 1 ? 'numeric' : undefined });

        return { isoDate, display, src: best.src };
    }

    // ── UI helpers ──
    function setProgress(pct, label) {
        progressFill.style.width = pct + '%';
        progressPct.textContent = Math.round(pct) + '%';
        if (label) progressLabel.textContent = label;
    }

    function resetOCR() {
        extractedIsoDate = null;
        uploadContent.style.display = '';
        previewWrap.style.display = 'none';
        resultArea.style.display = 'none';
        detectedDate.style.display = 'none';
        rawDetail.style.display = 'none';
        noDateEl.style.display = 'none';
        applyBtn.style.display = 'none';
        rawTextEl.textContent = '';
        dateValueEl.textContent = '—';
        progressFill.style.width = '0%';
        progressPct.textContent = '0%';
        progressLabel.textContent = 'Reading text…';
        if (fileInput) fileInput.value = '';
    }

    // ── File selection triggers OCR ──
    function handleFile(file) {
        if (!file || !file.type.startsWith('image/')) return;

        // Show preview
        const reader = new FileReader();
        reader.onload = (e) => {
            previewImg.src = e.target.result;
            uploadContent.style.display = 'none';
            previewWrap.style.display = '';
        };
        reader.readAsDataURL(file);

        // Run OCR
        runOCR(file);
    }

    async function runOCR(imageSource) {
        if (typeof Tesseract === 'undefined') {
            showToast('⚠️ Tesseract.js not loaded. Check your connection.', 'error');
            return;
        }

        resultArea.style.display = '';
        progressWrap.style.display = '';
        detectedDate.style.display = 'none';
        rawDetail.style.display = 'none';
        noDateEl.style.display = 'none';
        applyBtn.style.display = 'none';
        setProgress(0, 'Initializing OCR engine…');

        try {
            const result = await Tesseract.recognize(imageSource, 'eng', {
                logger: (info) => {
                    if (info.status === 'recognizing text') {
                        setProgress(info.progress * 100, 'Reading text…');
                    } else if (info.status === 'loading tesseract core') {
                        setProgress(10, 'Loading OCR engine…');
                    } else if (info.status === 'initializing tesseract') {
                        setProgress(20, 'Initializing…');
                    } else if (info.status === 'loading language traineddata') {
                        setProgress(30, 'Loading language data…');
                    } else if (info.status === 'initializing api') {
                        setProgress(40, 'Preparing…');
                    }
                }
            });

            setProgress(100, 'Done');

            const rawText = result.data.text || '';
            rawTextEl.textContent = rawText.trim() || '(No text extracted)';
            rawDetail.style.display = '';

            const parsed = extractExpiryDate(rawText);

            if (parsed) {
                extractedIsoDate = parsed.isoDate;
                dateValueEl.textContent = `${parsed.display}  (${parsed.isoDate})`;
                detectedDate.style.display = '';
                applyBtn.style.display = 'inline-flex';
                playBeep();
                showToast(`📅 Expiry date detected: ${parsed.display}`, 'success');
            } else {
                noDateEl.style.display = '';
                showToast('⚠️ No expiry date found. Try a clearer photo.', 'error');
            }

        } catch (err) {
            console.error('Tesseract error:', err);
            setProgress(0, 'Error');
            noDateEl.style.display = '';
            rawDetail.style.display = '';
            rawTextEl.textContent = 'OCR failed: ' + (err.message || err);
            showToast('❌ OCR failed. Try again with a clearer image.', 'error');
        }
    }

    // Reuse barcode scanner's playBeep if available
    function playBeep() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(660, ctx.currentTime);
            gain.gain.setValueAtTime(0.2, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
        } catch (_) { }
    }

    // ── Apply expiry date to form ──
    function applyExpiryDate() {
        if (!extractedIsoDate) return;

        const expiryInput = document.getElementById('itemExpiry');
        if (expiryInput) {
            expiryInput.value = extractedIsoDate;
            expiryInput.dispatchEvent(new Event('input', { bubbles: true }));
            expiryInput.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // Open Add Item modal if not already open
        const addItemModal = document.getElementById('addItemModal');
        if (addItemModal && !addItemModal.classList.contains('active')) {
            if (typeof openModal === 'function') openModal();
        }

        // Close scanner
        if (scannerOverlay) {
            scannerOverlay.classList.remove('active');
            document.body.style.overflow = '';
        }

        showToast(`📅 Expiry date applied: ${dateValueEl.textContent.split('(')[0].trim()}`, 'success');

        // Focus expiry field
        setTimeout(() => expiryInput?.focus(), 150);
    }

    // ── Event Listeners ──
    // Camera button — open native camera on mobile, file picker on desktop
    cameraBtn?.addEventListener('click', () => {
        // On mobile, "capture=environment" triggers rear camera directly
        // On desktop, it just opens file picker
        fileInput.removeAttribute('capture');
        fileInput.setAttribute('capture', 'environment');
        fileInput.click();
    });

    fileBtn?.addEventListener('click', () => {
        // Desktop file picker — no capture attribute
        fileInput.removeAttribute('capture');
        fileInput.click();
    });

    fileInput?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
    });

    retakeBtn?.addEventListener('click', resetOCR);
    cancelOcrBtn?.addEventListener('click', () => {
        if (scannerOverlay) {
            // Stop camera if barcode tab was active
            if (typeof Quagga !== 'undefined') { try { Quagga.stop(); } catch (_) { } }
            scannerOverlay.classList.remove('active');
            document.body.style.overflow = '';
        }
        resetOCR();
    });

    applyBtn?.addEventListener('click', applyExpiryDate);

    // Also reset OCR state when scanner modal closes (via barcode close btn)
    document.getElementById('closeScannerBtn')?.addEventListener('click', resetOCR);

    // Reset OCR when switching back to barcode tab
    document.getElementById('tabBarcode')?.addEventListener('click', resetOCR);

    console.log('📅 Expiry date OCR scanner initialized (Tesseract.js)');
})();
