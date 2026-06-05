// Initialize Supabase
const SUPABASE_URL = "https://qkvywqgnnfmgcbozaeqc.supabase.co"
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_KoLXhGkTKB6kM70cnKZxyw_y_ZQQvCO"
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// DOM Elements
const loginSection = document.getElementById('login-section');
const dashboardSection = document.getElementById('dashboard-section');
const loginForm = document.getElementById('loginForm');
const tableBody = document.getElementById('tableBody');
const loginError = document.getElementById('loginError');
const totalCountEl = document.getElementById('totalCount');
const newCountEl = document.getElementById('newCount');
const sidebar = document.getElementById('sidebar');
const menuToggle = document.getElementById('menuToggle');
const togglePasswordBtn = document.getElementById('togglePassword');
const adminPasswordInput = document.getElementById('adminPassword');
const adminEmailDisplay = document.getElementById('adminEmailDisplay');

const refreshReBtn = document.querySelector('.refreshReBtn')


refreshReBtn.addEventListener('click',fetchRegistrations)
// Global Chart Instances
let domainsChart = null;
let experienceChart = null;

/**
 * SECURITY: XSS Prevention
 */
function escapeHTML(str) {
    if (!str) return "";
    const p = document.createElement("p");
    p.textContent = str;
    return p.innerHTML;
}

// --- INITIALIZATION ---

window.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        showDashboard(session.user.email);
    }
    
    if (window.lucide) lucide.createIcons();
    initNavigation();
});

// --- NAVIGATION (SPA) ---

function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const pages = document.querySelectorAll('.dashboard-page');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const pageId = item.getAttribute('data-page');
            
            // Update Sidebar UI
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            // Switch Page
            pages.forEach(p => p.classList.remove('active'));
            document.getElementById(pageId).classList.add('active');

            // Mobile sidebar behavior
            if (window.innerWidth <= 1024) {
                sidebar.classList.remove('open');
            }
        });
    });
}

// --- AUTHENTICATION ---

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('adminEmail').value;
    const password = adminPasswordInput.value;
    const btn = document.getElementById('loginBtn');
    
    btn.disabled = true;
    btn.innerHTML = `<span>Connexion...</span>`;
    loginError.textContent = "";

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
        loginError.textContent = "Identifiants incorrects.";
        btn.disabled = false;
        btn.innerHTML = `<span>Se connecter</span>`;
    } else {
        showDashboard(data.user.email);
    }
});

togglePasswordBtn.addEventListener('click', () => {
    const type = adminPasswordInput.getAttribute('type') === 'password' ? 'text' : 'password';
    adminPasswordInput.setAttribute('type', type);
    const icon = togglePasswordBtn.querySelector('i');
    icon.setAttribute('data-lucide', type === 'password' ? 'eye' : 'eye-off');
    lucide.createIcons();
});

window.logout = async function() {
    if (!confirm("Voulez-vous vraiment vous déconnecter ?")) return;
    await supabaseClient.auth.signOut();
    location.reload(); // Refresh to clear all states
};

// --- DASHBOARD LOGIC ---

async function showDashboard(email) {
    loginSection.classList.add('hidden');
    dashboardSection.classList.remove('hidden');
    adminEmailDisplay.textContent = email;
    
    if (window.lucide) lucide.createIcons();
    await fetchRegistrations();
}

menuToggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
});

// Fetch Data
async function fetchRegistrations() {
    tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 40px;">Chargement des données...</td></tr>`;

    const { data, error } = await supabaseClient
        .from('registrations')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Erreur:", error);
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--danger); padding: 40px;">Erreur lors du chargement.</td></tr>`;
        return;
    }

    updateStats(data);
    renderTable(data);
    initCharts(data);
}

function updateStats(data) {
    totalCountEl.textContent = data.length;
    const now = new Date();
    const last24h = data.filter(row => (now - new Date(row.created_at)) < (24 * 60 * 60 * 1000));
    newCountEl.textContent = last24h.length;
}

function renderTable(data) {
    tableBody.innerHTML = "";
    if (data.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 40px;">Aucune inscription.</td></tr>`;
        return;
    }

    data.forEach(row => {
        const dateObj = new Date(row.created_at);
        const domainsHtml = row.domaines.map(d => `<span class="badge badge-info">${escapeHTML(d)}</span>`).join(' ');

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="Candidat"><div class="user-info"><span class="user-name">${escapeHTML(row.nom)}</span></div></td>
            <td data-label="Contact"><div class="user-info"><span class="user-email">${escapeHTML(row.email)}</span><span style="font-size: 0.75rem; color: var(--text-muted);">${escapeHTML(row.phone)}</span></div></td>
            <td data-label="Domaines">${domainsHtml}</td>
            <td data-label="Expérience">${row.experience === 'oui' ? '<span class="badge badge-success">Oui</span>' : '<span class="badge badge-danger">Non</span>'}</td>
            <td data-label="Date"><div style="display: flex; flex-direction: column;"><span>${dateObj.toLocaleDateString('fr-FR')}</span><span style="font-size: 0.75rem; color: var(--text-muted);">${dateObj.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})}</span></div></td>
            <td data-label="Actions"><button class="btn-icon" onclick="deleteRecord('${row.id}')"><i data-lucide="trash-2" style="width: 16px;"></i></button></td>
        `;
        tableBody.appendChild(tr);
    });
    if (window.lucide) lucide.createIcons();
}

// --- ANALYTICS (CHART.JS) ---

function initCharts(data) {
    if (!window.Chart) return;

    // 1. Process Domains Data
    const domainCounts = {};
    data.forEach(row => {
        row.domaines.forEach(d => {
            domainCounts[d] = (domainCounts[d] || 0) + 1;
        });
    });

    // 2. Process Experience Data
    const expCounts = { 'Oui': 0, 'Non': 0 };
    data.forEach(row => {
        const key = row.experience === 'oui' ? 'Oui' : 'Non';
        expCounts[key]++;
    });

    // DOMAINS CHART
    if (domainsChart) domainsChart.destroy();
    const ctxD = document.getElementById('domainsChart').getContext('2d');
    domainsChart = new Chart(ctxD, {
        type: 'bar',
        data: {
            labels: Object.keys(domainCounts),
            datasets: [{
                label: 'Inscriptions',
                data: Object.values(domainCounts),
                backgroundColor: '#2563eb',
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, grid: { color: '#e2e8f0' } }, x: { grid: { display: false } } }
        }
    });

    // EXPERIENCE CHART
    if (experienceChart) experienceChart.destroy();
    const ctxE = document.getElementById('experienceChart').getContext('2d');
    experienceChart = new Chart(ctxE, {
        type: 'doughnut',
        data: {
            labels: Object.keys(expCounts),
            datasets: [{
                data: Object.values(expCounts),
                backgroundColor: ['#10b981', '#ef4444'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } }
        }
    });
}

window.deleteRecord = async function(id) {
    if(!confirm("⚠️ Confirmer la suppression ?")) return;
    const { error } = await supabaseClient.from('registrations').delete().eq('id', id);
    if (error) alert("Erreur."); else await fetchRegistrations();
};
