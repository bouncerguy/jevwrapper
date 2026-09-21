/* JEV Wrapper — MIT © 2026 Ken Cox. All demo data below is illustrative. */
const $ = id => document.getElementById(id);
const clone = value => structuredClone(value);
const pretty = value => typeof value === 'string' ? value : JSON.stringify(value, null, 2);
const typeNames = { choice: 'CHOICE', score: 'SCORE', noul: 'TRUTH ESTIMATE' };
const state = { mode: 'live', config: null, plan: null, result: null, template: 'support', busy: false, history: [], toastTimer: null, revision: 0 };

const samples = {
  support: {
    message: 'Route this support request to billing, technical support, or account management. Mark it as urgent if the customer cannot use a service they have paid for. Evaluate each question independently.',
    context: 'Customer message: “My team paid our invoice yesterday, but our workspace is still suspended for an unpaid balance. We cannot access our project files, and we have a client delivery this afternoon. Can someone fix our account?”',
    summary: 'Choose the responsible support team and estimate whether the customer is unable to use a paid service.',
    questions: [
      { id: 'department', type: 'choice', instructions: 'Choose the team responsible for the primary issue in the customer message.', options: [ { label: 'billing', description: 'Invoices, payments, charges, or access suspended because of a billing issue.' }, { label: 'technical_support', description: 'Product failures or technical errors unrelated to billing.' }, { label: 'account_management', description: 'Changes to the customer relationship, plan, ownership, or account administration unrelated to an unpaid bill.' } ] },
      { id: 'urgent', type: 'noul', instructions: 'The customer is currently unable to use a service they have paid for.', options: [] }
    ],
    results: [ { id: 'department', type: 'choice', value: 'billing', confidence: 0.94, probabilities: { billing: 0.94, technical_support: 0.04, account_management: 0.02 } }, { id: 'urgent', type: 'noul', value: 0.96, probabilities: { true: 0.96, false: 0.04 }, reviewSignal: 0.96, reviewSignalKind: 'distance_from_ambiguity' } ]
  },
  content: {
    message: 'Classify this post as tutorial, announcement, or opinion. A tutorial gives actionable instructions; an announcement reports a release or update; opinion argues a viewpoint. Choose the main purpose. Also estimate whether it contains step-by-step instructions.',
    context: 'Draft post: “Here is how I made support routing easier: 1. List the teams that can take a request. 2. Write an exact criterion for each team. 3. Test those criteria against ten real examples. 4. Send uncertain cases to a person for review.”',
    summary: 'Choose the post’s primary content category and evaluate whether it contains sequential instructions.',
    questions: [
      { id: 'content_type', type: 'choice', instructions: 'Classify the primary purpose of the post. Choose its dominant purpose if more than one applies.', options: [ { label: 'tutorial', description: 'Gives actionable instructions for completing a task.' }, { label: 'announcement', description: 'Reports a release, launch, or update.' }, { label: 'opinion', description: 'Argues for a point of view.' } ] },
      { id: 'step_by_step', type: 'noul', instructions: 'The post contains step-by-step instructions a reader can follow.', options: [] }
    ],
    results: [ { id: 'content_type', type: 'choice', value: 'tutorial', confidence: 0.97, probabilities: { tutorial: 0.97, announcement: 0.01, opinion: 0.02 } }, { id: 'step_by_step', type: 'noul', value: 0.99, probabilities: { true: 0.99, false: 0.01 }, reviewSignal: 0.99, reviewSignalKind: 'distance_from_ambiguity' } ]
  },
  priority: {
    message: 'Score this issue using this ordered rubric: low means cosmetic and no workflow is blocked; medium means a workflow is slowed but a workaround exists; high means a core workflow is blocked with no workaround; critical means a widespread outage or confirmed data loss. Use only the supplied evidence.',
    context: 'Issue report: “CSV exports fail for one customer’s analytics dashboard. The customer can still read the dashboard and copy individual rows manually. They need about 2,000 rows for their weekly report. We have no evidence that any other customers are affected.”',
    summary: 'Score the issue against the explicit four-level impact rubric, using only the evidence provided.',
    questions: [ { id: 'priority', type: 'score', instructions: 'Score the issue against this ordered impact rubric. Use only the reported evidence, and do not assume a wider outage or data loss.', options: [ { label: 'low', description: 'Cosmetic issue; no workflow is blocked.' }, { label: 'medium', description: 'A workflow is slowed, but a workaround exists.' }, { label: 'high', description: 'A core workflow is blocked with no workaround.' }, { label: 'critical', description: 'A widespread outage or confirmed data loss.' } ] } ],
    results: [ { id: 'priority', type: 'score', value: 1.37, confidence: 0.66, probabilities: { 0: 0.02, 1: 0.62, 2: 0.33, 3: 0.03 } } ]
  }
};

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function announce(text, busy = false) {
  $('message-box').textContent = text;
  $('message-box').classList.toggle('busy', busy);
  $('message-box').hidden = !text;
}
function toast(text) {
  clearTimeout(state.toastTimer);
  $('toast').textContent = text;
  $('toast').hidden = false;
  state.toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3500);
}
function setBusy(busy, message = '') {
  state.busy = busy;
  for (const id of ['interpret-button', 'clarify-button', 'decide-button', 'mode-live', 'mode-demo', 'save-plan']) $(id).disabled = busy;
  for (const el of document.querySelectorAll('.template-chip')) el.disabled = busy;
  $('request-form').setAttribute('aria-busy', String(busy));
  if (message) announce(message, busy);
  if (!busy && state.plan?.clarifications?.length) $('decide-button').disabled = true;
}
function resetOutput() {
  state.revision++;
  state.plan = null;
  state.result = null;
  state.history = [];
  $('empty-state').hidden = false;
  $('plan-area').hidden = true;
  $('results-section').hidden = true;
  $('plan-editor').hidden = true;
  $('edit-plan-toggle').setAttribute('aria-expanded', 'false');
  $('provenance-badge').textContent = 'AWAITING INPUT';
  $('provenance-badge').className = 'provenance-badge';
  announce('');
}
function chooseTemplate(name) {
  const sample = samples[name];
  if (!sample) return;
  state.template = name;
  resetOutput();
  $('request').value = sample.message;
  $('context').value = sample.context;
  for (const el of document.querySelectorAll('.template-chip')) {
    el.classList.toggle('selected', el.dataset.template === name);
    el.setAttribute('aria-pressed', String(el.dataset.template === name));
  }
}
function setMode(mode) {
  if (state.busy) return;
  const wasDemo = state.mode === 'demo';
  state.mode = mode;
  resetOutput();
  const demo = mode === 'demo';
  $('mode-live').classList.toggle('active', !demo);
  $('mode-live').setAttribute('aria-pressed', String(!demo));
  $('mode-demo').classList.toggle('active', demo);
  $('mode-demo').setAttribute('aria-pressed', String(demo));
  $('request').readOnly = demo;
  $('context').readOnly = demo;
  $('mode-notice').textContent = demo ? 'Illustrative sample fixture. Inputs and answers are prewritten, including example probabilities. No AI call is made. Switch to “Your request” to evaluate your own text.' : 'Live mode uses this server’s configured LLM and JEV accounts. Your text is sent to those providers when you run it.';
  $('mode-notice').classList.toggle('demo-notice', demo);
  $('access-details').hidden = demo;
  $('interpret-button').firstElementChild.textContent = demo ? '1. Explore the sample plan' : '1. Make a decision plan';
  $('decide-button').firstElementChild.textContent = demo ? '2. Show illustrative results' : '2. Run with JEV';
  if (demo) chooseTemplate(state.template);
  if (!demo && wasDemo) toast('Live mode selected. You can now edit the request and context.');
}
async function api(path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = $('access-token').value.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`./api/${path}`, { method: 'POST', headers, body: JSON.stringify({ ...body, mode: 'live' }), credentials: 'same-origin', signal: AbortSignal.timeout(60000) });
  let data;
  try { data = await response.json(); } catch { throw new Error(`The server returned an unreadable response (HTTP ${response.status}).`); }
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : `Request failed (HTTP ${response.status}).`);
  return data;
}
function canUseLive() {
  if (!state.config?.liveAvailable) {
    announce('Live evaluation is not configured on this instance yet. Try the illustrative demo, or run your own instance with your LLM and JEV API keys.');
    return false;
  }
  if (state.config.authRequired && !$('access-token').value.trim()) {
    $('access-details').open = true;
    $('access-token').focus();
    announce('This live instance requires its owner access token. The illustrative demo is available to everyone.');
    return false;
  }
  return true;
}
function validateClientPlan(plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) throw new Error('The plan must be a JSON object.');
  if (typeof plan.summary !== 'string' || !plan.summary.trim()) throw new Error('Add a plain-English summary.');
  if (typeof plan.state !== 'string' || !plan.state.trim()) throw new Error('The plan must include its source state.');
  if (!Array.isArray(plan.clarifications)) throw new Error('Clarifications must be an array.');
  if (!Array.isArray(plan.questions) || plan.questions.length > 10 || (!plan.questions.length && !plan.clarifications.length)) throw new Error('Use one to ten questions, or request clarification.');
  const ids = new Set();
  for (const question of plan.questions) {
    if (!question || !/^[a-z][a-z0-9_]*$/.test(question.id) || ['__proto__', 'constructor', 'prototype'].includes(question.id) || ids.has(question.id)) throw new Error('Question IDs must be unique lowercase identifiers.');
    ids.add(question.id);
    if (!Object.hasOwn(typeNames, question.type)) throw new Error('Question type must be choice, score, or noul.');
    if (typeof question.instructions !== 'string' || !question.instructions.trim()) throw new Error(`Add instructions for ${question.id}.`);
    if (!Array.isArray(question.options)) throw new Error(`Options for ${question.id} must be an array.`);
    if (question.type === 'noul' && question.options.length) throw new Error('Truth-estimate questions use an empty options array.');
    if (question.type !== 'noul' && question.options.length < 2) throw new Error(`Add at least two options for ${question.id}.`);
    for (const option of question.options) if (!option || typeof option.label !== 'string' || !option.label.trim() || typeof option.description !== 'string' || !option.description.trim()) throw new Error('Every option needs a label and a criterion description.');
  }
  return plan;
}
function renderPlan() {
  const plan = state.plan;
  const demo = state.mode === 'demo';
  $('empty-state').hidden = true;
  $('plan-area').hidden = false;
  $('plan-summary').textContent = plan.summary;
  $('provenance-badge').textContent = demo ? 'ILLUSTRATIVE DEMO' : 'LIVE LLM PLAN';
  $('provenance-badge').className = `provenance-badge ${demo ? 'demo' : 'live'}`;
  $('edit-plan-toggle').hidden = demo;
  $('questions').replaceChildren();
  for (const question of plan.questions) {
    const card = node('article', 'question-card');
    const heading = node('div', 'question-card-head');
    heading.append(node('span', 'question-id', question.id), node('span', 'type-badge', typeNames[question.type] || question.type));
    card.append(heading, node('p', '', question.instructions));
    if (question.options?.length) {
      const options = node('div', 'question-options');
      for (let index = 0; index < question.options.length; index++) {
        const option = question.options[index];
        const pill = node('span', '', question.type === 'score' ? `${index}: ${option.label}` : option.label);
        pill.title = option.description;
        options.append(pill);
      }
      card.append(options);
      const details = node('details', 'criteria-details');
      details.append(node('summary', '', 'Read the exact option criteria'));
      const list = node('dl', 'criteria-list');
      question.options.forEach(option => { list.append(node('dt', '', option.label), node('dd', '', option.description)); });
      details.append(list);
      card.append(details);
    }
    $('questions').append(card);
  }
  const clarifications = Array.isArray(plan.clarifications) ? plan.clarifications : [];
  $('clarifications').hidden = clarifications.length === 0;
  $('clarification-list').replaceChildren(...clarifications.map(question => node('li', '', question)));
  $('decide-button').disabled = clarifications.length > 0;
  $('plan-json').value = JSON.stringify(plan, null, 2);
}
async function interpret(clarification = '') {
  if (state.busy) return;
  const message = $('request').value.trim();
  const context = $('context').value.trim();
  if (!message) { $('request').focus(); announce('Describe what JEV should decide first.'); return; }
  $('results-section').hidden = true;
  state.result = null;
  if (state.mode === 'demo') {
    const fixture = samples[state.template];
    state.plan = { summary: fixture.summary, state: JSON.stringify({ request: fixture.message, context: fixture.context }), questions: clone(fixture.questions), clarifications: [] };
    renderPlan();
    announce('Illustrative plan loaded. This is a prewritten example; no model was called.');
    if (matchMedia('(max-width: 800px)').matches) $('decision-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (!canUseLive()) return;
  const history = clone(state.history);
  if (clarification) {
    if (state.plan?.clarifications.length) history.push({ role: 'assistant', content: state.plan.clarifications.join('\n') });
    history.push({ role: 'user', content: clarification });
  }
  if (history.length > 10) {
    announce('This request has reached its clarification limit. Put the resolved criteria into the main request, then make a new plan. Earlier answers have been preserved.');
    return;
  }
  setBusy(true, 'Translating your request into explicit questions…');
  const revision = state.revision;
  try {
    const data = await api('interpret', { message, context, history });
    if (revision !== state.revision) return;
    if (data.mode !== 'live') throw new Error('The server did not return a live interpretation. No result has been accepted.');
    state.plan = validateClientPlan(data.plan);
    state.history = history;
    $('clarification-answer').value = '';
    renderPlan();
    announce(state.plan.clarifications.length ? 'The interpreter needs more information before JEV can evaluate this request.' : 'Plan ready. Review the exact questions and option criteria before running JEV.');
    if (matchMedia('(max-width: 800px)').matches) $('decision-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    announce(error.name === 'TimeoutError' ? 'This request took too long. Please try again.' : error.message);
  } finally { setBusy(false); }
}
function percent(value) { return `${(value * 100).toFixed(value * 100 % 1 ? 1 : 0)}%`; }
function renderResults() {
  const data = state.result;
  const demo = data.mode === 'demo';
  $('results-section').hidden = false;
  $('results-mode').textContent = demo ? 'ILLUSTRATIVE DEMO · NO AI CALL' : 'LIVE JEV RESPONSE';
  $('results-mode').className = `provenance-badge ${demo ? 'demo' : 'live'}`;
  $('result-summary').textContent = data.summary || 'Inspect each result and its review status below.';
  $('result-cards').replaceChildren();
  for (const result of data.results) {
    const needsReview = result.status !== 'ready';
    const card = node('article', `result-card${needsReview ? ' review' : ''}`);
    const label = node('div', 'mono-label', result.id);
    label.append(node('span', 'result-type', typeNames[result.type] || result.type));
    card.append(label);
    let value = pretty(result.value);
    if (result.type === 'noul' && typeof result.value === 'number') value = `${percent(result.value)} yes`;
    if (result.type === 'score' && typeof result.value === 'number') {
      const question = state.plan?.questions.find(q => q.id === result.id);
      value = `${Number(result.value.toFixed(3))} / ${Math.max(0, (question?.options?.length || 1) - 1)}`;
    }
    card.append(node('div', 'result-value', value));
    const status = node('div', 'result-status');
    status.append(node('span', 'status-dot'), node('span', '', needsReview ? 'Needs human review' : 'Meets review threshold'));
    card.append(status);
    const strength = result.type === 'noul' ? result.reviewSignal : result.confidence;
    if (typeof strength === 'number' && Number.isFinite(strength) && strength >= 0 && strength <= 1) {
      const track = node('div', 'confidence-track');
      const fill = node('div', 'confidence-fill');
      fill.style.width = `${strength * 100}%`;
      track.append(fill);
      const caption = result.type === 'noul' ? `${percent(strength)} review signal · not confidence` : `${percent(strength)} provider confidence${demo ? ' (illustrative)' : ''}`;
      card.append(track, node('div', 'confidence-caption', caption));
    } else card.append(node('p', 'confidence-caption', 'Confidence unavailable — human review required.'));
    if (result.type === 'score') {
      const question = state.plan?.questions.find(q => q.id === result.id);
      if (question?.options) card.append(node('p', 'score-legend', question.options.map((option, i) => `${i} ${option.label}`).join(' · ')));
    }
    if (result.type === 'noul') card.append(node('p', 'score-legend', 'The value is the estimated probability that the statement is true. The review signal is its distance from ambiguity: max(p, 1−p).'));
    $('result-cards').append(card);
  }
  $('results-provenance').textContent = demo ? 'Sample fixture authored to illustrate the interface. These values are not observed JEV outputs and are not evidence of model performance.' : `Model: ${data.model || 'Not returned'}${typeof data.elapsedMs === 'number' ? ` · ${(data.elapsedMs / 1000).toFixed(2)}s` : ''} · Review threshold: ${percent(data.threshold ?? Number($('confidence-threshold').value) / 100)}. Raw response is available below.`;
  $('result-json').textContent = JSON.stringify(data, null, 2);
  $('results-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
async function decide() {
  if (state.busy || !state.plan) return;
  if ($('plan-json').value !== JSON.stringify(state.plan, null, 2)) { announce('Apply your JSON edits before running the decision.'); return; }
  if (state.plan.clarifications.length) { announce('Answer the clarification questions before running JEV.'); return; }
  const threshold = Number($('confidence-threshold').value) / 100;
  if (state.mode === 'demo') {
    const fixture = samples[state.template];
    const results = clone(fixture.results).map(result => {
      const strength = result.type === 'noul' ? result.reviewSignal : result.confidence;
      return { ...result, status: strength >= threshold ? 'ready' : 'needs_review' };
    });
    state.result = { mode: 'demo', provenance: 'Illustrative, human-authored fixture. No model call. Probabilities are example values, not measured outputs.', model: 'none — illustrative sample', threshold, summary: 'Illustrative results for the fixed example. Change the review threshold to see how a workflow flags uncertainty.', results, plan: clone(state.plan) };
    renderResults();
    announce('Illustrative results loaded. No AI call was made.');
    return;
  }
  state.result = null;
  $('results-section').hidden = true;
  if (!canUseLive()) return;
  setBusy(true, 'JEV is evaluating your reviewed questions…');
  const revision = state.revision;
  try {
    const data = await api('decide', { plan: state.plan, threshold });
    if (revision !== state.revision) return;
    if (data.mode !== 'live' || !Array.isArray(data.results)) throw new Error('The server did not return a valid live result.');
    state.result = data;
    renderResults();
    announce('JEV has responded. Review the answer cards and inspect the complete response below.');
  } catch (error) { announce(error.name === 'TimeoutError' ? 'JEV took too long to respond. Please try again.' : error.message); }
  finally { setBusy(false); }
}
async function copy(text, success) {
  try { await navigator.clipboard.writeText(text); toast(success); }
  catch { toast('Clipboard access is unavailable. Select and copy the text directly.'); }
}
$('request-form').addEventListener('submit', event => { event.preventDefault(); interpret(); });
$('mode-live').addEventListener('click', () => setMode('live'));
$('mode-demo').addEventListener('click', () => setMode('demo'));
$('try-demo').addEventListener('click', () => { setMode('demo'); interpret(); });
document.querySelectorAll('[data-template]').forEach(button => button.addEventListener('click', () => chooseTemplate(button.dataset.template)));
$('decide-button').addEventListener('click', decide);
$('clarify-button').addEventListener('click', () => {
  const answer = $('clarification-answer').value.trim();
  if (!answer) { $('clarification-answer').focus(); announce('Add the missing information before updating the plan.'); return; }
  interpret(answer);
});
$('confidence-threshold').addEventListener('input', () => { $('threshold-value').textContent = `${$('confidence-threshold').value}%`; });
$('edit-plan-toggle').addEventListener('click', () => {
  $('plan-editor').hidden = !$('plan-editor').hidden;
  $('edit-plan-toggle').setAttribute('aria-expanded', String(!$('plan-editor').hidden));
  if (!$('plan-editor').hidden) $('plan-json').focus();
});
$('save-plan').addEventListener('click', () => {
  try {
    const plan = validateClientPlan(JSON.parse($('plan-json').value));
    state.plan = plan;
    state.result = null;
    $('results-section').hidden = true;
    renderPlan();
    $('plan-editor').hidden = true;
    $('edit-plan-toggle').setAttribute('aria-expanded', 'false');
    announce('Updated plan applied. Review the questions before running JEV.');
  } catch (error) { announce(`Plan not saved: ${error.message}`); }
});
for (const id of ['request', 'context']) $(id).addEventListener('input', () => {
  if (state.plan || state.busy) resetOutput();
  document.querySelectorAll('.template-chip').forEach(el => { el.classList.remove('selected'); el.setAttribute('aria-pressed', 'false'); });
});
$('copy-json').addEventListener('click', () => { if (state.result) copy(JSON.stringify(state.result, null, 2), 'JSON copied.'); });
$('download-json').addEventListener('click', () => {
  if (!state.result) return;
  const blob = new Blob([JSON.stringify(state.result, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = node('a');
  link.href = url;
  link.download = `jevwrapper-${state.result.mode}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('copy-quickstart').addEventListener('click', () => copy($('quickstart-code').textContent, 'Quick start copied.'));
async function loadConfig() {
  try {
    const response = await fetch('./api/config', { credentials: 'same-origin', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Configuration unavailable');
    state.config = await response.json();
    const label = state.config.liveAvailable ? (state.config.authRequired ? 'Live service · owner access' : 'Live service available') : 'Illustrative demo available';
    $('service-status').replaceChildren(node('span', `status-dot${state.config.liveAvailable ? '' : ' muted-dot'}`), document.createTextNode(label));
    $('auth-indicator').textContent = state.config.authRequired ? 'Required for live mode' : 'Optional';
    if (state.config.version) document.querySelector('.version').textContent = `v${state.config.version}`;
  } catch {
    state.config = { liveAvailable: false, authRequired: false };
    $('service-status').replaceChildren(node('span', 'status-dot muted-dot'), document.createTextNode('Offline · demo available'));
  }
}
loadConfig();
