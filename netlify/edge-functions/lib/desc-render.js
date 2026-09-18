// desc-render.js — Edge (Deno ESM) variant.
//
// HAND-MAINTAINED TWIN of /js/desc-render.js (browser IIFE). The marked shared
// block MUST stay byte-identical in both files (the landing gate diffs it), or SSR vs hydration will render different KEY DETAILS cards.

// BEGIN SHARED — keep byte-identical with the twin (gate diffs this block)
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// buildKeyDetailsCardHtml — Card 1 extraction contract (Foreman ruling 2026-09-18).
// Input: the stored canonical DX text (Key Details → Overview → END, or the legacy
// headline-first shape). Output: the BODY of the KEY DETAILS card.
//   • Start AFTER the 'Key Details' heading line (fallback: top of text if absent).
//   • Never render the 'Key Details' heading — the card head performs that job.
//   • Skip any Key Details bullet whose label is 'Price' — the hero owns price.
//   • Render 'Overview' as a sub-heading followed by its prose.
//   • Stop at 'Interested In This Unit?' — dealer/lead surfaces own the CTA.
//   • Everything before 'Key Details' (legacy headline) is not rendered.
// The stored description is never modified; this is presentation only.
function buildKeyDetailsCardHtml(text) {
  if (!text) return '';
  var lines = String(text).split('\n');
  var parts = [];
  var bullets = [];
  function flush() {
    if (!bullets.length) return;
    parts.push('<ul class="desc-list">' + bullets.map(function (b) { return '<li>' + escHtml(b) + '</li>'; }).join('') + '</ul>');
    bullets = [];
  }
  var start = 0;
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].trim() === 'Key Details') { start = i + 1; break; }
  }
  for (var k = start; k < lines.length; k++) {
    var line = lines[k].trimEnd ? lines[k].trimEnd() : lines[k].replace(/\s+$/, '');
    var t = line.trim();
    if (!t) { flush(); continue; }
    if (t === 'Interested In This Unit?') { flush(); break; }
    if (t === 'Key Details') { flush(); continue; }
    if (t === 'Overview') { flush(); parts.push('<div class="desc-heading">Overview</div>'); continue; }
    if (/^[-•]\s+/.test(t)) {
      var b = t.replace(/^[-•]\s+/, '');
      if (/^Price:/.test(b)) continue;
      bullets.push(b);
      continue;
    }
    flush();
    parts.push('<p class="desc-para">' + escHtml(line) + '</p>');
  }
  flush();
  return parts.join('');
}
// END SHARED

export { buildKeyDetailsCardHtml };
