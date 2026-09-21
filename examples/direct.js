// Run: node --env-file=.env examples/direct.js
// Inspectable questions can be reused without paying to interpret them every time.
import {decide} from '../src/index.js';

const result = await decide({plan:{
  summary:'Route a customer support ticket.',
  state:'My last invoice was charged twice. Could you help?',
  clarifications:[],
  questions:[{id:'department',type:'choice',instructions:'Which team should handle this ticket?',options:[
    {label:'billing',description:'Invoices, refunds, and payment issues'},
    {label:'technical',description:'Bugs, connectivity, or integration issues'},
    {label:'sales',description:'Pricing and new purchases'}
  ]}]
},threshold:0.7});
console.log(JSON.stringify(result,null,2));
