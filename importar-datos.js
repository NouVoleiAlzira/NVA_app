/* =====================================================================
   Importar datos en Opciones
   - Jugadores/as y Equipos: cargar un Excel de Cluber (Nombre, Apellidos,
     Equipos y Estado de pago; el resto de columnas no se lee ni se guarda)
   Se muestran las diferencias y se pregunta antes de guardar.
   ===================================================================== */
(function () {
  "use strict";

  const XLSX_URL = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
  const XLSX_SRI = "sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw";
  const CATEGORIES = ["Escuela", "Alevín", "Infantil", "Cadete", "Juvenil", "Junior", "Senior Femenino", "Senior Masculino", "Mixto"];

  const esc = escapeHtml;
  const norm = (s) => normalizeTeamName(s);

  let xlsxPromise = null;
  function ensureXlsx() {
    if (window.XLSX) return Promise.resolve();
    if (!xlsxPromise) xlsxPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = XLSX_URL; s.integrity = XLSX_SRI; s.crossOrigin = "anonymous"; s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { xlsxPromise = null; reject(new Error("No se pudo cargar el lector de Excel")); };
      document.head.appendChild(s);
    });
    return xlsxPromise;
  }

  // ---------- Ventana de diferencias (casillas para elegir qué se aplica) ----------
  // groups: [{ title, extra?, items: [{ id, label, checked, cls }] }]
  function askDiffs(title, intro, groups, okText) {
    return new Promise((resolve) => {
      const o = document.createElement("div");
      o.className = "cp-modal";
      o.innerHTML = `<div class="cp-modal-box imp-box">
        <div class="cp-modal-title">${esc(title)}</div>
        <div class="cp-modal-txt">${intro}</div>
        <div class="imp-list">${groups.map((g, gi) => `
          <div class="imp-group">
            <div class="imp-group-title">${esc(g.title)}${g.extra || ""}</div>
            ${g.items.map(it => it.noCheck
              ? `<div class="imp-item ${it.cls || ""}"><span>${it.label}</span></div>`
              : `<label class="imp-item ${it.cls || ""}"><input type="checkbox" data-id="${esc(it.id)}" ${it.checked ? "checked" : ""}> <span>${it.label}</span></label>`).join("")}
          </div>`).join("")}
        </div>
        <div class="cp-modal-row">
          <button class="cp-modal-btn cp-modal-stop">Cancelar</button>
          <button class="cp-modal-btn cp-modal-main">${esc(okText)}</button>
        </div>
      </div>`;
      document.body.appendChild(o);
      const done = (v) => { o.remove(); resolve(v); };
      o.querySelector(".cp-modal-stop").onclick = () => done(null);
      o.querySelector(".cp-modal-main").onclick = () => {
        const sel = new Set(Array.from(o.querySelectorAll(".imp-list input[type=checkbox]:checked")).map(c => c.dataset.id));
        const extras = {};
        o.querySelectorAll(".imp-list select[data-id]").forEach(s => { extras[s.dataset.id] = s.value; });
        done({ sel, extras });
      };
    });
  }

  // =====================================================================
  // 1) Excel de jugadores/as y equipos
  // =====================================================================
  function guessCategory(s) {
    const n = norm(s);
    if (/\bESCUELA\b/.test(n)) return "Escuela";
    if (/\bMIXTO\b/.test(n)) return "Mixto";
    if (/\bALEVIN\b|\bBENJAMIN\b/.test(n)) return "Alevín";
    if (/\bINFANTIL\b/.test(n)) return "Infantil";
    if (/\bCADETE\b/.test(n)) return "Cadete";
    if (/\bJUVENIL\b/.test(n)) return "Juvenil";
    if (/\bJUNIOR\b/.test(n)) return "Junior";
    if (/\bSENIOR\b/.test(n) && /\bMASC/.test(n)) return "Senior Masculino";
    if (/\bSENIOR\b/.test(n)) return "Senior Femenino";
    return "Mixto";
  }

  // Busca el equipo del Excel entre los de la app; si no está, propone nombre y categoría.
  function resolveTeam(label) {
    const s = label.replace(/\s+/g, " ").trim();
    const n = norm(s);
    const ex = appData.teams.find(t => norm(getTeamKey(t)) === n) || appData.teams.find(t => norm(t.name) === n);
    if (ex) return { key: getTeamKey(ex), exists: true };
    const m = s.match(/^(.*?)\s*\(([^)]+)\)$/);
    const name = m ? m[1].trim() : s;
    let cat = m ? m[2].trim() : guessCategory(s);
    const known = CATEGORIES.find(c => norm(c) === norm(cat));
    if (known) cat = known;
    return { key: `${name} (${cat})`, name, cat, exists: false };
  }

  // Del Excel de Cluber solo se leen Nombre, Apellidos, Equipos y Estado de pago.
  // El resto de columnas (contacto, documentos, tutores...) es confidencial:
  // no se lee, no se guarda y no sale de este navegador.
  function readExcelRows(wb) {
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
    if (!rows.length) return [];
    const head = rows[0].map(h => norm(String(h)));
    let cN = head.findIndex(h => h === "NOMBRE");
    let cA = head.findIndex(h => h.startsWith("APELLIDO"));
    let cE = head.findIndex(h => h.startsWith("EQUIPO"));
    const cP = head.findIndex(h => h === "ESTADO DE PAGO");
    const hasHeader = cN >= 0 || cE >= 0;
    if (cN < 0) cN = 0;
    if (cA < 0) cA = 1;
    if (cE < 0) cE = 2;
    return rows.slice(hasHeader ? 1 : 0).map(r => ({
      player: `${String(r[cN] || "").trim()} ${String(r[cA] || "").trim()}`.replace(/\s+/g, " ").trim(),
      team: String(r[cE] || "").replace(/\s+/g, " ").trim(),
      pay: cP >= 0 ? payState(r[cP]) : ""
    })).filter(r => r.player && r.team && !/NO VALIDA/.test(norm(r.team)));
  }

  // Avisos que se crean según el «Estado de pago» (iguales que el aviso manual)
  const PAY_WARNINGS = {
    nopagado: { reason: "NO PAGADO", color: "#ef4444" },
    programado: { reason: "Programado", color: "#eab308" }
  };
  const isPayReason = (r) => Object.values(PAY_WARNINGS).some(w => norm(w.reason) === norm(r || ""));
  function payState(v) {
    const n = norm(String(v || ""));
    if (n === "NO PAGADO") return "nopagado";
    if (n === "PROGRAMADO") return "programado";
    if (n === "PAGADO") return "pagado";
    return "";
  }

  const tokens = (s) => norm(s).split(" ").filter(Boolean);
  // Mismo jugador con el nombre más corto en la app (p. ej. «Laura Torres» y «Laura Torres Cervera»)
  const isShortFormOf = (shortN, longN) => {
    const a = tokens(shortN), b = tokens(longN);
    return a.length >= 2 && a.length < b.length && a.every(t => b.includes(t)) && a[0] === b[0];
  };

  // ---------- Paso 1: equipos nuevos y equipos que ya no están en el Excel ----------
  // Devuelve { teams: Map(etiqueta Excel -> {key, exists, name, cat} | null), remove: [claves] } o null si se cancela.
  async function askTeamChanges(teamsMap) {
    const resolved = new Map();
    teamsMap.forEach((players, label) => resolved.set(label, resolveTeam(label)));
    const inExcel = new Set([...resolved.values()].filter(t => t.exists).map(t => t.key));
    const missing = appData.teams.map(getTeamKey).filter(k => !inExcel.has(k));
    const fresh = [...resolved.entries()].filter(([, t]) => !t.exists);
    if (!fresh.length && !missing.length) return { teams: resolved, remove: [] };

    const groups = [];
    if (fresh.length) groups.push({
      title: "🆕 Equipos nuevos en el Excel",
      items: fresh.map(([label, t], i) => ({ id: `n${i}`, noCheck: true, cls: "imp-add",
        label: `<b>${esc(t.name)}</b> <small>· ${teamsMap.get(label).length} jugadores/as</small><div class="imp-sub">
          <select data-id="n${i}" onchange="this.nextElementSibling.hidden = this.value !== 'new'"><option value="new">Crear equipo nuevo</option>${missing.map((k, j) => `<option value="m${j}">Es «${esc(k)}» (cargar ahí)</option>`).join("")}<option value="skip">No cargar este equipo</option></select>
          <select data-id="cat_n${i}">${CATEGORIES.map(c => `<option${c === t.cat ? " selected" : ""}>${esc(c)}</option>`).join("")}</select></div>` }))
    });
    if (missing.length) groups.push({
      title: "📭 Equipos que no están en el Excel",
      items: missing.map((k, j) => ({ id: `m${j}`, noCheck: true, cls: "imp-del",
        label: `<b>${esc(k)}</b> <small>· ${getPlayersForTeamKey(k).length} jugadores/as en la app</small><div class="imp-sub">
          <select data-id="m${j}"><option value="keep">Mantener el equipo</option><option value="delete">Eliminar el equipo y sus jugadores/as</option></select></div>` }))
    });
    const res = await askDiffs("Cambios en los equipos",
      `El Excel tiene equipos que no están en la app${missing.length ? " y en la app hay equipos que no están en el Excel" : ""}. Elige qué hacer con cada uno.<br><small>Si un equipo nuevo es uno de la app con otro nombre, elige «Es…» para cargar sus jugadores/as en ese equipo.</small>`,
      groups, "Continuar");
    if (!res) return null;

    const targeted = new Set();
    fresh.forEach(([label, t], i) => {
      const v = res.extras[`n${i}`] || "new";
      if (v === "skip") { resolved.set(label, null); return; }
      if (v.startsWith("m")) {
        const key = missing[Number(v.slice(1))];
        targeted.add(key);
        resolved.set(label, { key, exists: true });
        return;
      }
      const cat = res.extras[`cat_n${i}`] || t.cat;
      resolved.set(label, { key: `${t.name} (${cat})`, name: t.name, cat, exists: appData.teams.some(x => getTeamKey(x) === `${t.name} (${cat})`) });
    });
    const remove = missing.filter((k, j) => res.extras[`m${j}`] === "delete" && !targeted.has(k));
    return { teams: resolved, remove };
  }

  // ---------- Paso 2: jugadores/as y avisos de pago ----------
  function diffPlayers(teamsMap, resolved) {
    const groups = [], plan = {}, people = [];
    let id = 0;
    teamsMap.forEach((players, label) => {
      const t = resolved.get(label);
      if (!t) return;
      const current = t.exists ? getPlayersForTeamKey(t.key).slice() : [];
      const used = new Set();
      const items = [];
      const pl = { team: t, add: [], rename: [], remove: [] };
      const xlsUnmatched = [];
      players.forEach(p => {
        const i = current.findIndex((c, k) => !used.has(k) && norm(c) === norm(p.name));
        if (i >= 0) { used.add(i); people.push({ p, from: current[i] }); } else xlsUnmatched.push(p);
      });
      xlsUnmatched.forEach(p => {
        const i = current.findIndex((c, k) => !used.has(k) && isShortFormOf(c, p.name));
        if (i >= 0) {
          used.add(i);
          const iid = `r${id++}`;
          pl.rename.push({ id: iid, from: current[i], to: p.name });
          people.push({ p, from: current[i], renameId: iid });
          items.push({ id: iid, label: `✏️ ${esc(current[i])} → ${esc(p.name)}`, checked: false, cls: "imp-ren" });
        } else {
          const iid = `a${id++}`;
          pl.add.push({ id: iid, name: p.name });
          people.push({ p, addId: iid });
          items.push({ id: iid, label: `➕ ${esc(p.name)}`, checked: true, cls: "imp-add" });
        }
      });
      current.forEach((c, k) => {
        if (used.has(k)) return;
        const iid = `d${id++}`;
        pl.remove.push({ id: iid, name: c });
        items.push({ id: iid, label: `➖ ${esc(c)} <small>(no está en el Excel)</small>`, checked: false, cls: "imp-del" });
      });
      plan[label] = pl;
      if (items.length) groups.push({ title: t.exists ? t.key : `${t.key} (nuevo)`, extra: ` <small>· ${players.length} en el Excel</small>`, items });
    });

    // Avisos según el «Estado de pago». El aviso va por nombre, igual que el manual.
    const warnItems = [], warnPlan = [], seen = new Set();
    people.forEach(x => {
      const appName = x.from || x.p.name;
      if (seen.has(norm(appName))) return;   // misma jugadora en varios equipos: un solo aviso
      seen.add(norm(appName));
      const cur = warningsData[appName];
      const curReason = cur ? (typeof cur === "string" ? cur : cur.reason) : "";
      const want = PAY_WARNINGS[x.p.pay];
      const iid = `w${id++}`;
      if (want) {
        if (cur && norm(curReason) === norm(want.reason) && (cur.color || "") === want.color) return;
        const manual = cur && !isPayReason(curReason);
        warnPlan.push({ id: iid, x, set: want });
        warnItems.push({ id: iid, checked: !manual, cls: x.p.pay === "programado" ? "imp-ren" : "imp-del",
          label: `⚠️ ${esc(appName)} → aviso «${esc(want.reason)}»${manual ? ` <small>(ahora tiene «${esc(curReason)}»)</small>` : ""}` });
      } else if (x.p.pay === "pagado" && cur && isPayReason(curReason)) {
        warnPlan.push({ id: iid, x, set: null });
        warnItems.push({ id: iid, checked: true, cls: "imp-add", label: `✅ ${esc(appName)} → quitar aviso «${esc(curReason)}» <small>(ya está pagado)</small>` });
      }
    });
    if (warnItems.length) groups.unshift({ title: "💳 Avisos por el Estado de pago", items: warnItems });
    return { groups, plan, warnPlan };
  }

  // Nombre que tendrá la jugadora en la app después de aplicar los cambios elegidos
  function finalName(x, sel) {
    if (x.renameId && sel.has(x.renameId)) return x.p.name;
    if (x.from) return x.from;
    return x.addId && sel.has(x.addId) ? x.p.name : null;
  }

  function deleteTeamKey(key) {
    const i = appData.teams.findIndex(t => getTeamKey(t) === key);
    if (i < 0) return false;
    const name = appData.teams[i].name;
    appData.teams.splice(i, 1);
    delete appData.players[key];
    if (name && !appData.teams.some(t => t.name === name)) delete appData.players[name];
    (appData.coaches || []).forEach(c => { if (c.teams) c.teams = c.teams.filter(t => t !== key && t !== name); });
    return true;
  }

  // Un fichero de avisos por equipo, como al guardarlos a mano
  async function saveWarningsForPlayers(names) {
    localStorage.setItem("NVA_WARNINGS_DATA", JSON.stringify(warningsData));
    const keys = appData.teams.map(getTeamKey).filter(k => getPlayersForTeamKey(k).some(n => names.has(n)));
    for (const key of keys) {
      const teamWarnings = {};
      getPlayersForTeamKey(key).forEach(n => { if (warningsData[n]) teamWarnings[n] = warningsData[n]; });
      await writeGitHubFile(`${WARNINGS_FOLDER}/warning_${sanitizeFileName(key)}.json`, teamWarnings, `Avisos de pago (Excel Cluber) - ${key}`);
    }
  }

  async function handleExcel(input) {
    const file = input.files && input.files[0];
    input.value = "";
    if (!file) return;
    let rows;
    mostrarCargando("Leyendo el Excel...");
    try {
      await ensureXlsx();
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      rows = readExcelRows(wb);
    } catch (e) {
      console.error(e);
      ocultarCargando();
      alert("No se pudo leer el Excel. La primera vez hace falta conexión para descargar el lector de Excel.");
      return;
    }
    // Los avisos actuales se traen antes para no pisar los que haya puesto otra persona
    try { await fetchWarningsFromGitHub(); } catch (e) { console.warn(e); }
    ocultarCargando();
    if (!rows.length) { alert("No he encontrado jugadores/as en el Excel (columnas Nombre, Apellidos y Equipos)."); return; }

    const teamsMap = new Map();
    rows.forEach(r => {
      if (!teamsMap.has(r.team)) teamsMap.set(r.team, []);
      const list = teamsMap.get(r.team);
      if (!list.some(p => norm(p.name) === norm(r.player))) list.push({ name: r.player, pay: r.pay });
    });

    const teamRes = await askTeamChanges(teamsMap);
    if (!teamRes) return;
    const { groups, plan, warnPlan } = diffPlayers(teamsMap, teamRes.teams);
    const teamChanges = teamRes.remove.length || [...teamRes.teams.values()].some(t => t && !t.exists);

    let res = { sel: new Set(), extras: {} };
    if (groups.length) {
      res = await askDiffs("Diferencias con el Excel",
        `${rows.length} jugadores/as en ${teamsMap.size} equipos. Marca lo que quieras cargar o modificar.<br><small>➕ añadir · ✏️ cambiar nombre · ➖ quitar (los dos últimos vienen desmarcados porque el historial va por nombre) · ⚠️ aviso por el Estado de pago.</small>`,
        groups, "Aplicar cambios");
      if (!res) return;
    } else if (!teamChanges) {
      alert(`El Excel coincide con los datos actuales (${rows.length} jugadores/as en ${teamsMap.size} equipos). No hay nada que cambiar.`);
      return;
    }

    let nTeams = 0, nDelTeams = 0, nAdd = 0, nRen = 0, nDel = 0, nWarn = 0, nUnwarn = 0;
    teamRes.remove.forEach(k => { if (deleteTeamKey(k)) nDelTeams++; });
    Object.values(plan).forEach(pl => {
      const t = pl.team;
      if (!t.exists && !appData.teams.some(x => getTeamKey(x) === t.key)) { appData.teams.push({ name: t.name, category: t.cat }); nTeams++; }
      const list = ensurePlayerListExists(t.key);
      pl.rename.forEach(r => { if (!res.sel.has(r.id)) return; const i = list.indexOf(r.from); if (i >= 0) { list[i] = r.to; nRen++; } });
      pl.remove.forEach(r => { if (!res.sel.has(r.id)) return; const i = list.indexOf(r.name); if (i >= 0) { list.splice(i, 1); nDel++; } });
      pl.add.forEach(r => { if (res.sel.has(r.id) && !list.includes(r.name)) { list.push(r.name); nAdd++; } });
    });

    const warned = new Set();
    warnPlan.forEach(w => {
      if (!res.sel.has(w.id)) return;
      const name = finalName(w.x, res.sel);
      if (!name) return;
      // Si se ha cambiado el nombre, el aviso antiguo se mueve al nombre nuevo
      if (w.x.from && name !== w.x.from && warningsData[w.x.from]) { warningsData[name] = warningsData[w.x.from]; delete warningsData[w.x.from]; }
      if (w.set) { warningsData[name] = { reason: w.set.reason, color: w.set.color }; nWarn++; }
      else { delete warningsData[name]; nUnwarn++; }
      warned.add(name);
    });

    if (!(nTeams || nDelTeams || nAdd || nRen || nDel || nWarn || nUnwarn)) { alert("No se ha aplicado ningún cambio."); return; }
    if (nTeams || nDelTeams || nAdd || nRen || nDel) {
      saveDataAndSyncGitHub();
      renderConfigTab2Select();
    }
    if (warned.size) {
      mostrarCargando("Guardando avisos...");
      try { await saveWarningsForPlayers(warned); } finally { ocultarCargando(); }
      if (typeof refreshDireccionAccordion === "function") refreshDireccionAccordion();
    }
    alert(`Cambios aplicados:\n- Equipos nuevos: ${nTeams}\n- Equipos eliminados: ${nDelTeams}\n- Jugadores/as añadidos: ${nAdd}\n- Nombres cambiados: ${nRen}\n- Jugadores/as quitados: ${nDel}\n- Avisos de pago puestos: ${nWarn}\n- Avisos de pago quitados: ${nUnwarn}`);
  }

  window.impPickExcel = () => document.getElementById("impExcelInput").click();
  window.impHandleExcel = handleExcel;
})();
