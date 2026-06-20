var currentIndex = -1;
var mode = "slider";
var statusFilter = "all";
var filteredItems = [];

function init() {
  buildSidebar();
  if (filteredItems.length > 0) selectItem(0);
}

function buildSidebar() {
  var list = document.getElementById("sidebar-list");
  var filterText = document.getElementById("filter").value.toLowerCase();

  filteredItems = ITEMS.filter(function(item) {
    var matchesText = item.suiteName.toLowerCase().indexOf(filterText) !== -1 ||
      item.testName.toLowerCase().indexOf(filterText) !== -1 ||
      (item.outputName && item.outputName.toLowerCase().indexOf(filterText) !== -1);
    var matchesStatus = statusFilter === "all" || item.status === statusFilter;
    return matchesText && matchesStatus;
  });

  var failed = filteredItems.filter(function(i) { return i.status === "failed"; }).length;
  var passed = filteredItems.filter(function(i) { return i.status === "passed"; }).length;
  var skipped = filteredItems.filter(function(i) { return i.status === "skipped"; }).length;
  var suites = {};
  filteredItems.forEach(function(i) { suites[i.suiteName] = true; });
  document.getElementById("stats").textContent =
    failed + " failed, " + passed + " passed" +
    (skipped ? ", " + skipped + " skipped" : "") +
    " across " + Object.keys(suites).length + " suites";

  var groups = {};
  filteredItems.forEach(function(item, i) {
    if (!groups[item.suiteName]) groups[item.suiteName] = [];
    groups[item.suiteName].push({ item: item, index: i });
  });

  list.innerHTML = "";
  var keys = Object.keys(groups);
  for (var k = 0; k < keys.length; k++) {
    var suiteName = keys[k];
    var entries = groups[suiteName];

    var group = document.createElement("div");
    group.className = "spec-group";

    var header = document.createElement("div");
    header.className = "spec-group-header";
    header.innerHTML = '<span class="arrow">&#9660;</span> ' + escapeHtml(suiteName);
    header.onclick = (function(h) { return function() { h.classList.toggle("collapsed"); }; })(header);
    group.appendChild(header);

    var itemsDiv = document.createElement("div");
    itemsDiv.className = "spec-group-items";

    for (var e = 0; e < entries.length; e++) {
      var entry = entries[e];
      var el = document.createElement("div");
      el.className = "item" + (entry.index === currentIndex ? " active" : "");
      el.dataset.index = entry.index;

      var dot = document.createElement("span");
      dot.className = "status-dot " + entry.item.status;
      el.appendChild(dot);

      var label = document.createElement("span");
      label.className = "item-label";
      if (entry.item.type === "image") {
        label.textContent = entry.item.outputName || entry.item.testName;
        label.title = entry.item.testName + " - " + entry.item.outputName +
          " (" + (entry.item.mismatchExact || entry.item.mismatch) + "% mismatch)";
      } else {
        label.textContent = entry.item.testName;
        label.title = entry.item.testName;
      }
      el.appendChild(label);

      if (entry.item.type !== "image") {
        var typeTag = document.createElement("span");
        typeTag.className = "item-type";
        typeTag.textContent = entry.item.type === "error" ? "err" : "";
        if (typeTag.textContent) el.appendChild(typeTag);
      }

      el.onclick = (function(idx) { return function() { selectItem(idx); }; })(entry.index);
      itemsDiv.appendChild(el);
    }

    group.appendChild(itemsDiv);
    list.appendChild(group);
  }
}

function selectItem(index) {
  if (index < 0 || index >= filteredItems.length) return;
  currentIndex = index;
  var item = filteredItems[currentIndex];

  document.getElementById("current-title").textContent =
    item.suiteName + " / " + (item.outputName || item.testName);

  var info = document.getElementById("diff-info");
  var modeBtns = document.querySelector(".mode-btns");

  if (item.type === "image") {
    modeBtns.style.display = "";
    var mismatch = parseFloat(item.mismatch);
    if (item.status === "new") {
      info.textContent = "New baseline (created)";
      info.className = "diff-info";
    } else if (mismatch === 0) {
      info.textContent = "0% mismatch (identical)";
      info.className = "diff-info identical";
    } else {
      var cls = mismatch <= 1 ? "minor" : "major";
      info.textContent = (item.mismatchExact || item.mismatch) + "% mismatch";
      info.className = "diff-info " + cls;
    }
  } else {
    modeBtns.style.display = "none";
    info.textContent = item.status.toUpperCase();
    info.className = "diff-info " + (item.status === "failed" ? "major" : item.status === "passed" ? "identical" : "");
  }

  var copyBtn = document.getElementById("copy-cmd-btn");
  if (item.status === "failed" || item.testStatus === "failed") {
    copyBtn.style.display = "";
    copyBtn.textContent = "Copy debug cmd";
    copyBtn.classList.remove("copied");
  } else {
    copyBtn.style.display = "none";
  }

  document.querySelectorAll(".item").forEach(function(el) {
    el.classList.toggle("active", parseInt(el.dataset.index) === currentIndex);
  });
  var activeEl = document.querySelector(".item.active");
  if (activeEl) activeEl.scrollIntoView({ block: "nearest" });

  render();
}

function navigate(dir) {
  if (filteredItems.length === 0) return;
  var next = currentIndex + dir;
  if (next < 0) next = filteredItems.length - 1;
  if (next >= filteredItems.length) next = 0;
  selectItem(next);
}

function setMode(m) {
  mode = m;
  document.querySelectorAll(".mode-btns button").forEach(function(b) {
    b.classList.toggle("active", b.dataset.mode === m);
  });
  if (currentIndex >= 0) render();
}

function setStatusFilter(s) {
  statusFilter = s;
  document.querySelectorAll(".status-filters button").forEach(function(b) {
    b.classList.toggle("active", b.dataset.status === s);
  });
  var oldItem = currentIndex >= 0 ? filteredItems[currentIndex] : null;
  buildSidebar();
  if (oldItem) {
    var newIdx = filteredItems.findIndex(function(i) {
      return i.testName === oldItem.testName && i.type === oldItem.type &&
        i.outputName === oldItem.outputName;
    });
    if (newIdx >= 0) { selectItem(newIdx); return; }
  }
  if (filteredItems.length > 0) selectItem(0);
  else {
    currentIndex = -1;
    document.getElementById("compare-area").innerHTML =
      '<div style="color:#555;font-size:14px;">No items match the current filter.</div>';
    document.getElementById("current-title").textContent = "No results";
    document.getElementById("diff-info").textContent = "";
  }
}

function render() {
  var area = document.getElementById("compare-area");
  var item = filteredItems[currentIndex];

  if (item.type !== "image") {
    renderDetailView(area, item);
    return;
  }

  var expectedSrc = item.expected;
  var actualSrc = item.actual;
  var diffSrc = item.diff;

  if (mode === "slider") {
    area.innerHTML =
      '<div class="slider-container" id="slider">' +
        '<img class="img-expected" src="' + escapeAttr(expectedSrc) + '" draggable="false" />' +
        '<div class="img-actual-wrap" id="actual-wrap">' +
          '<img src="' + escapeAttr(actualSrc) + '" draggable="false" />' +
        '</div>' +
        '<div class="slider-line" id="slider-line">' +
          '<div class="slider-label left">Expected</div>' +
          '<div class="slider-label right">Actual</div>' +
          '<div class="slider-handle"></div>' +
        '</div>' +
      '</div>';
    initSlider();
  } else if (mode === "sidebyside") {
    area.innerHTML =
      '<div class="sidebyside">' +
        '<div class="panel">' +
          '<div class="panel-label">Expected</div>' +
          '<img src="' + escapeAttr(expectedSrc) + '" draggable="false" />' +
        '</div>' +
        '<div class="panel">' +
          '<div class="panel-label">Actual</div>' +
          '<img src="' + escapeAttr(actualSrc) + '" draggable="false" />' +
        '</div>' +
        '<div class="panel">' +
          '<div class="panel-label">Diff</div>' +
          '<img src="' + escapeAttr(diffSrc) + '" draggable="false" />' +
        '</div>' +
      '</div>';
  } else if (mode === "diff") {
    area.innerHTML =
      '<div class="diff-container">' +
        '<img src="' + escapeAttr(expectedSrc) + '" draggable="false" />' +
        '<img class="diff-overlay" src="' + escapeAttr(actualSrc) + '" draggable="false" />' +
      '</div>' +
      '<div style="position:absolute;bottom:12px;left:20px;font-size:11px;color:#888;">' +
        'Black = identical pixels. Colored = differences.' +
      '</div>';
  }
}

function renderDetailView(area, item) {
  var statusClass = item.status;
  var statusLabel = item.status.toUpperCase();
  var html = '<div class="detail-view">' +
    '<div class="detail-status ' + escapeAttr(statusClass) + '">' +
      escapeHtml(statusLabel) + ' - ' + escapeHtml(item.testName) +
    '</div>';

  if (item.failureMessage) {
    html += '<div class="failure-message">' + escapeHtml(item.failureMessage) + '</div>';
  } else if (item.status === "passed") {
    html += '<div style="color:#40916c;font-size:14px;">Test passed.</div>';
  } else if (item.status === "skipped") {
    html += '<div style="color:#e9c46a;font-size:14px;">Test skipped.</div>';
  }

  html += '</div>';
  area.innerHTML = html;
}

function initSlider() {
  var slider = document.getElementById("slider");
  var wrap = document.getElementById("actual-wrap");
  var line = document.getElementById("slider-line");
  if (!slider) return;

  var dragging = false;

  function updateSlider(ratio) {
    ratio = Math.max(0, Math.min(1, ratio));
    var w = slider.offsetWidth;
    var px = ratio * w;
    wrap.style.width = px + "px";
    line.style.left = px + "px";
  }

  var img = slider.querySelector(".img-expected");
  var actualImg = wrap.querySelector("img");
  function setInitial() {
    actualImg.style.width = img.offsetWidth + "px";
    actualImg.style.height = img.offsetHeight + "px";
    updateSlider(0.5);
  }
  if (img.complete) setInitial(); else img.onload = setInitial;

  slider.addEventListener("mousedown", function(e) { dragging = true; updateSlider(e.offsetX / slider.offsetWidth); });
  window.addEventListener("mousemove", function(e) {
    if (!dragging) return;
    var rect = slider.getBoundingClientRect();
    updateSlider((e.clientX - rect.left) / rect.width);
  });
  window.addEventListener("mouseup", function() { dragging = false; });

  slider.addEventListener("touchstart", function(e) {
    dragging = true;
    var rect = slider.getBoundingClientRect();
    updateSlider((e.touches[0].clientX - rect.left) / rect.width);
  });
  window.addEventListener("touchmove", function(e) {
    if (!dragging) return;
    var rect = slider.getBoundingClientRect();
    updateSlider((e.touches[0].clientX - rect.left) / rect.width);
  });
  window.addEventListener("touchend", function() { dragging = false; });
}

function escapeHtml(s) {
  var d = document.createElement("div");
  d.appendChild(document.createTextNode(s));
  return d.innerHTML;
}

function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

document.addEventListener("keydown", function(e) {
  if (e.target.tagName === "INPUT") return;
  if (e.key === "j" || e.key === "ArrowDown") { e.preventDefault(); navigate(1); }
  if (e.key === "k" || e.key === "ArrowUp") { e.preventDefault(); navigate(-1); }
  if (e.key === "1") setMode("slider");
  if (e.key === "2") setMode("sidebyside");
  if (e.key === "3") setMode("diff");
  if (e.key === "/") { e.preventDefault(); document.getElementById("filter").focus(); }
  if (e.key === "Escape") { document.getElementById("filter").blur(); }
});

document.getElementById("filter").addEventListener("input", function() {
  var oldItem = currentIndex >= 0 ? filteredItems[currentIndex] : null;
  buildSidebar();
  if (oldItem) {
    var newIdx = filteredItems.findIndex(function(i) {
      return i.testName === oldItem.testName && i.type === oldItem.type &&
        i.outputName === oldItem.outputName;
    });
    if (newIdx >= 0) currentIndex = newIdx;
    else currentIndex = -1;
  }
});

function copyDebugCommand() {
  var item = filteredItems[currentIndex];
  if (!item) return;
  var envParts = [];
  if (KARMA_MODE.compat) envParts.push("FORCE_COMPAT=true");
  if (KARMA_MODE.cpu) envParts.push("FORCE_CPU_RENDERING=true");
  var grep = item.testName;
  if (grep) envParts.push("KARMA_GREP=" + JSON.stringify(grep));
  var cmd = (envParts.length ? envParts.join(" ") + " " : "") +
    "npx karma start --no-single-run --browsers Chrome";
  navigator.clipboard.writeText(cmd).then(function() {
    var btn = document.getElementById("copy-cmd-btn");
    btn.textContent = "Copied!";
    btn.classList.add("copied");
    setTimeout(function() {
      btn.textContent = "Copy debug cmd";
      btn.classList.remove("copied");
    }, 2000);
  });
}

init();
