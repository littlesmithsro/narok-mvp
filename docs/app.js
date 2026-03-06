const EUR = new Intl.NumberFormat('sk-SK', { style: 'currency', currency: 'EUR' });

function dailyBase(monthlyBase) {
  return (monthlyBase * 12) / 365;
}

function calcPN({ status, insured, sicknessDays2y, hasSocialDebt, dvz, pnDays }) {
  const baseEligible = insured && sicknessDays2y >= 270;
  if (!baseEligible) {
    return {
      eligible: false,
      reason: 'Podmienka: aktívne nemocenské poistenie + aspoň 270 dní poistenia za posledné 2 roky.',
    };
  }

  if (status === 'szco' && hasSocialDebt) {
    return {
      eligible: false,
      reason: 'Pri SZČO môže byť výplata dávky zablokovaná pri nedoplatkoch na poistnom.',
    };
  }

  let total = 0;
  if (status === 'employee') {
    const first3 = Math.min(pnDays, 3) * dvz * 0.25;
    const rest = Math.max(0, pnDays - 3) * dvz * 0.55;
    total = first3 + rest;
  } else {
    total = pnDays * dvz * 0.55;
  }

  return {
    eligible: true,
    monthlyEstimate: total,
    total,
    reason:
      status === 'employee'
        ? `Zamestnanec: 1.–3. deň 25 % DVZ, od 4. dňa 55 % DVZ (na ${pnDays} dní).`
        : `SZČO: orientačne 55 % DVZ (na ${pnDays} dní), ak sú splnené podmienky poistenia a bez dlhu.`,
  };
}

function calcOCR({ insured, sicknessDays2y, hasSocialDebt, status, dvz, ocrDays }) {
  const baseEligible = insured && sicknessDays2y >= 270;
  if (!baseEligible) {
    return {
      eligible: false,
      reason: 'Podmienka: aktívne nemocenské poistenie + aspoň 270 dní poistenia za posledné 2 roky.',
    };
  }

  if (status === 'szco' && hasSocialDebt) {
    return {
      eligible: false,
      reason: 'Pri SZČO môže byť výplata dávky zablokovaná pri nedoplatkoch na poistnom.',
    };
  }

  const cappedDays = Math.min(ocrDays, 14);
  const total = cappedDays * dvz * 0.55;

  return {
    eligible: true,
    monthlyEstimate: total,
    total,
    reason: `Orientačne 55 % DVZ na ${cappedDays} dní (MVP režim krátkej OČR max 14 dní).`,
  };
}

function calcUnemployment({ hasUnemploymentInsurance, unemploymentDays4y, registeredJobseeker, dvz, status }) {
  if (!registeredJobseeker) {
    return {
      eligible: false,
      reason: 'Podmienka: evidencia na úrade práce.',
    };
  }

  if (!hasUnemploymentInsurance) {
    return {
      eligible: false,
      reason:
        status === 'szco'
          ? 'SZČO typicky nemá nárok bez dobrovoľného poistenia v nezamestnanosti.'
          : 'Chýba poistenie v nezamestnanosti.',
    };
  }

  if (unemploymentDays4y < 730) {
    return {
      eligible: false,
      reason: 'Podmienka: aspoň 730 dní poistenia v nezamestnanosti za posledné 4 roky.',
    };
  }

  const monthly = dvz * 0.5 * 30.4167;
  const months = 6;
  return {
    eligible: true,
    monthlyEstimate: monthly,
    months,
    total: monthly * months,
    reason: 'Orientačne 50 % DVZ, štandardne 6 mesiacov podpory.',
  };
}

function resultCard(title, data, extra = '') {
  const status = data.eligible
    ? '<span class="pill ok">Nárok pravdepodobne ÁNO</span>'
    : '<span class="pill bad">Nárok pravdepodobne NIE</span>';

  const money = data.eligible
    ? `<div class="kpi">${EUR.format(data.monthlyEstimate || data.total || 0)}</div>`
    : '<div class="kpi">—</div>';

  return `
    <article class="result-card">
      <h3>${title}</h3>
      ${status}
      ${money}
      <div class="muted">${data.reason}</div>
      ${extra}
    </article>
  `;
}

function summaryCard(input, dvz) {
  return `
    <article class="result-card">
      <h3>Tvoj profil (rýchly súhrn)</h3>
      <div class="muted">Status: <strong>${input.status === 'szco' ? 'SZČO' : 'Zamestnanec'}</strong></div>
      <div class="muted">DVZ (orientačne): <strong>${EUR.format(dvz)}</strong> / deň</div>
      <div class="muted">Poistenie (nemocenské): <strong>${input.insured ? 'áno' : 'nie'}</strong></div>
      <div class="muted">Poistenie v nezamestnanosti: <strong>${input.hasUnemploymentInsurance ? 'áno' : 'nie'}</strong></div>
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
});

form.addEventListener('submit', (e) => {
  e.preventDefault();

  const monthlyBase = Number(document.getElementById('monthlyBase').value || 0);
  const dvz = dailyBase(monthlyBase);

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
  };

  const pn = calcPN({ ...input, dvz });
  const ocr = calcOCR({ ...input, dvz });
  const unemp = calcUnemployment({ ...input, dvz });

  results.innerHTML = [
    summaryCard(input, dvz),
    resultCard('PN (nemocenské)', pn, pn.eligible ? `<div class="muted">Odhad za zadané obdobie: <strong>${EUR.format(pn.total)}</strong></div>` : ''),
    resultCard('OČR', ocr, ocr.eligible ? `<div class="muted">Odhad za zadané obdobie: <strong>${EUR.format(ocr.total)}</strong></div>` : ''),
    resultCard(
      'Podpora v nezamestnanosti',
      unemp,
      unemp.eligible
        ? `<div class="muted">Trvanie: <strong>${unemp.months} mesiacov</strong><br/>Celkom: <strong>${EUR.format(unemp.total)}</strong></div>`
        : ''
    ),
  ].join('');
});
