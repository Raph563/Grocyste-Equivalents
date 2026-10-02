import test from'node:test';import assert from'node:assert/strict';
import{shoppingRangeColumnIndexes}from'../src/ui/shopping-range-browser.mjs';
const table=labels=>({querySelectorAll:()=>labels.map(textContent=>({textContent}))});
test('les colonnes anglaises et françaises natives sont reconnues, leur absence permet le panneau compagnon',()=>{
 assert.deepEqual(shoppingRangeColumnIndexes(table(['Product','Amount','Last price (Unit)','Last price (Total)'])),{historicalUnit:2,currentTotal:3});
 assert.deepEqual(shoppingRangeColumnIndexes(table(['Produit','Quantité','Coût historique (unité)','Prix actuel (total)'])),{historicalUnit:2,currentTotal:3});
 assert.throws(()=>shoppingRangeColumnIndexes(table(['Product','Amount','Hidden status'])),/introuvables/);
});
