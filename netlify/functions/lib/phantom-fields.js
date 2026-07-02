// Conservative phantom-field suppression — drop fields the inventory feed
// commonly back-fills with defaults that don't apply (e.g. fuel='Diesel' on a
// farm attachment that has no engine). v1 covers the obvious cases; expand as
// review surfaces more. Erring on the side of INCLUDING a field is correct —
// the model is also given the description text as observable context.
const FARM_ATTACHMENT_SUBS = new Set([
  'backhoe attachment', 'hay rake', 'baler', 'cultivator', 'planter',
  'wagon', 'harrow', 'disk', 'box scraper', 'rotary cutter',
  'land leveler', 'overseeder', 'v-ripper',
]);

function isPhantom(unit, key) {
  const cat = String(unit.category || '').toLowerCase();
  const sub = String(unit.subcategory || '').toLowerCase();
  // Trailers don't have engines/fuel/horsepower. (Hours/mileage suppression is
  // owned by lib/usage-display — do NOT duplicate here.)
  if (cat === 'trailers') {
    if (key === 'engine' || key === 'fuel' || key === 'horsepower') return true;
  }
  // Farm attachments (non-self-propelled) have no engine block. Hours/mileage
  // suppression is owned by lib/usage-display — do NOT duplicate here.
  if (cat === 'farm' && FARM_ATTACHMENT_SUBS.has(sub)) {
    if (key === 'engine' || key === 'fuel' || key === 'horsepower') return true;
  }
  // Classic cars predate mainstream diesel; feed-defaulted "Fuel: Diesel" is almost always a
  // phantom value on this subcategory. Suppress fuel so the model doesn't treat a wrong fact
  // as ground truth (a contradictory fact can also wrongly trigger abstain).
  if (sub === 'classic car' && key === 'fuel') return true;
  return false;
}

module.exports = { isPhantom, FARM_ATTACHMENT_SUBS };
