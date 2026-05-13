/**
 * Smart Assess — Print Preview v3
 *
 * Fixes:
 *  1. Multi-print: passes body classes into iframe so printing-multi CSS rules apply
 *  2. Live settings: uses CSS transform:scale on a full-page iframe for instant updates
 *  3. Settings sidebar: Size, Orientation, Margins, Scale slider, Background toggle
 */
(function (window) {
  'use strict';

  var PAGE_MM = {
    'A4':     { w: 210, h: 297 },
    'A5':     { w: 148, h: 210 },
    'Letter': { w: 216, h: 279 },
    'Legal':  { w: 216, h: 356 },
  };
  var MARGIN_MM = { 'none': 0, 'small': 6, 'medium': 10, 'large': 18 };
  var MM_TO_PX = 3.7795;   // 1mm ≈ 3.78px at 96dpi

  var SmartPrintPreview = {
    open: function (opts) { this._openModal(opts || {}); },

    _openModal: function (opts) {
      var ex = document.getElementById('sa-pp-overlay');
      if (ex) ex.remove();

      /* ── State ──────────────────────────────────────────────────────────── */
      /* Use caller-provided defaults (e.g. from printSingle/printMultiple)
         so the preview opens with the correct page setup pre-selected. */
      var S = {
        size:      opts.size      || 'A4',
        landscape: opts.landscape || false,
        margin:    opts.margin    || 'medium',
        scale:     opts.scale     || 90,
        bg:        opts.bg !== undefined ? opts.bg : true,
      };

      /* ── Overlay ────────────────────────────────────────────────────────── */
      var overlay = document.createElement('div');
      overlay.id = 'sa-pp-overlay';
      overlay.style.cssText =
        'position:fixed;inset:0;z-index:99999;background:#525659;' +
        'display:flex;flex-direction:row;font-family:inherit;';

      /* ── Settings panel ─────────────────────────────────────────────────── */
      var panel = document.createElement('div');
      panel.style.cssText =
        'width:210px;flex-shrink:0;background:#2d2d2d;color:#ddd;' +
        'display:flex;flex-direction:column;overflow-y:auto;';

      panel.innerHTML =
        /* header */
        '<div style="background:#1A3A5C;padding:12px 14px;font-weight:700;font-size:13px;' +
          'display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">' +
          '<span>🖨 Print Preview</span>' +
          '<button id="sa-pp-close" style="background:#c0392b;color:#fff;border:none;' +
            'border-radius:4px;width:24px;height:24px;cursor:pointer;font-size:14px;' +
            'font-weight:700;line-height:1;">✕</button>' +
        '</div>' +

        /* size */
        '<div class="sap-sec">' +
          '<div class="sap-lbl">Paper size</div>' +
          '<select id="sap-size" class="sap-sel">' +
            '<option value="A4" selected>A4 (210×297 mm)</option>' +
            '<option value="A5">A5 (148×210 mm)</option>' +
            '<option value="Letter">Letter (216×279 mm)</option>' +
            '<option value="Legal">Legal (216×356 mm)</option>' +
          '</select>' +
        '</div>' +

        /* orientation */
        '<div class="sap-sec">' +
          '<div class="sap-lbl">Orientation</div>' +
          '<div style="display:flex;gap:6px;">' +
            '<button class="sap-tab active" data-v="portrait">▯ Portrait</button>' +
            '<button class="sap-tab" data-v="landscape">▭ Landscape</button>' +
          '</div>' +
        '</div>' +

        /* margins */
        '<div class="sap-sec">' +
          '<div class="sap-lbl">Margins</div>' +
          '<select id="sap-margin" class="sap-sel">' +
            '<option value="none">None</option>' +
            '<option value="small">Small (6 mm)</option>' +
            '<option value="medium" selected>Medium (10 mm)</option>' +
            '<option value="large">Large (18 mm)</option>' +
          '</select>' +
        '</div>' +

        /* scale */
        '<div class="sap-sec">' +
          '<div class="sap-lbl" style="display:flex;justify-content:space-between;">' +
            'Scale <span id="sap-scalelbl" style="color:#D99900;font-weight:700;">90%</span>' +
          '</div>' +
          '<input id="sap-scale" type="range" min="40" max="100" value="90" step="5" ' +
            'style="width:100%;accent-color:#D99900;cursor:pointer;margin-top:4px;">' +
        '</div>' +

        /* background */
        '<div class="sap-sec">' +
          '<div class="sap-lbl">Options</div>' +
          '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;">' +
            '<input id="sap-bg" type="checkbox" checked style="accent-color:#D99900;">' +
            'Print background colors' +
          '</label>' +
        '</div>' +

        /* page info */
        '<div style="padding:10px 14px;font-size:11px;color:#777;border-top:1px solid #3a3a3a;' +
          'margin-top:auto;" id="sap-info">A4 · Portrait · 210×297 mm</div>' +

        /* print btn */
        '<div style="padding:12px 14px;flex-shrink:0;">' +
          '<button id="sap-print" style="width:100%;background:#D99900;color:#fff;border:none;' +
            'padding:10px;border-radius:6px;cursor:pointer;font-weight:700;font-size:14px;">' +
            '🖨 Print' +
          '</button>' +
        '</div>';

      /* ── Preview area ───────────────────────────────────────────────────── */
      var parea = document.createElement('div');
      parea.style.cssText =
        'flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0;';

      var topbar = document.createElement('div');
      topbar.style.cssText =
        'background:#404040;color:#aaa;padding:7px 14px;font-size:11px;' +
        'display:flex;align-items:center;flex-shrink:0;';
      topbar.innerHTML =
        '<span>Settings apply live to the preview</span>' +
        '<span id="sap-zoom" style="margin-left:auto;background:rgba(255,255,255,.08);' +
          'padding:2px 8px;border-radius:8px;">90%</span>';

      /* scroll container — centres the page shadow */
      var scroll = document.createElement('div');
      scroll.style.cssText =
        'flex:1;overflow:auto;display:flex;justify-content:center;' +
        'align-items:flex-start;padding:28px;background:#525659;';

      /* The outer clip keeps the page-box from spilling */
      var clip = document.createElement('div');
      clip.id = 'sap-clip';
      clip.style.cssText = 'flex-shrink:0;overflow:hidden;position:relative;' +
        'box-shadow:0 4px 28px rgba(0,0,0,.55);';

      /* iframe fills the natural page at 100% — we scale the clip */
      var frame = document.createElement('iframe');
      frame.id = 'sap-frame';
      frame.style.cssText =
        'border:none;display:block;background:#fff;' +
        'transform-origin:top left;';

      var loader = document.createElement('div');
      loader.id = 'sap-loader';
      loader.style.cssText =
        'position:absolute;inset:0;display:flex;align-items:center;' +
        'justify-content:center;background:#fff;color:#666;font-size:13px;z-index:5;';
      loader.textContent = 'Loading preview\u2026';

      clip.appendChild(loader);
      clip.appendChild(frame);
      scroll.appendChild(clip);
      parea.appendChild(topbar);
      parea.appendChild(scroll);
      overlay.appendChild(panel);
      overlay.appendChild(parea);

      /* ── Panel CSS ──────────────────────────────────────────────────────── */
      var pStyle = document.createElement('style');
      pStyle.textContent =
        '.sap-sec{padding:11px 14px;border-bottom:1px solid #3a3a3a;}' +
        '.sap-lbl{font-size:10px;font-weight:700;text-transform:uppercase;' +
          'letter-spacing:.5px;color:#888;margin-bottom:6px;}' +
        '.sap-sel{width:100%;padding:4px 6px;border-radius:4px;font-size:12px;' +
          'border:1px solid #555;background:#3a3a3a;color:#ddd;cursor:pointer;}' +
        '.sap-tab{flex:1;padding:5px;border:1px solid #555;background:#3a3a3a;' +
          'color:#999;border-radius:4px;cursor:pointer;font-size:12px;}' +
        '.sap-tab.active{background:#1A3A5C;color:#fff;border-color:#1A3A5C;}' +
        '.sap-tab:hover:not(.active){background:#444;color:#ddd;}';
      document.head.appendChild(pStyle);
      document.body.appendChild(overlay);

      /* ── Collect styles before DOM mutation ─────────────────────────────── */
      var linkHrefs = Array.from(
        document.querySelectorAll('link[rel="stylesheet"]')
      ).map(function(l){ return l.href; }).filter(Boolean);

      var inlineCSS = Array.from(document.styleSheets).map(function(ss){
        try{ return Array.from(ss.cssRules||[]).map(function(r){return r.cssText;}).join('\n'); }
        catch(_){ return ''; }
      }).filter(Boolean).join('\n');

      /* ── Capture body state ─────────────────────────────────────────────── */
      /* CRITICAL: capture body classes BEFORE we append overlay */
      var bodyClasses = document.body.className
        .replace('sa-pp-overlay','').trim();   // exclude any preview artifact

      /* clone content */
      var clone = document.createElement('div');
      clone.innerHTML = document.body.innerHTML;
      clone.querySelectorAll(
        '.no-print,.sidebar,.topbar,header,nav,.navbar,.flash-stack,' +
        '#sa-pp-overlay,script,[data-bs-toggle]'
      ).forEach(function(el){ el.remove(); });
      clone.querySelectorAll('a').forEach(function(a){
        a.removeAttribute('href'); a.style.cursor='default';
      });
      clone.querySelectorAll('button,input,select,textarea').forEach(function(el){
        el.setAttribute('disabled','disabled');
      });
      var bodyHTML = clone.innerHTML;

      /* ── Write iframe ───────────────────────────────────────────────────── */
      var iDoc = frame.contentDocument || frame.contentWindow.document;
      iDoc.open();
      iDoc.write('<!DOCTYPE html><html><head>' +
        '<meta charset="utf-8">' +
        linkHrefs.map(function(h){
          return '<link rel="stylesheet" href="' + h + '">';
        }).join('') +
        '<style>' + inlineCSS + '</style>' +
        '<style id="sap-page">@page{size:A4 portrait;margin:10mm;}</style>' +
        '<style id="sap-body">' +
          'html,body{background:#fff!important;margin:0!important;' +
          'padding:10mm!important;box-sizing:border-box!important;overflow:visible!important;}' +
          '.no-print,.sidebar,.topbar,header,nav,.navbar,.flash-stack{display:none!important;}' +
        '</style>' +
        '</head>' +
        /* Apply the original body classes so printing-multi / printing-single CSS works */
        '<body class="' + bodyClasses + '">' + bodyHTML + '</body></html>');
      iDoc.close();

      /* ── updateLayout: resize clip+frame and apply @page CSS ────────────── */
      function updateLayout() {
        var dims   = PAGE_MM[S.size] || PAGE_MM['A4'];
        var wMM    = S.landscape ? dims.h : dims.w;
        var hMM    = S.landscape ? dims.w : dims.h;
        var sc     = S.scale / 100;
        var mMM    = MARGIN_MM[S.margin];

        /* Natural pixel size at 96dpi */
        var natW = Math.round(wMM * MM_TO_PX);
        var natH = Math.round(hMM * MM_TO_PX);

        /* Scaled display size */
        var dispW = Math.round(natW * sc);
        var dispH = Math.round(natH * sc);

        /* clip = display size, iframe = natural size then scaled via transform */
        clip.style.width  = dispW + 'px';
        clip.style.height = dispH + 'px';
        frame.style.width  = natW + 'px';
        frame.style.height = natH + 'px';
        frame.style.transform = 'scale(' + sc + ')';

        /* Update @page inside iframe */
        var iDocument = frame.contentDocument || frame.contentWindow.document;
        var ps = iDocument.getElementById('sap-page');
        if (ps) {
          ps.textContent =
            '@page{size:' + S.size + ' ' + (S.landscape ? 'landscape' : 'portrait') +
            ';margin:' + mMM + 'mm;}';
        }
        /* Update body padding to reflect margins visually */
        var bs = iDocument.getElementById('sap-body');
        if (bs) {
          bs.textContent =
            'html,body{background:#fff!important;margin:0!important;' +
            'padding:' + mMM + 'mm!important;' +
            'box-sizing:border-box!important;overflow:visible!important;' +
            (S.bg ? '' : '-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;') +
            '}' +
            '.no-print,.sidebar,.topbar,header,nav,.navbar,.flash-stack{display:none!important;}';
        }

        /* Info labels */
        var info = overlay.querySelector('#sap-info');
        if (info) {
          info.textContent = S.size + ' \u00b7 ' +
            (S.landscape ? 'Landscape' : 'Portrait') + ' \u00b7 ' +
            wMM + '\u00d7' + hMM + ' mm';
        }
        var zoomEl = overlay.querySelector('#sap-zoom');
        if (zoomEl) zoomEl.textContent = S.scale + '%';
        var lblEl = overlay.querySelector('#sap-scalelbl');
        if (lblEl) lblEl.textContent = S.scale + '%';
      }

      /* ── Wire events ────────────────────────────────────────────────────── */
      panel.querySelector('#sap-size').addEventListener('change', function(){
        S.size = this.value; updateLayout();
      });
      panel.querySelectorAll('.sap-tab').forEach(function(btn){
        btn.addEventListener('click', function(){
          panel.querySelectorAll('.sap-tab').forEach(function(b){ b.classList.remove('active'); });
          this.classList.add('active');
          S.landscape = (this.dataset.v === 'landscape');
          updateLayout();
        });
      });
      panel.querySelector('#sap-margin').addEventListener('change', function(){
        S.margin = this.value; updateLayout();
      });
      panel.querySelector('#sap-scale').addEventListener('input', function(){
        S.scale = parseInt(this.value, 10); updateLayout();
      });
      panel.querySelector('#sap-bg').addEventListener('change', function(){
        S.bg = this.checked; updateLayout();
      });

      /* ── Print ──────────────────────────────────────────────────────────── */
      function doPrint() {
        updateLayout();   // ensure latest @page is applied
        var settings = { pageSize: S.size, landscape: S.landscape };
        if (window.electronAPI && window.electronAPI.printWithSettings) {
          overlay.remove();
          try { document.head.removeChild(pStyle); } catch(_){}
          window.electronAPI.printWithSettings(settings);
          window.dispatchEvent(new CustomEvent('sa-pp-afterprint'));
        } else {
          try {
            frame.contentWindow.focus();
            // Listen for afterprint on the iframe then notify parent
            frame.contentWindow.addEventListener('afterprint', function _ap() {
              frame.contentWindow.removeEventListener('afterprint', _ap);
              window.dispatchEvent(new CustomEvent('sa-pp-afterprint'));
            });
            frame.contentWindow.print();
          } catch(e) { window.print(); }
        }
      }

      /* ── Close ──────────────────────────────────────────────────────────── */
      function closeOverlay() {
        overlay.remove();
        try { document.head.removeChild(pStyle); } catch(_){}
        document.removeEventListener('keydown', onKey);
        window.dispatchEvent(new CustomEvent('sa-pp-afterprint'));
      }
      function onKey(e) { if (e.key === 'Escape') closeOverlay(); }

      panel.querySelector('#sap-print').addEventListener('click', doPrint);
      panel.querySelector('#sa-pp-close').addEventListener('click', closeOverlay);
      overlay.addEventListener('click', function(e){
        if (e.target === overlay) closeOverlay();
      });
      document.addEventListener('keydown', onKey);

      /* ── Show on load ───────────────────────────────────────────────────── */
      frame.onload = function(){
        loader.style.display = 'none';
        updateLayout();
      };
      setTimeout(function(){
        if (loader.style.display !== 'none'){
          loader.style.display = 'none';
          updateLayout();
        }
      }, 2500);

      /* initial layout with loader still showing */
      /* Pre-select UI controls to match initial state */
      var sizeEl = panel.querySelector('#sap-size');
      if (sizeEl) sizeEl.value = S.size;
      panel.querySelectorAll('.sap-tab').forEach(function(b){
        b.classList.toggle('active', b.dataset.v === (S.landscape ? 'landscape' : 'portrait'));
      });
      var marginEl = panel.querySelector('#sap-margin');
      if (marginEl) marginEl.value = S.margin;
      var scaleEl = panel.querySelector('#sap-scale');
      if (scaleEl) scaleEl.value = S.scale;
      var bgEl = panel.querySelector('#sap-bg');
      if (bgEl) bgEl.checked = S.bg;

      updateLayout();
    }
  };

  window.SmartPrintPreview = SmartPrintPreview;

  /* Intercept Ctrl+P in browser */
  document.addEventListener('keydown', function(e){
    if ((e.ctrlKey || e.metaKey) && e.key === 'p' && !e.shiftKey){
      if (!window.electronAPI){
        e.preventDefault();
        SmartPrintPreview.open();
      }
    }
  });

})(window);