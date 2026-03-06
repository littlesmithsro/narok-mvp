const EUR = new Intl.NumberFormat('sk-SK', { style: 'currency', currency: 'EUR' });

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

function evaluateBenefits(input) {
  const dvz = dailyBase(input.monthlyBase);

  const benefits = [];

  // 1) PN
  {
    let score = 0;
    const missing = [];

    score += input.insured ? 40 : 0;
    score += scoreByRatio(input.sicknessDays2y, 270, 40);
    score += input.status === 'szco' ? (input.hasSocialDebt ? 0 : 20) : 20;

    if (!input.insured) missing.push('Aktívne nemocenské poistenie');
    if (input.sicknessDays2y < 270) missing.push(`Doplniť dni poistenia (${input.sicknessDays2y}/270)`);
    if (input.status === 'szco' && input.hasSocialDebt) missing.push('Vysporiadať nedoplatky na sociálnom poistení');

    const eligible = score >= 100;
    let total = 0;
    if (eligible) {
      if (input.status === 'employee') {
        const first3 = Math.min(input.pnDays, 3) * dvz * 0.25;
        const rest = Math.max(0, input.pnDays - 3) * dvz * 0.55;
        total = first3 + rest;
      } else {
        total = input.pnDays * dvz * 0.55;
      }
    }

    benefits.push({
      id: 'pn',
      name: 'PN (nemocenské)',
      score: clamp(Math.round(score)),
      missing,
      estimateMonthly: total,
      estimateTotal: total,
      extra: eligible ? `Odhad za ${input.pnDays} dní: ${EUR.format(total)}` : 'Orientačný výpočet po splnení podmienok.'
    });
  }

  // 2) OCR
  {
    let score = 0;
    const missing = [];

    score += input.insured ? 40 : 0;
    score += scoreByRatio(input.sicknessDays2y, 270, 40);
    score += input.status === 'szco' ? (input.hasSocialDebt ? 0 : 20) : 20;

    if (!input.insured) missing.push('Aktívne nemocenské poistenie');
    if (input.sicknessDays2y < 270) missing.push(`Doplniť dni poistenia (${input.sicknessDays2y}/270)`);
    if (input.status === 'szco' && input.hasSocialDebt) missing.push('Vysporiadať nedoplatky na sociálnom poistení');

    const eligible = score >= 100;
    const cappedDays = Math.min(input.ocrDays, 14);
    const total = eligible ? cappedDays * dvz * 0.55 : 0;

    benefits.push({
      id: 'ocr',
      name: 'OČR',
      score: clamp(Math.round(score)),
      missing,
      estimateMonthly: total,
      estimateTotal: total,
      extra: eligible ? `Odhad za ${cappedDays} dní: ${EUR.format(total)}` : 'MVP režim: krátka OČR do 14 dní.'
    });
  }

  // 3) Nezamestnanosť
  {
    let score = 0;
    const missing = [];

    score += input.registeredJobseeker ? 30 : 0;
    score += input.hasUnemploymentInsurance ? 30 : 0;
    score += scoreByRatio(input.unemploymentDays4y, 730, 40);

    if (!input.registeredJobseeker) missing.push('Evidencia na úrade práce');
    if (!input.hasUnemploymentInsurance) missing.push('Poistenie v nezamestnanosti');
    if (input.unemploymentDays4y < 730) missing.push(`Doplniť dni poistenia (${input.unemploymentDays4y}/730)`);

    const eligible = score >= 100;
    const monthly = eligible ? dvz * 0.5 * 30.4167 : 0;
    const months = eligible ? 6 : 0;

    benefits.push({
      id: 'unemployment',
      name: 'Podpora v nezamestnanosti',
      score: clamp(Math.round(score)),
      missing,
      estimateMonthly: monthly,
      estimateTotal: monthly * months,
      months,
      extra: eligible ? `Trvanie: ${months} mesiacov · Celkom: ${EUR.format(monthly * months)}` : 'Štandardne 6 mesiacov po splnení podmienok.'
    });
  }

  // 4) Prídavok na dieťa (profile heuristic)
  {
    let score = 0;
    const missing = [];
    score += input.childrenCount > 0 ? 70 : 0;
    score += input.residencySr ? 30 : 0;

    if (input.childrenCount <= 0) missing.push('Mať nezaopatrené dieťa');
    if (!input.residencySr) missing.push('Pobyt/väzba na SR');

    benefits.push({
      id: 'child-benefit',
      name: 'Prídavok na dieťa',
      score: clamp(Math.round(score)),
      missing,
      estimateMonthly: null,
      estimateTotal: null,
      extra: 'Suma podľa aktuálnej sadzby štátu.'
    });
  }

  // 5) Rodičovský príspevok
  {
    let score = 0;
    const missing = [];
    score += input.childrenCount > 0 ? 45 : 0;
    score += input.youngestChildAge <= 3 ? 35 : 0;
    score += input.residencySr ? 20 : 0;

    if (input.childrenCount <= 0) missing.push('Dieťa v starostlivosti');
    if (!(input.youngestChildAge <= 3)) missing.push('Dieťa v relevantnom veku (spravidla do 3 rokov)');
    if (!input.residencySr) missing.push('Pobyt/väzba na SR');

    benefits.push({
      id: 'parental',
      name: 'Rodičovský príspevok',
      score: clamp(Math.round(score)),
      missing,
      estimateMonthly: null,
      estimateTotal: null,
      extra: 'Overiť presný režim podľa veku dieťaťa a situácie.'
    });
  }

  // 6) Hmotná núdza (heuristic)
  {
    let score = 0;
    const missing = [];
    const incomePerPerson = input.householdMembers > 0 ? input.householdIncome / input.householdMembers : input.householdIncome;

    score += input.residencySr ? 20 : 0;
    score += incomePerPerson <= 350 ? 60 : scoreByRatio(Math.max(0, 700 - incomePerPerson), 350, 60);
    score += input.housingCost > 0 ? 20 : 0;

    if (!input.residencySr) missing.push('Pobyt/väzba na SR');
    if (incomePerPerson > 350) missing.push('Nižší príjem na člena domácnosti');
    if (input.housingCost <= 0) missing.push('Preukázané náklady na bývanie');

    benefits.push({
      id: 'material-need',
      name: 'Pomoc v hmotnej núdzi',
      score: clamp(Math.round(score)),
      missing,
      estimateMonthly: null,
      estimateTotal: null,
      extra: `Príjem na člena domácnosti: ${EUR.format(incomePerPerson)}.`
    });
  }

  // 7) Príspevok na bývanie (heuristic)
  {
    let score = 0;
    const missing = [];
    score += input.housingCost > 0 ? 40 : 0;
    score += input.residencySr ? 20 : 0;
    score += input.householdIncome <= 1200 ? 40 : scoreByRatio(Math.max(0, 2200 - input.householdIncome), 1000, 40);

    if (input.housingCost <= 0) missing.push('Náklady na bývanie');
    if (!input.residencySr) missing.push('Pobyt/väzba na SR');
    if (input.householdIncome > 1200) missing.push('Nižší príjem domácnosti');

    benefits.push({
      id: 'housing',
      name: 'Príspevok na bývanie (v rámci HN)',
      score: clamp(Math.round(score)),
      missing,
      estimateMonthly: null,
      estimateTotal: null,
      extra: 'Naviazané na podmienky pomoci v hmotnej núdzi.'
    });
  }

  // 8) Kompenzácie ŤZP (heuristic)
  {
    let score = 0;
    const missing = [];
    score += input.tzp ? 70 : 0;
    score += input.residencySr ? 30 : 0;

    if (!input.tzp) missing.push('Status ŤZP / relevantné posúdenie');
    if (!input.residencySr) missing.push('Pobyt/väzba na SR');

    benefits.push({
      id: 'tzp',
      name: 'Kompenzácie ŤZP (balík)',
      score: clamp(Math.round(score)),
      missing,
      estimateMonthly: null,
      estimateTotal: null,
      extra: 'Môže zahŕňať opatrovanie, osobnú asistenciu, pomôcky, dopravu.'
    });
  }

  return benefits;
}

function benefitCard(b) {
  const status = statusFromScore(b.score);
  const missing = b.missing.length
    ? `<ul class="missing">${b.missing.slice(0, 4).map((m) => `<li>${m}</li>`).join('')}</ul>`
    : '<div class="muted">Bez chýbajúcich položiek.</div>';

  const amount = typeof b.estimateMonthly === 'number'
    ? `<div class="muted">Mesačne (odhad): <strong>${EUR.format(b.estimateMonthly)}</strong></div>`
    : '';

  return `
    <article class="result-card">
      <div class="row-between">
        <h3>${b.name}</h3>
        <span class="pill ${status.cls}">${status.label}</span>
      </div>
      <div class="progress-wrap">
        <div class="progress"><span style="width:${b.score}%"></span></div>
        <div class="progress-text"><strong>${b.score}%</strong></div>
      </div>
      ${amount}
      <div class="muted">${b.extra || ''}</div>
      <div class="muted mt8"><strong>Čo chýba:</strong></div>
      ${missing}
    </article>
  `;
}

function summaryCards(input, benefits) {
  const eligible = benefits.filter((b) => b.score >= 100).length;
  const almost = benefits.filter((b) => b.score >= 50 && b.score < 100).length;

  const top3 = [...benefits]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((b) => `${b.name} (${b.score}%)`)
    .join(' · ');

  return `
    <article class="result-card summary">
      <h3>Profil nárokov — prehľad</h3>
      <div class="muted">Status: <strong>${input.status === 'szco' ? 'SZČO' : 'Zamestnanec'}</strong></div>
      <div class="muted">Nárokov 100%: <strong>${eligible}</strong> · Almost: <strong>${almost}</strong></div>
      <div class="muted">Najbližšie nároky: <strong>${top3 || '—'}</strong></div>
    </article>
  `;
}

const form = document.getElementById('eligibilityForm');
const results = document.getElementById('results');
const prefillBtn = document.getElementById('prefillSzcoProfile');

prefillBtn.addEventListener('click', () => {
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
  document.getElementById('youngestChildAge').value = 0;
  document.getElementById('householdMembers').value = 1;
  document.getElementById('householdIncome').value = 1300;
  document.getElementById('housingCost').value = 450;
  document.getElementById('tzp').value = 'no';
});

form.addEventListener('submit', (e) => {
  e.preventDefault();

  const input = {
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
    youngestChildAge: Number(document.getElementById('youngestChildAge').value || 0),
    householdMembers: Number(document.getElementById('householdMembers').value || 1),
    householdIncome: Number(document.getElementById('householdIncome').value || 0),
    housingCost: Number(document.getElementById('housingCost').value || 0),
    tzp: document.getElementById('tzp').value === 'yes',
  };

  const benefits = evaluateBenefits(input);

  results.innerHTML = [
    summaryCards(input, benefits),
    ...benefits.map(benefitCard),
  ].join('');
});
