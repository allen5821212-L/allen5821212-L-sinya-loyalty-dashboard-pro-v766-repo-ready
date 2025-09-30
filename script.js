// ====== Utilities ======
const $ = (sel, ctx=document) => ctx.querySelector(sel);
const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));
const format = (n) => (isFinite(n) ? n.toLocaleString('zh-TW', {maximumFractionDigits: 0}) : '-');

const STORAGE_KEY = "sinya_v7_optimized_state";

function readNumber(el) {
  const v = parseFloat(el.value || el.textContent);
  return isFinite(v) ? v : 0;
}

function clamp(v, min, max){ return Math.min(max, Math.max(min, v)); }

// ====== Data Model ======
function collectState(){
  const tiers = $$('#tierTable tbody tr').map(tr => {
    const [levelEl, nEl, aspEl, cashR, cardR] = $$('td', tr);
    return {
      level: levelEl.textContent.trim(),
      members: parseFloat(nEl.textContent.trim()) || 0,
      asp: parseFloat(aspEl.textContent.trim()) || 0,
      cashRebatePct: parseFloat(cashR.textContent.trim()) || 0,
      cardRebatePct: parseFloat(cardR.textContent.trim()) || 0,
    };
  });

  const campaigns = $$('#campaignTable tbody tr').map(tr => {
    const [name, month, uplift, cost] = $$('td input', tr).map(i => i.value);
    return { name, month: parseInt(month)||1, upliftPct: parseFloat(uplift)||0, cost: parseFloat(cost)||0 };
  });

  const monthlyRows = $$('#monthlyTable tbody tr').map(tr => {
    const tds = $$('td', tr);
    return {
      month: parseInt(tds[0].textContent),
      coef: parseFloat($('input', tds[1]).value) || 0,
      salesTarget: parseFloat($('input', tds[2]).value) || 0,
      gpTarget: parseFloat($('input', tds[3]).value) || 0,
      salesActual: parseFloat($('input', tds[4]).value) || 0,
      gpActual: parseFloat($('input', tds[6]).value) || 0,
    };
  });

  return {
    annualSalesTarget: readNumber($('#annualSalesTarget')),
    annualGpTarget: readNumber($('#annualGpTarget')),
    annualMarketingCost: readNumber($('#annualMarketingCost')),
    gmPct: readNumber($('#gmPct')),
    cashPct: readNumber($('#cashPct')),
    cardPct: readNumber($('#cardPct')),
    cardFeePct: readNumber($('#cardFeePct')),
    tiers, campaigns, monthlyRows,
    birthdayAmt: readNumber($('#birthdayAmt')),
    birthdayRate: readNumber($('#birthdayRate')),
    ugcMonthly: readNumber($('#ugcMonthly')),
    referrerAmt: readNumber($('#referrerAmt')),
    inviteeAmt: readNumber($('#inviteeAmt')),
    refOrdersYear: readNumber($('#refOrdersYear')),
    impactPay: $('#impactPay').value,
    impactTiers: $('#impactTiers').value
  };
}

function hydrateState(state){
  $('#annualSalesTarget').value = state.annualSalesTarget ?? 0;
  $('#annualGpTarget').value = state.annualGpTarget ?? 0;
  $('#annualMarketingCost').value = state.annualMarketingCost ?? 0;
  $('#gmPct').value = state.gmPct ?? 0;
  $('#cashPct').value = state.cashPct ?? 0;
  $('#cardPct').value = state.cardPct ?? 0;
  $('#cardFeePct').value = state.cardFeePct ?? 0;
  $('#birthdayAmt').value = state.birthdayAmt ?? 0;
  $('#birthdayRate').value = state.birthdayRate ?? 0;
  $('#ugcMonthly').value = state.ugcMonthly ?? 0;
  $('#referrerAmt').value = state.referrerAmt ?? 0;
  $('#inviteeAmt').value = state.inviteeAmt ?? 0;
  $('#refOrdersYear').value = state.refOrdersYear ?? 0;
  $('#impactPay').value = state.impactPay ?? 'all';
  $('#impactTiers').value = state.impactTiers ?? '';

  // tiers
  const tbody = $('#tierTable tbody');
  tbody.innerHTML = '';
  (state.tiers ?? []).forEach(t => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td contenteditable>${t.level}</td>
      <td contenteditable>${t.members}</td>
      <td contenteditable>${t.asp}</td>
      <td contenteditable>${t.cashRebatePct}</td>
      <td contenteditable>${t.cardRebatePct}</td>
      <td><button class="row-del">刪</button></td>
    `;
    tbody.appendChild(tr);
  });

  // campaigns
  const ctbody = $('#campaignTable tbody');
  ctbody.innerHTML='';
  (state.campaigns ?? []).forEach(c => addCampaignRow(c));

  // monthly
  const mtbody = $('#monthlyTable tbody');
  mtbody.innerHTML='';
  for(let m=1;m<=12;m++){
    const r = state.monthlyRows?.find(x=>x.month===m) || {};
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${m}</td>
      <td><input type="number" step="0.1" value="${r.coef ?? (100/12).toFixed(2)}"/></td>
      <td><input type="number" value="${r.salesTarget ?? 0}"/></td>
      <td><input type="number" value="${r.gpTarget ?? 0}"/></td>
      <td><input type="number" value="${r.salesActual ?? 0}"/></td>
      <td class="att-badge"></td>
      <td><input type="number" value="${r.gpActual ?? 0}"/></td>
      <td class="att-badge"></td>
    `;
    mtbody.appendChild(tr);
  }
}

function saveLocal(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(collectState()));
  alert('已存檔（LocalStorage）');
}
function loadLocal(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(!raw){ alert('尚無存檔'); return; }
  const state = JSON.parse(raw);
  hydrateState(state);
  recalcAll();
}

// ====== Calculations ======
function normalizedPayShare(cashPct, cardPct){
  let c = Math.max(0, cashPct), d = Math.max(0, cardPct);
  const sum = c + d;
  if(sum <= 0) return {cash:0.5, card:0.5};
  return { cash: c/sum, card: d/sum };
}

function calcTotals(state){
  // Sales from tiers:
  const annualSales = state.tiers.reduce((sum, t)=> sum + t.members * t.asp, 0);

  // GP from GM%
  const gp = annualSales * (state.gmPct/100);

  // Rebates: purchase rebates weighted by pay share + birthday + UGC + referral
  const payShare = normalizedPayShare(state.cashPct, state.cardPct);
  const purchaseRebates = state.tiers.reduce((sum, t) => {
    const cashRb = t.cashRebatePct/100, cardRb = t.cardRebatePct/100;
    const blendedRb = payShare.cash*cashRb + payShare.card*cardRb;
    return sum + t.members * t.asp * blendedRb;
  }, 0);

  const birthdayRebates = state.tiers.reduce((sum, t) => sum + t.members * (state.birthdayRate/100) * state.birthdayAmt, 0);
  const ugcRebates = state.ugcMonthly * 12;
  const referralRebates = (state.referrerAmt + state.inviteeAmt) * state.refOrdersYear;

  const rebatesTotal = purchaseRebates + birthdayRebates + ugcRebates + referralRebates;

  // Card fees (only card portion of sales)
  const cardFees = annualSales * normalizedPayShare(state.cashPct, state.cardPct).card * (state.cardFeePct/100);

  // Campaigns: simple sum of costs + uplift on sales/gp (uplift applied multiplicatively to sales; gp follows GM%)
  const upliftFactor = 1 + state.campaigns.reduce((acc,c)=> acc + (c.upliftPct/100), 0);
  const campaignCost = state.campaigns.reduce((acc,c)=> acc + c.cost, 0);

  const salesAfterUplift = annualSales * upliftFactor;
  const gpAfterUplift = salesAfterUplift * (state.gmPct/100);

  // Net
  const net = gpAfterUplift - rebatesTotal - cardFees - campaignCost - state.annualMarketingCost;

  return {
    annualSales, gp, rebatesTotal, cardFees, campaignCost,
    salesAfterUplift, gpAfterUplift, net, payShare
  };
}

function distributeMonthly(state, totals){
  // Apply coefficient template -> distribute targets
  const tSales = state.annualSalesTarget || totals.salesAfterUplift;
  const tGp = state.annualGpTarget || totals.gpAfterUplift;

  const rows = $$('#monthlyTable tbody tr');
  let coefs = rows.map(r => parseFloat($$('td input', r)[0].value) || 0);
  const sum = coefs.reduce((a,b)=>a+b,0);
  if(sum <= 0) coefs = coefs.map(_=>100/12);
  const norm = coefs.map(v => v / coefs.reduce((a,b)=>a+b,0));

  rows.forEach((tr, i) => {
    const inputs = $$('td input', tr);
    const s = Math.round(tSales * norm[i]);
    const g = Math.round(tGp * norm[i]);
    inputs[1].value = s;
    inputs[2].value = g;

    // attainment badges
    const salesActual = parseFloat(inputs[2+0].value) || 0; // will be 0 initially
    const gpActual = parseFloat(inputs[2+2].value) || 0;
    const salesRate = s ? (salesActual / s) : 0;
    const gpRate = g ? (gpActual / g) : 0;
    const salesBadge = $('td.att-badge', tr);
    const gpBadge = $$('td.att-badge', tr)[1];
    salesBadge.innerHTML = badge(salesRate);
    gpBadge.innerHTML = badge(gpRate);
  });
}

function badge(rate){
  if(rate >= 1.0) return `<span class="badge green">${(rate*100).toFixed(1)}%</span>`;
  if(rate >= 0.95) return `<span class="badge">${(rate*100).toFixed(1)}%</span>`;
  return `<span class="badge red">${(rate*100).toFixed(1)}%</span>`;
}

function recalcAll(){
  const state = collectState();
  const totals = calcTotals(state);

  // KPI Tiles
  $('#kpiSales').textContent = format(totals.salesAfterUplift);
  $('#kpiGp').textContent = format(totals.gpAfterUplift);
  $('#kpiRebates').textContent = format(totals.rebatesTotal);
  $('#kpiFees').textContent = format(totals.cardFees);
  $('#kpiCampaignCost').textContent = format(totals.campaignCost);
  $('#kpiNet').textContent = format(totals.net);

  // Attainment
  const salesAtt = totals.salesAfterUplift / (collectState().annualSalesTarget || totals.salesAfterUplift || 1);
  const netAtt = totals.net / (collectState().annualGpTarget || totals.gpAfterUplift || 1);
  $('#attSales').textContent = (salesAtt*100).toFixed(1) + '%';
  $('#attNet').textContent = (netAtt*100).toFixed(1) + '%';

  // Monthly distribution
  distributeMonthly(state, totals);
}

// ====== Campaign Rows ======
function addCampaignRow(c={name:'活動', month:1, upliftPct:2, cost:50000}){
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input value="${c.name}"/></td>
    <td><input type="number" min="1" max="12" value="${c.month}"/></td>
    <td><input type="number" step="0.1" value="${c.upliftPct}"/></td>
    <td><input type="number" value="${c.cost}"/></td>
    <td><button class="row-del">刪</button></td>
  `;
  $('#campaignTable tbody').appendChild(tr);
}

// ====== Monthly Table Init ======
function initMonthly(){
  const tbody = $('#monthlyTable tbody');
  tbody.innerHTML='';
  for(let m=1;m<=12;m++){
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${m}</td>
      <td><input type="number" step="0.1" value="${(100/12).toFixed(2)}"/></td>
      <td><input type="number" value="0"/></td>
      <td><input type="number" value="0"/></td>
      <td><input type="number" value="0"/></td>
      <td class="att-badge"></td>
      <td><input type="number" value="0"/></td>
      <td class="att-badge"></td>
    `;
    tbody.appendChild(tr);
  }
}

// ====== Coefficient Templates ======
const coefTemplates = {
  balanced: Array(12).fill(100/12),
  gaming: [7,7,7,7,8,8,8,9,10,10,14,15], // 偏重 Q4
  double11: [7,7,7,7,7,8,8,9,10,13,16,11], // 11月最高
};
function applyCoefTemplate(key){
  const coefs = coefTemplates[key] || coefTemplates.balanced;
  const sum = coefs.reduce((a,b)=>a+b,0);
  const norm = coefs.map(v => v/sum*100);
  $$('#monthlyTable tbody tr').forEach((tr, i) => {
    $$('td input', tr)[0].value = norm[i].toFixed(2);
  });
}

// ====== Optimizer (simple what-if) ======
function generateAdvice(){
  const state = collectState();
  const totals = calcTotals(state);

  const gap = Math.max(0, (state.annualGpTarget || totals.gpAfterUplift) - totals.gpAfterUplift);
  const adviceRows = [];

  // A: 提升 ASP 以補足缺口（固定會員數）
  const membersTotal = state.tiers.reduce((s,t)=>s+t.members,0) || 1;
  const gm = state.gmPct/100 || 0.12;
  const needSalesA = gap / gm;
  const deltaAsp = needSalesA / membersTotal;
  adviceRows.push({
    plan:'A',
    desc:`將全體等級 ASP 平均 +${Math.ceil(deltaAsp)} 元`,
    sales: Math.round(totals.salesAfterUplift + needSalesA),
    gp: Math.round(totals.gpAfterUplift + gap),
    pct: ((gap / (totals.gpAfterUplift||1))*100).toFixed(1)+'%'
  });

  // B: 增加會員數（固定 ASP）
  const avgAsp = state.tiers.reduce((s,t)=>s + t.members*t.asp,0) / (membersTotal||1);
  const needMembers = needSalesA / (avgAsp||1);
  adviceRows.push({
    plan:'B',
    desc:`將全體會員數 +${Math.ceil(needMembers)} 人`,
    sales: Math.round(totals.salesAfterUplift + needSalesA),
    gp: Math.round(totals.gpAfterUplift + gap),
    pct: ((gap / (totals.gpAfterUplift||1))*100).toFixed(1)+'%'
  });

  const tbody = $('#adviceTable tbody');
  tbody.innerHTML='';
  adviceRows.forEach(r=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.plan}</td><td>${r.desc}</td><td>${format(r.sales)}</td><td>${format(r.gp)}</td><td>${r.pct}</td>`;
    tbody.appendChild(tr);
  });
}

// ====== CSV Export (Monthly KPI) ======
function downloadCSV(){
  const rows = $$('#monthlyTable tbody tr').map(tr => {
    const tds = $$('td', tr);
    const month = tds[0].textContent.trim();
    const coef = $$('input', tds)[0].value;
    const salesT = $$('input', tds)[1].value;
    const gpT = $$('input', tds)[2].value;
    const salesA = $$('input', tds)[3].value;
    const gpA = $$('input', tds)[5].value;
    const salesRate = salesT > 0 ? (salesA/salesT) : 0;
    const gpRate = gpT > 0 ? (gpA/gpT) : 0;
    return {Month:month,CoefPct:coef,SalesTarget:salesT,GPTarget:gpT,SalesActual:salesA,SalesAttainment:(salesRate*100).toFixed(2)+'%',GPActual:gpA,GPAttainment:(gpRate*100).toFixed(2)+'%'};
  });
  const header = Object.keys(rows[0]).join(",");
  const csv = [header].concat(rows.map(r=>Object.values(r).join(","))).join("\n");
  const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'monthly_kpi.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ====== Events ======
function bindEvents(){
  // live recalc
  document.body.addEventListener('input', e => {
    if(e.target.matches('input, [contenteditable=""], [contenteditable]')) recalcAll();
  });

  // row deletes
  document.body.addEventListener('click', e => {
    if(e.target.classList.contains('row-del')){
      e.target.closest('tr').remove();
      recalcAll();
    }
  });

  $('#addTier').addEventListener('click', () => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td contenteditable>新等級</td><td contenteditable>0</td><td contenteditable>0</td><td contenteditable>1.0</td><td contenteditable>0.1</td><td><button class="row-del">刪</button></td>`;
    $('#tierTable tbody').appendChild(tr);
  });

  $('#addCampaign').addEventListener('click', ()=> addCampaignRow());
  $('#clearCampaigns').addEventListener('click', ()=> { $('#campaignTable tbody').innerHTML=''; recalcAll(); });

  $('#applyCoef').addEventListener('click', ()=> { applyCoefTemplate($('#coefTpl').value); recalcAll(); });

  $('#saveBtn').addEventListener('click', saveLocal);
  $('#loadBtn').addEventListener('click', loadLocal);

  $('#exportJsonBtn').addEventListener('click', () => {
    const data = JSON.stringify(collectState(), null, 2);
    const blob = new Blob([data], {type: 'application/json;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sinya_v7_scenario.json';
    a.click();
    URL.revokeObjectURL(url);
  });
  $('#importJsonBtn').addEventListener('click', ()=> $('#importJsonInput').click());
  $('#importJsonInput').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const state = JSON.parse(reader.result);
        hydrateState(state);
        recalcAll();
      } catch(err){
        alert('JSON 解析失敗：' + err.message);
      }
    };
    reader.readAsText(file, 'utf-8');
  });

  $('#genAdvice').addEventListener('click', generateAdvice);
  $('#downloadCsvBtn').addEventListener('click', downloadCSV);
}

// ====== Init ======
(function init(){
  initMonthly();
  bindEvents();
  recalcAll();
  // try load
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw){
      hydrateState(JSON.parse(raw));
      recalcAll();
    }
  }catch(_){}
})();
