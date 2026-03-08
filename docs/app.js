const EUR = new Intl.NumberFormat('sk-SK', { style: 'currency', currency: 'EUR' });
const STORAGE_KEY = 'narok-mvp-input-v2';

const STATUS_LABELS = {
  employee: 'Zamestnanec',
  szco: 'SZČO',
  unemployed: 'Nezamestnaný',
  parental: 'Rodič / rodičovská',
  student: 'Študent',
  other: 'Iné',
};

const RULES_VERSION = 'v1.3';
const RULES_UPDATED_AT = '2026-03-08';

const REQUIRED_DOCS = {
  pn: ['Potvrdenie o PN od lekára', 'Občiansky preukaz', 'Údaje o poistení (Sociálna poisťovňa)'],
  ocr: ['Potvrdenie potreby OČR', 'Občiansky preukaz', 'Údaje o poistení'],
  unemployment: ['Doklad o skončení pracovného pomeru', 'Potvrdenie o evidencii na úrade práce', 'Občiansky preukaz'],
  child: ['Rodný list dieťaťa', 'Občiansky preukaz', 'Doklad o pobyte/väzbe na SR'],
  parental: ['Rodný list dieťaťa', 'Občiansky preukaz', 'Rozhodnutia o súvisiacich dávkach (ak sú)'],
  tzp: ['Lekárske správy / zdravotná dokumentácia', 'Komplexný posudok (ak existuje)', 'Občiansky preukaz'],
  'material-need': ['Doklady o príjme celej domácnosti', 'Doklady o bývaní a nákladoch', 'Občiansky preukaz'],
  housing: ['Nájomná zmluva / doklad o bývaní', 'Doklady o úhradách bývania', 'Doklady o príjme domácnosti'],
  pension: ['Výpis z individuálneho účtu poistenca', 'Doklady o obdobiach poistenia', 'Občiansky preukaz'],
  'child-benefit': ['Rodný list dieťaťa', 'Občiansky preukaz', 'Doklad o pobyte/väzbe na SR'],
};

const benefitDefinitions = [
  {
    id: 'pn',
    name: 'PN (nemocenské)',
    evaluate(input) {
      let score = 0;
      const missing = [];

      score += input.insured ? 40 : 0;
      score += scoreByRatio(input.sicknessDays2y, 270, 40);
      score += input.status === 'szco' ? (input.hasSocialDebt ? 0 : 20) : 20;

      if (!input.insured) missing.push('Aktívne nemocenské poistenie');
      if (input.sicknessDays2y < 270) missing.push(`Doplniť dni poistenia (${input.sicknessDays2y}/270)`);
      if (input.status === 'szco' && input.hasSocialDebt) missing.push('Vysporiadať nedoplatky na sociálnom poistení');

      const eligible = score >= 100;
      const dvz = dailyBase(input.monthlyBase);
      const total = eligible
        ? (input.status === 'employee'
          ? Math.min(input.pnDays, 3) * dvz * 0.25 + Math.max(0, input.pnDays - 3) * dvz * 0.55
          : input.pnDays * dvz * 0.55)
        : 0;

      return {
        score,
        missing,
        estimateMonthly: total,
        estimateTotal: total,
        extra: eligible
          ? `Odhad za ${input.pnDays} dní: ${EUR.format(total)}`
          : 'Orientačný výpočet po splnení podmienok.',
      };
    },
  },
  {
    id: 'ocr',
    name: 'OČR',
    evaluate(input) {
      let score = 0;
      const missing = [];

      score += input.insured ? 40 : 0;
      score += scoreByRatio(input.sicknessDays2y, 270, 40);
      score += input.status === 'szco' ? (input.hasSocialDebt ? 0 : 20) : 20;

      if (!input.insured) missing.push('Aktívne nemocenské poistenie');
      if (input.sicknessDays2y < 270) missing.push(`Doplniť dni poistenia (${input.sicknessDays2y}/270)`);
      if (input.status === 'szco' && input.hasSocialDebt) missing.push('Vysporiadať nedoplatky na sociálnom poistení');

      const eligible = score >= 100;
      const dvz = dailyBase(input.monthlyBase);
      const cappedDays = Math.min(input.ocrDays, 14);
      const total = eligible ? cappedDays * dvz * 0.55 : 0;

      return {
        score,
        missing,
        estimateMonthly: total,
        estimateTotal: total,
        extra: eligible
          ? `Odhad za ${cappedDays} dní: ${EUR.format(total)}`
          : 'MVP režim: krátka OČR do 14 dní.',
      };
    },
  },
  {
    id: 'unemployment',
    name: 'Podpora v nezamestnanosti',
    evaluate(input) {
      let score = 0;
      const missing = [];

      score += input.registeredJobseeker ? 30 : 0;
      score += input.hasUnemploymentInsurance ? 30 : 0;
      score += scoreByRatio(input.unemploymentDays4y, 730, 40);

      if (!input.registeredJobseeker) missing.push('Evidencia na úrade práce');
      if (!input.hasUnemploymentInsurance) missing.push('Poistenie v nezamestnanosti');
      if (input.unemploymentDays4y < 730) missing.push(`Doplniť dni poistenia (${input.unemploymentDays4y}/730)`);

      const eligible = score >= 100;
      const dvz = dailyBase(input.monthlyBase);
      const monthly = eligible ? dvz * 0.5 * 30.4167 : 0;
      const months = eligible ? 6 : 0;

      return {
        score,
        missing,
        estimateMonthly: monthly,
        estimateTotal: monthly * months,
        extra: eligible
          ? `Trvanie: ${months} mesiacov · Celkom: ${EUR.format(monthly * months)}`
          : 'Štandardne 6 mesiacov po splnení podmienok.',
      };
    },
  },
  {
    id: 'child',
    name: 'Prídavok na dieťa',
    evaluate(input) {
      let score = 0;
      const missing = [];

      score += input.childrenCount > 0 ? 70 : 0;
      score += input.residencySr ? 30 : 0;

      if (input.childrenCount <= 0) missing.push('Mať nezaopatrené dieťa');
      if (!input.residencySr) missing.push('Pobyt/väzba na SR');

      return {
        score,
        missing,
        estimateMonthly: null,
        estimateTotal: null,
        extra: 'Suma podľa aktuálnej sadzby štátu.',
      };
    },
  },
];

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
const saveDraftBtn = document.getElementById('saveDraftBtn');
const loadDraftBtn = document.getElementById('loadDraftBtn');
const dotEls = [...document.querySelectorAll('.step')];
const questions = [...document.querySelectorAll('.form-step .grid > label')];

let currentQuestion = 0;

function dailyBase(monthlyBase) {
  return (monthlyBase * 12) / 365;
}

function clamp(v, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v));
}

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
  return STATUS_LABELS[status] || status;
}

function verdictFromScore(score) {
  if (score >= 85) return { label: 'Vysoká šanca', cls: 'ok' };
  if (score >= 55) return { label: 'Stredná šanca', cls: 'warn' };
  return { label: 'Nízka šanca', cls: 'bad' };
}

function docsForBenefit(benefitId) {
  return REQUIRED_DOCS[benefitId] || ['Občiansky preukaz', 'Doklad o situácii', 'Potvrdenie relevantné k dávke'];
}

function evaluateBenefits(input) {
  return benefitDefinitions.map((definition) => {
    const out = definition.evaluate(input);
    return {
      id: definition.id,
      name: definition.name,
      score: clamp(Math.round(out.score || 0)),
      missing: out.missing || [],
      estimateMonthly: out.estimateMonthly,
      estimateTotal: out.estimateTotal,
      extra: out.extra || '',
    };
  });
}

function estimatedPotential(benefit) {
  return typeof benefit.estimateTotal === 'number' && Number.isFinite(benefit.estimateTotal)
    ? benefit.estimateTotal
    : 0;
}

function prioritizeBenefits(benefits) {
  return [...benefits].sort((a, b) => {
    const potentialDiff = estimatedPotential(b) - estimatedPotential(a);
    if (potentialDiff !== 0) return potentialDiff;
    return b.score - a.score;
  });
}

function benefitCard(benefit, idx = 0) {
  const status = statusFromScore(benefit.score);
  const missing = benefit.missing.length
    ? `<ul class="missing">${benefit.missing.slice(0, 4).map((m) => `<li>${m}</li>`).join('')}</ul>`
    : '<div class="muted">Bez chýbajúcich položiek.</div>';

  const amount = typeof benefit.estimateMonthly === 'number'
    ? `<div class="muted">Mesačne (odhad): <strong>${EUR.format(benefit.estimateMonthly)}</strong></div>`
    : '';

  const priorityPill = idx < 3 ? `<span class="pill warn" style="margin-left:6px;">TOP ${idx + 1}</span>` : '';

  return `<article class="result-card">
    <div class="row-between"><h3>${benefit.name}</h3><div><span class="pill ${status.cls}">${status.label}</span>${priorityPill}</div></div>
    <div class="progress-wrap"><div class="progress"><span style="width:${benefit.score}%"></span></div><div class="progress-text"><strong>${benefit.score}%</strong></div></div>
    ${amount}
    <div class="muted">Potenciál celkom: <strong>${EUR.format(estimatedPotential(benefit))}</strong></div>
    <div class="muted">${benefit.extra}</div>
    <div class="muted"><strong>Čo chýba:</strong></div>
    ${missing}
  </article>`;
}

function summaryCards(input, benefits) {
  const prioritized = prioritizeBenefits(benefits);
  const eligible = prioritized.filter((benefit) => benefit.score >= 100).length;
  const almost = prioritized.filter((benefit) => benefit.score >= 50 && benefit.score < 100).length;
  const top3 = prioritized
    .slice(0, 3)
    .map((benefit) => `${benefit.name} (${EUR.format(estimatedPotential(benefit))})`)
    .join(' · ');

  const totalPotential = prioritized.reduce((sum, benefit) => sum + estimatedPotential(benefit), 0);
  const topBenefit = prioritized[0];
  const verdict = topBenefit ? verdictFromScore(topBenefit.score) : null;
  const docItems = topBenefit
    ? docsForBenefit(topBenefit.id).map((doc) => `<li>${doc}</li>`).join('')
    : '<li>Vyplň formulár pre odporúčanie dokladov.</li>';

  const nextActions = prioritized
    .slice(0, 2)
    .flatMap((benefit) => benefit.missing.slice(0, 2).map((m) => `${benefit.name}: ${m}`))
    .slice(0, 3);

  const actionsHtml = nextActions.length
    ? `<ul class="missing">${nextActions.map((item) => `<li>${item}</li>`).join('')}</ul>`
    : '<div class="muted">Žiadne kritické chýbajúce položky.</div>';

  return `<article class="result-card summary">
    <div class="row-between"><h3>Profil nárokov — prehľad</h3><span class="pill warn">Pravidlá ${RULES_VERSION} · ${RULES_UPDATED_AT}</span></div>
    <div class="muted">Situácia: <strong>${statusLabel(input.status)}</strong></div>
    <div class="muted">Potenciál, ktorý vieš získať (orientačne): <strong>${EUR.format(totalPotential)}</strong></div>
    <div class="muted">Nárokov 100%: <strong>${eligible}</strong> · Almost: <strong>${almost}</strong></div>
    <div class="muted">Priorita podľa potenciálu: <strong>${top3 || '—'}</strong></div>
    <div class="muted" style="margin-top:8px;"><strong>TOP dávka:</strong> ${topBenefit ? topBenefit.name : '—'} ${verdict ? `<span class="pill ${verdict.cls}" style="margin-left:6px;">${verdict.label}</span>` : ''}</div>
    <div class="muted" style="margin-top:8px;"><strong>Odporúčané ďalšie kroky:</strong></div>
    ${actionsHtml}
    <div class="muted" style="margin-top:8px;"><strong>Checklist dokladov pre TOP dávku:</strong></div>
    <ul class="missing">${docItems}</ul>
  </article>`;
}

function syncConditionalFields() {
  socialDebtWrap.classList.toggle('hidden', statusSelect.value !== 'szco');
}

function getInput() {
  return {
    status: document.getElementById('status').value,
    insured: document.getElementById('sicknessInsured').value === 'yes',
    sicknessDays2y: Number(document.getElementById('sicknessDays2y').value || 0),
    hasSocialDebt: document.getElementById('hasSocialDebt').value === 'yes',
    hasUnemploymentInsurance: document.getElementById('status').value === 'employee'
      ? true
      : document.getElementById('hasUnemploymentInsurance').value === 'yes',
    unemploymentDays4y: Number(document.getElementById('unemploymentDays4y').value || 0),
    registeredJobseeker: document.getElementById('registeredJobseeker').value === 'yes',
    pnDays: Number(document.getElementById('pnDays').value || 0),
    ocrDays: Number(document.getElementById('ocrDays').value || 0),
    monthlyBase: Number(document.getElementById('monthlyBase').value || 0),
    residencySr: document.getElementById('residencySr').value === 'yes',
    childrenCount: Number(document.getElementById('childrenCount').value || 0),
  };
}

function applyInput(input) {
  if (!input) return;

  document.getElementById('status').value = input.status || 'employee';
  document.getElementById('sicknessInsured').value = input.insured ? 'yes' : 'no';
  document.getElementById('sicknessDays2y').value = input.sicknessDays2y ?? 730;
  document.getElementById('hasSocialDebt').value = input.hasSocialDebt ? 'yes' : 'no';
  document.getElementById('hasUnemploymentInsurance').value = (input.status === 'employee' || input.hasUnemploymentInsurance) ? 'yes' : 'no';
  document.getElementById('unemploymentDays4y').value = input.unemploymentDays4y ?? 0;
  document.getElementById('registeredJobseeker').value = input.registeredJobseeker ? 'yes' : 'no';
  document.getElementById('pnDays').value = input.pnDays ?? 30;
  document.getElementById('ocrDays').value = input.ocrDays ?? 14;
  document.getElementById('monthlyBase').value = input.monthlyBase ?? 1300;
  document.getElementById('residencySr').value = input.residencySr ? 'yes' : 'no';
  document.getElementById('childrenCount').value = input.childrenCount ?? 0;

  syncConditionalFields();
  currentQuestion = 0;
  renderQuestion();
}

function renderReview() {
  const input = getInput();
  const unemploymentInsuranceLabel = input.status === 'employee'
    ? 'Poistenie v nezamestnanosti (zamestnanec): <strong>štandardne áno</strong>'
    : `Poistenie v nezamestnanosti: <strong>${input.hasUnemploymentInsurance ? 'áno' : 'nie'}</strong>`;

  reviewBox.innerHTML = `
    Situácia: <strong>${statusLabel(input.status)}</strong><br/>
    Nemocenské poistenie: <strong>${input.insured ? 'áno' : 'nie'}</strong><br/>
    Dni nemocenského poistenia: <strong>${input.sicknessDays2y}</strong><br/>
    ${unemploymentInsuranceLabel} · dni: <strong>${input.unemploymentDays4y}</strong><br/>
    Evidencia na úrade práce: <strong>${input.registeredJobseeker ? 'áno' : 'nie'}</strong><br/>
    <span class="muted">Pozn.: pre dávku v nezamestnanosti je evidencia na úrade práce štandardná podmienka.</span>
  `;
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
  if (id === 'hasUnemploymentInsurance') {
    return ['szco', 'unemployed'].includes(status);
  }
  if (id === 'unemploymentDays4y') {
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
  document.querySelectorAll('.form-step').forEach((fieldset) => fieldset.classList.add('hidden'));

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

function saveDraft() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(getInput()));
}

function loadDraft() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    applyInput(JSON.parse(raw));
  } catch (_e) {
    // noop
  }
}

statusSelect.addEventListener('change', () => {
  const status = statusSelect.value;

  if (status !== 'szco') document.getElementById('hasSocialDebt').value = 'no';

  if (status === 'unemployed') {
    document.getElementById('registeredJobseeker').value = 'yes';
  } else {
    document.getElementById('registeredJobseeker').value = 'no';
  }

  // Konzistentné defaulty podľa typu situácie
  if (status === 'employee') {
    // zamestnanec je typicky povinne poistený v nezamestnanosti
    document.getElementById('hasUnemploymentInsurance').value = 'yes';
  }
  if (status === 'szco') {
    // SZČO typicky nie je poistená v nezamestnanosti, iba dobrovoľne
    document.getElementById('hasUnemploymentInsurance').value = 'no';
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
  applyInput({
    status: 'szco',
    insured: true,
    sicknessDays2y: 730,
    hasSocialDebt: false,
    monthlyBase: 1300,
    pnDays: 30,
    ocrDays: 14,
    hasUnemploymentInsurance: false,
    unemploymentDays4y: 0,
    registeredJobseeker: false,
    residencySr: true,
    childrenCount: 0,
  });
});

prefillUnemployedBtn.addEventListener('click', () => {
  applyInput({
    status: 'unemployed',
    insured: false,
    sicknessDays2y: 120,
    hasSocialDebt: false,
    monthlyBase: 900,
    pnDays: 30,
    ocrDays: 14,
    hasUnemploymentInsurance: true,
    unemploymentDays4y: 730,
    registeredJobseeker: true,
    residencySr: true,
    childrenCount: 0,
  });
});

saveDraftBtn?.addEventListener('click', () => {
  saveDraft();
  saveDraftBtn.textContent = 'Uložené ✓';
  setTimeout(() => { saveDraftBtn.textContent = 'Uložiť rozpracované'; }, 1200);
});

loadDraftBtn?.addEventListener('click', () => {
  loadDraft();
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const input = getInput();
  const prioritized = prioritizeBenefits(evaluateBenefits(input));
  results.innerHTML = [summaryCards(input, prioritized), ...prioritized.map((benefit, idx) => benefitCard(benefit, idx))].join('');
  exportPdfBtn.classList.remove('hidden');
  saveDraft();
});

exportPdfBtn.addEventListener('click', () => {
  window.print();
});

syncConditionalFields();
loadDraft();
renderQuestion();
