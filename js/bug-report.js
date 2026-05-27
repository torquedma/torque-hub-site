// ── Bug Report widget — admin/audit-only ─────────────────────────────────
// Activate with ?audit=1 in URL or localStorage.setItem('th_audit','1') once.
// Hidden to all other visitors. POSTs to public.bug_reports via anon key.
(function () {
  var AUDIT_ON =
    /[?&]audit=1\b/.test(location.search) ||
    localStorage.getItem('th_audit') === '1';

  if (/[?&]audit=1\b/.test(location.search)) {
    localStorage.setItem('th_audit', '1');
  }
  if (/[?&]audit=0\b/.test(location.search)) {
    localStorage.removeItem('th_audit');
    return;
  }
  if (!AUDIT_ON) return;

  var SUPABASE_URL = 'https://bxsikkmqasydosmblzov.supabase.co';
  var SUPABASE_ANON =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4c2lra21xYXN5ZG9zbWJsem92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4OTc1OTksImV4cCI6MjA5MDQ3MzU5OX0.JMEI7cx2tddmbvfqm_qxiIWp7f5Phuk5l0Y487DUSZg';

  var btn = document.createElement('button');
  btn.id = 'th-bug-btn';
  btn.type = 'button';
  btn.textContent = '🐛 Report';
  btn.style.cssText =
    'position:fixed;bottom:20px;right:20px;z-index:999998;' +
    'background:#dc2626;color:#fff;border:none;border-radius:999px;' +
    'padding:10px 16px;font-family:system-ui,sans-serif;font-size:13px;' +
    'font-weight:700;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,0.3);';
  btn.addEventListener('click', openModal);

  var modal = document.createElement('div');
  modal.id = 'th-bug-modal';
  modal.style.cssText =
    'display:none;position:fixed;inset:0;z-index:999999;' +
    'background:rgba(0,0,0,0.6);align-items:center;justify-content:center;' +
    'font-family:system-ui,sans-serif;';
  modal.innerHTML =
    '<div style="background:#0f172a;color:#f8fafc;border:1px solid #334155;' +
    'border-radius:14px;padding:20px;width:min(420px,92vw);' +
    'box-shadow:0 20px 60px rgba(0,0,0,0.5);">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">' +
        '<b style="font-size:15px;">Report a bug</b>' +
        '<button id="th-bug-close" type="button" style="background:none;border:none;color:#94a3b8;font-size:20px;cursor:pointer;line-height:1;">×</button>' +
      '</div>' +
      '<input id="th-bug-title" placeholder="Short title (required)" style="width:100%;box-sizing:border-box;padding:9px 11px;margin-bottom:9px;background:#1e293b;color:#f8fafc;border:1px solid #334155;border-radius:8px;font-size:13px;font-family:inherit;" />' +
      '<textarea id="th-bug-desc" placeholder="What\'s wrong? (optional)" rows="4" style="width:100%;box-sizing:border-box;padding:9px 11px;margin-bottom:9px;background:#1e293b;color:#f8fafc;border:1px solid #334155;border-radius:8px;font-size:13px;font-family:inherit;resize:vertical;"></textarea>' +
      '<div style="display:flex;gap:8px;margin-bottom:9px;">' +
        '<select id="th-bug-sev" style="flex:1;padding:9px 11px;background:#1e293b;color:#f8fafc;border:1px solid #334155;border-radius:8px;font-size:13px;font-family:inherit;">' +
          '<option value="low">Severity: Low</option>' +
          '<option value="medium" selected>Severity: Medium</option>' +
          '<option value="high">Severity: High</option>' +
        '</select>' +
        '<select id="th-bug-cat" style="flex:1;padding:9px 11px;background:#1e293b;color:#f8fafc;border:1px solid #334155;border-radius:8px;font-size:13px;font-family:inherit;">' +
          '<option value="bug" selected>Type: Bug</option>' +
          '<option value="copy">Type: Copy</option>' +
          '<option value="design">Type: Design</option>' +
          '<option value="data">Type: Data</option>' +
          '<option value="other">Type: Other</option>' +
        '</select>' +
      '</div>' +
      '<div id="th-bug-meta" style="font-size:11px;color:#64748b;margin-bottom:12px;word-break:break-all;"></div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
        '<button id="th-bug-cancel" type="button" style="padding:9px 14px;background:transparent;color:#94a3b8;border:1px solid #334155;border-radius:8px;font-size:13px;cursor:pointer;font-family:inherit;">Cancel</button>' +
        '<button id="th-bug-submit" type="button" style="padding:9px 14px;background:#16a34a;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">Submit</button>' +
      '</div>' +
      '<div id="th-bug-status" style="font-size:12px;margin-top:10px;min-height:16px;"></div>' +
    '</div>';

  document.body.appendChild(btn);
  document.body.appendChild(modal);

  function openModal() {
    modal.style.display = 'flex';
    document.getElementById('th-bug-meta').textContent =
      'Page: ' + location.pathname + (location.search || '') + ' — ' + (document.title || '');
    document.getElementById('th-bug-status').textContent = '';
    setTimeout(function () { document.getElementById('th-bug-title').focus(); }, 50);
  }
  function closeModal() { modal.style.display = 'none'; }

  modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
  document.getElementById('th-bug-close').addEventListener('click', closeModal);
  document.getElementById('th-bug-cancel').addEventListener('click', closeModal);

  document.getElementById('th-bug-submit').addEventListener('click', async function () {
    var title = document.getElementById('th-bug-title').value.trim();
    var status = document.getElementById('th-bug-status');
    if (!title) {
      status.style.color = '#fca5a5';
      status.textContent = 'Title is required.';
      return;
    }
    var payload = {
      title: title,
      description: document.getElementById('th-bug-desc').value.trim() || null,
      severity: document.getElementById('th-bug-sev').value,
      category: document.getElementById('th-bug-cat').value,
      url: location.href,
      page_title: document.title || null,
      user_agent: navigator.userAgent,
      reporter: localStorage.getItem('th_reporter') || 'audit'
    };
    status.style.color = '#94a3b8';
    status.textContent = 'Submitting…';
    try {
      var res = await fetch(SUPABASE_URL + '/rest/v1/bug_reports', {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON,
          Authorization: 'Bearer ' + SUPABASE_ANON,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        status.style.color = '#86efac';
        status.textContent = 'Reported ✓';
        document.getElementById('th-bug-title').value = '';
        document.getElementById('th-bug-desc').value = '';
        setTimeout(closeModal, 900);
      } else {
        var t = await res.text();
        status.style.color = '#fca5a5';
        status.textContent = 'Failed (' + res.status + '): ' + t.slice(0, 120);
      }
    } catch (e) {
      status.style.color = '#fca5a5';
      status.textContent = 'Network error: ' + e.message;
    }
  });

  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'B' || e.key === 'b')) {
      e.preventDefault();
      openModal();
    }
  });
})();
