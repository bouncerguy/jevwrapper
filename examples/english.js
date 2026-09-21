// Run: node --env-file=.env examples/english.js
import {interpret,decide} from '../src/index.js';
const {plan} = await interpret({
  message:'Classify this ticket as billing (payments/refunds), technical (software faults), or sales (pricing/new purchases). Also estimate whether the sender explicitly asks for help today.',
  context:'My invoice was charged twice. Please fix this today.'
});
console.log('Inspect this plan:', JSON.stringify(plan,null,2));
if(plan.clarifications.length)console.log('Please clarify:',plan.clarifications);
// In a real interface, let the person inspect or edit the plan before proceeding.
else if(process.argv.includes('--run'))console.log(JSON.stringify(await decide({plan}),null,2));
