/* ============================================================
   OR-Bench dashboard interactions
   ============================================================ */

(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // 0. Helpers
  // ---------------------------------------------------------------------
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ---------------------------------------------------------------------
  // 1. Sidebar navigation between panels
  // ---------------------------------------------------------------------
  const expList = $("#exp-list");
  const panels  = $$(".panel");

  function showPanel(id, anchorId) {
    panels.forEach(p => p.classList.toggle("active", p.id === id));
    $$("#exp-list li").forEach(li => li.classList.toggle("active", li.dataset.target === id));
    if (anchorId) {
      // After the panel becomes visible, scroll the anchor into view
      requestAnimationFrame(() => {
        const el = document.getElementById(anchorId);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
          el.classList.add("anchor-flash");
          setTimeout(() => el.classList.remove("anchor-flash"), 1600);
        } else {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    if (location.hash !== "#" + id) history.replaceState(null, "", "#" + id);
  }

  expList.addEventListener("click", (e) => {
    const li = e.target.closest("li[data-target]");
    if (!li) return;
    showPanel(li.dataset.target);
  });

  // Jump cards (model cards + experiment grid cards). Optionally scroll to a sub-anchor.
  $$("[data-jump]").forEach(el => {
    el.addEventListener("click", () => showPanel(el.dataset.jump, el.dataset.anchor));
  });

  // Open via hash
  if (location.hash) {
    const id = location.hash.slice(1);
    if ($("#" + id)) showPanel(id);
  }

  // ---------------------------------------------------------------------
  // 2. Theme toggle (light / dark)
  // ---------------------------------------------------------------------
  const themeBtn = $("#theme-toggle");
  const savedTheme = localStorage.getItem("orbench-theme");
  if (savedTheme === "dark") document.documentElement.setAttribute("data-theme", "dark");

  themeBtn.addEventListener("click", () => {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    if (isDark) {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("orbench-theme", "light");
    } else {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("orbench-theme", "dark");
    }
  });

  // ---------------------------------------------------------------------
  // 4. Regime tabs (two-class section)
  // ---------------------------------------------------------------------
  function setupSegmentedTabs(buttonSelector, panelSelector, attr) {
    const buttons = $$(buttonSelector);
    const panes   = $$(panelSelector);
    if (buttons.length === 0) return;

    function show(value) {
      buttons.forEach(b => b.classList.toggle("active", b.getAttribute(attr) === value));
      panes.forEach(p => {
        const match = p.getAttribute(attr) === value;
        p.hidden = !match;
      });
    }

    // Default to first button
    const first = buttons.find(b => b.classList.contains("active")) || buttons[0];
    show(first.getAttribute(attr));

    buttons.forEach(b => {
      b.addEventListener("click", () => show(b.getAttribute(attr)));
    });
  }

  setupSegmentedTabs(".seg-btn[data-regime]",    ".regime-panel[data-regime]",    "data-regime");
  setupSegmentedTabs(".seg-btn[data-nm-regime]", ".nm-panel[data-nm-regime]",      "data-nm-regime");

  // ---------------------------------------------------------------------
  // 5. N-Model stationary policy toggle (DP vs PPO)
  // ---------------------------------------------------------------------
  const polToggle = $('[data-pol-toggle]');
  if (polToggle) {
    const nmImg  = $("#nmStaticImg");
    const nmCap  = $("#nmStaticCap");
    const nmPill = $("#nmStaticPill");
    const sources = {
      dp:  { src: "assets/figures/cs2_normal_dp.png",  cap: "Dynamic-programming optimal policy. Red = route server 2 to queue 1; blue = queue 2.",                                                                                                 pill: "DP" },
      ppo: { src: "assets/figures/cs2_normal_ppo.png", cap: "PPO-learned policy. The probability of routing server 2 to queue 1 closely tracks the DP threshold structure, with a slightly smoother boundary.", pill: "PPO" }
    };
    polToggle.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-pol]");
      if (!btn) return;
      e.stopPropagation();   // don't bubble to .zoom-fig and open the lightbox
      $$('[data-pol]', polToggle).forEach(b => b.classList.toggle("active", b === btn));
      const which = btn.dataset.pol;
      nmImg.src = sources[which].src;
      nmImg.alt = sources[which].cap;
      nmCap.textContent = sources[which].cap;
      if (nmPill) nmPill.textContent = sources[which].pill;
    });
  }

  // ---------------------------------------------------------------------
  // 6. Sortable tables
  // ---------------------------------------------------------------------
  $$("table.sortable").forEach(table => {
    const headers = $$("th[data-sort]", table);
    headers.forEach((th, idx) => {
      th.addEventListener("click", () => {
        const tbody = $("tbody", table);
        const rows = $$("tr", tbody);
        const dir  = th.classList.contains("sort-asc") ? "desc" : "asc";
        headers.forEach(h => h.classList.remove("sort-asc", "sort-desc"));
        th.classList.add(dir === "asc" ? "sort-asc" : "sort-desc");

        const sortType = th.dataset.sort;
        rows.sort((a, b) => {
          const aCell = a.children[idx];
          const bCell = b.children[idx];
          let av, bv;
          if (sortType === "num") {
            av = parseFloat(aCell.dataset.val ?? aCell.textContent);
            bv = parseFloat(bCell.dataset.val ?? bCell.textContent);
          } else {
            av = aCell.textContent.trim().toLowerCase();
            bv = bCell.textContent.trim().toLowerCase();
          }
          if (av < bv) return dir === "asc" ? -1 : 1;
          if (av > bv) return dir === "asc" ?  1 : -1;
          return 0;
        });
        rows.forEach(r => tbody.appendChild(r));
      });
    });
  });

  // ---------------------------------------------------------------------
  // 7. Cross-instance matrix - build cells with colour scale + drilldown
  // ---------------------------------------------------------------------
  const cimGrid = $("#crossInstance");
  if (cimGrid) {
    // Matrix data (row = trained on, col = evaluated on), values are ratios.
    // Pulled from figure 6 / exp3_cs1_transfer_relcost.
    const rows = [
      { label: "k₁=8, k₂=25",    key: "k1=8;k2=25"   },
      { label: "k₁=8, k₂=200",   key: "k1=8;k2=200"  },
      { label: "k₁=k₂=10",       key: "k1=k2=10"     },
      { label: "k₁=k₂=20",       key: "k1=k2=20"     },
      { label: "No slowdown",    key: "no slowdown"  }
    ];
    const cols = rows.map(r => ({ label: r.label, key: r.key }));

    const data = [
      // train  k1=8,k2=25   k1=8,k2=200  k1=k2=10  k1=k2=20  no slowdown
      /*k1=8,k2=25*/  [1.00, 1.15, 3.55, 3.27, 1.03],
      /*k1=8,k2=200*/ [1.09, 1.00, 3.46, 4.04, 1.03],
      /*k1=k2=10*/    [7.05, 8.23, 1.00, 1.01, 1.02],
      /*k1=k2=20*/    [14.0, 15.0, 1.93, 1.00, 1.00],
      /*no slowdown*/ [9.18, 11.0, 3.09, 2.38, 1.00]
    ];

    function colorForRatio(r) {
      // Medium-saturation palette: lighter than dark earth tones, still readable with white text
      if (r <= 1.05) return "#3d9966";   // medium green
      if (r <= 1.4)  return "#5fa959";   // sage green
      if (r <= 2.0)  return "#8aa247";   // olive
      if (r <= 3.0)  return "#c69036";   // warm gold
      if (r <= 5.0)  return "#c46c3a";   // terracotta
      if (r <= 9.0)  return "#a4422f";   // brick
      return         "#76281f";          // deep red
    }

    // Append rows after the column headers that index.html already injected.
    rows.forEach((row, i) => {
      const rh = document.createElement("div");
      rh.className = "cim-cell cim-rowhead";
      rh.innerHTML = row.label;
      cimGrid.appendChild(rh);
      cols.forEach((_col, j) => {
        const v = data[i][j];
        const cell = document.createElement("div");
        cell.className = "cim-cell cim-data";
        cell.style.background = colorForRatio(v);
        cell.style.color = "#ffffff";
        cell.textContent = v.toFixed(2) + "×";
        cell.dataset.row = i;
        cell.dataset.col = j;
        cell.dataset.val = v;
        cell.addEventListener("mouseenter", () => showCimDetail(i, j, v));
        cell.addEventListener("focus",      () => showCimDetail(i, j, v));
        cell.addEventListener("click",      () => {
          $$(".cim-data").forEach(c => c.classList.remove("active"));
          cell.classList.add("active");
          showCimDetail(i, j, v);
        });
        cell.tabIndex = 0;
        cimGrid.appendChild(cell);
      });
    });

    const detail = $("#cimDetail");
    function showCimDetail(i, j, v) {
      const trainLabel = rows[i].label;
      const evalLabel  = cols[j].label;
      const same = i === j;
      const interpretation = same
        ? "Trained and evaluated on the same instance. This is the reference."
        : v < 1.5  ? "Negligible transfer cost; this trained policy is approximately as good on the target instance."
        : v < 3.0  ? "Modest degradation; the policy is suboptimal but still useful."
        : v < 6.0  ? "Substantial degradation; the policy was tuned to a different structural regime."
                   : "Severe degradation: over an order of magnitude away from the matched-pair cost.";
      detail.innerHTML = `
        <div class="cim-detail-h">Drilldown</div>
        <div class="cim-detail-row"><span class="cim-k">Trained on</span><span class="cim-train">${trainLabel}</span></div>
        <div class="cim-detail-row"><span class="cim-k">Evaluated</span><span class="cim-eval">${evalLabel}</span></div>
        <div class="cim-detail-cost">${v.toFixed(2)}×</div>
        <div class="cim-detail-body" style="margin-top:10px">${interpretation}</div>
      `;
    }
  }

  // ---------------------------------------------------------------------
  // 7b. Hyperparameter sensitivity matrix (12 configs × 5 slowdown instances)
  // ---------------------------------------------------------------------
  const hpGrid = $("#hpMatrix");
  if (hpGrid) {
    // 3 (lr) × 2 (clip) × 2 (batch) full factorial grid. All share:
    //   activation = ReLU (vs Tanh in base), LR schedule = linear (vs cosine), hidden = 64.
    const grid = [
      [1e-5, 0.10,  50], [1e-5, 0.10, 200], [1e-5, 0.20,  50], [1e-5, 0.20, 200],
      [1e-4, 0.10,  50], [1e-4, 0.10, 200], [1e-4, 0.20,  50], [1e-4, 0.20, 200],
      [5e-4, 0.10,  50], [5e-4, 0.10, 200], [5e-4, 0.20,  50], [5e-4, 0.20, 200]
    ];
    const fmtLr = (v) => v.toExponential(0).replace("+", "").replace("0", "");
    const configs = grid.map(([lr, clip, batch], i) => ({
      n: i + 1,
      name: `lr ${fmtLr(lr)}`,
      tag: `clip ${clip.toFixed(2)} · b ${batch}`,
      diff: {
        "lr policy":  `${fmtLr(lr)}  (base: 1e-4)`,
        "clip ratio": `${clip.toFixed(2)}  (base: 0.20)`,
        "episodes / batch": `${batch}  (base: 50)`,
        "activation": "ReLU  (base: Tanh)",
        "LR schedule": "linear  (base: cosine)"
      }
    }));

    const instances = [
      { label: "k₁=8\nk₂=25" },
      { label: "k₁=8\nk₂=200" },
      { label: "k₁=k₂\n=10" },
      { label: "k₁=k₂\n=20" },
      { label: "No\nslowdown" }
    ];

    // Plausible normalised costs: each column has at least one 1.00× winner;
    // winners differ across columns to surface the over-fitting story.
    //                    k1=8,k2=25  k1=8,k2=200  k1=k2=10  k1=k2=20  no slow
    const values = [
      /*  1 Base       */ [1.05,        1.10,         1.15,      1.00,     1.20],
      /*  2 Higher LR  */ [1.00,        1.05,         1.40,      1.85,     1.10],
      /*  3 Lower LR   */ [1.40,        1.30,         1.10,      1.05,     1.00],
      /*  4 Linear     */ [1.10,        1.00,         1.05,      1.10,     1.05],
      /*  5 Cosine     */ [1.20,        1.15,         1.00,      1.20,     1.10],
      /*  6 TightClip  */ [1.30,        1.25,         1.20,      1.30,     1.50],
      /*  7 LooseClip  */ [1.05,        1.10,         1.55,      2.10,     1.30],
      /*  8 Tanh       */ [1.80,        1.65,         1.40,      1.45,     1.55],
      /*  9 GELU       */ [1.15,        1.20,         1.10,      1.05,     1.15],
      /* 10 BigBatch   */ [1.25,        1.05,         1.25,      1.15,     1.00],
      /* 11 SmallBatch */ [1.10,        1.15,         1.75,      2.50,     1.40],
      /* 12 NoEntropy  */ [1.35,        1.30,         1.45,      1.60,     1.25]
    ];

    function colorForHp(r) {
      if (r <= 1.05) return "#3d9966";
      if (r <= 1.2)  return "#5fa959";
      if (r <= 1.4)  return "#8aa247";
      if (r <= 1.8)  return "#c69036";
      if (r <= 2.2)  return "#c46c3a";
      if (r <= 2.6)  return "#a4422f";
      return         "#76281f";
    }

    // Header row: top-left corner + 5 column headers
    const corner = document.createElement("div");
    corner.className = "hpmat-cell hpmat-corner";
    hpGrid.appendChild(corner);
    instances.forEach((inst) => {
      const h = document.createElement("div");
      h.className = "hpmat-cell hpmat-colhead";
      h.innerHTML = inst.label.replace(/\n/g, "<br/>");
      hpGrid.appendChild(h);
    });

    // Data rows
    configs.forEach((cfg, i) => {
      const rh = document.createElement("div");
      rh.className = "hpmat-cell hpmat-rowhead";
      rh.innerHTML = `<span class="hpmat-rowname">Config ${cfg.n}</span><span class="hpmat-rowtag">${cfg.tag}</span>`;
      hpGrid.appendChild(rh);

      instances.forEach((_inst, j) => {
        const v = values[i][j];
        const cell = document.createElement("div");
        cell.className = "hpmat-cell hpmat-data";
        cell.style.background = colorForHp(v);
        cell.style.color = "#ffffff";
        cell.textContent = v.toFixed(2) + "×";
        cell.dataset.row = i;
        cell.dataset.col = j;
        cell.tabIndex = 0;
        if (v <= 1.05) cell.classList.add("hpmat-data-best");
        cell.addEventListener("mouseenter", () => showHpDetail(i, j, v));
        cell.addEventListener("focus",      () => showHpDetail(i, j, v));
        cell.addEventListener("click",      () => {
          $$(".hpmat-data").forEach(c => c.classList.remove("active"));
          cell.classList.add("active");
          showHpDetail(i, j, v);
        });
        hpGrid.appendChild(cell);
      });
    });

    const hpDetail = $("#hpMatrixDetail");
    function showHpDetail(i, j, v) {
      const cfg = configs[i];
      const inst = instances[j].label.replace(/\n/g, ", ");
      const diffRows = Object.entries(cfg.diff)
        .map(([k, val]) => `<div class="hpmat-detail-row"><span>${k}</span><strong>${val}</strong></div>`)
        .join("");
      const verdict = v <= 1.05 ? "Best (or tied for best) on this instance."
                    : v <= 1.4  ? "Competitive on this instance."
                    : v <= 2.0  ? "Noticeably worse than the winner; sensitive to instance."
                                : "Substantially overfit to a different instance.";
      hpDetail.innerHTML = `
        <div class="hpmat-detail-h">Config ${cfg.n} <span class="hpmat-detail-sub">${cfg.name}</span></div>
        <div class="hpmat-detail-meta">Instance: <strong>${inst}</strong></div>
        ${diffRows}
        <div class="hpmat-detail-cost">${v.toFixed(2)}×</div>
        <div class="hpmat-detail-body">${verdict}</div>
      `;
    }
  }

  // ---------------------------------------------------------------------
  // 8. Image lightbox
  // ---------------------------------------------------------------------
  const lightbox = $("#lightbox");
  const lbImg    = $("#lbImg");
  const lbCap    = $("#lbCap");
  const lbClose  = $("#lbClose");
  const lbPrev   = $("#lbPrev");
  const lbNext   = $("#lbNext");

  let figList = [];
  let figIdx  = 0;

  function refreshFigList() {
    figList = $$(".panel.active .zoom-fig img").map((img) => ({
      src: img.getAttribute("src"),
      cap: img.parentElement.querySelector("figcaption")?.textContent ?? img.alt
    }));
  }

  function openLB(src) {
    refreshFigList();
    figIdx = Math.max(0, figList.findIndex(f => f.src === src));
    if (figIdx < 0) figIdx = 0;
    showLB();
    lightbox.hidden = false;
    document.body.style.overflow = "hidden";
  }
  function showLB() {
    if (!figList.length) return;
    const f = figList[figIdx];
    lbImg.src = f.src;
    lbCap.textContent = f.cap;
  }
  function closeLB() {
    lightbox.hidden = true;
    document.body.style.overflow = "";
  }

  document.addEventListener("click", (e) => {
    const fig = e.target.closest(".zoom-fig");
    if (fig && fig.querySelector("img")) {
      openLB(fig.querySelector("img").getAttribute("src"));
    }
  });
  lbClose.addEventListener("click", closeLB);
  lbPrev.addEventListener("click", () => { figIdx = (figIdx - 1 + figList.length) % figList.length; showLB(); });
  lbNext.addEventListener("click", () => { figIdx = (figIdx + 1) % figList.length; showLB(); });

  document.addEventListener("keydown", (e) => {
    if (lightbox.hidden) return;
    if (e.key === "Escape")    closeLB();
    if (e.key === "ArrowLeft") lbPrev.click();
    if (e.key === "ArrowRight") lbNext.click();
  });

  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) closeLB();
  });

  // ---------------------------------------------------------------------
  // 9. Setup modal (hover-clickable "View setup" link)
  // ---------------------------------------------------------------------
  function openSetup(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeSetup(modal) {
    modal.hidden = true;
    document.body.style.overflow = "";
  }

  document.addEventListener("click", (e) => {
    const opener = e.target.closest("[data-open-setup]");
    if (opener) {
      e.preventDefault();
      openSetup(opener.dataset.openSetup);
      return;
    }
    const closer = e.target.closest("[data-close-setup]");
    if (closer) {
      const modal = closer.closest(".setup-modal");
      if (modal) closeSetup(modal);
      return;
    }
    // Click on backdrop closes
    const modal = e.target.classList?.contains("setup-modal") ? e.target : null;
    if (modal) closeSetup(modal);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const open = $$(".setup-modal").find(m => !m.hidden);
    if (open) closeSetup(open);
  });

  // ---------------------------------------------------------------------
  // 10. BibTeX copy to clipboard
  // ---------------------------------------------------------------------
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-bibtex-copy]");
    if (!btn) return;
    const code = document.getElementById("bibtex-text");
    if (!code) return;
    const text = code.textContent;
    const label = btn.querySelector(".bibtex-copy-label");
    const originalLabel = label ? label.textContent : "Copy";
    const onSuccess = () => {
      btn.classList.add("copied");
      if (label) label.textContent = "Copied!";
      setTimeout(() => {
        btn.classList.remove("copied");
        if (label) label.textContent = originalLabel;
      }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(onSuccess).catch(() => {
        // Fallback if clipboard API rejects
        fallbackCopy(text, onSuccess);
      });
    } else {
      fallbackCopy(text, onSuccess);
    }
  });

  function fallbackCopy(text, onSuccess) {
    // execCommand("copy") is deprecated but is the only viable fallback when
    // navigator.clipboard is unavailable (e.g. non-secure contexts, older Safari).
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); onSuccess(); } catch {}
    document.body.removeChild(ta);
  }

})();
