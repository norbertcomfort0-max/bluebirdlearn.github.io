export function scheduleSM2(card, quality){
  card.history = card.history || [];
  card.history.push({ when: new Date().toISOString(), quality });
  if (typeof card.ef !== 'number') card.ef = 2.5;
  if (typeof card.interval !== 'number') card.interval = 0;
  if (typeof card.repetitions !== 'number') card.repetitions = 0;

  if (quality < 3) {
    card.repetitions = 0; card.interval = 1;
  } else {
    card.repetitions += 1;
    if (card.repetitions === 1) card.interval = 1;
    else if (card.repetitions === 2) card.interval = 6;
    else card.interval = Math.round((card.interval || 1) * card.ef);
  }
  const newEF = card.ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  card.ef = Math.max(1.3, newEF);
  card.nextReview = new Date(Date.now() + card.interval * 24*60*60*1000).toISOString();
  return card;
}