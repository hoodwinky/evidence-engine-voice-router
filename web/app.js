let token = '';
const byId = id => document.getElementById(id);
const message = text => { byId('message').textContent = text; };
function el(tag, text) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; }
async function api(path, method = 'GET', body) {
  if (!token) throw new Error('Enter your review token first.');
  const response = await fetch(path, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json(); if (!response.ok) throw new Error(data.message ?? 'Request failed.'); return data;
}
async function run(action) { try { await action(); } catch (error) { message(error.message); } }
function addButton(card, label, action) { const button = el('button', label); button.type = 'button'; button.addEventListener('click', () => run(action)); card.append(button); }
async function load() {
  const { captures } = await api('/v1/captures'); byId('items').replaceChildren();
  for (const item of captures) {
    const card = el('article'); card.append(el('h2', item.plan.title || 'Untitled capture'));
    const badge = el('p', item.status.replaceAll('_', ' ')); badge.className = 'status'; card.append(badge);
    card.append(el('blockquote', item.original.text), el('p', `${item.plan.kind} → ${item.plan.destination}`));
    if (item.plan.dueAt) card.append(el('p', `Due: ${item.plan.dueAt}`));
    if (item.plan.startAt) card.append(el('p', `Starts: ${item.plan.startAt} · Ends: ${item.plan.endAt ?? 'needed'}`));
    card.append(el('small', `Captured ${item.receivedAt} · SHA-256 ${item.originalSha256}`));
    if (['needs_details', 'pending_review', 'saved'].includes(item.status)) {
      const details = el('details'); details.append(el('summary', 'Edit action details'));
      const form = el('form');
      for (const field of ['kind', 'title', ...(item.plan.kind === 'reminder' ? ['dueAt'] : item.plan.kind === 'calendar' ? ['startAt', 'endAt'] : []), 'destination', ...(item.plan.kind === 'automation' ? ['automation'] : [])]) {
        const label = el('label', field); const input = el('input'); input.name = field; input.value = item.plan[field] ?? ''; label.append(input); form.append(label);
      }
      form.append(el('p', 'Dates need seconds and a UTC offset, for example 2026-12-01T09:00:00+11:00.'));
      const save = el('button', 'Update proposal'); form.append(save);
      form.addEventListener('submit', event => { event.preventDefault(); run(async () => { const fields = Object.fromEntries(new FormData(form)); Object.keys(fields).forEach(key => { if (!fields[key]) delete fields[key]; }); await api(`/v1/captures/${item.id}/prepare`, 'POST', { details: fields, revision: item.revision }); await load(); message('Proposal updated. Review it before confirming.'); }); });
      details.append(form); card.append(details);
    }
    if (item.plan.missing.length) card.append(el('p', `Details needed: ${item.plan.missing.join(', ')}`));
    if (item.status === 'pending_review') addButton(card, item.plan.destination === 'device' ? 'Confirm device handoff' : 'Confirm and send', async () => {
      if (!window.confirm(`Send “${item.plan.title}” to ${item.plan.destination}?`)) return;
      const result = await api(`/v1/captures/${item.id}/execute`, 'POST', { revision: item.revision, confirmed: true }); await load(); message(result.status === 'awaiting_device' ? 'Handoff prepared. Complete it in your native client, or import the calendar file.' : `Delivery status: ${result.status}`);
    });
    if (item.plan.kind === 'calendar' && !item.plan.missing.length) addButton(card, 'Download calendar file', async () => {
      const response = await fetch(`/v1/captures/${item.id}/calendar.ics`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error('Calendar download failed.');
      const url = URL.createObjectURL(await response.blob()), link = el('a'); link.href = url; link.download = 'event.ics'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); message('Calendar file downloaded. Import it to create the event; attendees have not been invited.');
    });
    if (item.status === 'awaiting_device') {
      card.append(el('pre', JSON.stringify(item.result, null, 2)));
      addButton(card, 'I created the item on my device', async () => { if (!window.confirm('Confirm you have created the reminder or event in the native app.')) return; await api(`/v1/captures/${item.id}/receipt`, 'POST', { revision: item.revision, externalId: 'user-confirmed-in-native-app' }); await load(); message('Your device completion report was recorded.'); });
    }
    if (item.error) card.append(el('p', item.error));
    byId('items').append(card);
  }
}
byId('connect').addEventListener('click', () => run(async () => { token = byId('token').value; byId('token').value = ''; await load(); message('Inbox opened.'); }));
byId('disconnect').addEventListener('click', () => { token = ''; byId('token').value = ''; byId('items').replaceChildren(); message('Token forgotten.'); });
byId('capture').addEventListener('submit', event => { event.preventDefault(); run(async () => { const body = { text: byId('text').value, source: 'web' }; if (byId('kind').value) body.kind = byId('kind').value; const result = await api('/v1/captures', 'POST', body); byId('text').value = ''; await load(); message(result.message); }); });
