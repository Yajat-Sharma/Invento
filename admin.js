// ===== FreshAlert — admin.js =====
// PRIVACY RULE: This file ONLY reads from:
//   - 'analytics'         (aggregated stats, no personal data)
//   - 'freshalert_users'  (user list with masked emails)
// It NEVER reads any key starting with 'items_user_'.

// =====================
// 1. ANALYTICS DATA SOURCE
// =====================

/**
 * Get aggregated analytics — sourced entirely from the
 * 'analytics' key, never from individual user item keys.
 */
function getAdminAnalytics() {
    return getAnalytics(); // defined in auth.js
}

// =====================
// 2. OVERVIEW CARDS
// =====================
function renderOverviewCards() {
    const analytics = getAdminAnalytics();
    const users = getUsers(); // from auth.js — user list only

    // Only count non-admin users for the "Total Users" card
    const registeredUserCount = users.filter(u => u.role !== 'admin').length;

    animateCount('totalUsers', registeredUserCount);
    animateCount('totalItems', analytics.totalItemsTracked);
    animateCount('totalMedicines', analytics.totalMedicines);
    animateCount('totalGroceries', analytics.totalGroceries);
    animateCount('expiringSoon', analytics.expiringSoon);
    animateCount('expiredItems', analytics.expiredItems);
}

function animateCount(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    let start = 0;
    const duration = 1400;
    const step = (timestamp) => {
        if (!step.start) step.start = timestamp;
        const progress = Math.min((timestamp - step.start) / duration, 1);
        el.textContent = Math.floor(progress * value).toLocaleString();
        if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

// =====================
// 3. CHARTS   (data from analytics only)
// =====================
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.color = '#8F9BBA';

function renderCharts() {
    const analytics = getAdminAnalytics();
    const counts = analytics.categoryCounts;

    // ── Category Doughnut ──
    const catCtx = document.getElementById('categoryChart')?.getContext('2d');
    if (!catCtx) return;

    const labels = ['Medicine', 'Dairy', 'Vegetables', 'Fruits', 'Snacks', 'Vitamins', 'Other'];
    const dataVals = [
        counts.medicine, counts.dairy, counts.vegetables,
        counts.fruits, counts.snacks, counts.vitamins, counts.other
    ];
    const totalCat = dataVals.reduce((a, b) => a + b, 0);
    const topIdx = dataVals.indexOf(Math.max(...dataVals));

    const insightEl = document.getElementById('categoryInsight');
    if (insightEl) {
        insightEl.textContent = totalCat > 0
            ? `${labels[topIdx]} is the most tracked category (${Math.round((dataVals[topIdx] / totalCat) * 100)}%).`
            : 'No items tracked yet across all users.';
    }

    new Chart(catCtx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: dataVals,
                backgroundColor: ['#7000FF', '#4318FF', '#05CD99', '#EE5D50', '#FFB547', '#0D9488', '#A3AED0'],
                borderWidth: 0,
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { position: 'right', labels: { usePointStyle: true, boxWidth: 8, padding: 20 } }
            }
        }
    });

    // ── Expiry Bar Chart ──
    const expCtx = document.getElementById('expiryInsightChart')?.getContext('2d');
    if (!expCtx) return;

    const expVals = [
        analytics.expiredItems,
        0, // "expiring today" not tracked separately — kept for chart shape
        analytics.expiringSoon,
        0
    ];

    const expiryInsightEl = document.getElementById('expiryInsight');
    if (expiryInsightEl) {
        expiryInsightEl.textContent = `${analytics.expiringSoon} item${analytics.expiringSoon !== 1 ? 's' : ''} are expiring within the next 3 days across all users.`;
    }

    const gradientBar = expCtx.createLinearGradient(0, 0, 0, 400);
    gradientBar.addColorStop(0, '#4318FF');
    gradientBar.addColorStop(1, '#05CD99');

    new Chart(expCtx, {
        type: 'bar',
        data: {
            labels: ['Already Expired', 'Expiring Today', 'Within 3 Days', 'Within 7 Days'],
            datasets: [{
                label: 'Items',
                data: expVals,
                backgroundColor: ['#EE5D50', '#FFB547', gradientBar, gradientBar],
                borderRadius: 8,
                barThickness: 32
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(143,155,186,0.1)' }, border: { dash: [4, 4] } },
                x: { grid: { display: false } }
            }
        }
    });
}

// =====================
// 4. BOTTOM SECTION  (aggregated stats + users table)
// =====================
function renderLists() {
    const analytics = getAdminAnalytics();
    const users = getUsers().filter(u => u.role !== 'admin');
    const total = analytics.totalItemsTracked;
    const userCount = users.length;

    // Stat minis
    const avgEl = document.getElementById('avgItemsUser');
    if (avgEl) avgEl.textContent = userCount > 0 ? (total / userCount).toFixed(1) : '0';

    const todayEl = document.getElementById('itemsAddedToday');
    if (todayEl) todayEl.textContent = '—'; // not tracked in analytics object

    const freshEl = document.getElementById('consumedBeforeExp');
    if (freshEl) freshEl.textContent = '—';

    // Most Active Users — show registered user list with masked emails
    // (we show names only, no item counts, to preserve privacy)
    const usersListEl = document.getElementById('mostActiveUsers');
    if (usersListEl) {
        const avatarColors = ['#4f83ff', '#10b981', '#7c4dff', '#ffb547', '#ee5d50', '#0d9488'];
        const initials = n => n.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
        if (users.length === 0) {
            usersListEl.innerHTML = '<li class="user-item" style="color:#8899bb;">No registered users yet.</li>';
        } else {
            usersListEl.innerHTML = users.slice(0, 5).map((u, i) => `
                <li class="user-item">
                    <div style="width:32px;height:32px;border-radius:50%;background:${avatarColors[i % avatarColors.length]};display:flex;align-items:center;justify-content:center;font-size:0.72rem;font-weight:700;color:#fff;flex-shrink:0;">${initials(u.name)}</div>
                    <div class="user-details">
                        <span class="user-name">${u.name}</span>
                        <span class="user-metric">${maskEmail(u.email)}</span>
                    </div>
                </li>`).join('');
        }
    }

    // Most Tracked Items — derived from category counts, not raw items
    const trackedEl = document.getElementById('mostTrackedItems');
    if (trackedEl) {
        const analytics = getAdminAnalytics();
        const catIcons = {
            medicine: '💊', dairy: '🥛', vegetables: '🥬',
            fruits: '🍎', snacks: '🍪', vitamins: '💊', other: '📦'
        };
        const sorted = Object.entries(analytics.categoryCounts)
            .filter(([, v]) => v > 0)
            .sort(([, a], [, b]) => b - a);

        if (sorted.length === 0) {
            trackedEl.innerHTML = '<li class="tracked-item">No items tracked yet.</li>';
        } else {
            trackedEl.innerHTML = sorted.map(([cat, count], idx) => `
                <li class="tracked-item">
                    <div class="item-left">
                        <span class="item-rank">${idx + 1}</span>
                        <span class="item-name">${catIcons[cat] || '📦'} ${cat.charAt(0).toUpperCase() + cat.slice(1)}</span>
                    </div>
                    <span class="item-count">${count} item${count !== 1 ? 's' : ''}</span>
                </li>`).join('');
        }
    }

    // Recent Activity Feed — show generic category activity (no personal data)
    const feedEl = document.getElementById('activityFeed');
    if (feedEl) {
        const analytics = getAdminAnalytics();
        const catIcons = { medicine: '💊', dairy: '🥛', vegetables: '🥬', fruits: '🍎', snacks: '🍪', vitamins: '💊', other: '📦' };
        const bgs = { medicine: 'bg-purple', dairy: 'bg-blue', vegetables: 'bg-green', fruits: 'bg-red', snacks: 'bg-yellow', vitamins: 'bg-purple', other: 'bg-orange' };
        const catCounts = analytics.categoryCounts;
        const topCats = Object.entries(catCounts).filter(([, v]) => v > 0).sort(([, a], [, b]) => b - a).slice(0, 5);

        if (topCats.length === 0) {
            feedEl.innerHTML = '<li class="feed-item">No activity yet.</li>';
        } else {
            feedEl.innerHTML = topCats.map(([cat, count]) => `
                <li class="feed-item">
                    <div class="feed-icon ${bgs[cat] || 'bg-orange'}">${catIcons[cat] || '📦'}</div>
                    <div class="feed-content">
                        <p class="feed-text"><strong style="color:var(--clr-blue)">${count}</strong> ${cat} item${count !== 1 ? 's' : ''} tracked across all users</p>
                        <span class="feed-time">Aggregated analytics</span>
                    </div>
                </li>`).join('');
        }
    }
}

// =====================
// 5. REGISTERED USERS TABLE (masked emails)
// =====================
function renderUsersTable() {
    const users = getUsers().filter(u => u.role !== 'admin'); // exclude admin from count
    const badge = document.getElementById('usersBadge');
    const tbody = document.getElementById('usersTableBody');
    const noMsg = document.getElementById('noUsersMsg');
    if (!tbody) return;

    if (badge) badge.textContent = `${users.length} user${users.length !== 1 ? 's' : ''}`;

    if (users.length === 0) {
        tbody.innerHTML = '';
        if (noMsg) noMsg.style.display = 'block';
        return;
    }
    if (noMsg) noMsg.style.display = 'none';

    const sorted = [...users].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const formatDate = (iso) => {
        try {
            return new Date(iso).toLocaleDateString('en-US', {
                year: 'numeric', month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        } catch { return iso; }
    };

    const avatarColors = ['#4f83ff', '#10b981', '#7c4dff', '#ffb547', '#ee5d50', '#0d9488'];
    const initials = name => name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

    tbody.innerHTML = sorted.map((user, idx) => {
        const color = avatarColors[idx % avatarColors.length];
        return `
        <tr style="border-bottom:1px solid rgba(255,255,255,0.04);transition:background 0.15s;"
            onmouseover="this.style.background='rgba(255,255,255,0.03)'"
            onmouseout="this.style.background='transparent'">
            <td style="padding:0.75rem;color:#8899bb;font-size:0.8rem;">${idx + 1}</td>
            <td style="padding:0.75rem;">
                <div style="display:flex;align-items:center;gap:0.6rem;">
                    <div style="width:32px;height:32px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:0.72rem;font-weight:700;color:#fff;flex-shrink:0;">
                        ${initials(user.name)}
                    </div>
                    <span style="color:#f0f4ff;font-weight:500;">${user.name}</span>
                </div>
            </td>
            <td style="padding:0.75rem;color:#8899bb;">
                <span title="Email masked for privacy" style="font-family:monospace;">${maskEmail(user.email)}</span>
                <span style="margin-left:0.4rem;font-size:0.7rem;background:rgba(79,131,255,0.12);color:#7eb3ff;padding:0.15rem 0.4rem;border-radius:4px;">masked</span>
            </td>
            <td style="padding:0.75rem;color:#8899bb;font-size:0.8rem;">${formatDate(user.createdAt)}</td>
        </tr>`;
    }).join('');
}

// =====================
// 6. THEME TOGGLE
// =====================
const themeToggleBtn = document.getElementById('adminThemeToggle');
if (themeToggleBtn) {
    if (localStorage.getItem('freshalert_theme') === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
    themeToggleBtn.addEventListener('click', () => {
        const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('freshalert_theme', next);
        themeToggleBtn.textContent = next === 'dark' ? '☀️' : '🌙';
        location.reload();
    });
}

// =====================
// INIT
// =====================
document.addEventListener('DOMContentLoaded', () => {
    // Theme icon sync
    if (localStorage.getItem('freshalert_theme') === 'dark') {
        const btn = document.getElementById('adminThemeToggle');
        if (btn) btn.textContent = '☀️';
    }

    // Show admin's own name in the header profile
    const adminSession = getCurrentUser();
    if (adminSession) {
        const nameEl = document.querySelector('.profile-name');
        if (nameEl) nameEl.textContent = adminSession.name;
    }

    renderOverviewCards();
    setTimeout(renderCharts, 200);
    renderLists();
    renderUsersTable();

    // Auto-refresh when analytics or user list changes (cross-tab)
    window.addEventListener('storage', (e) => {
        if (e.key === ANALYTICS_KEY || e.key === AUTH_USERS_KEY) {
            location.reload();
        }
    });
});
