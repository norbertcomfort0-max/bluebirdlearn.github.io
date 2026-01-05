export function exportAttemptCSV(attempt){
  const rows = [['type','examId','examTitle','score','when','studentName']];
  rows.push([attempt.type||'', attempt.examId||'', attempt.examTitle||'', attempt.score!=null?String(attempt.score):'', attempt.when||'', attempt.studentName||'']);
  return rows.map(r=> r.map(c=> `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
}