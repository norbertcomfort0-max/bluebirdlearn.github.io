export function aggregateExamAverages(attempts){
  const byExam = {};
  (attempts||[]).filter(a=>a.type==='exam').forEach(a=>{
    const k = a.examTitle || 'Exam';
    byExam[k] = byExam[k] || { sum:0, count:0 };
    byExam[k].sum += (a.score || 0);
    byExam[k].count++;
  });
  return Object.entries(byExam).map(([k,v])=> ({ title:k, avg: Math.round(v.sum / v.count) }));
}

export function flashcardStats(flashcards){
  const total = (flashcards||[]).length;
  const due = (flashcards||[]).filter(c=> new Date(c.nextReview) <= new Date()).length;
  return { total, due };
}