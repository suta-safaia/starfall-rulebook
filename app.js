(async function () {
  const manifest = await (await fetch("manifest.json")).json();

  // Build nested tree from manifest.dirs (all folders) + manifest.files
  const root = { children: {}, files: [] };
  function ensureDir(path) {
    if (!path) return root;
    let node = root;
    for (const part of path.split("/")) {
      node.children[part] = node.children[part] || { children: {}, files: [] };
      node = node.children[part];
    }
    return node;
  }
  manifest.dirs.forEach(ensureDir);
  manifest.files.forEach((f) => {
    const idx = f.lastIndexOf("/");
    ensureDir(idx >= 0 ? f.slice(0, idx) : "").files.push({
      name: idx >= 0 ? f.slice(idx + 1) : f,
      path: f,
    });
  });

  // Sort key: 中文数字前缀（一、二、…）和阿拉伯数字前缀（01_）按数值排序，其余按拼音
  const CN_NUM = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  function prefixNum(name) {
    const cn = name.match(/^([一二两三四五六七八九十]+)、/);
    if (cn) {
      const s = cn[1];
      if (s.length === 1) return CN_NUM[s];
      // 处理 十一、十二、二十一 这类
      let n = 0;
      const parts = s.split("十");
      if (parts.length === 2) {
        n = (parts[0] ? CN_NUM[parts[0]] : 1) * 10 + (parts[1] ? CN_NUM[parts[1]] : 0);
        return n;
      }
      return CN_NUM[s[0]] || 0;
    }
    const ar = name.match(/^(\d+)[_、.]/);
    if (ar) return parseInt(ar[1], 10);
    return null;
  }
  function compareNames(a, b) {
    const na = prefixNum(a), nb = prefixNum(b);
    if (na !== null && nb !== null && na !== nb) return na - nb;
    if (na !== null && nb === null) return -1;
    if (na === null && nb !== null) return 1;
    return a.localeCompare(b, "zh");
  }

  const treeEl = document.getElementById("tree");
  function render(node, container) {
    const ul = document.createElement("ul");
    const inner = document.createElement("div");
    inner.className = "inner";
    for (const name of Object.keys(node.children).sort(compareNames)) {
      const li = document.createElement("li");
      li.className = "folder";
      const label = document.createElement("div");
      label.className = "label";
      label.innerHTML = '<span class="caret"></span><span class="icon">📁</span>';
      label.appendChild(document.createTextNode(name));
      label.onclick = () => li.classList.toggle("open");
      li.appendChild(label);
      render(node.children[name], li);
      inner.appendChild(li);
    }
    for (const f of node.files.sort((a, b) => a.name.localeCompare(b.name, "zh"))) {
      const li = document.createElement("li");
      li.className = "file";
      li.dataset.path = f.path;
      li.innerHTML = '<span class="caret"></span><span class="icon">📄</span>';
      li.appendChild(document.createTextNode(f.name.replace(/\.md$/i, "")));
      li.onclick = () => loadDoc(f.path, li);
      inner.appendChild(li);
    }
    ul.appendChild(inner);
    container.appendChild(ul);
  }
  render(root, treeEl);

  treeEl.querySelectorAll(":scope > ul > .inner > li.folder").forEach((li) => li.classList.add("open"));

  const article = document.getElementById("article");
  async function loadDoc(path, li) {
    document.querySelectorAll(".tree .file.active").forEach((el) => el.classList.remove("active"));
    if (li) li.classList.add("active");
    location.hash = "#/" + path;
    article.innerHTML = "<p class='empty-hint'>加载中……</p>";
    const res = await fetch("docs/" + path.split("/").map(encodeURIComponent).join("/"));
    if (!res.ok) {
      article.innerHTML = "<p class='empty-hint'>文档加载失败（" + res.status + "）</p>";
      return;
    }
    article.innerHTML = marked.parse(await res.text());
    document.getElementById("content").scrollTop = 0;
  }

  // Search filter
  const search = document.getElementById("search");
  search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    const files = treeEl.querySelectorAll(".file");
    if (!q) {
      treeEl.querySelectorAll(".hidden").forEach((el) => el.classList.remove("hidden"));
      const hint = treeEl.querySelector(".no-result");
      if (hint) hint.remove();
      return;
    }
    files.forEach((f) => {
      const hit = f.textContent.toLowerCase().includes(q);
      f.classList.toggle("hidden", !hit);
      if (hit) {
        let p = f.parentElement;
        while (p && p !== treeEl) {
          if (p.classList.contains("folder")) p.classList.add("open");
          p = p.parentElement;
        }
      }
    });
    // Hide folders whose subtree has no visible file
    treeEl.querySelectorAll(".folder").forEach((folder) => {
      folder.classList.toggle("hidden", !folder.querySelector(".file:not(.hidden)"));
    });
    if (!treeEl.querySelector(".file:not(.hidden)") && !treeEl.querySelector(".no-result")) {
      const hint = document.createElement("div");
      hint.className = "no-result";
      hint.textContent = "没有匹配的文档";
      treeEl.appendChild(hint);
    } else {
      const hint = treeEl.querySelector(".no-result");
      if (hint && treeEl.querySelector(".file:not(.hidden)")) hint.remove();
    }
  });

  // Deep link: #/path/to/doc.md
  if (location.hash.startsWith("#/")) {
    const path = decodeURIComponent(location.hash.slice(2));
    const li = treeEl.querySelector('.file[data-path="' + CSS.escape(path) + '"]');
    if (li) {
      let p = li.parentElement;
      while (p && p !== treeEl) {
        if (p.classList && p.classList.contains("folder")) p.classList.add("open");
        p = p.parentElement;
      }
      loadDoc(path, li);
    }
  }
})();
