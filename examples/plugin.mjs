import { VoiceRouter } from '../src/router.mjs';
// An existing Evidence Engine host can register its own adapter.
// This synthetic example does not call an external service.
const deliveries = [];
const router = new VoiceRouter({ destinations: {
  pilot: async ({ capture, idempotencyKey }) => { deliveries.push({ action: capture.plan, idempotencyKey }); return { externalId: 'synthetic-demo-1' }; }
} });
const capture = router.capture({ text: 'Automate pilot: prepare the venue checklist', source: 'api' }, { idempotencyKey: 'synthetic-demo-1' });
console.log('Review:', capture.plan);
console.log('Confirmed result:', await router.execute(capture.id, { revision: capture.revision, confirmed: true }));
console.log('Synthetic deliveries:', deliveries.length);
router.close();
