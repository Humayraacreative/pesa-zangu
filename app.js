// ===== 1. DATA =====
const CATS = {
  out: ["Chakula","Usafiri","Kodi na nyumba","Umeme na maji","Simu na intaneti",
        "Afya","Burudani","Mavazi","Elimu","Akiba na uwekezaji","Mengine"],
  in:  ["Mshahara","Biashara","Kazi ya pembeni","Zawadi","Mengine"]
};
const MONTHS = ["Januari","Februari","Machi","Aprili","Mei","Juni",
                "Julai","Agosti","Septemba","Oktoba","Novemba","Desemba"];
const SHORT = MONTHS.map(m => m.slice(0, 3));
const PALETTE = ["#0B7A75","#C2255C","#D9822B","#3B6FD9","#7A4FD1","#2E9E5B",
                 "#C9A227","#D1493F","#5B8DA8","#14B8A6","#8A8F98"];

let tx       = JSON.parse(localStorage.getItem("tx") || "[]");
let budget   = JSON.parse(localStorage.getItem("budget") || "{}");
let settings = JSON.parse(localStorage.getItem("settings") || '{"salary":0,"payday":1}');
let view = "ongeza";            // ukurasa wa kwanza (badilisha kuwa "dash" ukitaka dashibodi)
let type = "out";
let flash = "";                 // ujumbe mfupi baada ya kuhifadhi
let ym = cycleOf(today());      // mzunguko unaoonekana, mf. "2026-10"
let charts = [];
let rng = "leo";                // kipindi kilichochaguliwa kwenye Uchambuzi
let A = null;                   // matokeo ya uchambuzi wa sasa

function save(){
  localStorage.setItem("tx", JSON.stringify(tx));
  localStorage.setItem("budget", JSON.stringify(budget));
  localStorage.setItem("settings", JSON.stringify(settings));
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();

// ===== 2. VIFAA VIDOGO =====
function pad(n){ return String(n).padStart(2, "0"); }
function today(){
  const d = new Date();
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}
function fmt(n){ return Math.round(n).toLocaleString("en-US"); }
function esc(s){
  return String(s).replace(/[&<>"]/g, c =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
}
function total(list, t){
  return list.filter(x => x.type === t).reduce((s, x) => s + x.amt, 0);
}
function byNewest(list){
  return [...list].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id);
}
function shiftMonth(s, k){
  const [y, m] = s.split("-").map(Number);
  const d = new Date(y, m - 1 + k, 1);
  return d.getFullYear() + "-" + pad(d.getMonth() + 1);
}
function css(name){
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// ===== 3. MZUNGUKO WA MSHAHARA =====
// Tarehe yoyote ni ya mzunguko upi? Mzunguko unaitwa kwa mwezi unaoanzia.
function cycleOf(date){
  const day = Number(date.slice(8));
  const m = date.slice(0, 7);
  return day >= settings.payday ? m : shiftMonth(m, -1);
}
function cycleLabel(s){
  const [y, m] = s.split("-").map(Number);
  if (settings.payday === 1) return MONTHS[m - 1] + " " + y;
  const e = shiftMonth(s, 1);
  return settings.payday + " " + SHORT[m - 1] + " – " + (settings.payday - 1) + " " +
         SHORT[Number(e.slice(5)) - 1] + " " + e.slice(0, 4);
}
function cycleDays(s){            // orodha ya tarehe zote za mzunguko
  const [y, m] = s.split("-").map(Number);
  const list = [];
  const d = new Date(y, m - 1, settings.payday);
  const end = new Date(y, m, settings.payday);
  while (d < end){
    list.push(d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()));
    d.setDate(d.getDate() + 1);
  }
  return list;
}
function monthList(s){ return tx.filter(t => cycleOf(t.date) === s); }

// ===== 4. SEHEMU ZA SCREEN =====
function itemHtml(t){
  return `<div class="item">
    <div><b>${esc(t.cat)}</b>
      <small>${esc(t.note)} ${t.date}</small>
      <button class="del" data-del="${t.id}">Futa</button></div>
    <div class="amt ${t.type}">${t.type === "in" ? "+" : "−"}${fmt(t.amt)}</div>
  </div>`;
}

function budgetBars(keys, spent, income){
  if (!keys.length) return `<p class="sub">Hakuna matumizi wala bajeti kwa mzunguko huu.</p>`;
  return keys.map(c => {
    const s = spent[c] || 0, limit = budget[c] || 0;
    const pct = limit ? s / limit * 100 : 0;
    const cls = pct > 100 ? "over" : pct >= 80 ? "warn" : "";
    const width = limit ? Math.min(pct, 100) : (income ? Math.min(s / income * 100, 100) : 0);
    let note = "";
    if (pct > 100) note = `<div class="out sub note">Umevuka bajeti kwa ${fmt(s - limit)}</div>`;
    else if (pct >= 80) note = `<div class="sub note">Unakaribia kikomo (baki ${fmt(limit - s)})</div>`;
    return `<div class="row"><span>${esc(c)}</span>
      <span class="sub">${fmt(s)}${limit ? " / " + fmt(limit) : ""}${income ? " · " + Math.round(s / income * 100) + "% ya kipato" : ""}</span></div>
      <div class="bar ${cls}"><i style="width:${width}%"></i></div>${note}`;
  }).join("");
}

function dashView(){
  const list = monthList(ym);
  const salary = list.filter(t => t.type === "in" && t.cat === "Mshahara")
                     .reduce((s, t) => s + t.amt, 0);
  const income = total(list, "in");
  const side = income - salary;                 // kipato cha pembeni
  const out = total(list, "out");
  const left = income - out;

  const spent = {};
  list.filter(t => t.type === "out")
      .forEach(t => { spent[t.cat] = (spent[t.cat] || 0) + t.amt; });
  const keys = CATS.out.filter(c => spent[c] > 0 || budget[c] > 0)
                       .sort((a, b) => (spent[b] || 0) - (spent[a] || 0));

  // sentensi za maelezo
  const lines = [];
  if (income > 0){
    lines.push(`Umetumia <b>${Math.round(out / income * 100)}%</b> ya kipato chako cha mzunguko huu.`);
    if (out > 0){
      const top = Object.keys(spent).sort((a, b) => spent[b] - spent[a])[0];
      lines.push(`Unatumia zaidi kwenye <b>${esc(top)}</b>: ${fmt(spent[top])} (${Math.round(spent[top] / income * 100)}% ya kipato).`);
    }
    if (left < 0){
      lines.push(`Matumizi yamezidi kipato kwa <b class="out">${fmt(-left)}</b>.`);
    } else if (ym === cycleOf(today())){
      const daysLeft = cycleDays(ym).filter(d => d >= today()).length;
      if (daysLeft > 0 && left > 0)
        lines.push(`Siku ${daysLeft} zimebaki. Unaweza kutumia wastani wa <b>${fmt(left / daysLeft)}</b> kwa siku.`);
    }
  } else if (out > 0){
    lines.push(`Bado hujaandika mshahara wala kipato kwa mzunguko huu, kwa hiyo asilimia hazionekani.`);
  }

  return `<div class="head"><h1>Dashibodi</h1>
      <div class="mon"><button data-m="-1">‹</button>
      <span>${cycleLabel(ym)}</span><button data-m="1">›</button></div></div>
    <div class="kpis">
      <div class="kpi i"><span class="sub">Mshahara</span><b class="in">${fmt(salary)}</b></div>
      <div class="kpi i"><span class="sub">Kipato cha pembeni</span><b class="in">${fmt(side)}</b></div>
      <div class="kpi o"><span class="sub">Matumizi ya mwezi mzima</span><b class="out">${fmt(out)}</b></div>
      <div class="kpi n"><span class="sub">Kilichobaki (kipato − matumizi)</span>
        <b class="${left >= 0 ? "in" : "out"}">${left < 0 ? "−" : ""}${fmt(Math.abs(left))}</b></div>
    </div>
    ${lines.length ? `<div class="card insight">${lines.map(l => `<p>${l}</p>`).join("")}</div>` : ""}
    <div class="grid2">
      <div class="card"><b>Mwelekeo wa miezi 6</b>
        <div class="chartbox"><canvas id="c1"></canvas></div></div>
      <div class="card"><b>Kipato chako kimeenda wapi</b>
        ${income > 0 || out > 0 ? `<div class="chartbox"><canvas id="c2"></canvas></div>`
                                : `<p class="sub">Bado hakuna rekodi.</p>`}</div>
      <div class="card"><b>Matumizi kila siku</b>
        ${out > 0 ? `<div class="chartbox"><canvas id="c3"></canvas></div>`
                  : `<p class="sub">Bado hakuna matumizi.</p>`}</div>
      <div class="card"><b>Matumizi dhidi ya bajeti</b><div style="margin-top:12px">
        ${budgetBars(keys, spent, income)}</div></div>
    </div>`;
}

function drawCharts(){
  if (typeof Chart === "undefined") return;     // hakuna intaneti: chati hazipo
  Chart.defaults.color = css("--mute");
  Chart.defaults.font.family = "system-ui, sans-serif";
  const grid = css("--line");
  const list = monthList(ym);
  const outs = list.filter(t => t.type === "out");
  const income = total(list, "in"), outTotal = total(list, "out");

  // 1. Mwelekeo wa mizunguko 6
  const labels = [], ins = [], outv = [];
  for (let k = -5; k <= 0; k++){
    const s = shiftMonth(ym, k), l = monthList(s);
    labels.push(SHORT[Number(s.slice(5)) - 1]);
    ins.push(total(l, "in"));
    outv.push(total(l, "out"));
  }
  charts.push(new Chart(document.getElementById("c1"), {
    type: "line",
    data: { labels, datasets: [
      { label:"Kipato",   data:ins,  borderColor:css("--in"),  backgroundColor:css("--in") + "22",
        fill:true, tension:.35 },
      { label:"Matumizi", data:outv, borderColor:css("--out"), backgroundColor:css("--out") + "22",
        fill:true, tension:.35 }
    ]},
    options: { responsive:true, maintainAspectRatio:false,
      scales:{ x:{ grid:{ display:false } }, y:{ beginAtZero:true, grid:{ color:grid } } },
      plugins:{ legend:{ position:"bottom" } } }
  }));

  // 2. Pete: kipato kimeenda wapi (pamoja na kilichobaki)
  const c2 = document.getElementById("c2");
  if (c2){
    const spent = {};
    outs.forEach(t => { spent[t.cat] = (spent[t.cat] || 0) + t.amt; });
    const names = CATS.out.filter(c => spent[c] > 0);
    const data = names.map(c => spent[c]);
    const colors = names.map(c => PALETTE[CATS.out.indexOf(c)]);
    const left = income - outTotal;
    if (left > 0){ names.push("Kilichobaki"); data.push(left); colors.push("#A5D6A7"); }
    charts.push(new Chart(c2, {
      type: "doughnut",
      data: { labels:names,
              datasets:[{ data, backgroundColor:colors, borderColor:css("--surf"), borderWidth:2 }] },
      options: { responsive:true, maintainAspectRatio:false, cutout:"62%",
                 plugins:{ legend:{ position:"bottom", labels:{ boxWidth:12 } } } }
    }));
  }

  // 3. Matumizi kila siku ya mzunguko
  const c3 = document.getElementById("c3");
  if (c3){
    const days = cycleDays(ym);
    const vals = days.map(ds => outs.filter(t => t.date === ds).reduce((s, t) => s + t.amt, 0));
    charts.push(new Chart(c3, {
      type: "bar",
      data: { labels: days.map(ds => Number(ds.slice(8))),
              datasets:[{ label:"Matumizi", data:vals, backgroundColor:css("--out"), borderRadius:3 }] },
      options: { responsive:true, maintainAspectRatio:false,
        scales:{ x:{ grid:{ display:false } }, y:{ beginAtZero:true, grid:{ color:grid } } },
        plugins:{ legend:{ display:false } } }
    }));
  }
}

function ongezaView(){
  const td = tx.filter(t => t.date === today());
  return `<div class="head"><h1>Ongeza rekodi</h1></div><div class="card">
    <div class="seg">
      <button id="tOut" data-type="out">Matumizi</button>
      <button id="tIn" data-type="in">Mapato</button>
    </div>
    <label>Kiasi (TSh)</label>
    <input id="fa" type="number" inputmode="numeric" placeholder="mf. 5000">
    <label>Aina</label><select id="fc"></select>
    <label>Maelezo (si lazima)</label>
    <input id="fn" type="text" placeholder="mf. nauli ya daladala">
    <label>Tarehe</label><input id="fd" type="date" value="${today()}">
    <p id="err" class="out"></p>
    <button class="main-btn" id="save">Hifadhi</button>
    <p class="ok">${flash}</p></div>
    <div class="card">
      <div class="row"><b>Rekodi za leo</b>
        <span class="out">Umetumia leo: ${fmt(total(td, "out"))}</span></div>` +
    (td.length ? byNewest(td).map(itemHtml).join("")
               : `<p class="sub">Bado hujaandika kitu leo.</p>`) + `</div>`;
}

function bajetiView(){
  return `<div class="head"><h1>Bajeti</h1></div>
    <div class="card"><b>Msingi wa bajeti</b>
      <label>Mshahara wako wa kila mwezi (TSh)</label>
      <input type="number" inputmode="numeric" id="sSalary" value="${settings.salary || ""}">
      <label>Siku unayopokea mshahara (1 hadi 28)</label>
      <input type="number" inputmode="numeric" id="sPayday" min="1" max="28" value="${settings.payday}">
      <p class="sub">Mzunguko wako unaanzia siku hii. Ukipokea tarehe 28, mzunguko ni 28 hadi 27 ya mwezi unaofuata. Weka 1 kwa mwezi wa kawaida.</p></div>
    <div class="card insight" id="planInfo"></div>
    <div class="card"><b>Panga matumizi kwa kila aina (kwa mwezi)</b>` +
    CATS.out.map(c => `<label>${c}</label>
      <input type="number" inputmode="numeric" data-b="${c}" value="${budget[c] || ""}">`).join("") +
    `<button class="main-btn" id="saveBudget">Hifadhi bajeti</button></div>`;
}

function planInfo(){
  const sal = parseFloat(document.getElementById("sSalary").value) || 0;
  let planned = 0;
  document.querySelectorAll("[data-b]").forEach(i => { planned += parseFloat(i.value) || 0; });
  const free = sal - planned;
  document.getElementById("planInfo").innerHTML =
    `Mshahara: <b>${fmt(sal)}</b> · Umepanga: <b>${fmt(planned)}</b> · ` +
    (free >= 0 ? `Bado hujapangia: <b class="in">${fmt(free)}</b>`
               : `Umepanga zaidi ya mshahara kwa <b class="out">${fmt(-free)}</b>`);
}

function rekodiView(){
  return `<div class="head"><h1>Rekodi zote</h1></div><div class="card">` +
    (tx.length ? byNewest(tx).map(itemHtml).join("")
               : `<p class="sub">Hakuna rekodi bado.</p>`) + `</div>`;
}

function nakalaView(){
  const hasPin = !!getPin();
  return `<div class="head"><h1>Nakala na usalama</h1></div>
    <div class="card">
      <b>Nakala (backup)</b>
      <p>Rekodi zako ziko ndani ya simu hii. Pakua nakala mara kwa mara ili usizipoteze.</p>
      <p class="sub">Rekodi zilizopo: ${tx.length}</p>
      <button class="main-btn" id="export">Pakua nakala</button>
    </div>
    <div class="card"><b>Rudisha nakala</b>
      <p class="sub">Chagua faili ulilopakua awali. Rekodi zitaunganishwa na zilizopo, hazitafutwa.</p>
      <input type="file" id="import" accept=".json,application/json">
    </div>
    <div class="card"><b>PIN ya kufungua app</b>
      <p class="sub">${hasPin ? "PIN imewekwa. App inajifunga ukiiacha nyuma kwa dakika 1." : "Bado hujaweka PIN."}</p>
      <button class="main-btn" id="setPin">${hasPin ? "Badilisha PIN" : "Weka PIN"}</button>
      ${hasPin ? `<button class="del" id="removePin">Ondoa PIN</button>` : ""}
    </div>`;
}

// ===== 5. UCHAMBUZI WA MATUMIZI =====
const RANGES = [["leo","Leo"],["jana","Jana"],["wiki","Wiki hii"],
                ["wikipita","Wiki iliyopita"],["mzunguko","Mwezi huu"]];
const DOW = ["Jtt","Jnn","Jtn","Alh","Iju","Jms","Jpi"];   // Jumatatu ni ya kwanza

function addDays(ds, k){
  const [y, m, d] = ds.split("-").map(Number);
  const x = new Date(y, m - 1, d + k);
  return x.getFullYear() + "-" + pad(x.getMonth() + 1) + "-" + pad(x.getDate());
}
function dowIdx(ds){                 // 0 = Jumatatu ... 6 = Jumapili
  const [y, m, d] = ds.split("-").map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}
function weekStart(ds){ return addDays(ds, -dowIdx(ds)); }
function dayRange(start, n){ return Array.from({ length: n }, (_, i) => addDays(start, i)); }
function dm(ds){ return ds.slice(8) + "/" + ds.slice(5, 7); }
function sumAmt(l){ return l.reduce((s, t) => s + t.amt, 0); }

// days = siku za kipindi, prev = siku za kipindi cha kulinganisha (idadi sawa)
function periodDays(r){
  const t = today();
  if (r === "leo")
    return { days:[t], chartDays:[t], prev:[addDays(t,-1)], prevChart:[addDays(t,-1)],
             name:"leo", pname:"jana" };
  if (r === "jana"){
    const j = addDays(t, -1);
    return { days:[j], chartDays:[j], prev:[addDays(j,-1)], prevChart:[addDays(j,-1)],
             name:"jana", pname:"siku iliyotangulia" };
  }
  if (r === "wiki"){
    const s = weekStart(t), n = dowIdx(t) + 1, ps = addDays(s, -7);
    return { days:dayRange(s,n), chartDays:dayRange(s,7),
             prev:dayRange(ps,n), prevChart:dayRange(ps,7),
             name:"wiki hii", pname:`wiki iliyopita (siku ${n} za kwanza)` };
  }
  if (r === "wikipita"){
    const s = addDays(weekStart(t), -7), ps = addDays(s, -7);
    return { days:dayRange(s,7), chartDays:dayRange(s,7),
             prev:dayRange(ps,7), prevChart:dayRange(ps,7),
             name:"wiki iliyopita", pname:"wiki iliyotangulia" };
  }
  const cur = cycleOf(t);
  const all = cycleDays(cur), days = all.filter(d => d <= t);
  const pall = cycleDays(shiftMonth(cur, -1));
  return { days, chartDays:all, prev:pall.slice(0, days.length), prevChart:pall,
           name:"mwezi huu", pname:`mwezi uliopita (siku ${days.length} za kwanza)` };
}

function analyse(r){
  const p = periodDays(r);
  const inSet = new Set(p.days), prevSet = new Set(p.prev);
  const outs = tx.filter(t => t.type === "out");
  const cur = outs.filter(t => inSet.has(t.date));
  const prv = outs.filter(t => prevSet.has(t.date));
  const byCat = l => { const o = {}; l.forEach(t => { o[t.cat] = (o[t.cat] || 0) + t.amt; }); return o; };
  const catCur = byCat(cur), catPrev = byCat(prv);
  return { p, cur, outs, tot:sumAmt(cur), prevTot:sumAmt(prv), catCur, catPrev,
           names:CATS.out.filter(c => (catCur[c] || 0) > 0 || (catPrev[c] || 0) > 0) };
}

function uchambuziView(){
  A = analyse(rng);
  const { p, cur, tot, prevTot, catCur, catPrev, names } = A;
  const n = p.days.length;

  let pc = 0, chg = "—", cls = "";
  if (prevTot > 0){
    pc = Math.round((tot - prevTot) / prevTot * 100);
    chg = (pc > 0 ? "+" : pc < 0 ? "−" : "") + Math.abs(pc) + "%";
    cls = pc > 0 ? "out" : pc < 0 ? "in" : "";
  }

  const lines = [];
  if (tot === 0 && prevTot === 0){
    lines.push(`Hakuna matumizi yaliyoandikwa kwa ${p.name} wala ${p.pname}.`);
  } else if (tot === 0){
    lines.push(`Hujaandika matumizi kwa ${p.name}. Kwa ${p.pname} ulitumia ${fmt(prevTot)}.`);
  } else {
    if (prevTot > 0){
      const how = pc === 0 ? "sawa na"
        : `<b class="${pc > 0 ? "out" : "in"}">${Math.abs(pc)}% ${pc > 0 ? "zaidi" : "pungufu"}</b> kuliko`;
      lines.push(`Umetumia <b>${fmt(tot)}</b> ${p.name}. Ni ${how} ${p.pname} (${fmt(prevTot)}).`);
      let best = null;
      CATS.out.forEach(c => {
        const d = (catCur[c] || 0) - (catPrev[c] || 0);
        if (d !== 0 && (!best || Math.abs(d) > Math.abs(best.d))) best = { c, d };
      });
      if (best) lines.push(`Mabadiliko makubwa zaidi: <b>${esc(best.c)}</b> (${best.d > 0 ? "+" : "−"}${fmt(Math.abs(best.d))}).`);
    } else {
      lines.push(`Umetumia <b>${fmt(tot)}</b> ${p.name}. Hakuna matumizi ya ${p.pname} ya kulinganisha.`);
    }
    const top = Object.keys(catCur).sort((a, b) => catCur[b] - catCur[a])[0];
    lines.push(`Eneo kubwa la matumizi: <b>${esc(top)}</b> (${Math.round(catCur[top] / tot * 100)}%).`);
    if (n > 1){
      const per = p.days.map(d => sumAmt(cur.filter(t => t.date === d)));
      const mx = Math.max(...per);
      lines.push(`Siku ya matumizi makubwa zaidi: <b>${dm(p.days[per.indexOf(mx)])}</b> (${fmt(mx)}).`);
    }
  }

  const hasData = tot > 0 || prevTot > 0;
  return `<div class="head"><h1>Uchambuzi wa matumizi</h1></div>
    <div class="chips">${RANGES.map(([k, l]) =>
      `<button data-range="${k}" class="${k === rng ? "on" : ""}">${l}</button>`).join("")}</div>
    <p class="sub">${dm(p.days[0])}${n > 1 ? " – " + dm(p.days[n - 1]) : ""} · inalinganishwa na ${p.pname}</p>
    <div class="kpis">
      <div class="kpi o"><span class="sub">Matumizi</span><b class="out">${fmt(tot)}</b></div>
      <div class="kpi"><span class="sub">Wastani kwa siku</span><b>${fmt(n ? tot / n : 0)}</b></div>
      <div class="kpi"><span class="sub">Idadi ya rekodi</span><b>${cur.length}</b></div>
      <div class="kpi n"><span class="sub">Dhidi ya kipindi kilichopita</span><b class="${cls}">${chg}</b></div>
    </div>
    <div class="card insight">${lines.map(l => `<p>${l}</p>`).join("")}</div>
    <div class="grid2">
      ${hasData && p.chartDays.length > 1
        ? `<div class="card"><b>Matumizi kwa siku</b><div class="chartbox"><canvas id="c4"></canvas></div></div>` : ""}
      ${names.length
        ? `<div class="card"><b>Kwa aina: sasa dhidi ya kilichopita</b>
           <div class="chartbox" style="height:${Math.max(220, names.length * 50)}px"><canvas id="c5"></canvas></div></div>` : ""}
    </div>
    <div class="card"><b>Rekodi za kipindi hiki</b>` +
    (cur.length ? byNewest(cur).map(itemHtml).join("")
                : `<p class="sub">Hakuna rekodi.</p>`) + `</div>`;
}

function drawAnalysisCharts(){
  if (typeof Chart === "undefined") return;
  Chart.defaults.color = css("--mute");
  Chart.defaults.font.family = "system-ui, sans-serif";
  const grid = css("--line");
  const { p, outs, catCur, catPrev, names } = A;
  const day = d => sumAmt(outs.filter(t => t.date === d));

  const c4 = document.getElementById("c4");
  if (c4){
    const week = p.chartDays.length === 7;
    charts.push(new Chart(c4, {
      type: "bar",
      data: { labels: p.chartDays.map(d => week ? DOW[dowIdx(d)] : Number(d.slice(8))),
        datasets: [
          { type:"bar", label:"Sasa", data:p.chartDays.map(day),
            backgroundColor:css("--out"), borderRadius:4 },
          { type:"line", label:"Kipindi kilichopita",
            data:p.prevChart.slice(0, p.chartDays.length).map(day),
            borderColor:css("--mute"), borderDash:[5, 4], pointRadius:2, tension:.3 }
        ]},
      options: { responsive:true, maintainAspectRatio:false,
        scales:{ x:{ grid:{ display:false } }, y:{ beginAtZero:true, grid:{ color:grid } } },
        plugins:{ legend:{ position:"bottom" } } }
    }));
  }

  const c5 = document.getElementById("c5");
  if (c5){
    charts.push(new Chart(c5, {
      type: "bar",
      data: { labels: names,
        datasets: [
          { label:"Sasa", data:names.map(c => catCur[c] || 0),
            backgroundColor:css("--out"), borderRadius:3 },
          { label:"Kilichopita", data:names.map(c => catPrev[c] || 0),
            backgroundColor:css("--mute"), borderRadius:3 }
        ]},
      options: { indexAxis:"y", responsive:true, maintainAspectRatio:false,
        scales:{ x:{ beginAtZero:true, grid:{ color:grid } }, y:{ grid:{ display:false } } },
        plugins:{ legend:{ position:"bottom" } } }
    }));
  }
}

// ===== 6. TAHADHARI ZA KILA WIKI =====
function alertsHtml(){
  const msgs = [];                       // kila kimoja: [rangi, maandishi]
  const t = today();
  const outs = tx.filter(x => x.type === "out");
  const spentIn = days => { const s = new Set(days); return sumAmt(outs.filter(x => s.has(x.date))); };

  // 1. Wiki hii dhidi ya wiki iliyopita (siku sawa)
  const ws = weekStart(t), n = dowIdx(t) + 1;
  if (n >= 3){
    const thisW = spentIn(dayRange(ws, n));
    const lastW = spentIn(dayRange(addDays(ws, -7), n));
    if (thisW > 0 && lastW > 0){
      const pc = Math.round((thisW - lastW) / lastW * 100);
      if (pc >= 20)
        msgs.push(["bad", `Matumizi ya wiki hii yako juu: <b>${fmt(thisW)}</b>, ni ${pc}% zaidi kuliko wiki iliyopita kwa siku sawa (${fmt(lastW)}).`]);
      else if (pc <= -20)
        msgs.push(["good", `Hongera! Wiki hii umetumia <b>${Math.abs(pc)}% pungufu</b> kuliko wiki iliyopita.`]);
    }
  }

  // 2. Mwendo wa matumizi dhidi ya bajeti ya jumla
  const planned = CATS.out.reduce((s, c) => s + (budget[c] || 0), 0);
  const cur = cycleOf(t), all = cycleDays(cur);
  const elapsed = all.filter(d => d <= t).length;
  const list = monthList(cur).filter(x => x.type === "out");
  const spent = sumAmt(list);
  if (planned > 0 && elapsed >= 5){
    const proj = spent / elapsed * all.length;
    if (spent > planned)
      msgs.push(["bad", `Umevuka bajeti yako ya jumla (${fmt(planned)}) kwa <b>${fmt(spent - planned)}</b>.`]);
    else if (proj > planned * 1.05)
      msgs.push(["warn", `Kwa mwendo huu utatumia takriban <b>${fmt(proj)}</b> mzunguko huu, wakati bajeti yako ni ${fmt(planned)}. Punguza kidogo.`]);
  }

  // 3. Aina zilizokaribia au kuvuka kikomo
  const by = {};
  list.forEach(x => { by[x.cat] = (by[x.cat] || 0) + x.amt; });
  CATS.out.forEach(c => {
    const lim = budget[c] || 0;
    if (!lim || !by[c]) return;
    const pc = by[c] / lim * 100;
    if (pc > 100) msgs.push(["bad", `<b>${esc(c)}</b>: umevuka bajeti kwa ${fmt(by[c] - lim)}.`]);
    else if (pc >= 80) msgs.push(["warn", `<b>${esc(c)}</b>: umetumia ${Math.round(pc)}% ya bajeti (baki ${fmt(lim - by[c])}).`]);
  });

  // 4. Ripoti ya wiki iliyopita (mara moja kwa wiki)
  let report = "";
  if (settings.reportSeen !== ws){
    const lw = dayRange(addDays(ws, -7), 7);
    const lwList = outs.filter(x => lw.includes(x.date));
    const lwTot = sumAmt(lwList);
    if (lwTot > 0){
      const wwTot = spentIn(dayRange(addDays(ws, -14), 7));
      const cat = {};
      lwList.forEach(x => { cat[x.cat] = (cat[x.cat] || 0) + x.amt; });
      const top = Object.keys(cat).sort((a, b) => cat[b] - cat[a])[0];
      const cmp = wwTot > 0
        ? ` (${lwTot >= wwTot ? "+" : "−"}${Math.round(Math.abs(lwTot - wwTot) / wwTot * 100)}% dhidi ya wiki iliyotangulia)` : "";
      report = `<div class="card alert report"><b>Ripoti ya wiki iliyopita</b>
        <p>Ulitumia <b>${fmt(lwTot)}</b>${cmp}. Eneo kubwa: <b>${esc(top)}</b> (${fmt(cat[top])}).</p>
        <button class="main-btn" data-act="seen">Nimeelewa</button></div>`;
    }
  }
  return report + msgs.slice(0, 5).map(([k, h]) => `<div class="card alert ${k}">${h}</div>`).join("");
}

// ===== PIN YA KUFUNGUA APP =====
const PIN_KEY = "pz_pin";       // PIN inahifadhiwa tofauti, haiingii kwenye nakala (backup)
let fails = 0, lockedUntil = 0, hiddenAt = 0;

function getPin(){
  try { return JSON.parse(localStorage.getItem(PIN_KEY) || "null"); }
  catch (e) { return null; }
}

async function hashPin(pin, salt){
  const data = new TextEncoder().encode(salt + ":" + pin);
  if (window.crypto && crypto.subtle){
    const buf = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  }
  let h = 5381;                  // njia mbadala dhaifu kama browser haina crypto.subtle
  data.forEach(b => { h = ((h << 5) + h + b) >>> 0; });
  return "w" + h;
}

// mode: "set" (kuweka PIN mpya) au "unlock" (kufungua)
function lockScreen(mode, onDone){
  const old = document.getElementById("lock");
  if (old) old.remove();
  const setting = mode === "set";
  const box = document.createElement("div");
  box.id = "lock";
  box.className = "lock";
  box.innerHTML = `<div class="lockbox">
    <h1>Pesa Zangu</h1>
    <p class="sub">${setting ? "Weka PIN mpya (tarakimu 4 hadi 8)" : "Weka PIN kufungua"}</p>
    <input id="pinIn" type="password" inputmode="numeric" maxlength="8" autocomplete="off">
    ${setting ? `<input id="pinIn2" type="password" inputmode="numeric" maxlength="8" placeholder="Rudia PIN" autocomplete="off">` : ""}
    <p id="pinErr" class="out"></p>
    <button class="main-btn" id="pinOk">${setting ? "Hifadhi PIN" : "Fungua"}</button>
    <button class="del" id="pinAlt">${setting ? "Ghairi" : "Umesahau PIN?"}</button>
  </div>`;
  document.body.appendChild(box);

  const pin1 = document.getElementById("pinIn");
  const pin2 = document.getElementById("pinIn2");
  const err = document.getElementById("pinErr");
  const ok = document.getElementById("pinOk");
  pin1.focus();
  box.querySelectorAll("input").forEach(i =>
    i.addEventListener("keydown", e => { if (e.key === "Enter") ok.click(); }));

  ok.onclick = async () => {
    const v = pin1.value;
    if (setting){
      if (!/^\d{4,8}$/.test(v)){ err.textContent = "PIN iwe tarakimu 4 hadi 8."; return; }
      if (v !== pin2.value){ err.textContent = "PIN mbili hazilingani."; return; }
      const salt = Date.now() + "-" + Math.random().toString(36).slice(2);
      localStorage.setItem(PIN_KEY, JSON.stringify({ salt, hash: await hashPin(v, salt) }));
      box.remove();
      if (onDone) onDone();
      return;
    }
    if (Date.now() < lockedUntil){
      err.textContent = "Subiri sekunde " + Math.ceil((lockedUntil - Date.now()) / 1000) + " kisha ujaribu tena.";
      return;
    }
    const p = getPin();
    if (p && await hashPin(v, p.salt) === p.hash){
      fails = 0;
      box.remove();
    } else {
      fails++;
      pin1.value = "";
      if (fails >= 5){
        lockedUntil = Date.now() + 30000;
        fails = 0;
        err.textContent = "Umekosea mara 5. Subiri sekunde 30.";
      } else {
        err.textContent = "PIN si sahihi.";
      }
    }
  };

  document.getElementById("pinAlt").onclick = () => {
    if (setting){ box.remove(); return; }
    if (confirm("Hii itafuta rekodi zote na PIN kwenye simu hii. Unaweza kuzirudisha kwa nakala (backup) uliyopakua. Endelea?")){
      ["tx", "budget", "settings", PIN_KEY].forEach(k => localStorage.removeItem(k));
      location.reload();
    }
  };
}

// jifunge yenyewe ukiacha app nyuma kwa zaidi ya dakika 1
document.addEventListener("visibilitychange", () => {
  if (document.hidden){ hiddenAt = Date.now(); return; }
  if (getPin() && hiddenAt && Date.now() - hiddenAt > 60000 && !document.getElementById("lock"))
    lockScreen("unlock");
});

// ===== 7. KUCHORA UKURASA =====
function render(){
  charts.forEach(c => c.destroy());
  charts = [];
  document.querySelectorAll(".side nav button").forEach(b =>
    b.classList.toggle("on", b.dataset.v === view));
  const views = { dash:dashView, uchambuzi:uchambuziView, ongeza:ongezaView,
                  bajeti:bajetiView, rekodi:rekodiView, nakala:nakalaView };
  const showAlerts = (view === "dash" || view === "ongeza");
  document.getElementById("app").innerHTML = (showAlerts ? alertsHtml() : "") + views[view]();
  flash = "";
  if (view === "ongeza") setType(type);
  if (view === "bajeti") planInfo();
  if (view === "dash") drawCharts();
  if (view === "uchambuzi") drawAnalysisCharts();
}

// ===== 8. VITENDO =====
function setType(t){
  type = t;
  document.getElementById("tOut").classList.toggle("on", t === "out");
  document.getElementById("tIn").classList.toggle("on", t === "in");
  document.getElementById("fc").innerHTML =
    CATS[t].map(c => `<option>${c}</option>`).join("");
}

function saveTx(){
  const amt = parseFloat(document.getElementById("fa").value);
  const date = document.getElementById("fd").value;
  const err = document.getElementById("err");
  if (!(amt > 0)){ err.textContent = "Weka kiasi kikubwa kuliko sifuri."; return; }
  if (!date){ err.textContent = "Chagua tarehe."; return; }
  tx.push({ id: Date.now(), type, amt,
            cat: document.getElementById("fc").value,
            note: document.getElementById("fn").value.trim(), date });
  save();
  ym = cycleOf(date);
  flash = "Imehifadhiwa ✓";
  render();                        // tunabaki kwenye ukurasa wa Ongeza
}

function exportData(){
  const blob = new Blob([JSON.stringify({ tx, budget, settings }, null, 2)],
                        { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "pesa-zangu-" + today() + ".json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

document.querySelectorAll(".side nav button").forEach(b => {
  b.onclick = () => { view = b.dataset.v; render(); window.scrollTo(0, 0); };
});

document.getElementById("app").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.range){ rng = b.dataset.range; render(); return; }
  if (b.dataset.act === "seen"){
    settings.reportSeen = weekStart(today());
    save(); render(); return;
  }
  if (b.dataset.m){
    ym = shiftMonth(ym, Number(b.dataset.m));
    render();
  } else if (b.dataset.del){
    if (confirm("Una uhakika unataka kufuta?")){
      tx = tx.filter(t => t.id !== Number(b.dataset.del));
      save(); render();
    }
  } else if (b.dataset.type){
    setType(b.dataset.type);
  } else if (b.id === "save"){
    saveTx();
  } else if (b.id === "saveBudget"){
    document.querySelectorAll("[data-b]").forEach(inp => {
      const v = parseFloat(inp.value);
      if (v > 0) budget[inp.dataset.b] = v; else delete budget[inp.dataset.b];
    });
    settings.salary = parseFloat(document.getElementById("sSalary").value) || 0;
    const p = parseInt(document.getElementById("sPayday").value);
    settings.payday = (p >= 1 && p <= 28) ? p : 1;
    ym = cycleOf(today());
    save(); view = "dash"; render();
  } else if (b.id === "export"){
    exportData();
  } else if (b.id === "setPin"){
    lockScreen("set", render);
  } else if (b.id === "removePin"){
    if (confirm("Ondoa PIN? Mtu yeyote atakayefungua app ataona rekodi zako.")){
      localStorage.removeItem(PIN_KEY);
      render();
    }
  }
});

// bajeti ibadilike papo hapo unapoandika
document.getElementById("app").addEventListener("input", e => {
  if (e.target.id === "sSalary" || e.target.dataset.b) planInfo();
});

document.getElementById("app").addEventListener("change", e => {
  if (e.target.id !== "import") return;
  const file = e.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      const ids = new Set(tx.map(t => t.id));
      (d.tx || []).forEach(t => {
        if (t && t.date && t.amt > 0 && !ids.has(t.id)) tx.push(t);
      });
      Object.assign(budget, d.budget || {});
      Object.assign(settings, d.settings || {});
      ym = cycleOf(today());
      save(); view = "dash"; render();
      alert("Nakala imerudishwa.");
    } catch (err) {
      alert("Faili hili si nakala sahihi ya Pesa Zangu.");
    }
  };
  r.readAsText(file);
});

if (getPin()) lockScreen("unlock");
render();