/* ==========================================================================
   MedTrack — Medical Inventory Tracker
   Single-file application logic (vanilla JavaScript)
   --------------------------------------------------------------------------
   Module layout:
     1.  Constants & state
     2.  Storage layer (localStorage)
     3.  Utilities (id, format, escape, etc.)
     4.  Toast notifications
     5.  Modal manager
     6.  Auth (login / passcode)
     7.  Router / view switching
     8.  Search, sort & filter
     9.  Inventory CRUD
     10. Office CRUD
     11. Renderers (dashboard, inventory, offices)
     12. Data import/export (CSV & JSON)
     13. Settings (passcode change)
     14. App initialization
   ========================================================================== */

(function () {
    'use strict';

    /* ======================================================================
       1. CONSTANTS & STATE
       ====================================================================== */

    const STORAGE_KEY = 'medtrack.v1';
    const DEFAULT_PASSCODE = '1234';

    /**
     * Application state. Mutated through dedicated helpers so changes flow
     * to localStorage and the UI together.
     */
    const state = {
        passcode: DEFAULT_PASSCODE,
        offices: [],            // [{ id, name, address, createdAt }]
        inventory: [],          // [{ id, serialNumber, model, maker, officeId, notes, dateAdded }]
        meta: { lastActivity: null },

        // UI-only (not persisted)
        currentView: 'dashboard',
        officeFilter: 'all',
        sortKey: 'dateAdded-desc',
        searchQuery: '',
    };

    /* ======================================================================
       2. STORAGE LAYER
       ====================================================================== */

    /** Load persisted data from localStorage into `state`. */
    function loadFromStorage() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const data = JSON.parse(raw);

            if (typeof data.passcode === 'string') state.passcode = data.passcode;
            if (Array.isArray(data.offices))      state.offices = data.offices;
            if (Array.isArray(data.inventory))    state.inventory = data.inventory;
            if (data.meta && typeof data.meta === 'object') state.meta = data.meta;
        } catch (err) {
            console.warn('[MedTrack] Failed to read storage:', err);
            toast('Could not read saved data', 'error');
        }
    }

    /** Persist the current state to localStorage. */
    function saveToStorage() {
        try {
            state.meta.lastActivity = new Date().toISOString();
            const payload = {
                passcode: state.passcode,
                offices: state.offices,
                inventory: state.inventory,
                meta: state.meta,
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch (err) {
            console.error('[MedTrack] Failed to save:', err);
            toast('Could not save data — storage may be full', 'error');
        }
    }

    /** Wipe everything and restore defaults. */
    function wipeStorage() {
        localStorage.removeItem(STORAGE_KEY);
        state.passcode = DEFAULT_PASSCODE;
        state.offices = [];
        state.inventory = [];
        state.meta = { lastActivity: null };
        saveToStorage();
    }


    /* ======================================================================
       3. UTILITIES
       ====================================================================== */

    /** Generate a sortable, collision-resistant id. */
    function uid(prefix = 'id') {
        return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    }

    /** ISO date for today (YYYY-MM-DD). */
    function todayISO() {
        const d = new Date();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${d.getFullYear()}-${m}-${day}`;
    }

    /** Format an ISO date as "Mar 14, 2025". */
    function formatDate(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return iso;
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }

    /** Format an ISO timestamp as a friendly relative time. */
    function timeAgo(iso) {
        if (!iso) return '—';
        const then = new Date(iso).getTime();
        const diff = Date.now() - then;
        if (Number.isNaN(diff)) return iso;
        const sec = Math.floor(diff / 1000);
        if (sec < 60) return 'just now';
        const min = Math.floor(sec / 60);
        if (min < 60) return `${min}m ago`;
        const hr = Math.floor(min / 60);
        if (hr < 24) return `${hr}h ago`;
        const day = Math.floor(hr / 24);
        if (day < 7) return `${day}d ago`;
        return formatDate(iso);
    }

    /** Escape arbitrary text for safe HTML insertion. */
    function esc(value) {
        if (value == null) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /** Find an office by id; returns `null` when missing. */
    function getOffice(id) {
        return state.offices.find(o => o.id === id) || null;
    }

    /** Approximate localStorage usage in KB. */
    function getStorageUsage() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY) || '';
            const bytes = new Blob([raw]).size;
            return `${(bytes / 1024).toFixed(1)} KB`;
        } catch {
            return '—';
        }
    }


    /* ======================================================================
       4. TOAST NOTIFICATIONS
       ====================================================================== */

    const ICONS = {
        success: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m22 4-10 10-3-3"/></svg>',
        error:   '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
        warning: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
        info:    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
    };

    /**
     * Show a toast notification.
     * @param {string} message  — main message text
     * @param {('success'|'error'|'warning'|'info')} type
     * @param {string} [title]  — optional bold title above message
     */
    function toast(message, type = 'info', title) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const el = document.createElement('div');
        el.className = `toast ${type}`;
        el.innerHTML = `
            <span class="toast-icon">${ICONS[type] || ICONS.info}</span>
            <div class="toast-content">
                ${title ? `<div class="toast-title">${esc(title)}</div>` : ''}
                <div class="toast-message">${esc(message)}</div>
            </div>
            <button class="toast-close" aria-label="Dismiss">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
        `;

        const remove = () => {
            el.classList.add('leaving');
            setTimeout(() => el.remove(), 200);
        };

        el.querySelector('.toast-close').addEventListener('click', remove);
        container.appendChild(el);
        setTimeout(remove, 3800);
    }


    /* ======================================================================
       5. MODAL MANAGER
       ====================================================================== */

    /** Open a modal by element id. */
    function openModal(id) {
        const modal = document.getElementById(id);
        if (!modal) return;
        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');
        // Autofocus first input
        setTimeout(() => {
            const input = modal.querySelector('input:not([type=hidden]), textarea, select');
            if (input) input.focus();
        }, 30);
    }

    /** Close a modal by element id. */
    function closeModal(id) {
        const modal = document.getElementById(id);
        if (!modal) return;
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
    }

    /** Wire up backdrop-click and [data-close-modal] elements. */
    function initModalDismissals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.querySelectorAll('[data-close-modal]').forEach(btn => {
                btn.addEventListener('click', () => closeModal(modal.id));
            });
        });
        // Escape key closes any open modal
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal.open').forEach(m => closeModal(m.id));
            }
        });
    }

    /**
     * Open a generic confirm dialog.
     * @param {object} opts
     * @param {string} opts.title
     * @param {string} opts.message
     * @param {string} [opts.confirmLabel='Confirm']
     * @param {string} [opts.confirmStyle='btn-danger']
     * @param {Function} opts.onConfirm
     */
    function confirmDialog({ title, message, confirmLabel = 'Confirm', confirmStyle = 'btn-danger', onConfirm }) {
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-message').textContent = message;

        const okBtn = document.getElementById('confirm-ok-btn');
        okBtn.textContent = confirmLabel;
        okBtn.className = `btn ${confirmStyle}`;

        // Replace listener to avoid stacking
        const fresh = okBtn.cloneNode(true);
        okBtn.parentNode.replaceChild(fresh, okBtn);
        fresh.addEventListener('click', () => {
            closeModal('confirm-modal');
            if (typeof onConfirm === 'function') onConfirm();
        });

        openModal('confirm-modal');
    }


    /* ======================================================================
       6. AUTH (LOGIN / PASSCODE)
       ====================================================================== */

    function initAuth() {
        const loginScreen = document.getElementById('login-screen');
        const form = document.getElementById('login-form');
        const input = document.getElementById('passcode-input');
        const dots = document.getElementById('passcode-dots');

        // Update visual dots as user types
        input.addEventListener('input', () => {
            const len = input.value.length;
            dots.querySelectorAll('span').forEach((dot, i) => {
                dot.classList.toggle('filled', i < len);
            });
        });

        // Submit checks passcode
        form.addEventListener('submit', e => {
            e.preventDefault();
            const attempt = input.value.trim();
            if (attempt === state.passcode) {
                unlockApp();
            } else {
                dots.classList.add('shake');
                setTimeout(() => dots.classList.remove('shake'), 450);
                input.value = '';
                dots.querySelectorAll('span').forEach(d => d.classList.remove('filled'));
                toast('Incorrect passcode', 'error');
            }
        });

        // Click anywhere on the card focuses the hidden input
        document.querySelector('.login-card').addEventListener('click', () => input.focus());

        // Logout button locks the app
        document.getElementById('logout-btn').addEventListener('click', lockApp);
    }

    function showLogin() {
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('login-screen').setAttribute('aria-hidden', 'false');
        document.getElementById('app').classList.add('hidden');
        document.getElementById('app').setAttribute('aria-hidden', 'true');
        // Reset input
        const input = document.getElementById('passcode-input');
        input.value = '';
        document.querySelectorAll('#passcode-dots span').forEach(d => d.classList.remove('filled'));
        setTimeout(() => input.focus(), 50);
    }

    function unlockApp() {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('login-screen').setAttribute('aria-hidden', 'true');
        document.getElementById('app').classList.remove('hidden');
        document.getElementById('app').setAttribute('aria-hidden', 'false');
        renderAll();
        toast('Welcome back', 'success');
    }

    function lockApp() {
        showLogin();
    }


    /* ======================================================================
       7. ROUTER / VIEW SWITCHING
       ====================================================================== */

    function initRouter() {
        // Sidebar nav
        document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
            btn.addEventListener('click', () => switchView(btn.dataset.view));
        });
        // "View all" shortcuts (e.g. dashboard → inventory)
        document.querySelectorAll('[data-nav]').forEach(btn => {
            btn.addEventListener('click', () => switchView(btn.dataset.nav));
        });

        // Mobile sidebar toggle
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        document.getElementById('sidebar-toggle').addEventListener('click', () => {
            sidebar.classList.add('open');
            overlay.classList.add('open');
        });
        const closeSidebar = () => {
            sidebar.classList.remove('open');
            overlay.classList.remove('open');
        };
        document.getElementById('sidebar-close').addEventListener('click', closeSidebar);
        overlay.addEventListener('click', closeSidebar);
    }

    function switchView(view) {
        state.currentView = view;

        // Toggle nav active state
        document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === view);
        });

        // Show/hide views
        document.querySelectorAll('.view').forEach(el => {
            el.classList.toggle('hidden', el.id !== `view-${view}`);
        });

        // Re-render for views that depend on filters
        if (view === 'dashboard') renderDashboard();
        if (view === 'inventory') renderInventory();
        if (view === 'offices') renderOffices();
        if (view === 'settings') renderSettings();

        // Close mobile sidebar after navigation
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('sidebar-overlay').classList.remove('open');

        // Scroll to top of view
        document.querySelector('.main').scrollTo({ top: 0, behavior: 'smooth' });
    }


    /* ======================================================================
       8. SEARCH, SORT & FILTER
       ====================================================================== */

    function initSearchAndFilter() {
        const search = document.getElementById('global-search');
        const officeFilter = document.getElementById('office-filter');
        const sortSelect = document.getElementById('sort-select');

        // Real-time search filter
        search.addEventListener('input', () => {
            state.searchQuery = search.value.trim().toLowerCase();
            renderInventory();
            renderDashboard(); // recent list reflects search too
        });

        // Office filter
        officeFilter.addEventListener('change', () => {
            state.officeFilter = officeFilter.value;
            renderAll();
        });

        // Sort
        sortSelect.addEventListener('change', () => {
            state.sortKey = sortSelect.value;
            renderInventory();
        });

        // Press "/" to focus search
        document.addEventListener('keydown', e => {
            if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA' && !document.querySelector('.modal.open')) {
                e.preventDefault();
                search.focus();
            }
        });
    }

    /**
     * Apply current search + office filter + sort to the inventory list.
     * @returns {Array} filtered, sorted inventory
     */
    function getVisibleInventory() {
        let items = state.inventory.slice();

        // Office filter
        if (state.officeFilter !== 'all') {
            items = items.filter(i => i.officeId === state.officeFilter);
        }

        // Search across multiple fields
        const q = state.searchQuery;
        if (q) {
            items = items.filter(i => {
                const office = getOffice(i.officeId);
                return (
                    (i.serialNumber || '').toLowerCase().includes(q) ||
                    (i.model || '').toLowerCase().includes(q) ||
                    (i.maker || '').toLowerCase().includes(q) ||
                    (i.notes || '').toLowerCase().includes(q) ||
                    (office?.name || '').toLowerCase().includes(q)
                );
            });
        }

        // Sort
        const [key, dir] = state.sortKey.split('-');
        const mult = dir === 'desc' ? -1 : 1;
        items.sort((a, b) => {
            const av = (a[key] || '').toString().toLowerCase();
            const bv = (b[key] || '').toString().toLowerCase();
            if (av < bv) return -1 * mult;
            if (av > bv) return 1 * mult;
            return 0;
        });

        return items;
    }


    /* ======================================================================
       9. INVENTORY CRUD
       ====================================================================== */

    function initInventoryActions() {
        // "Add Machine" buttons (multiple locations)
        document.querySelectorAll('[data-action="add-item"]').forEach(btn => {
            btn.addEventListener('click', () => openItemModal());
        });

        // Form submit
        document.getElementById('item-form').addEventListener('submit', e => {
            e.preventDefault();
            handleItemFormSubmit();
        });
    }

    /**
     * Open the add/edit modal.
     * @param {string} [itemId] — when present, edit mode; otherwise add mode.
     */
    function openItemModal(itemId) {
        const isEdit = !!itemId;
        const item = isEdit ? state.inventory.find(i => i.id === itemId) : null;

        if (isEdit && !item) {
            toast('Item not found', 'error');
            return;
        }

        // Title
        document.getElementById('item-modal-title').textContent = isEdit ? 'Edit Machine' : 'Add Machine';
        document.getElementById('item-save-btn').textContent = isEdit ? 'Save Changes' : 'Save Machine';

        // Populate fields
        document.getElementById('item-id').value          = item?.id || '';
        document.getElementById('item-serial').value      = item?.serialNumber || '';
        document.getElementById('item-model').value       = item?.model || '';
        document.getElementById('item-maker').value       = item?.maker || '';
        document.getElementById('item-notes').value       = item?.notes || '';
        document.getElementById('item-date').value        = item?.dateAdded || todayISO();

        // Office dropdown
        const sel = document.getElementById('item-office');
        sel.innerHTML = '<option value="">— Select an office —</option>' +
            state.offices.map(o => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join('');
        sel.value = item?.officeId || (state.officeFilter !== 'all' ? state.officeFilter : '');

        // Guard against no offices
        if (state.offices.length === 0) {
            toast('Create an office first', 'warning');
            switchView('offices');
            return;
        }

        openModal('item-modal');
    }

    function handleItemFormSubmit() {
        const id = document.getElementById('item-id').value;
        const data = {
            serialNumber: document.getElementById('item-serial').value.trim(),
            model:        document.getElementById('item-model').value.trim(),
            maker:        document.getElementById('item-maker').value.trim(),
            officeId:     document.getElementById('item-office').value,
            notes:        document.getElementById('item-notes').value.trim(),
            dateAdded:    document.getElementById('item-date').value || todayISO(),
        };

        // Validation
        if (!data.serialNumber || !data.model || !data.maker || !data.officeId) {
            toast('Please fill in all required fields', 'warning');
            return;
        }

        // Check for duplicate serial (excluding the item being edited)
        const dup = state.inventory.find(i =>
            i.serialNumber.toLowerCase() === data.serialNumber.toLowerCase() && i.id !== id
        );
        if (dup) {
            toast(`Serial number "${data.serialNumber}" already exists`, 'warning');
            return;
        }

        if (id) {
            // Edit existing
            const idx = state.inventory.findIndex(i => i.id === id);
            if (idx === -1) {
                toast('Item not found', 'error');
                return;
            }
            state.inventory[idx] = { ...state.inventory[idx], ...data };
            toast(`Updated ${data.model}`, 'success');
        } else {
            // Add new
            state.inventory.unshift({
                id: uid('item'),
                ...data,
            });
            toast(`Added ${data.model}`, 'success');
        }

        saveToStorage();
        closeModal('item-modal');
        renderAll();
    }

    function deleteItem(itemId) {
        const item = state.inventory.find(i => i.id === itemId);
        if (!item) return;
        confirmDialog({
            title: 'Delete machine?',
            message: `This will permanently remove "${item.model}" (S/N: ${item.serialNumber}) from inventory.`,
            confirmLabel: 'Delete',
            onConfirm: () => {
                state.inventory = state.inventory.filter(i => i.id !== itemId);
                saveToStorage();
                renderAll();
                toast('Machine deleted', 'success');
            },
        });
    }


    /* ======================================================================
       10. OFFICE CRUD
       ====================================================================== */

    function initOfficeActions() {
        document.querySelectorAll('[data-action="add-office"]').forEach(btn => {
            btn.addEventListener('click', () => openOfficeModal());
        });

        document.getElementById('office-form').addEventListener('submit', e => {
            e.preventDefault();
            handleOfficeFormSubmit();
        });
    }

    function openOfficeModal(officeId) {
        const isEdit = !!officeId;
        const office = isEdit ? getOffice(officeId) : null;

        document.getElementById('office-modal-title').textContent = isEdit ? 'Edit Office' : 'New Office';
        document.getElementById('office-id').value      = office?.id || '';
        document.getElementById('office-name').value    = office?.name || '';
        document.getElementById('office-address').value = office?.address || '';

        openModal('office-modal');
    }

    function handleOfficeFormSubmit() {
        const id = document.getElementById('office-id').value;
        const name = document.getElementById('office-name').value.trim();
        const address = document.getElementById('office-address').value.trim();

        if (!name) {
            toast('Office name is required', 'warning');
            return;
        }

        // Check duplicate name
        const dup = state.offices.find(o => o.name.toLowerCase() === name.toLowerCase() && o.id !== id);
        if (dup) {
            toast(`An office named "${name}" already exists`, 'warning');
            return;
        }

        if (id) {
            const idx = state.offices.findIndex(o => o.id === id);
            if (idx === -1) return;
            state.offices[idx] = { ...state.offices[idx], name, address };
            toast(`Updated ${name}`, 'success');
        } else {
            state.offices.push({
                id: uid('office'),
                name,
                address,
                createdAt: new Date().toISOString(),
            });
            toast(`Created office: ${name}`, 'success');
        }

        saveToStorage();
        closeModal('office-modal');
        renderAll();
    }

    function deleteOffice(officeId) {
        const office = getOffice(officeId);
        if (!office) return;

        const machineCount = state.inventory.filter(i => i.officeId === officeId).length;
        const extra = machineCount > 0
            ? ` This will also delete ${machineCount} machine${machineCount === 1 ? '' : 's'} assigned to this office.`
            : '';

        confirmDialog({
            title: 'Delete office?',
            message: `Permanently remove "${office.name}".${extra}`,
            confirmLabel: 'Delete Office',
            onConfirm: () => {
                state.offices = state.offices.filter(o => o.id !== officeId);
                state.inventory = state.inventory.filter(i => i.officeId !== officeId);
                if (state.officeFilter === officeId) state.officeFilter = 'all';
                saveToStorage();
                renderAll();
                toast(`Deleted ${office.name}`, 'success');
            },
        });
    }


    /* ======================================================================
       11. RENDERERS
       ====================================================================== */

    /** Render everything that might be affected by a state change. */
    function renderAll() {
        renderOfficeFilter();
        renderDashboard();
        renderInventory();
        renderOffices();
        renderSettings();
    }

    /** Populate the topbar's office filter dropdown. */
    function renderOfficeFilter() {
        const sel = document.getElementById('office-filter');
        const current = state.officeFilter;
        sel.innerHTML = '<option value="all">All Offices</option>' +
            state.offices.map(o => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join('');
        // Preserve current selection if still valid
        sel.value = state.offices.find(o => o.id === current) ? current : 'all';
        state.officeFilter = sel.value;
    }

    /** Dashboard: stat cards + recent list + per-office breakdown. */
    function renderDashboard() {
        // Stat values
        const total = state.inventory.length;
        document.getElementById('stat-total').textContent = total;
        document.getElementById('stat-offices').textContent = state.offices.length;

        // Items added in the last 7 days
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const recent = state.inventory.filter(i => {
            const t = new Date(i.dateAdded).getTime();
            return !Number.isNaN(t) && t >= weekAgo;
        }).length;
        document.getElementById('stat-recent').textContent = recent;

        // Unique makers
        const makers = new Set(state.inventory.map(i => (i.maker || '').toLowerCase()).filter(Boolean));
        document.getElementById('stat-makers').textContent = makers.size;

        // Recent list (last 6 items by dateAdded)
        const recentList = document.getElementById('recent-list');
        const filtered = getVisibleInventory();
        const recentItems = filtered.slice().sort((a, b) => {
            return new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime();
        }).slice(0, 6);

        if (recentItems.length === 0) {
            recentList.innerHTML = `<div class="recent-item" style="grid-template-columns: 1fr; text-align:center; color:var(--text-muted); padding: 28px 14px;">No machines yet — click <strong style="color:var(--text);">Add Machine</strong> above to get started.</div>`;
        } else {
            recentList.innerHTML = recentItems.map(item => {
                const office = getOffice(item.officeId);
                return `
                    <div class="recent-item">
                        <div class="recent-info">
                            <div class="recent-model">${esc(item.model)}</div>
                            <div class="recent-meta">${esc(item.maker)} · S/N ${esc(item.serialNumber)}</div>
                        </div>
                        <div class="recent-tag">${esc(office?.name || 'Unassigned')}</div>
                        <div class="recent-date">${esc(formatDate(item.dateAdded))}</div>
                    </div>
                `;
            }).join('');
        }

        // Office breakdown
        const breakdown = document.getElementById('office-breakdown');
        if (state.offices.length === 0) {
            breakdown.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding: 20px 14px; font-size:13px;">Create your first office to see inventory breakdowns.</div>`;
        } else {
            const counts = state.offices.map(o => ({
                office: o,
                count: state.inventory.filter(i => i.officeId === o.id).length,
            })).sort((a, b) => b.count - a.count);
            const maxCount = Math.max(1, ...counts.map(c => c.count));

            breakdown.innerHTML = counts.map(({ office, count }) => `
                <div class="breakdown-row">
                    <div class="breakdown-name" title="${esc(office.name)}">${esc(office.name)}</div>
                    <div class="breakdown-bar">
                        <div class="breakdown-bar-fill" style="width: ${(count / maxCount * 100).toFixed(1)}%"></div>
                    </div>
                    <div class="breakdown-count">${count}</div>
                </div>
            `).join('');
        }
    }

    /** Inventory: table view + mobile card view + empty state. */
    function renderInventory() {
        const tbody = document.getElementById('inventory-tbody');
        const cards = document.getElementById('inventory-cards');
        const empty = document.getElementById('inventory-empty');
        const countText = document.getElementById('inventory-count-text');

        const items = getVisibleInventory();

        // Update count subtitle
        const totalMatching = items.length;
        const totalAll = state.inventory.length;
        if (state.searchQuery || state.officeFilter !== 'all') {
            countText.textContent = `Showing ${totalMatching} of ${totalAll} machine${totalAll === 1 ? '' : 's'}`;
        } else {
            countText.textContent = `${totalAll} machine${totalAll === 1 ? '' : 's'} total`;
        }

        // Empty state — show different copy for "no data" vs "filter yields nothing"
        const tableWrap = document.querySelector('#view-inventory .table-wrap');
        if (items.length === 0) {
            empty.classList.remove('hidden');
            tbody.innerHTML = '';
            cards.innerHTML = '';
            if (tableWrap) tableWrap.style.display = 'none';

            // Customize empty-state copy depending on cause
            const heading = empty.querySelector('h3');
            const body = empty.querySelector('p');
            const btn = empty.querySelector('.btn');
            if (totalAll === 0) {
                heading.textContent = 'No machines yet';
                body.textContent = 'Add your first piece of medical equipment to get started.';
                if (btn) btn.style.display = '';
            } else {
                heading.textContent = 'No matches found';
                body.textContent = 'Try a different search term or clear the office filter.';
                if (btn) btn.style.display = 'none';
            }
            return;
        }
        empty.classList.add('hidden');
        if (tableWrap) tableWrap.style.display = '';

        // Table rows (desktop)
        tbody.innerHTML = items.map(item => {
            const office = getOffice(item.officeId);
            return `
                <tr>
                    <td class="serial-cell">${esc(item.serialNumber)}</td>
                    <td>${esc(item.model)}</td>
                    <td>${esc(item.maker)}</td>
                    <td><span class="office-pill">${esc(office?.name || 'Unassigned')}</span></td>
                    <td>${esc(formatDate(item.dateAdded))}</td>
                    <td class="notes-cell" title="${esc(item.notes || '')}">${esc(item.notes || '—')}</td>
                    <td class="actions-cell">
                        <button class="icon-btn" data-edit-item="${esc(item.id)}" aria-label="Edit">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button class="icon-btn danger" data-delete-item="${esc(item.id)}" aria-label="Delete">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        // Card view (mobile)
        cards.innerHTML = items.map(item => {
            const office = getOffice(item.officeId);
            return `
                <div class="inv-card">
                    <div class="inv-card-top">
                        <div>
                            <div class="inv-card-title">${esc(item.model)}</div>
                            <div class="inv-card-serial">S/N ${esc(item.serialNumber)}</div>
                        </div>
                        <div class="inv-card-actions">
                            <button class="icon-btn" data-edit-item="${esc(item.id)}" aria-label="Edit">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                            <button class="icon-btn danger" data-delete-item="${esc(item.id)}" aria-label="Delete">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            </button>
                        </div>
                    </div>
                    <div class="inv-card-meta">
                        <span class="inv-card-meta-item">${esc(item.maker)}</span>
                        <span>·</span>
                        <span class="office-pill">${esc(office?.name || 'Unassigned')}</span>
                        <span>·</span>
                        <span>${esc(formatDate(item.dateAdded))}</span>
                    </div>
                    ${item.notes ? `<div class="inv-card-notes">${esc(item.notes)}</div>` : ''}
                </div>
            `;
        }).join('');

        // Wire up row-level action buttons (event delegation handles this once globally,
        // but adding listeners here keeps the renderer self-contained.)
        bindRowActions();
    }

    /** Bind edit/delete buttons inside the inventory views (idempotent). */
    function bindRowActions() {
        document.querySelectorAll('[data-edit-item]').forEach(btn => {
            btn.onclick = () => openItemModal(btn.dataset.editItem);
        });
        document.querySelectorAll('[data-delete-item]').forEach(btn => {
            btn.onclick = () => deleteItem(btn.dataset.deleteItem);
        });
        document.querySelectorAll('[data-edit-office]').forEach(btn => {
            btn.onclick = () => openOfficeModal(btn.dataset.editOffice);
        });
        document.querySelectorAll('[data-delete-office]').forEach(btn => {
            btn.onclick = () => deleteOffice(btn.dataset.deleteOffice);
        });
        document.querySelectorAll('[data-view-office]').forEach(btn => {
            btn.onclick = () => {
                state.officeFilter = btn.dataset.viewOffice;
                document.getElementById('office-filter').value = state.officeFilter;
                switchView('inventory');
            };
        });
    }

    /** Offices view: card grid + empty state. */
    function renderOffices() {
        const grid = document.getElementById('offices-grid');
        const empty = document.getElementById('offices-empty');

        if (state.offices.length === 0) {
            grid.innerHTML = '';
            empty.classList.remove('hidden');
            return;
        }
        empty.classList.add('hidden');

        // Sort alphabetically
        const offices = state.offices.slice().sort((a, b) => a.name.localeCompare(b.name));

        grid.innerHTML = offices.map(office => {
            const count = state.inventory.filter(i => i.officeId === office.id).length;
            return `
                <div class="office-card">
                    <div class="office-card-header">
                        <div class="office-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4"/></svg>
                        </div>
                        <div class="office-actions">
                            <button class="icon-btn" data-edit-office="${esc(office.id)}" aria-label="Edit">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                            <button class="icon-btn danger" data-delete-office="${esc(office.id)}" aria-label="Delete">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            </button>
                        </div>
                    </div>
                    <div class="office-name">${esc(office.name)}</div>
                    <div class="office-address">${esc(office.address || 'No address set')}</div>
                    <div class="office-count">
                        <strong>${count}</strong> machine${count === 1 ? '' : 's'}
                        <button class="btn btn-ghost btn-sm" style="margin-left:auto;" data-view-office="${esc(office.id)}">View →</button>
                    </div>
                </div>
            `;
        }).join('');

        bindRowActions();
    }

    /** Settings view: update storage usage + last activity. */
    function renderSettings() {
        document.getElementById('storage-used').textContent = getStorageUsage();
        document.getElementById('last-activity').textContent = timeAgo(state.meta.lastActivity);
    }


    /* ======================================================================
       12. DATA IMPORT / EXPORT
       ====================================================================== */

    function initDataActions() {
        document.getElementById('btn-export-csv').addEventListener('click', exportCSV);
        document.getElementById('btn-backup-json').addEventListener('click', exportJSON);

        // CSV import
        document.getElementById('btn-import-csv').addEventListener('click', () => {
            document.getElementById('csv-file-input').click();
        });
        document.getElementById('csv-file-input').addEventListener('change', e => {
            const file = e.target.files[0];
            if (file) importCSV(file);
            e.target.value = ''; // reset so same file can be re-selected
        });

        // JSON restore
        document.getElementById('btn-restore-json').addEventListener('click', () => {
            confirmDialog({
                title: 'Restore from backup?',
                message: 'This will replace all current offices and inventory with the contents of the backup file. This cannot be undone.',
                confirmLabel: 'Choose file',
                confirmStyle: 'btn-primary',
                onConfirm: () => document.getElementById('json-file-input').click(),
            });
        });
        document.getElementById('json-file-input').addEventListener('change', e => {
            const file = e.target.files[0];
            if (file) importJSON(file);
            e.target.value = '';
        });

        // Clear all
        document.getElementById('btn-clear-all').addEventListener('click', () => {
            confirmDialog({
                title: 'Wipe all data?',
                message: 'This permanently deletes every office, every machine, and resets your passcode to 1234. This cannot be undone.',
                confirmLabel: 'Wipe Everything',
                onConfirm: () => {
                    wipeStorage();
                    toast('All data cleared', 'success');
                    renderAll();
                    showLogin();
                },
            });
        });
    }

    /**
     * Convert inventory to CSV and trigger a download.
     * Columns: serialNumber, model, maker, officeName, notes, dateAdded
     */
    function exportCSV() {
        if (state.inventory.length === 0) {
            toast('Nothing to export', 'warning');
            return;
        }

        const headers = ['serialNumber', 'model', 'maker', 'officeName', 'notes', 'dateAdded'];
        const rows = state.inventory.map(i => {
            const office = getOffice(i.officeId);
            return [i.serialNumber, i.model, i.maker, office?.name || '', i.notes || '', i.dateAdded];
        });

        const csv = [headers, ...rows]
            .map(row => row.map(csvCell).join(','))
            .join('\r\n');

        downloadBlob(csv, `medtrack-inventory-${todayISO()}.csv`, 'text/csv;charset=utf-8;');
        toast(`Exported ${rows.length} item${rows.length === 1 ? '' : 's'}`, 'success');
    }

    /** Escape a single CSV cell value. */
    function csvCell(value) {
        const s = (value == null ? '' : String(value));
        if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
    }

    /**
     * Parse a CSV string. Handles quoted fields containing commas, quotes, and
     * newlines. Returns an array of objects keyed by the header row.
     */
    function parseCSV(text) {
        // Normalize line endings, strip BOM
        const src = text.replace(/^\uFEFF/, '');

        const rows = [];
        let row = [];
        let field = '';
        let inQuotes = false;

        for (let i = 0; i < src.length; i++) {
            const c = src[i];
            const next = src[i + 1];

            if (inQuotes) {
                if (c === '"' && next === '"') { field += '"'; i++; }
                else if (c === '"') { inQuotes = false; }
                else { field += c; }
            } else {
                if (c === '"') { inQuotes = true; }
                else if (c === ',') { row.push(field); field = ''; }
                else if (c === '\n' || c === '\r') {
                    if (c === '\r' && next === '\n') i++;
                    row.push(field); field = '';
                    if (row.length > 1 || row[0] !== '') rows.push(row);
                    row = [];
                } else { field += c; }
            }
        }
        // Tail
        if (field !== '' || row.length > 0) {
            row.push(field);
            if (row.length > 1 || row[0] !== '') rows.push(row);
        }

        if (rows.length === 0) return [];

        const headers = rows[0].map(h => h.trim());
        return rows.slice(1).map(r => {
            const obj = {};
            headers.forEach((h, idx) => { obj[h] = (r[idx] ?? '').trim(); });
            return obj;
        });
    }

    /** Read a CSV file and merge its rows into inventory. */
    function importCSV(file) {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const records = parseCSV(String(reader.result));
                if (records.length === 0) {
                    toast('CSV file is empty', 'warning');
                    return;
                }

                let added = 0;
                let skipped = 0;
                let officesCreated = 0;

                records.forEach(rec => {
                    const serialNumber = (rec.serialNumber || rec['Serial Number'] || '').trim();
                    const model        = (rec.model || rec.Model || '').trim();
                    const maker        = (rec.maker || rec.Maker || rec.Manufacturer || '').trim();
                    const officeName   = (rec.officeName || rec.office || rec.Office || rec['Office Location'] || '').trim();
                    const notes        = (rec.notes || rec.Notes || '').trim();
                    const dateAdded    = (rec.dateAdded || rec.Date || rec['Date Added'] || todayISO()).trim();

                    // Required fields
                    if (!serialNumber || !model || !maker || !officeName) {
                        skipped++;
                        return;
                    }

                    // Skip duplicates
                    if (state.inventory.some(i => i.serialNumber.toLowerCase() === serialNumber.toLowerCase())) {
                        skipped++;
                        return;
                    }

                    // Find or create office
                    let office = state.offices.find(o => o.name.toLowerCase() === officeName.toLowerCase());
                    if (!office) {
                        office = {
                            id: uid('office'),
                            name: officeName,
                            address: '',
                            createdAt: new Date().toISOString(),
                        };
                        state.offices.push(office);
                        officesCreated++;
                    }

                    state.inventory.push({
                        id: uid('item'),
                        serialNumber, model, maker, notes, dateAdded,
                        officeId: office.id,
                    });
                    added++;
                });

                saveToStorage();
                renderAll();

                const parts = [
                    `${added} machine${added === 1 ? '' : 's'} imported`,
                    officesCreated && `${officesCreated} office${officesCreated === 1 ? '' : 's'} created`,
                    skipped && `${skipped} row${skipped === 1 ? '' : 's'} skipped`,
                ].filter(Boolean).join(' · ');
                toast(parts || 'Nothing imported', added > 0 ? 'success' : 'warning');
            } catch (err) {
                console.error(err);
                toast('Failed to parse CSV file', 'error');
            }
        };
        reader.onerror = () => toast('Could not read file', 'error');
        reader.readAsText(file);
    }

    /** Export full state as JSON backup. */
    function exportJSON() {
        const payload = {
            app: 'MedTrack',
            version: '1.0.0',
            exportedAt: new Date().toISOString(),
            offices: state.offices,
            inventory: state.inventory,
        };
        downloadBlob(JSON.stringify(payload, null, 2), `medtrack-backup-${todayISO()}.json`, 'application/json');
        toast('Backup downloaded', 'success');
    }

    /** Restore full state from a JSON backup file. */
    function importJSON(file) {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const data = JSON.parse(String(reader.result));
                if (!Array.isArray(data.offices) || !Array.isArray(data.inventory)) {
                    toast('Invalid backup file', 'error');
                    return;
                }
                state.offices = data.offices;
                state.inventory = data.inventory;
                saveToStorage();
                renderAll();
                toast(`Restored ${data.inventory.length} machines, ${data.offices.length} offices`, 'success');
            } catch (err) {
                console.error(err);
                toast('Failed to parse backup file', 'error');
            }
        };
        reader.onerror = () => toast('Could not read file', 'error');
        reader.readAsText(file);
    }

    /** Trigger a browser download of arbitrary text content. */
    function downloadBlob(content, filename, mime) {
        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }


    /* ======================================================================
       13. SETTINGS (PASSCODE CHANGE)
       ====================================================================== */

    function initSettings() {
        document.getElementById('passcode-form').addEventListener('submit', e => {
            e.preventDefault();
            const current = document.getElementById('current-passcode').value;
            const next    = document.getElementById('new-passcode').value;
            const confirm = document.getElementById('confirm-passcode').value;

            if (current !== state.passcode) {
                toast('Current passcode is incorrect', 'error');
                return;
            }
            if (next.length < 4) {
                toast('New passcode must be at least 4 characters', 'warning');
                return;
            }
            if (next !== confirm) {
                toast('Passcodes do not match', 'warning');
                return;
            }

            state.passcode = next;
            saveToStorage();
            e.target.reset();
            toast('Passcode updated successfully', 'success');
        });
    }


    /* ======================================================================
       14. APP INITIALIZATION
       ====================================================================== */

    function init() {
        loadFromStorage();

        // Seed with a default office on first launch so the app feels alive
        if (state.offices.length === 0 && state.inventory.length === 0) {
            state.offices.push({
                id: uid('office'),
                name: 'Main Office',
                address: '',
                createdAt: new Date().toISOString(),
            });
            saveToStorage();
        }

        // Module wiring
        initAuth();
        initRouter();
        initSearchAndFilter();
        initInventoryActions();
        initOfficeActions();
        initDataActions();
        initSettings();
        initModalDismissals();

        // Render once before showing login (so the app behind it is correct)
        renderAll();

        // Loading screen → login
        setTimeout(() => {
            const loader = document.getElementById('loading-screen');
            loader.style.opacity = '0';
            loader.style.transition = 'opacity 300ms ease';
            setTimeout(() => {
                loader.classList.add('hidden');
                showLogin();
            }, 300);
        }, 900);
    }

    // Kick off when the DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
