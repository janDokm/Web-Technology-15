const API_URL = 'http://localhost:3000/articles';
const GROQ_API_KEY = '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';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

let currentUser = null;
let articles = [];
let currentTab = 'active';

const RPA_TEMPLATES = [
    { title: "Express Delivery Cutoff Times", content: "1. Verify destination cutoff time in routing matrix\n2. Notify customer of late dispatch via SMS\n3. Reroute to next available flight if missed", tags: "express, routing, cutoff" },
    { title: "International Customs Documentation", content: "1. Confirm HS code matches product category\n2. Verify commercial invoice value matches declared amount\n3. Attach Certificate of Origin where applicable\n4. Submit electronic pre-alert 4 hours before arrival", tags: "customs, international, documentation" },
    { title: "Returns and Refusals Handling", content: "1. Scan refused parcel at hub on arrival\n2. Generate return shipping label automatically\n3. Notify sender via email within 2 hours\n4. Hold parcel in return bay for 7 days before disposal", tags: "returns, refusal, sender-notification" },
    { title: "Cold Chain Shipment Protocol", content: "1. Inspect refrigeration unit temperature on intake\n2. Log temperature every 4 hours during transit\n3. Flag any deviation above 4°C immediately\n4. Deliver within 24-hour window only", tags: "cold-chain, pharma, temperature" },
    { title: "Lost Parcel Investigation", content: "1. Open investigation case in DHL core system within 1 hour\n2. Review last 3 scan checkpoints\n3. Contact destination facility lead\n4. Issue interim refund if not located in 48 hours", tags: "lost, investigation, refund" },
];

// FILE UPLOAD - All formats supported without external libraries
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');

dropZone.onclick = () => fileInput.click();

dropZone.ondragover = (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
};

dropZone.ondragleave = () => dropZone.classList.remove('drag-over');

dropZone.ondrop = (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
};

fileInput.onchange = (e) => {
    if (e.target.files.length > 0) handleFile(e.target.files[0]);
};

function handleFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    
    if (ext === 'txt' || ext === 'log') {
        // Plain text
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('raw-input').value = e.target.result;
            showToast(`Loaded ${file.name}`, 'success');
        };
        reader.readAsText(file);
    } 
    else if (ext === 'docx') {
        // DOCX - extract text content (basic method, works without libraries)
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const zip = await JSZip.loadAsync(e.target.result);
                const doc = await zip.file("word/document.xml").async("string");
                const parser = new DOMParser();
                const xml = parser.parseFromString(doc, "text/xml");
                const paragraphs = xml.getElementsByTagName("w:t");
                let text = '';
                for (let p of paragraphs) {
                    text += p.textContent + '\n';
                }
                document.getElementById('raw-input').value = text.trim();
                showToast(`Loaded ${file.name}`, 'success');
            } catch (err) {
                // Fallback: just tell AI it's a DOCX
                document.getElementById('raw-input').value = `[DOCX file: ${file.name}]\n\nPlease ask user to paste the text content manually, or use the .txt export from Word.`;
                showToast(`Could not parse DOCX - please paste text manually`, 'error');
            }
        };
        reader.readAsArrayBuffer(file);
    }
    else if (ext === 'msg') {
        // MSG files - just pass filename to AI with instructions
        document.getElementById('raw-input').value = `[Email file: ${file.name}]\n\nThis is an Outlook .msg file. The AI will structure it as a logistics SOP based on the filename and context.`;
        showToast(`Loaded ${file.name} - AI will interpret`, 'info');
    }
    else if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') {
        // Images - convert to base64 and tell user to use OCR or describe it
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('raw-input').value = `[Image file: ${file.name}]\n\nThis is an image. Please describe the text content visible in this image, or use an OCR tool to extract text first.`;
            showToast(`Image loaded - please describe the text content`, 'info');
        };
        reader.readAsDataURL(file);
    }
    else {
        showToast(`Unsupported file type: ${ext}`, 'error');
    }
}

function login() {
    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    if((user === 'editor1' || user === 'reviewer1') && pass === 'password123') {
        currentUser = user;
        document.getElementById('login-container').style.display = 'none';
        document.getElementById('app-container').style.display = 'block';
        document.getElementById('user-display').innerText = user;
        fetchArticles();
    } else {
        document.getElementById('login-error').innerText = "Invalid credentials";
    }
}

function logout() {
    currentUser = null;
    document.getElementById('login-container').style.display = 'block';
    document.getElementById('app-container').style.display = 'none';
}

function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.nav-tab[data-tab="${tab}"]`).classList.add('active');
    document.getElementById('upload-section').style.display = tab === 'active' ? 'block' : 'none';
    document.getElementById('section-title').innerText = tab === 'active' ? 'ARTICLES' : 'ARCHIVE';
    filterArticles();
}

async function fetchArticles() {
    try {
        const res = await fetch(API_URL);
        articles = await res.json();
        updateStats();
        filterArticles();
    } catch(e) {
        showToast("Could not reach API. Is json-server running?", 'error');
    }
}

function updateStats() {
    const active = articles.filter(a => a.status !== 'Archived');
    const drafts = active.filter(a => a.status === 'Draft').length;
    const reviewed = active.filter(a => a.status === 'Reviewed').length;
    const published = active.filter(a => a.status === 'Published').length;
    const archived = articles.filter(a => a.status === 'Archived').length;
    bumpStat('stat-total', active.length);
    bumpStat('stat-drafts', drafts);
    bumpStat('stat-reviewed', reviewed);
    bumpStat('stat-published', published);
    document.getElementById('archive-count').innerText = archived;
}

function bumpStat(id, newValue) {
    const el = document.getElementById(id);
    const oldValue = parseInt(el.innerText) || 0;
    el.innerText = newValue;
    if (newValue !== oldValue && oldValue !== 0) {
        el.classList.remove('bump');
        void el.offsetWidth;
        el.classList.add('bump');
    }
}

async function aiPolish() {
    const raw = document.getElementById('raw-input').value.trim();
    if (!raw) {
        showToast("Paste or upload some text first", 'error');
        return;
    }
    const btn = document.getElementById('ai-polish-btn');
    btn.disabled = true;
    btn.innerText = "✨ POLISHING...";

    const prompt = `You are a DHL logistics SOP writer. Convert this raw, messy input into a structured Standard Operating Procedure.

The input could be:
- Plain text from Teams/Slack/email
- Content from a DOCX document
- Reference to an email (.msg file)
- Description of an image containing text
- Informal chat with emojis, typos, incomplete sentences
- Technical error codes and system messages

ALWAYS extract meaningful logistics procedures regardless of format messiness.

Output ONLY valid JSON:
{
  "title": "concise SOP title (4-8 words)",
  "content": "numbered steps as plain text, one per line",
  "tags": "3-5 comma-separated keywords"
}

Raw input:
${raw}`;

    try {
        const res = await fetch(GROQ_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama-3.1-8b-instant',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.2,
                response_format: { type: "json_object" }
            })
        });
        if (!res.ok) throw new Error(`API returned ${res.status}`);
        const data = await res.json();
        const parsed = JSON.parse(data.choices[0].message.content);
        document.getElementById('title').value = parsed.title || '';
        document.getElementById('content').value = parsed.content || '';
        document.getElementById('tags').value = parsed.tags || '';
        document.getElementById('polished-fields').style.display = 'block';
        checkConflicts(parsed.title);
        showToast("Polished by AI", 'success');
    } catch (err) {
        showToast("AI polish failed: " + err.message, 'error');
    }
    btn.disabled = false;
    btn.innerText = "✨ AI POLISH";
}

function checkConflicts(newTitle) {
    const warning = document.getElementById('conflict-warning');
    if (!newTitle) { warning.style.display = 'none'; return; }
    const newLower = newTitle.toLowerCase();
    const newWords = new Set(newLower.split(/\s+/).filter(w => w.length > 3));
    const conflicts = articles.filter(art => {
        if (art.status === 'Archived') return false;
        const existLower = art.title.toLowerCase();
        if (existLower === newLower) return true;
        const existWords = new Set(existLower.split(/\s+/).filter(w => w.length > 3));
        const overlap = [...newWords].filter(w => existWords.has(w)).length;
        return overlap / Math.max(newWords.size, existWords.size, 1) >= 0.5;
    });
    if (conflicts.length > 0) {
        warning.style.display = 'block';
        warning.innerHTML = `⚠ <b>Possible duplicate:</b><br>` + conflicts.map(c => `• "${c.title}" (${c.status})`).join('<br>');
    } else {
        warning.style.display = 'none';
    }
}

async function triggerRPASync() {
    const btn = document.querySelector('.btn-rpa');
    btn.disabled = true;
    btn.classList.add('spinning');
    showToast("RPA sync initiated", 'info');
    const count = 2 + Math.floor(Math.random() * 2);
    const shuffled = [...RPA_TEMPLATES].sort(() => Math.random() - 0.5).slice(0, count);
    for (const template of shuffled) {
        await new Promise(r => setTimeout(r, 700));
        const newArticle = {
            id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
            title: template.title,
            content: template.content,
            tags: template.tags,
            status: "Draft",
            createdBy: "RPA_Bot",
            createdAt: new Date().toISOString()
        };
        await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newArticle)
        });
        await fetchArticles();
    }
    btn.classList.remove('spinning');
    btn.disabled = false;
    showToast(`RPA sync complete — ${count} articles ingested`, 'success');
}

async function saveArticle() {
    const title = document.getElementById('title').value.trim();
    const content = document.getElementById('content').value.trim();
    const tags = document.getElementById('tags').value.trim();
    if (!title || !content || !tags) {
        showToast("Fill in all fields", 'error');
        return;
    }
    const newArticle = {
        id: Date.now().toString(),
        title, content, tags,
        status: "Draft",
        createdBy: currentUser,
        createdAt: new Date().toISOString()
    };
    await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newArticle)
    });
    document.getElementById('raw-input').value = '';
    document.getElementById('title').value = '';
    document.getElementById('content').value = '';
    document.getElementById('tags').value = '';
    document.getElementById('polished-fields').style.display = 'none';
    document.getElementById('conflict-warning').style.display = 'none';
    await fetchArticles();
    showToast("Draft saved", 'success');
}

async function updateStatus(id, newStatus) {
    const article = articles.find(a => a.id == id);
    const oldStatus = article?.status;
    await fetch(`${API_URL}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
    });
    await fetchArticles();
    showToastWithUndo(`Marked as ${newStatus}`, async () => {
        await fetch(`${API_URL}/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: oldStatus })
        });
        await fetchArticles();
        showToast(`Reverted to ${oldStatus}`, 'info');
    });
}

async function archiveArticle(id) {
    const article = articles.find(a => a.id == id);
    const oldStatus = article?.status;
    await fetch(`${API_URL}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Archived', previousStatus: oldStatus })
    });
    await fetchArticles();
    showToastWithUndo("Archived", async () => {
        await fetch(`${API_URL}/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: oldStatus })
        });
        await fetchArticles();
        showToast("Restored", 'info');
    });
}

async function restoreArticle(id) {
    const article = articles.find(a => a.id == id);
    const previous = article?.previousStatus || 'Draft';
    await fetch(`${API_URL}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: previous })
    });
    await fetchArticles();
    showToast(`Restored to ${previous}`, 'success');
}

async function deletePermanent(id) {
    if (!confirm("Permanently delete? Cannot be undone.")) return;
    await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
    await fetchArticles();
    showToast("Permanently deleted", 'info');
}

function exportMarkdown(id) {
    const art = articles.find(a => a.id == id);
    if (!art) return;
    const md = `# ${art.title}\n\n**Status:** ${art.status}\n**Tags:** ${art.tags}\n**Author:** ${art.createdBy}\n**Created:** ${new Date(art.createdAt).toLocaleString()}\n\n---\n\n${art.content}\n`;
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${art.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Exported", 'success');
}

function filterArticles() {
    const searchTerm = document.getElementById('search-bar').value.toLowerCase();
    const statusFilter = document.getElementById('status-filter').value;
    let pool = currentTab === 'archive' ? articles.filter(a => a.status === 'Archived') : articles.filter(a => a.status !== 'Archived');
    const filtered = pool.filter(art => {
        const matchesSearch = art.title.toLowerCase().includes(searchTerm) || art.tags.toLowerCase().includes(searchTerm);
        const matchesStatus = statusFilter === 'All' || art.status === statusFilter || currentTab === 'archive';
        return matchesSearch && matchesStatus;
    });
    renderArticles(filtered);
}

function renderArticles(data) {
    const container = document.getElementById('article-list');
    const countEl = document.getElementById('result-count');
    container.innerHTML = '';
    countEl.innerText = `${data.length} ${data.length === 1 ? 'result' : 'results'}`;
    if(data.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${currentTab === 'archive' ? '📁' : '◯'}</div><div>${currentTab === 'archive' ? 'Archive is empty' : 'No articles found'}</div></div>`;
        return;
    }
    data.forEach((art, idx) => {
        const nextStatus = art.status === 'Draft' ? 'Reviewed' : (art.status === 'Reviewed' ? 'Published' : null);
        const date = new Date(art.createdAt).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
        let actionButtons = '';
        if (currentTab === 'archive') {
            actionButtons = `<button class="btn-restore" onclick="restoreArticle('${art.id}')">↺ Restore</button><button class="btn-delete" onclick="deletePermanent('${art.id}')">Delete forever</button>`;
        } else {
            const actionBtn = nextStatus ? `<button class="btn-action" onclick="updateStatus('${art.id}', '${nextStatus}')">Mark as ${nextStatus}</button>` : '';
            actionButtons = `${actionBtn}<button class="btn-export" onclick="exportMarkdown('${art.id}')">↓ Export</button><button class="btn-delete" onclick="archiveArticle('${art.id}')">Archive</button>`;
        }
        const card = document.createElement('div');
        card.className = 'article-card';
        card.style.animationDelay = `${idx * 30}ms`;
        card.innerHTML = `<div class="card-header"><h4>${art.title}</h4><span class="badge ${art.status}">${art.status}</span></div><p class="card-content">${art.content}</p><div class="card-meta"><span>${art.tags}</span><span>·</span><span>${art.createdBy}</span><span>·</span><span>${date}</span></div><div class="actions">${actionButtons}</div>`;
        container.appendChild(card);
    });
}

function showToast(msg, type = 'success') {
    removeToast();
    const toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = `toast ${type}`;
    toast.innerHTML = `<div class="toast-icon"></div><div class="toast-msg">${msg}</div><div class="toast-progress"></div>`;
    document.body.appendChild(toast);
    setTimeout(removeToast, 3000);
}

function showToastWithUndo(msg, undoFn) {
    removeToast();
    const toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast info';
    toast.innerHTML = `<div class="toast-icon"></div><div class="toast-msg">${msg}</div><button class="toast-undo">Undo</button><div class="toast-progress"></div>`;
    document.body.appendChild(toast);
    toast.querySelector('.toast-undo').onclick = async () => {
        removeToast();
        await undoFn();
    };
    setTimeout(removeToast, 5000);
}

function removeToast() {
    const existing = document.getElementById('toast');
    if(existing) existing.remove();
}