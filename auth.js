// ===== FreshAlert — auth.js =====
// Shared auth utilities: users, sessions, roles, analytics, guards, email masking.

const AUTH_USERS_KEY = 'freshalert_users';
const AUTH_SESSION_KEY = 'freshalert_currentUser';
const ANALYTICS_KEY = 'analytics';

// =====================
// USER STORAGE HELPERS
// =====================

/** Return all registered users from localStorage */
function getUsers() {
    try { return JSON.parse(localStorage.getItem(AUTH_USERS_KEY)) || []; }
    catch { return []; }
}

/** Persist all users to localStorage */
function saveUsers(users) {
    localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(users));
}

/** Return the currently logged-in user session, or null */
function getCurrentUser() {
    try { return JSON.parse(localStorage.getItem(AUTH_SESSION_KEY)) || null; }
    catch { return null; }
}

/** Persist a user session (includes role) */
function setCurrentUser(user) {
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(user));
}

/** Clear the current session */
function clearCurrentUser() {
    localStorage.removeItem(AUTH_SESSION_KEY);
}

// =====================
// PER-USER ITEM KEY
// =====================

/**
 * Returns the localStorage key for the current user's items.
 * Format: items_user_<userId>
 */
function getUserItemsKey(userId) {
    const uid = userId || getCurrentUser()?.id;
    if (!uid) return null;
    return 'items_user_' + uid;
}

// =====================
// PASSWORD HASHING (SHA-256 via Web Crypto API)
// =====================

/** Hash a plain-text password using SHA-256, returns hex string (Promise) */
async function hashPassword(password) {
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// =====================
// ADMIN SEEDING
// =====================

/**
 * Seeds a default admin account if none exists.
 * Credentials: admin@freshalert.com / Admin@1234
 * Called once on page load from auth.js itself.
 */
async function seedAdminIfNeeded() {
    const users = getUsers();
    const adminExists = users.some(u => u.role === 'admin');
    if (adminExists) return;

    const hashed = await hashPassword('Admin@1234');
    const adminUser = {
        id: 'admin_001',
        name: 'Admin',
        email: 'admin@freshalert.com',
        password: hashed,
        role: 'admin',
        createdAt: new Date().toISOString()
    };
    users.unshift(adminUser);
    saveUsers(users);
}

// Seed on every page load (safe: no-ops if admin already exists)
seedAdminIfNeeded();

// =====================
// EMAILJS WELCOME SYSTEM
// =====================

const SYSTEM_EMAILJS_CONFIG = {
    serviceId: 'YOUR_SERVICE_ID', // e.g. service_xxxxxx
    templateId: 'YOUR_TEMPLATE_ID', // e.g. template_xxxxxx
    publicKey: 'YOUR_PUBLIC_KEY' // e.g. xxxxxxxxxxxxxxxx
};

/**
 * Sends a welcome email containing a direct login link to new users.
 */
async function sendWelcomeEmail(userName, userEmail, shopName) {
    if (!SYSTEM_EMAILJS_CONFIG.serviceId || SYSTEM_EMAILJS_CONFIG.serviceId === 'YOUR_SERVICE_ID') {
        console.warn('Welcome Email skipped: EmailJS config is missing in auth.js');
        return false;
    }
    
    if (typeof emailjs === 'undefined') {
        console.warn('Welcome Email skipped: EmailJS SDK is not loaded.');
        return false;
    }

    try {
        emailjs.init({ publicKey: SYSTEM_EMAILJS_CONFIG.publicKey });

        // Construct the direct login link automatically based on current domain layout
        const baseUrl = window.location.origin + window.location.pathname.replace(/\/([^\/]*)$/, '');
        const loginLink = `${baseUrl}/login.html?email=${encodeURIComponent(userEmail)}`;

        const response = await emailjs.send(
            SYSTEM_EMAILJS_CONFIG.serviceId,
            SYSTEM_EMAILJS_CONFIG.templateId,
            {
                to_email: userEmail,
                to_name: userName,
                shop_name: shopName,
                login_link: loginLink
            }
        );
        console.log('Welcome email dispatched successfully:', response.status);
        return true;
    } catch (err) {
        console.error('Failed to send welcome email:', err.text || err.message || err);
        return false;
    }
}

// =====================
// AUTH ACTIONS
// =====================

/**
 * Register a new user.
 * @returns {{ success: boolean, error?: string }}
 */
async function registerUser({ name, email, password, shopName }) {
    const users = getUsers();

    // Check email uniqueness (case-insensitive)
    const exists = users.some(u => u.email.toLowerCase() === email.toLowerCase());
    if (exists) {
        return { success: false, error: 'An account with this email already exists.' };
    }

    const hashed = await hashPassword(password);
    const newUser = {
        id: 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
        name: name.trim(),
        shopName: (shopName || name).trim(),
        email: email.toLowerCase().trim(),
        password: hashed,
        role: 'user',   // always 'user' for self-registration
        createdAt: new Date().toISOString()
    };

    users.push(newUser);
    saveUsers(users);

    return { success: true };
}

/**
 * Authenticate a user by email + password.
 * @returns {{ success: boolean, user?: object, error?: string }}
 */
async function loginUser({ email, password }) {
    const users = getUsers();
    const found = users.find(u => u.email.toLowerCase() === email.toLowerCase().trim());
    if (!found) {
        return { success: false, error: 'No account found with this email.' };
    }

    const hashed = await hashPassword(password);
    if (found.password !== hashed) {
        return { success: false, error: 'Incorrect password. Please try again.' };
    }

    // Store session — include role, exclude password
    const session = { id: found.id, name: found.name, email: found.email, role: found.role };
    setCurrentUser(session);
    return { success: true, user: session };
}

/**
 * Log out the current user and redirect to login.
 */
function logoutUser() {
    clearCurrentUser();
    window.location.href = 'login.html';
}

// =====================
// AUTH GUARDS
// =====================

/**
 * Protects any page from unauthenticated access.
 * Redirects to login.html if no session exists.
 */
function requireAuth() {
    if (!getCurrentUser()) {
        window.location.href = 'login.html';
    }
}

/**
 * Protects admin-only pages.
 * Redirects:
 *   - No session    → login.html
 *   - Non-admin     → dashboard.html
 */
function requireAdmin() {
    const user = getCurrentUser();
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    if (user.role !== 'admin') {
        window.location.href = 'dashboard.html';
    }
}

/**
 * Redirects already-logged-in users away from login/signup pages.
 * Admins go to admin.html, regular users to dashboard.html.
 */
function redirectIfLoggedIn() {
    const user = getCurrentUser();
    if (!user) return;
    window.location.href = user.role === 'admin' ? 'admin.html' : 'dashboard.html';
}

// =====================
// EMAIL MASKING (Privacy)
// =====================

/**
 * Masks an email address for display in the admin panel.
 * john.doe@gmail.com  →  jo***@gmail.com
 * a@b.com             →  a***@b.com
 */
function maskEmail(email) {
    if (!email || !email.includes('@')) return '***';
    const [local, domain] = email.split('@');
    const visible = local.length > 2 ? local.slice(0, 2) : local.slice(0, 1);
    return `${visible}***@${domain}`;
}

// =====================
// ANALYTICS HELPERS
// =====================

/** Default analytics structure */
function defaultAnalytics() {
    return {
        totalItemsTracked: 0,
        categoryCounts: {
            medicine: 0,
            dairy: 0,
            vegetables: 0,
            fruits: 0,
            snacks: 0,
            vitamins: 0,
            other: 0
        },
        expiredItems: 0,
        expiringSoon: 0,
        totalMedicines: 0,
        totalGroceries: 0
    };
}

/** Read aggregated analytics from localStorage */
function getAnalytics() {
    try {
        const stored = JSON.parse(localStorage.getItem(ANALYTICS_KEY));
        // Merge with default to handle missing fields from older versions
        return stored ? { ...defaultAnalytics(), ...stored, categoryCounts: { ...defaultAnalytics().categoryCounts, ...(stored.categoryCounts || {}) } } : defaultAnalytics();
    } catch {
        return defaultAnalytics();
    }
}

/** Persist analytics to localStorage */
function saveAnalytics(analytics) {
    localStorage.setItem(ANALYTICS_KEY, JSON.stringify(analytics));
}

/**
 * Rebuilds the aggregated analytics object by scanning ALL items_user_* keys.
 * This is the ONLY function that reads per-user item keys — it only produces
 * counts, never exposing raw item data elsewhere.
 *
 * Call after every add / update / delete in script.js.
 */
function rebuildAnalytics() {
    const analytics = defaultAnalytics();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Scan every key in localStorage for items_user_* pattern
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith('items_user_')) continue;

        let userItems = [];
        try { userItems = JSON.parse(localStorage.getItem(key)) || []; }
        catch { continue; }

        userItems.forEach(item => {
            analytics.totalItemsTracked++;

            // Category counts
            const cat = item.category || 'other';
            if (analytics.categoryCounts[cat] !== undefined) {
                analytics.categoryCounts[cat]++;
            } else {
                analytics.categoryCounts.other++;
            }

            // Medicine / grocery split
            if (cat === 'medicine' || cat === 'vitamins') {
                analytics.totalMedicines++;
            } else if (['dairy', 'vegetables', 'fruits', 'snacks'].includes(cat)) {
                analytics.totalGroceries++;
            }

            // Expiry status
            if (item.expiryDate) {
                const exp = new Date(item.expiryDate);
                exp.setHours(0, 0, 0, 0);
                const diffDays = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
                if (diffDays < 0) {
                    analytics.expiredItems++;
                } else if (diffDays <= 3) {
                    analytics.expiringSoon++;
                }
            }
        });
    }

    saveAnalytics(analytics);
    return analytics;
}
