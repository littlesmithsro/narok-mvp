const EUR = new Intl.NumberFormat('sk-SK', { style: 'currency', currency: 'EUR' });
const STORAGE_KEY = 'narok-mvp-input-v3';

const STATUS_LABELS = {
  employee: 'Zamestnanec',
  szco: 'SZČO',
  unemployed: 'Nezamestnaný',
  parental: 'Rodič / rodičovská',
  student: 'Študent',
  other: 'Iné',
};

const STATUS_GUIDANCE = {
  employee: 'Typicky dáva zmysel PN, OČR a podľa situácie aj nezamestnanosť.',
  szco: 'Pri SZČO najviac rozhoduje poistenie, dni poistenia a nedoplatky.',
  unemployed: 'Pre dávku v nezamestnanosti je kritická evidencia na úrade práce a poistenie.',
  parental: 'Najviac zmysluplné sú rodinné a rodičovské podpory.',
  student: 'Študent má zvyčajne menej klasických dávkových nárokov, ale môže mať špecifické podpory.',
  other: 'Pozri najmä všeobecné podmienky viazané na poistenie, deti a väzbu na SR.',
};

const benefitDefinitions = [
  {
    id: 'pn',
    name: 'PN (nemocenské)',
    institution: 'Sociálna poisťovňa',
    action: 'Over si podmienky poistenia a priprav potvrdenie o PN a údaje o poistení.',
    formHint: 'Typicky riešené cez Sociálnu poisťovňu / zamestnávateľa podľa situácie.',
    evaluate(input) {
      let score = 0;
      const missing = [];

      score += input.insured ? 40 : 0;
      score += scoreByRatio(input.sicknessDays2y, 270, 40);

      if (input.status === 'employee') score += 20;
      if (input.status === 'szco' && !input.hasSocialDebt) score += 20;

      if (!input.insured) missing.push('Aktívne nemocenské poistenie');
      if (input.sicknessDays2y < 270) missing.push(`Doplniť dni poistenia (${input.sicknessDays2y}/270)`);
      if (input.status === 'szco' && input.hasSocialDebt) missing.push('Vysporiadať nedoplatky na sociálnom poistení');
      if (!['employee', 'szco'].includes(input.status)) missing.push('PN je najčastejšie viazaná na aktívne nemocenské poistenie');

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
          ? `Orientačný odhad za ${input.pnDays} dní: ${EUR.format(total)}`
          : 'Orientačný výpočet po splnení podmienok.',
      };
    },
  },
  {
    id: 'ocr',
    name: 'OČR',
    institution: 'Sociálna poisťovňa',
    action: 'Priprav si potvrdenie o potrebe starostlivosti a skontroluj nemocenské poistenie.',
    formHint: 'Najčastejšie cez Sociálnu poisťovňu, pri zamestnancovi aj cez zamestnávateľa.',
    evaluate(input) {
      let score = 0;
      const missing = [];

      score += input.insured ? 40 : 0;
      score += scoreByRatio(input.sicknessDays2y, 270, 40);

      if (input.status === 'employee') score += 20;
      if (input.status === 'szco' && !input.hasSocialDebt) score += 20;

      if (!input.insured) missing.push('Aktívne nemocenské poistenie');
      if (input.sicknessDays2y < 270) missing.push(`Doplniť dni poistenia (${input.sicknessDays2y}/270)`);
      if (input.status === 'szco' && input.hasSocialDebt) missing.push('Vysporiadať nedoplatky na sociálnom poistení');
      if (!['employee', 'szco'].includes(input.status)) missing.push('OČR je typicky viazaná na nemocenské poistenie');

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
          ? `Orientačný odhad za ${cappedDays} dní: ${EUR.format(total)}`
          : 'MVP režim: krátka OČR do 14 dní.',
      };
    },
  },
  {
    id: 'unemployment',
    name: 'Podpora v nezamestnanosti',
    institution: 'Sociálna poisťovňa + úrad práce',
    action: 'Ak ešte nie si evidovaný, prvý krok je evidencia na úrade práce. Potom rieš žiadosť o dávku.',
    formHint: 'Treba mať evidenciu na úrade práce a splniť podmienku poistenia v nezamestnanosti.',
    evaluate(input) {
      let score = 0;
      const missing = [];

      score += input.registeredJobseeker ? 40 : 0;
      score += input.hasUnemploymentInsurance ? 30 : 0;
      score += scoreByRatio(input.unemploymentDays4y, 730, 30);

      if (input.status !== 'unemployed') missing.push('Pre dávku v nezamestnanosti býva potrebný profil nezamestnaného');
      if (!input.registeredJobseeker) missing.push('Evidencia na úrade práce');
      if (!input.hasUnemploymentInsurance) missing.push('Poistenie v nezamestnanosti');
      if (input.unemploymentDays4y < 730) missing.push(`Doplniť dni poistenia (${input.unemploymentDays4y}/730)`);

      const eligible = score >= 100 && input.status === 'unemployed' && input.registeredJobseeker;
      const dvz = dailyBase(input.monthlyBase);
      const monthly = eligible ? dvz * 0.5 * 30.4167 : 0;
      const months = eligible ? 6 : 0;

      return {
        score,
        missing,
        estimateMonthly: monthly,
        estimateTotal: monthly * months,
        extra: eligible
          ? `Orientačne ${EUR.format(monthly)} mesačne na ${months} mesiacov.`
          : 'Štandardne 6 mesiacov po splnení podmienok.',
      };
    },
  },
  {
    id: 'child',
    name: 'Prídavok na dieťa',
    institution: 'ÚPSVaR',
    action: 'Skontroluj, či spĺňaš podmienku nezaopatreného dieťaťa a priprav si údaje o dieťati.',
    formHint: 'Základná rodinná podpora viazaná na dieťa a väzbu na SR.',
    evaluate(input) {
      let score = 0;
      const missing = [];

      score += input.childrenCount > 0 ? 70 : 0;
      score += input.residencySr ? 30 : 0;

      if (input.childrenCount <= 0) missing.push('Mať nezaopatrené dieťa');
      if (!input.residencySr) missing.push('Pobyt / väzba na SR');

      const monthly = input.childrenCount > 0 ? 60 * input.childrenCount : null;

      return {
        score,
        missing,
        estimateMonthly: monthly,
        estimateTotal: monthly,
        extra: input.childrenCount > 0
          ? `Pri ${input.childrenCount} dieťati/detoch orientačne ${EUR.format(monthly)} mesačne.`
          : 'Suma závisí od počtu detí a podmienok.',
      };
    },
  },
];

const form = document.getElementById('eligibilityForm');
const resultsShell = document.getElementById('results');
const resultsSummary = document.getElementById('resultsSummary');
const resultsList = document.getElementById('resultsList');
const leadCta = document.getElementById('leadCta');
const resultsActions = document.getElementById('resultsActions');
const statusInput = document.getElementById('status');
const statusChoices = [...document.querySelectorAll('.choice-pill')];
const socialDebtWrap = document.getElementById('socialDebtWrap');
const registeredJobseekerWrap = document.getElementById('registeredJobseekerWrap');
const prefillSzcoBtn = document.getElementById('prefillSzcoProfile');
const prefillUnemployedBtn = document.getElementById('prefillUnemployedProfile');
const saveDraftBtn = document.getElementById('saveDraftBtn');
const loadDraftBtn = document.getElementById('loadDraftBtn');
const exportPdfBtn = document.getElementById('exportPdfBtn');

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

function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

function statusFromScore(score) {
  if (score >= 100) return { label: 'Vysoká šanca', cls: 'ok' };
  if (score >= 60) return { label: 'Stredná šanca', cls: 'warn' };
  return { label: 'Nízka šanca', cls: 'bad' };
}

function estimatedPotential(benefit) {
  return typeof benefit.estimateTotal === 'number' && Number.isFinite(benefit.estimateTotal)
    ? benefit.estimateTotal
    : 0;
}

function evaluateBenefits(input) {
  return benefitDefinitions.map((definition) => {
    const out = definition.evaluate(input);
    return {
      id: definition.id,
      name: definition.name,
      institution: definition.institution,
      action: definition.action,
      formHint: definition.formHint,
      score: clamp(Math.round(out.score || 0)),
      missing: out.missing || [],
      estimateMonthly: out.estimateMonthly,
      estimateTotal: out.estimateTotal,
      extra: out.extra || '',
    };
  });
}

function prioritizeBenefits(benefits) {
  return [...benefits].sort((a, b) => {
    const potentialDiff = estimatedPotential(b) - estimatedPotential(a);
    if (potentialDiff !== 0) return potentialDiff;
    return b.score - a.score;
  });
}

function moneyText(amount, fallback = '—') {
  return typeof amount === 'number' && Number.isFinite(amount) ? EUR.format(amount) : fallback;
}

function getInput() {
  return {
    status: statusInput.value,
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

function syncConditionalFields() {
  const status = statusInput.value;
  socialDebtWrap.classList.toggle('hidden', status !== 'szco');
  registeredJobseekerWrap.classList.toggle('hidden', status !== 'unemployed');

  if (status !== 'szco') document.getElementById('hasSocialDebt').value = 'no';
  if (status === 'unemployed') {
    document.getElementById('registeredJobseeker').value = 'yes';
  } else {
    document.getElementById('registeredJobseeker').value = 'no';
  }
  if (!['employee', 'szco', 'unemployed'].includes(status)) {
    document.getElementById('hasUnemploymentInsurance').value = 'no';
    document.getElementById('unemploymentDays4y').value = 0;
  }
}

function applyInput(input) {
  if (!input) return;
  statusInput.value = input.status || 'employee';
  document.getElementById('sicknessInsured').value = input.insured ? 'yes' : 'no';
  document.getElementById('sicknessDays2y').value = input.sicknessDays2y ?? 730;
  document.getElementById('hasSocialDebt').value = input.hasSocialDebt ? 'yes' : 'no';
  document.getElementById('hasUnemploymentInsurance').value = input.hasUnemploymentInsurance ? 'yes' : 'no';
  document.getElementById('unemploymentDays4y').value = input.unemploymentDays4y ?? 0;
  document.getElementById('registeredJobseeker').value = input.registeredJobseeker ? 'yes' : 'no';
  document.getElementById('pnDays').value = input.pnDays ?? 30;
  document.getElementById('ocrDays').value = input.ocrDays ?? 14;
  document.getElementById('monthlyBase').value = input.monthlyBase ?? 1300;
  document.getElementById('residencySr').value = input.residencySr ? 'yes' : 'no';
  document.getElementById('childrenCount').value = input.childrenCount ?? 0;

  statusChoices.forEach((btn) => btn.classList.toggle('active', btn.dataset.status === statusInput.value));
  syncConditionalFields();
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

function recommendationLines(input, benefits) {
  const top = benefits.slice(0, 3);
  const lines = [];

  if (top[0]) lines.push(`Najsilnejší kandidát je ${top[0].name} — ${statusFromScore(top[0].score).label.toLowerCase()}.`);
  if (STATUS_GUIDANCE[input.status]) lines.push(STATUS_GUIDANCE[input.status]);

  top.forEach((benefit) => {
    const firstMissing = benefit.missing[0];
    if (firstMissing) lines.push(`${benefit.name}: najbližší krok je ${firstMissing.toLowerCase()}.`);
  });

  return lines.slice(0, 4);
}

function renderSummary(input, benefits) {
  const top3 = benefits.slice(0, 3);
  const totalPotential = benefits.reduce((sum, benefit) => sum + estimatedPotential(benefit), 0);
  const highChance = benefits.filter((benefit) => benefit.score >= 100).length;
  const mediumChance = benefits.filter((benefit) => benefit.score >= 60 && benefit.score < 100).length;
  const lines = recommendationLines(input, benefits);

  resultsSummary.innerHTML = `
    <article class="summary-card">
      <div class="row-between">
        <div>
          <h2>Na čo môžeš mať nárok</h2>
          <div class="muted">Profil: <strong>${statusLabel(input.status)}</strong> · Orientačný výsledok pre tvoj prípad</div>
        </div>
        <span class="pill info-pill">Výsledok za pár klikov</span>
      </div>

      <div class="summary-grid">
        <div class="metric"><strong>${moneyText(totalPotential)}</strong><span>Orientačný potenciál spolu</span></div>
        <div class="metric"><strong>${highChance}</strong><span>Nároky s vysokou šancou</span></div>
        <div class="metric"><strong>${mediumChance}</strong><span>Nároky so strednou šancou</span></div>
        <div class="metric"><strong>${top3[0] ? top3[0].name : '—'}</strong><span>Najsilnejší kandidát</span></div>
      </div>

      <div class="next-steps-box">
        <h3>Čo spraviť teraz</h3>
        <ul>${lines.map((line) => `<li>${line}</li>`).join('')}</ul>
      </div>
    </article>
  `;
}

function benefitCard(benefit, idx) {
  const status = statusFromScore(benefit.score);
  const rankPill = idx < 3 ? `<span class="pill info-pill">TOP ${idx + 1}</span>` : '';
  const missing = benefit.missing.length
    ? `<ul class="missing">${benefit.missing.map((item) => `<li>${item}</li>`).join('')}</ul>`
    : '<div class="muted">Momentálne nevidím kritické chýbajúce položky.</div>';

  return `
    <article class="result-card">
      <div class="result-top">
        <div>
          <h3 class="result-title">${benefit.name}</h3>
          <div class="institution">Kam to typicky patrí: ${benefit.institution}</div>
        </div>
        <div>${rankPill} <span class="pill ${status.cls}">${status.label}</span></div>
      </div>

      <div class="progress-wrap">
        <div class="progress"><span style="width:${benefit.score}%"></span></div>
        <div class="progress-text">Orientačná šanca: <strong>${benefit.score}%</strong></div>
      </div>

      <div class="meta-list">
        <div><strong>Odhad mesačne:</strong> ${moneyText(benefit.estimateMonthly, 'Neurčené')}</div>
        <div><strong>Potenciál spolu:</strong> ${moneyText(estimatedPotential(benefit))}</div>
        <div><strong>Prečo to dáva zmysel:</strong> ${benefit.extra}</div>
      </div>

      <div class="result-section">
        <h4>Čo ti chýba</h4>
        ${missing}
      </div>

      <div class="result-section">
        <h4>Čo spraviť ďalej</h4>
        <ul class="checklist">
          <li>${benefit.action}</li>
          <li>${benefit.formHint}</li>
        </ul>
      </div>
    </article>
  `;
}

function renderLeadCta(input, benefits) {
  const top = benefits[0];
  const topName = top ? top.name : 'výsledok';
  leadCta.innerHTML = `
    <h3>Chceš presný checklist a ďalší postup?</h3>
    <p>Momentálne ti najviac vychádza <strong>${topName}</strong>. Ďalší krok pre tento MVP je doplniť presný checklist dokladov a konkrétny postup, čo kde podať.</p>
    <div class="lead-cta-actions">
      <button type="button" class="secondary">Chcem presný checklist</button>
      <button type="button" class="secondary">Chcem pomoc s ďalším krokom</button>
      <button type="button" class="secondary">Poslať si výsledok neskôr</button>
    </div>
  `;
  leadCta.classList.remove('hidden');
}

function renderResults(input) {
  const prioritized = prioritizeBenefits(evaluateBenefits(input));
  renderSummary(input, prioritized);
  resultsList.innerHTML = prioritized.map((benefit, idx) => benefitCard(benefit, idx)).join('');
  renderLeadCta(input, prioritized);
  resultsShell.classList.remove('hidden');
  resultsActions.classList.remove('hidden');
  exportPdfBtn.classList.remove('hidden');
}

statusChoices.forEach((btn) => {
  btn.addEventListener('click', () => {
    statusInput.value = btn.dataset.status;
    statusChoices.forEach((item) => item.classList.toggle('active', item === btn));
    syncConditionalFields();
  });
});

prefillSzcoBtn.addEventListener('click', () => {
  applyInput({
    status: 'szco',
    insured: true,
    sicknessDays2y: 730,
    hasSocialDebt: false,
    monthlyBase: 1600,
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
    monthlyBase: 1200,
    pnDays: 30,
    ocrDays: 14,
    hasUnemploymentInsurance: true,
    unemploymentDays4y: 900,
    registeredJobseeker: true,
    residencySr: true,
    childrenCount: 0,
  });
});

saveDraftBtn.addEventListener('click', () => {
  saveDraft();
  saveDraftBtn.textContent = 'Uložené ✓';
  setTimeout(() => { saveDraftBtn.textContent = 'Uložiť'; }, 1200);
});

loadDraftBtn.addEventListener('click', () => {
  loadDraft();
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const input = getInput();
  saveDraft();
  renderResults(input);
  resultsShell.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

exportPdfBtn.addEventListener('click', () => window.print());

syncConditionalFields();
loadDraft();
