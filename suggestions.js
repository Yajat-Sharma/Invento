// ===== FreshAlert — suggestions.js =====

// Per-user item key (auth.js provides getCurrentUser)
const API_KEY_STORAGE = 'freshalert_gemini_key';

function getItems() {
    try {
        const user = getCurrentUser();
        const key = user ? ('items_user_' + user.id) : 'items_user_guest';
        return JSON.parse(localStorage.getItem(key)) || [];
    } catch {
        return [];
    }
}

// Reusing expiry logic from main script
function getExpiryDaysDiff(expiryDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDate);
    expiry.setHours(0, 0, 0, 0);
    return Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
}

// =====================
// 2. AI SIMULATION & INTEGRATION LOGIC
// =====================

/**
 * Main function invoked to process items and fetch AI data.
 */
async function generateAISuggestions() {
    const items = getItems();

    // Filter items expiring soon (<= 3 days) or already expired
    const urgentItems = items.filter(item => {
        const diff = getExpiryDaysDiff(item.expiryDate);
        return diff <= 5; // broad enough to grab some data
    });

    // Handle Empty State
    if (urgentItems.length === 0) {
        showUIState('empty');
        return;
    }

    // Check for API Key
    const apiKey = "AIzaSyC1EYftZj7GxFbgxCX2UkXRTXX-Dp0hhbA";
    if (!apiKey) {
        document.getElementById('aiErrorMessage').textContent = "Google Gemini API Key is missing. Please enter it in the settings.";
        showUIState('error');
        document.getElementById('apiModal').style.display = 'flex';
        return;
    }

    // Prepare Prompt
    const promptText = buildPrompt(urgentItems);
    console.log("SENDING TO AI API:\n", promptText);

    showUIState('loading');

    try {
        const aiResponse = await fetchAISuggestions(promptText, apiKey);
        renderAIResponse(aiResponse);
        showUIState('content');
    } catch (error) {
        console.error("AI API Error:", error);

        // If the error is a quota/rate limit error, gracefully fall back to our built-in simulation
        if (error.message.includes("quota") || error.message.includes("rate") || error.message.toLowerCase().includes("exceeded")) {
            console.warn("API Quota exceeded. Falling back to local AI simulation logic.");

            try {
                const fallbackResponse = await mockAiJSONApi(urgentItems);
                fallbackResponse.insights.unshift("⚠️ *Running in Offline Simulation Mode due to API Quota Limits.*");
                renderAIResponse(fallbackResponse);
                showUIState('content');
            } catch (fallbackError) {
                document.getElementById('aiErrorMessage').innerHTML = `Error: ${fallbackError.message}`;
                showUIState('error');
            }
        } else {
            document.getElementById('aiErrorMessage').innerHTML = `Error fetching from AI: ${error.message} <br> Make sure your API key is valid.`;
            showUIState('error');
        }
    }
}

/**
 * Intelligent Mock Function that mimics an LLM parsing the prompt to JSON.
 */
function mockAiJSONApi(items) {
    return new Promise((resolve) => {
        setTimeout(() => {
            const insights = [];
            const suggestions = [];

            let dairyCount = 0;
            let vegCount = 0;

            items.forEach(item => {
                const nameLow = item.name.toLowerCase();
                const diff = getExpiryDaysDiff(item.expiryDate);

                // Track for insights
                if (item.category === 'dairy') dairyCount++;
                if (item.category === 'vegetables') vegCount++;

                // Build suggestion logic based on name heuristics
                let emoji = "📦";
                let action = `Consider consuming this ${item.category} item soon to prevent waste.`;

                if (nameLow.includes('milk')) { emoji = "🥛"; action = "Blend into a smoothie, make pancakes, or use in a creamy pasta sauce."; }
                else if (nameLow.includes('banana')) { emoji = "🍌"; action = "Bake banana bread, freeze for smoothies, or top your morning oatmeal."; }
                else if (nameLow.includes('bread')) { emoji = "🍞"; action = "Make french toast, croutons, or freeze the slices for later use."; }
                else if (nameLow.includes('egg')) { emoji = "🥚"; action = "Boil them for salads, make an omelette, or bake a quiche."; }
                else if (item.category === 'vegetables') { emoji = "🥦"; action = "Chop and roast them for a side dish, or blend them into a healthy soup base."; }
                else if (item.category === 'medicine' || item.category === 'vitamins') { emoji = "💊"; action = "Safely dispose of this if expired, or ensure you take your required doses."; }

                let statusBadge = diff < 0 ? "Already Expired" : (diff === 0 ? "Expires Today" : `Expires in ${diff} Days`);
                let badgeClass = diff <= 0 ? "danger" : "warning";

                suggestions.push({
                    itemName: item.name,
                    emoji: emoji,
                    expiryStatus: statusBadge,
                    badgeClass: badgeClass,
                    suggestion: action
                });
            });

            // Generate overall insights
            if (dairyCount > 0) insights.push(`You have ${dairyCount} dairy item(s) expiring soon. Consider a milk-heavy recipe today.`);
            if (vegCount > 0) insights.push(`Use your vegetables in a stir-fry or soup before they lose their freshness.`);
            if (items.length > 3) insights.push(`Multiple items are reaching their limits. Prioritize items marked as 'Expires Today'.`);
            if (insights.length === 0) insights.push("Try combining some of your soon-to-expire items into a single meal!");

            resolve({
                insights: insights,
                suggestions: suggestions
            });
        }, 1200);
    });
}

/**
 * Formats inventory array into a string prompt
 */
function buildPrompt(items) {
    let inventoryText = "User Inventory:\n\n";
    items.forEach(i => {
        const diff = getExpiryDaysDiff(i.expiryDate);
        let status = diff < 0 ? `expired ${Math.abs(diff)} days ago` : (diff === 0 ? "expires today" : `expires in ${diff} days`);
        inventoryText += `${i.name} - ${status}\n`;
    });

    return `${inventoryText}
Generate helpful suggestions for consuming these items before expiry.
Suggest recipes or actions.

You MUST return the response ONLY as a raw JSON object exactly matching this structure. Do not include markdown codeblocks (\`\`\`json) or any other conversational text:
{
   "insights": [
       "You have many dairy items expiring soon.",
       "You should consume vegetables today to avoid waste."
   ],
   "suggestions": [
       { "itemName": "Milk", "emoji": "🥛", "expiryStatus": "Expires Tomorrow", "suggestion": "Make pancakes or milkshake." },
       { "itemName": "Bananas", "emoji": "🍌", "expiryStatus": "Expires Today", "suggestion": "Make banana smoothie." }
   ]
}`;
}

/**
 * Fetches data from Google Gemini API
 */
async function fetchAISuggestions(prompt, apiKey) {
    // using gemini-2.5-flash as it's the standard fast model
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [{
                parts: [{ text: prompt }]
            }],
            generationConfig: {
                temperature: 0.4,
            }
        })
    });

    if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error?.message || "Failed to fetch from Gemini API");
    }

    const data = await response.json();
    let textResponse = data.candidates[0].content.parts[0].text;

    // Clean up potential markdown formatting from the AI
    textResponse = textResponse.replace(/```json\n/gi, '').replace(/```\n?/g, '').trim();

    return JSON.parse(textResponse);
}

// =====================
// 3. UI RENDERING LOGIC
// =====================

function showUIState(state) {
    document.getElementById('aiLoader').style.display = 'none';
    document.getElementById('aiContent').style.display = 'none';
    document.getElementById('aiEmptyState').style.display = 'none';
    document.getElementById('aiErrorState').style.display = 'none';

    switch (state) {
        case 'loading': document.getElementById('aiLoader').style.display = 'flex'; break;
        case 'content': document.getElementById('aiContent').style.display = 'block'; break;
        case 'empty': document.getElementById('aiEmptyState').style.display = 'flex'; break;
        case 'error': document.getElementById('aiErrorState').style.display = 'flex'; break;
    }
}

function renderAIResponse(data) {
    // Render Insights
    const insightsList = document.getElementById('insightsList');
    insightsList.innerHTML = data.insights.map(i => `<li>${i}</li>`).join('');

    // Render Cards
    const suggestionsList = document.getElementById('suggestionsList');
    suggestionsList.innerHTML = data.suggestions.map((sg, idx) => {
        let badgeClass = sg.expiryStatus.toLowerCase().includes('today') || sg.expiryStatus.toLowerCase().includes('already') ? 'danger' : 'warning';
        return `
        <div class="suggestion-card card-enter" style="animation-delay: ${idx * 0.15}s">
            <div class="card-header">
                <div class="item-info">
                    <h4>${escapeHtml(sg.itemName)}</h4>
                    <span class="item-expiry ${badgeClass}">${sg.expiryStatus}</span>
                </div>
                <div class="card-icon">${sg.emoji}</div>
            </div>
            <div class="card-body">
                <div class="ai-tag">✨ AI Suggestion</div>
                <p>"${escapeHtml(sg.suggestion)}"</p>
            </div>
        </div>
        `;
    }).join('');

    // Attach 3D tilt effects to the newly rendered cards
    setTimeout(() => {
        attach3DTiltToCards();
    }, 100);
}

// =====================
// 4. EVENT LISTENERS
// =====================

document.getElementById('refreshAiBtn')?.addEventListener('click', () => {
    generateAISuggestions();
});

// Theme Toggle
const themeToggleBtn = document.getElementById('themeToggle');
if (themeToggleBtn) {
    if (localStorage.getItem('freshalert_theme') === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        themeToggleBtn.textContent = '☀️';
    }

    themeToggleBtn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('freshalert_theme', next);
        themeToggleBtn.textContent = next === 'dark' ? '☀️' : '🌙';
    });
}

// API Key Modal Logic
const apiModal = document.getElementById('apiModal');
const apiKeyInput = document.getElementById('geminiApiKeyInput');
const saveApiBtn = document.getElementById('saveApiBtn');

document.getElementById('apiSettingsBtn')?.addEventListener('click', () => {
    if (apiKeyInput) apiKeyInput.value = localStorage.getItem(API_KEY_STORAGE) || '';
    apiModal.style.display = 'flex';
});

document.getElementById('closeApiModal')?.addEventListener('click', () => apiModal.style.display = 'none');

if (saveApiBtn && apiKeyInput) {
    saveApiBtn.addEventListener('click', () => {
        const newKey = apiKeyInput.value.trim();
        if (newKey) {
            localStorage.setItem(API_KEY_STORAGE, newKey);
            apiModal.style.display = 'none';
            generateAISuggestions(); // Re-trigger the generation now that we have a key
        }
    });
}

// Utility to prevent XSS from LLM output
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// =====================
// 5. ANTI-GRAVITY UI LOGIC
// =====================

/**
 * Initializes the background particle system
 */
function initParticles() {
    const container = document.getElementById('particles-bg');
    if (!container) return;

    const particleCount = 20;
    for (let i = 0; i < particleCount; i++) {
        const p = document.createElement('div');
        p.className = 'particle';

        // Randomize
        const size = Math.random() * 4 + 2; // 2px to 6px
        p.style.width = `${size}px`;
        p.style.height = `${size}px`;
        p.style.left = `${Math.random() * 100}vw`;

        // Randomize animation
        const duration = Math.random() * 10 + 10; // 10s to 20s
        const delay = Math.random() * 10;
        p.style.animationDuration = `${duration}s`;
        p.style.animationDelay = `-${delay}s`; // start midway

        container.appendChild(p);
    }
}

/**
 * Attaches 3D Tilt Effect to drawn cards
 */
function attach3DTiltToCards() {
    const cards = document.querySelectorAll('.suggestion-card');

    cards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left; // x position within the element
            const y = e.clientY - rect.top;  // y position within the element

            const centerX = rect.width / 2;
            const centerY = rect.height / 2;

            // Calculate rotation (max 10 degrees)
            const rotateX = ((y - centerY) / centerY) * -10;
            const rotateY = ((x - centerX) / centerX) * 10;

            // Apply combining the tilt with a slight scale up
            // Note: since the card also has a CSS continuous animation 'card-float', 
            // the continuous css animation 'transform' gets overridden by inline style while hovering.
            // This actually looks cool as it pauses the float and locks onto the mouse.
            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
        });

        card.addEventListener('mouseleave', () => {
            // Reset style so CSS animations take back over
            card.style.transform = '';
        });
    });
}

/**
 * Parallax effect for Background Icons
 */
function initParallax() {
    const icons = document.querySelectorAll('.float-icon');
    if (icons.length === 0) return;

    document.addEventListener('mousemove', (e) => {
        const xAxis = (window.innerWidth / 2 - e.pageX) / 40;
        const yAxis = (window.innerHeight / 2 - e.pageY) / 40;

        icons.forEach((icon, index) => {
            const speed = (index + 1) * 0.5;
            // Translate the icons slightly.
            // They have innate CSS animations, but shifting their margins or absolute left/top
            // is safer so we don't conflict with CSS transform.
            icon.style.marginLeft = `${xAxis * speed}px`;
            icon.style.marginTop = `${yAxis * speed}px`;
        });
    });
}


// Initialize on page load (Wait for DOM to be fully loaded)
document.addEventListener('DOMContentLoaded', () => {
    generateAISuggestions();
    initParticles();
    initParallax();
});

