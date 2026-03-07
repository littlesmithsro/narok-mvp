const EUR = new Intl.NumberFormat('sk-SK', { style: 'currency', currency: 'EUR' });

function dailyBase(monthlyBase) {
  return (monthlyBase * 12) / 365;
}
function clamp(v, min = 0, max = 100) { return Math.max(min, Math.min(max, v)); }
function scoreByRatio(current, target, weight) {
  if (!target || target <= 0) return 0;
  const ratio = clamp((current / target) * 100, 0, 100);
  return (ratio / 100) * weight;
}
function statusFromScore(score) {
  if (score >= 100) return { label: 'Eligible', cls: 'ok' };
  if (score >= 50) return { label: 'Almost', cls: 'warn' };
  return { label: 'Low', cls: 'bad' };
}
function statusLabel(status) {
  return ({ employee:'Zamestnanec', szco:'SZČO', unemployed:'Nezamestnaný', parental:'Rodič / rodičovská', student:'Študent', other:'Iné' })[status] || status;
}

function evaluateBenefits(input) {
  const dvz = dailyBase(input.monthlyBase);
  const benefits = [];

  // PN
  {
    let score = 0; const missing = [];
    score += input.insured ? 40 : 0;
    score += scoreByRatio(input.sicknessDays2y, 270, 40);
    score += input.status === 'szco' ? (input.hasSocialDebt ? 0 : 20) : 20;
    if (!input.insured) missing.push('Aktívne nemocenské poistenie');
    if (input.sicknessDays2y < 270) missing.push(`Doplniť dni poistenia (${input.sicknessDays2y}/270)`);
    if (input.status === 'szco' && input.hasSocialDebt) missing.push('Vysporiadať nedoplatky na sociálnom poistení');
    const eligible = score >= 100;
    let total = 0;
    if (eligible) {
      total = input.status === 'employee'
        ? Math.min(input.pnDays, 3) * dvz * 0.25 + Math.max(0, input.pnDays - 3) * dvz * 0.55
        : input.pnDays * dvz * 0.55;
    }
    benefits.push({ id:'pn', name:'PN (nemocenské)', score:clamp(Math.round(score)), missing, estimateMonthly:total, estimateTotal:total, extra: eligible ? `Odhad za ${input.pnDays} dní: ${EUR.format(total)}` : 'Orientačný výpočet po splnení podmienok.' });
  }

  // OČR
  {
    let score = 0; const missing = [];
    score += input.insured ? 40 : 0;
    score += scoreByRatio(input.sicknessDays2y, 270, 40);
    score += input.status === 'szco' ? (input.hasSocialDebt ? 0 : 20) : 20;
    if (!input.insured) missing.push('Aktívne nemocenské poistenie');
    if (input.sicknessDays2y < 270) missing.push(`Doplniť dni poistenia (${input.sicknessDays2y}/270)`);
    if (input.status === 'szco' && input.hasSocialDebt) missing.push('Vysporiadať nedoplatky na sociálnom poistení');
    const eligible = score >= 100;
    const cappedDays = Math.min(input.ocrDays, 14);
    const total = eligible ? cappedDays * dvz * 0.55 : 0;
    benefits.push({ id:'ocr', name:'OČR', score:clamp(Math.round(score)), missing, estimateMonthly:total, estimateTotal:total, extra: eligible ? `Odhad za ${cappedDays} dní: ${EUR.format(total)}` : 'MVP režim: krátka OČR do 14 dní.' });
  }

  // Nezamestnanosť
  {
    let score = 0; const missing = [];
    score += input.registeredJobseeker ? 30 : 0;
    score += input.hasUnemploymentInsurance ? 30 : 0;
    score += scoreByRatio(input.unemploymentDays4y, 730, 40);
    if (!input.registeredJobseeker) missing.push('Evidencia na úrade práce');
    if (!input.hasUnemploymentInsurance) missing.push('Poistenie v nezamestnanosti');
    if (input.unemploymentDays4y < 730) missing.push(`Doplniť dni poistenia (${input.unemploymentDays4y}/730)`);
    const eligible = score >= 100;
    const monthly = eligible ? dvz * 0.5 * 30.4167 : 0;
    const months = eligible ? 6 : 0;
    benefits.push({ id:'unemployment', name:'Podpora v nezamestnanosti', score:clamp(Math.round(score)), missing, estimateMonthly:monthly, estimateTotal:monthly*months, months, extra: eligible ? `Trvanie: ${months} mesiacov · Celkom: ${EUR.format(monthly*months)}` : 'Štandardne 6 mesiacov po splnení podmienok.' });
  }

  // Prídavok na dieťa
  {
    let score = 0; const missing = [];
    score += input.childrenCount > 0 ? 70 : 0;
    score += input.residencySr ? 30 : 0;
    if (input.childrenCount <= 0) missing.push('Mať nezaopatrené dieťa');
    if (!input.residencySr) missing.push('Pobyt/väzba na SR');
    benefits.push({ id:'child', name:'Prídavok na dieťa', score:clamp(Math.round(score)), missing, estimateMonthly:null, estimateTotal:null, extra:'Suma podľa aktuálnej sadzby štátu.' });
  }

  return benefits;
}

function estimatedPotential(b) {
  return typeof b.estimateTotal === 'number' && Number.isFinite(b.estimateTotal) ? b.estimateTotal : 0;
}

function prioritizeBenefits(benefits) {
  return [...benefits].sort((a, b) => {
    const pot = estimatedPotential(b) - estimatedPotential(a);
    if (pot !== 0) return pot;
    return b.score - a.score;
  });
}

function benefitCard(b, idx = 0) {
  const status = statusFromScore(b.score);
  const missing = b.missing.length ? `<ul class="missing">${b.missing.slice(0, 4).map((m)=>`<li>${m}</li>`).join('')}</ul>` : '<div class="muted">Bez chýbajúcich položiek.</div>';
  const amount = typeof b.estimateMonthly === 'number' ? `<div class="muted">Mesačne (odhad): <strong>${EUR.format(b.estimateMonthly)}</strong></div>` : '';
  const priorityPill = idx < 3 ? `<span class="pill warn" style="margin-left:6px;">TOP ${idx + 1}</span>` : '';
  return `<article class="result-card"><div class="row-between"><h3>${b.name}</h3><div><span class="pill ${status.cls}">${status.label}</span>${priorityPill}</div></div><div class="progress-wrap"><div class="progress"><span style="width:${b.score}%"></span></div><div class="progress-text"><strong>${b.score}%</strong></div></div>${amount}<div class="muted">Potenciál celkom: <strong>${EUR.format(estimatedPotential(b))}</strong></div><div class="muted">${b.extra||''}</div><div class="muted"><strong>Čo chýba:</strong></div>${missing}</article>`;
}

function summaryCards(input, benefits) {
  const prioritized = prioritizeBenefits(benefits);
  const eligible = prioritized.filter((b) => b.score >= 100).length;
  const almost = prioritized.filter((b) => b.score >= 50 && b.score < 100).length;
  const top3 = prioritized.slice(0,3).map((b)=>`${b.name} (${EUR.format(estimatedPotential(b))})`).join(' · ');
  const totalPotential = prioritized.reduce((sum, b) => sum + estimatedPotential(b), 0);
  const nextActions = prioritized.slice(0,2).flatMap((b)=>b.missing.slice(0,2).map((m)=>`${b.name}: ${m}`)).slice(0,3);
  const actionsHtml = nextActions.length ? `<ul class="missing">${nextActions.map((x)=>`<li>${x}</li>`).join('')}</ul>` : '<div class="muted">Žiadne kritické chýbajúce položky.</div>';
  return `<article class="result-card summary"><h3>Profil nárokov — prehľad</h3><div class="muted">Situácia: <strong>${statusLabel(input.status)}</strong></div><div class="muted">Potenciál, ktorý vieš získať (orientačne): <strong>${EUR.format(totalPotential)}</strong></div><div class="muted">Nárokov 100%: <strong>${eligible}</strong> · Almost: <strong>${almost}</strong></div><div class="muted">Priorita podľa potenciálu: <strong>${top3||'—'}</strong></div><div class="muted" style="margin-top:8px;"><strong>Odporúčané ďalšie kroky:</strong></div>${actionsHtml}</article>`;
}

const form = document.getElementById('eligibilityForm');
const results = document.getElementById('results');
const statusSelect = document.getElementById('status');
const socialDebtWrap = document.getElementById('socialDebtWrap');
const reviewBox = document.getElementById('reviewBox');
const prefillSzcoBtn = document.getElementById('prefillSzcoProfile');
const prefillUnemployedBtn = document.getElementById('prefillUnemployedProfile');
const prevStepBtn = document.getElementById('prevStep');
const nextStepBtn = document.getElementById('nextStep');
const submitBtn = document.getElementById('submitBtn');
const exportPdfBtn = document.getElementById('exportPdfBtn');
const dotEls = [...document.querySelectorAll('.step')];
const questions = [...document.querySelectorAll('.form-step .grid > label')];
let currentQuestion = 0;

function syncConditionalFields() {
  socialDebtWrap.classList.toggle('hidden', statusSelect.value !== 'szco');
}

function getInput() {
  return {
    status: document.getElementById('status').value,
    insured: document.getElementById('sicknessInsured').value === 'yes',
    sicknessDays2y: Number(document.getElementById('sicknessDays2y').value || 0),
    hasSocialDebt: document.getElementById('hasSocialDebt').value === 'yes',
    hasUnemploymentInsurance: document.getElementById('hasUnemploymentInsurance').value === 'yes',
    unemploymentDays4y: Number(document.getElementById('unemploymentDays4y').value || 0),
    registeredJobseeker: document.getElementById('registeredJobseeker').value === 'yes',
    pnDays: Number(document.getElementById('pnDays').value || 0),
    ocrDays: Number(document.getElementById('ocrDays').value || 0),
    monthlyBase: Number(document.getElementById('monthlyBase').value || 0),
    residencySr: document.getElementById('residencySr').value === 'yes',
    childrenCount: Number(document.getElementById('childrenCount').value || 0),
  };
}

function renderReview() {
  const i = getInput();
  reviewBox.innerHTML = `Situácia: <strong>${statusLabel(i.status)}</strong><br/>Nemocenské poistenie: <strong>${i.insured ? 'áno':'nie'}</strong><br/>Dni nemocenského poistenia: <strong>${i.sicknessDays2y}</strong><br/>Poistenie v nezamestnanosti: <strong>${i.hasUnemploymentInsurance ? 'áno':'nie'}</strong> · dni: <strong>${i.unemploymentDays4y}</strong><br/>Evidencia na úrade práce: <strong>${i.registeredJobseeker ? 'áno':'nie'}</strong>`;
}

function questionFieldId(labelEl) {
  const control = labelEl.querySelector('select, input');
  return control ? control.id : null;
}

function isQuestionRelevant(labelEl) {
  const id = questionFieldId(labelEl);
  const status = statusSelect.value;

  if (id === 'hasSocialDebt') return status === 'szco';
  if (id === 'registeredJobseeker') return status === 'unemployed';
  if (id === 'unemploymentDays4y' || id === 'hasUnemploymentInsurance') {
    return ['employee', 'szco', 'unemployed'].includes(status);
  }

  return true;
}

function visibleQuestions() {
  return questions.filter((q) => isQuestionRelevant(q));
}

function updateStepDots(activeLabel) {
  const step = Number(activeLabel.closest('.form-step').dataset.step);
  dotEls.forEach((el, idx) => el.classList.toggle('active', idx + 1 <= step));
}

function renderQuestion() {
  questions.forEach((q) => q.classList.add('hidden'));
  document.querySelectorAll('.form-step').forEach((fs) => fs.classList.add('hidden'));

  const vq = visibleQuestions();
  const inReview = currentQuestion >= vq.length;

  if (!inReview) {
    const safeIndex = Math.max(0, Math.min(vq.length - 1, currentQuestion));
    currentQuestion = safeIndex;
    const activeQuestion = vq[safeIndex];
    if (activeQuestion) {
      activeQuestion.classList.remove('hidden');
      activeQuestion.closest('.form-step').classList.remove('hidden');
      updateStepDots(activeQuestion);
    }
  }

  const reviewStep = document.querySelector('.form-step[data-step="4"]');
  reviewStep.classList.toggle('hidden', !inReview);
  if (inReview) {
    dotEls.forEach((el) => el.classList.add('active'));
    renderReview();
  }

  const isFirst = currentQuestion === 0;
  prevStepBtn.disabled = isFirst;
  prevStepBtn.classList.toggle('hidden', isFirst);
  nextStepBtn.classList.toggle('hidden', inReview);
  submitBtn.classList.toggle('hidden', !inReview);
}

function goNext() {
  currentQuestion += 1;
  renderQuestion();
}

function goPrev() {
  if (currentQuestion > 0) currentQuestion -= 1;
  renderQuestion();
}

statusSelect.addEventListener('change', () => {
  const status = statusSelect.value;

  if (status !== 'szco') {
    document.getElementById('hasSocialDebt').value = 'no';
  }
  if (status !== 'unemployed') {
    document.getElementById('registeredJobseeker').value = 'no';
  }
  if (!['employee', 'szco', 'unemployed'].includes(status)) {
    document.getElementById('hasUnemploymentInsurance').value = 'no';
    document.getElementById('unemploymentDays4y').value = 0;
  }

  currentQuestion = 0;
  syncConditionalFields();
  renderQuestion();
});
prevStepBtn.addEventListener('click', goPrev);
nextStepBtn.addEventListener('click', goNext);

prefillSzcoBtn.addEventListener('click', () => {
  document.getElementById('status').value = 'szco';
  document.getElementById('sicknessInsured').value = 'yes';
  document.getElementById('sicknessDays2y').value = 730;
  document.getElementById('hasSocialDebt').value = 'no';
  document.getElementById('monthlyBase').value = 1300;
  document.getElementById('pnDays').value = 30;
  document.getElementById('ocrDays').value = 14;
  document.getElementById('hasUnemploymentInsurance').value = 'no';
  document.getElementById('unemploymentDays4y').value = 0;
  document.getElementById('registeredJobseeker').value = 'no';
  document.getElementById('residencySr').value = 'yes';
  document.getElementById('childrenCount').value = 0;
  syncConditionalFields();
  renderQuestion();
});

prefillUnemployedBtn.addEventListener('click', () => {
  document.getElementById('status').value = 'unemployed';
  document.getElementById('sicknessInsured').value = 'no';
  document.getElementById('sicknessDays2y').value = 120;
  document.getElementById('hasSocialDebt').value = 'no';
  document.getElementById('monthlyBase').value = 900;
  document.getElementById('pnDays').value = 30;
  document.getElementById('ocrDays').value = 14;
  document.getElementById('hasUnemploymentInsurance').value = 'yes';
  document.getElementById('unemploymentDays4y').value = 730;
  document.getElementById('registeredJobseeker').value = 'yes';
  document.getElementById('residencySr').value = 'yes';
  document.getElementById('childrenCount').value = 0;
  syncConditionalFields();
  renderQuestion();
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const input = getInput();
  const prioritized = prioritizeBenefits(evaluateBenefits(input));
  results.innerHTML = [summaryCards(input, prioritized), ...prioritized.map((b, idx) => benefitCard(b, idx))].join('');
  exportPdfBtn.classList.remove('hidden');
});

exportPdfBtn.addEventListener('click', () => {
  window.print();
});

syncConditionalFields();
renderQuestion();
