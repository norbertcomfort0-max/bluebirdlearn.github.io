// main.js - wires UI and integrates modules
import { loadState, saveState, STORAGE_KEY } from './storage.js';
import * as idb from './idb.js';
import * as ui from './ui.js';
import * as media from './media.js';
import * as fc from './flashcards.js';
import * as exm from './exams.js';
import * as an from './analytics.js';
import * as packer from './packer.js';

// default content
const DEFAULT_STATE = {
  profile: null, theme:'light', fontSize:16, lowBandwidth:false, reduceMotion:false,
  teacherTopics: [], flashcards: [], exams: [], attempts: [], classrooms: [], created_at: new Date().toISOString()
};

let STATE = loadState(DEFAULT_STATE);

// sample subjects (could be loaded from external package later)
const SAMPLE_CONTENT = [
  { id:'math', title:'Mathematics', desc:'Algebra, Geometry', topics:[ {id:'sets',title:'Sets',lesson:'<h3>Sets</h3><p>Definition.</p>'}, {id:'algebra',title:'Algebra',lesson:'<h3>Algebra</h3><p>Equations.</p>'} ] },
  { id:'biology', title:'Biology', desc:'Cells', topics:[ {id:'cells',title:'Cells',lesson:'<h3>Cells</h3><p>Units of life.</p>'} ] },
  { id:'english', title:'English', desc:'Grammar', topics:[ {id:'grammar',title:'Parts of speech',lesson:'<h3>Parts of speech</h3><p>Nouns, verbs, adjectives.</p>'} ] }
];

let mediaStream = null, mediaRecorder = null, mediaChunks = [], lastRecordedBlob=null, lastRecordedType=null;
let currentSubjectId=null, currentTopicIndex=0;
let QUIZ = null, quizTimerHandle = null;
let STUDY_SESSION = null;
let EXAM_SESSION = null;

function save() { saveState(STATE); renderAll(); }

// Utility
function escapeHtml(s){ return ui.escapeHtml(s); }

function init(){
  // Navigation
  document.querySelectorAll('.nav-btn').forEach(b=> b.addEventListener('click', ()=>{
    const view = b.dataset.view;
    document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden'));
    const el = document.getElementById('view-'+view);
    if (el) el.classList.remove('hidden');
    document.querySelectorAll('.nav-btn').forEach(nb=>nb.classList.toggle('active', nb===b));
    document.getElementById('navLessonBtn').style.display = view==='lesson' ? 'inline-block' : 'none';
  }));
  document.getElementById('homeBtn').addEventListener('click', e=>{ e.preventDefault(); document.querySelector('.nav-btn[data-view="home"]').click(); });

  // Settings
  document.getElementById('settingsBtn').addEventListener('click', ()=> openSettings());
  document.getElementById('closeSettings').addEventListener('click', ()=> closeSettings());
  document.getElementById('saveProfile').addEventListener('click', (ev)=>{ ev.preventDefault(); saveProfile(); });

  document.getElementById('avatarInput').addEventListener('change', handleAvatarUpload);
  document.getElementById('themeToggleHeader').addEventListener('click', toggleThemeQuick);
  document.getElementById('exportData').addEventListener('click', exportAllData);
  document.getElementById('importData').addEventListener('change', handleImportFile);
  document.getElementById('clearData').addEventListener('click', clearAllData);

  // content links
  document.getElementById('startLearning').addEventListener('click', ()=> document.querySelector('.nav-btn[data-view="subjects"]').click());
  document.getElementById('openDashboard').addEventListener('click', ()=> document.querySelector('.nav-btn[data-view="dashboard"]').click());
  document.getElementById('openManage').addEventListener('click', ()=> document.querySelector('.nav-btn[data-view="manage"]').click());

  // lesson viewer actions
  document.getElementById('createFlashcardFromSelection').addEventListener('click', createFlashcardFromSelection);
  document.getElementById('createExamQFromSelection').addEventListener('click', createExamQuestionFromSelection);
  document.getElementById('downloadLessonBtn').addEventListener('click', downloadLessonAsPDF);

  // flashcards wiring
  document.getElementById('fcSubject')?.addEventListener('change', populateTopicSelectForFlashcards);
  document.getElementById('addFlashcardBtn')?.addEventListener('click', addFlashcardFromForm);
  document.getElementById('exportFlashcardsBtn')?.addEventListener('click', exportFlashcardsJSON);
  document.getElementById('importFlashcards')?.addEventListener('change', handleImportFlashcardsFile);
  document.getElementById('studyDueBtn')?.addEventListener('click', ()=> startStudy('due'));
  document.getElementById('studyAllBtn')?.addEventListener('click', ()=> startStudy('all'));
  document.getElementById('studyTodayBtn')?.addEventListener('click', ()=> startStudy('today'));

  // exams wiring
  document.getElementById('addExamQuestion')?.addEventListener('click', ()=> addExamQuestionUI());
  document.getElementById('saveExamBtn')?.addEventListener('click', saveExamFromBuilder);
  document.getElementById('exportExamsBtn')?.addEventListener('click', exportExamsJSON);

  document.getElementById('closeExamRunner')?.addEventListener('click', closeExamRunner);

  // manage actions
  document.getElementById('openMediaRecorder').addEventListener('click', openMediaRecorder);
  document.getElementById('openAddTopic').addEventListener('click', openQuickAddTopic);
  document.getElementById('openTeacherTopics').addEventListener('click', renderManage);
  document.getElementById('exportSubjectBtn').addEventListener('click', ()=> { const subj = document.getElementById('exportSubjectSelect').value; if (subj) exportSubjectPackage(subj); });
  document.getElementById('importPackageFile').addEventListener('change', (e)=> { handleImportPackageFile(e.target.files[0]); e.target.value=''; });

  // media recorder wiring
  document.getElementById('startRec').addEventListener('click', startRecording);
  document.getElementById('stopRec').addEventListener('click', stopRecording);
  document.getElementById('saveRecBtn').addEventListener('click', saveRecordingAsTopic);
  document.getElementById('discardRecBtn').addEventListener('click', discardRecording);
  document.getElementById('closeMediaRecorder').addEventListener('click', closeMediaRecorder);

  // initial render
  renderAll();
}

function renderAll(){
  renderSubjects();
  renderProfileSummary();
  renderManage();
  renderFlashcardsList();
  renderExamsList();
  renderAnalytics();
  populateSubjectSelects();
  applyAppearance();
  renderDashboard();
}

/* ---------- Settings/Profile ---------- */
function openSettings(){
  const modal = document.getElementById('settingsModal');
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden','false');
  fillSettingsUI();
}
function closeSettings(){
  const modal = document.getElementById('settingsModal');
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden','true');
}
function fillSettingsUI(){
  document.getElementById('profileName').value = STATE.profile?.name || '';
  document.getElementById('profileRole').value = STATE.profile?.role || 'learner';
  document.getElementById('profileClass').value = STATE.profile?.class || '';
  document.getElementById('profileFavs').value = (STATE.profile?.favorites||[]).join(', ');
  document.getElementById('avatarPreview').src = STATE.profile?.avatar || 'logo.svg';
  document.getElementById('themeSelect').value = STATE.theme || 'auto';
  document.getElementById('fontSize').value = STATE.fontSize || 16;
  document.documentElement.style.setProperty('--fs', (STATE.fontSize || 16) + 'px');
  document.getElementById('textOnly').checked = !!STATE.lowBandwidth;
  document.getElementById('reduceMotion').checked = !!STATE.reduceMotion;
}
function saveProfile(){
  const name = document.getElementById('profileName').value.trim();
  const role = document.getElementById('profileRole').value;
  const klass = document.getElementById('profileClass').value;
  const favs = document.getElementById('profileFavs').value.split(',').map(s=>s.trim()).filter(Boolean);
  STATE.profile = STATE.profile || {};
  STATE.profile.name = name || STATE.profile.name || '';
  STATE.profile.role = role || 'learner';
  STATE.profile.class = klass || '';
  STATE.profile.favorites = favs;
  STATE.profile.updated_at = new Date().toISOString();
  save();
  closeSettings();
  alert('Profile saved locally.');
}
function handleAvatarUpload(ev){
  const f = ev.target.files && ev.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = ()=> { STATE.profile = STATE.profile || {}; STATE.profile.avatar = r.result; save(); document.getElementById('avatarPreview').src = r.result; };
  r.readAsDataURL(f);
  ev.target.value='';
}
function applyAppearance(){
  if (STATE.theme === 'auto') {
    const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.body.setAttribute('data-theme', dark ? 'dark' : 'light');
  } else {
    document.body.setAttribute('data-theme', STATE.theme);
  }
  document.documentElement.style.setProperty('--fs', (STATE.fontSize || 16) + 'px');
  if (STATE.lowBandwidth) document.documentElement.classList.add('text-only'); else document.documentElement.classList.remove('text-only');
  if (STATE.reduceMotion) document.documentElement.classList.add('reduce-motion'); else document.documentElement.classList.remove('reduce-motion');
}
function toggleThemeQuick(){ STATE.theme = STATE.theme === 'light' ? 'dark' : 'light'; save(); }

/* ---------- Subjects & Lesson Viewer ---------- */
function renderSubjects(){
  const el = document.getElementById('subjectGrid');
  el.innerHTML = '';
  SAMPLE_CONTENT.forEach(s=>{
    const b = document.createElement('div'); b.className='subject-card'; b.tabIndex=0;
    b.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><div><strong>${escapeHtml(s.title)}</strong><div class="muted">${escapeHtml(s.desc)}</div></div><div class="muted">${s.topics.length} topics</div></div>`;
    b.addEventListener('click', ()=> openSubject(s.id));
    el.appendChild(b);
  });
}
function openSubject(id){
  currentSubjectId = id; currentTopicIndex = 0; renderLesson(); document.querySelector('.nav-btn[data-view="lesson"]').click();
}
function renderLesson(){
  const subj = SAMPLE_CONTENT.find(s=>s.id===currentSubjectId);
  if (!subj) return;
  document.getElementById('lessonTitle').textContent = subj.title;
  const list = document.getElementById('lessonTopicList'); list.innerHTML='';
  subj.topics.forEach((t,i)=>{
    const d = document.createElement('div'); d.className='topic-item' + (i===currentTopicIndex ? ' active' : ''); d.textContent = t.title; d.tabIndex=0;
    d.addEventListener('click', ()=>{ currentTopicIndex = i; renderLesson(); });
    list.appendChild(d);
  });
  renderLessonContent();
}
function renderLessonContent(){
  const subj = SAMPLE_CONTENT.find(s=>s.id===currentSubjectId); if (!subj) return;
  const topic = subj.topics[currentTopicIndex];
  document.getElementById('lessonContent').innerHTML = `<h2>${escapeHtml(topic.title)}</h2>${topic.lesson || '<p>No content</p>'}`;
}
function downloadLessonAsPDF(){
  const subj = SAMPLE_CONTENT.find(s=>s.id===currentSubjectId); const topic = subj?.topics?.[currentTopicIndex];
  if (!topic) return alert('No lesson to download');
  const w = window.open('','_blank'); w.document.write(`<html><head><title>${escapeHtml(subj.title)} - ${escapeHtml(topic.title)}</title></head><body><h1>${escapeHtml(subj.title)} — ${escapeHtml(topic.title)}</h1>${topic.lesson}</body></html>`); w.document.close(); setTimeout(()=> w.print(), 400);
}
function createFlashcardFromSelection(){
  const sel = window.getSelection();
  if (!sel || !sel.toString().trim()) return alert('Select text in the lesson to create a flashcard from.');
  const front = sel.toString().trim();
  const back = prompt('Back text (answer)', '');
  if (back === null) return;
  STATE.flashcards = STATE.flashcards || [];
  STATE.flashcards.push({ id: uid('fc'), subject: currentSubjectId, topic: currentTopicIndex, front, back, ef:2.5, interval:0, repetitions:0, nextReview: new Date().toISOString(), history:[] });
  save(); alert('Flashcard saved.');
}
function createExamQuestionFromSelection(){
  const sel = window.getSelection();
  if (!sel || !sel.toString().trim()) return alert('Select text in the lesson to create a question from.');
  const qtext = sel.toString().trim();
  addExamQuestionUI({ prefill:{ q:qtext }});
  document.querySelector('.nav-btn[data-view="exams"]').click();
  alert('Question prefilled in exam builder.');
}

/* ---------- Flashcards UI & SM-2 ---------- */
function populateSubjectSelects(){
  const subjSel = document.getElementById('fcSubject');
  const recSubSel = document.getElementById('recSubject');
  const exportSub = document.getElementById('exportSubjectSelect');
  if (subjSel) subjSel.innerHTML=''; if (recSubSel) recSubSel.innerHTML=''; if (exportSub) exportSub.innerHTML='';
  SAMPLE_CONTENT.forEach(s=>{
    if (subjSel){ const o=document.createElement('option'); o.value=s.id; o.textContent=s.title; subjSel.appendChild(o); }
    if (recSubSel){ const o=document.createElement('option'); o.value=s.id; o.textContent=s.title; recSubSel.appendChild(o); }
    if (exportSub){ const o=document.createElement('option'); o.value=s.id; o.textContent=s.title; exportSub.appendChild(o); }
  });
  populateTopicSelectForFlashcards();
}
function populateTopicSelectForFlashcards(){
  const subj = document.getElementById('fcSubject')?.value || SAMPLE_CONTENT[0].id;
  const sel = document.getElementById('fcTopic');
  if (!sel) return;
  sel.innerHTML='';
  const s = SAMPLE_CONTENT.find(x=>x.id===subj);
  (s?.topics||[]).forEach(t=>{ const o=document.createElement('option'); o.value=t.id; o.textContent=t.title; sel.appendChild(o); });
}
function addFlashcardFromForm(){
  const subject = document.getElementById('fcSubject').value;
  const topic = document.getElementById('fcTopic').value;
  const front = document.getElementById('fcFront').value.trim();
  const back = document.getElementById('fcBack').value.trim();
  if (!front || !back) return alert('Enter front and back.');
  STATE.flashcards = STATE.flashcards || [];
  STATE.flashcards.push({ id: uid('fc'), subject, topic, front, back, ef:2.5, interval:0, repetitions:0, nextReview: new Date().toISOString(), history:[]});
  save(); document.getElementById('fcFront').value=''; document.getElementById('fcBack').value='';
  renderFlashcardsList(); alert('Flashcard added.');
}
function renderFlashcardsList(){
  const area = document.getElementById('flashcardsListArea'); if (!area) return; area.innerHTML='';
  const wrap = document.createElement('div'); wrap.className='card'; wrap.innerHTML='<h3>All flashcards</h3>'; if (!(STATE.flashcards||[]).length){ wrap.appendChild(document.createElement('div')).className='muted'; wrap.lastChild.textContent='No flashcards yet.'; area.appendChild(wrap); return; }
  (STATE.flashcards||[]).forEach((c,idx)=>{
    const item = document.createElement('div'); item.className='flashcard-list-item';
    const due = new Date(c.nextReview) <= new Date();
    item.innerHTML = `<div><strong>${escapeHtml(c.front)}</strong><div class="small-muted">${escapeHtml(c.back)}</div></div><div style="text-align:right"><div class="small-muted">EF:${Number(c.ef||2.5).toFixed(2)} • Int:${c.interval||0}d</div><div style="margin-top:6px">${due?'<span style="color:var(--primary);font-weight:700">Due</span>':new Date(c.nextReview).toLocaleDateString()}</div><div style="margin-top:6px"><button class="btn small" data-edit="'+idx+'">Edit</button> <button class="btn small" data-del="'+idx+'">Delete</button></div></div>`;
    const delBtn = item.querySelector('[data-del]'); if (delBtn) delBtn.addEventListener('click', ()=>{ if (confirm('Delete?')){ STATE.flashcards.splice(idx,1); save(); renderFlashcardsList(); }});
    const editBtn = item.querySelector('[data-edit]'); if (editBtn) editBtn.addEventListener('click', ()=>{ const nf = prompt('Edit front', c.front); if (nf===null) return; const nb = prompt('Edit back', c.back); if (nb===null) return; c.front=nf; c.back=nb; save(); renderFlashcardsList(); });
    wrap.appendChild(item);
  });
  area.appendChild(wrap);
}
function exportFlashcardsJSON(){ const blob=new Blob([JSON.stringify(STATE.flashcards||[],null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`flashcards_${new Date().toISOString().slice(0,10)}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),2000); }
function handleImportFlashcardsFile(ev){ const f=ev.target.files && ev.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=()=>{ try{ const parsed=JSON.parse(r.result); if(!Array.isArray(parsed)) return alert('Invalid file'); STATE.flashcards = STATE.flashcards || []; parsed.forEach(c=> STATE.flashcards.push(Object.assign({ id: uid('fc'), ef:2.5, interval:0, repetitions:0, nextReview:new Date().toISOString(), history:[] }, c))); save(); renderFlashcardsList(); alert('Imported'); }catch(e){ alert('Invalid file'); } ev.target.value='';}; r.readAsText(f); }

/* study session */
function startStudy(mode){
  const cards = (STATE.flashcards||[]).slice();
  const now = new Date();
  let queue = [];
  if (mode==='all') queue = cards;
  else if (mode==='today') queue = cards.filter(c=> new Date(c.nextReview) <= new Date().setHours(23,59,59,999));
  else queue = cards.filter(c=> new Date(c.nextReview) <= now);
  if (!queue.length) return alert('No cards to study');
  queue.sort((a,b)=> new Date(a.nextReview)-new Date(b.nextReview));
  STUDY_SESSION = { cards: queue, index:0, mode };
  renderStudyCard();
}
function renderStudyCard(){
  const area = document.getElementById('studyArea'); area.innerHTML='';
  if (!STUDY_SESSION || STUDY_SESSION.index>=STUDY_SESSION.cards.length){ area.innerHTML='<div class="card"><div class="muted">Study complete</div></div>'; STUDY_SESSION=null; renderFlashcardsList(); return; }
  const card = STUDY_SESSION.cards[STUDY_SESSION.index];
  const cw = document.createElement('div'); cw.className='flashcard-card';
  const front = document.createElement('div'); front.className='flashcard-front'; front.textContent=card.front;
  const back = document.createElement('div'); back.className='flashcard-back hidden'; back.textContent=card.back;
  const toggle = document.createElement('button'); toggle.className='btn small'; toggle.textContent='Show answer'; toggle.addEventListener('click', ()=>{ back.classList.toggle('hidden'); toggle.textContent = back.classList.contains('hidden') ? 'Show answer' : 'Hide answer';});
  const controls = document.createElement('div'); controls.className='flashcard-controls';
  const btns = [{t:'Again',q:0},{t:'Hard',q:3},{t:'Good',q:4},{t:'Easy',q:5}];
  btns.forEach(b=>{ const bt=document.createElement('button'); bt.className='btn'; bt.textContent=b.t; bt.addEventListener('click', ()=>{ scheduleAndAdvance(card.id,b.q); }); controls.appendChild(bt);});
  cw.appendChild(front); cw.appendChild(toggle); cw.appendChild(back); cw.appendChild(controls); area.appendChild(cw);
  const prog = document.createElement('div'); prog.className='muted'; prog.style.marginTop='8px'; prog.textContent = `Card ${STUDY_SESSION.index+1} / ${STUDY_SESSION.cards.length}`; area.appendChild(prog);
}
function scheduleAndAdvance(cardId, quality){
  const idx = (STATE.flashcards||[]).findIndex(c=>c.id===cardId); if (idx===-1) return;
  fc.scheduleSM2(STATE.flashcards[idx], quality);
  save();
  if (STUDY_SESSION){ STUDY_SESSION.index++; renderStudyCard(); } else renderFlashcardsList();
}

/* ---------- Exams (builder & runner) ---------- */
function addExamQuestionUI(opts){
  const builder = document.getElementById('examBuilder'); const qid = uid('q');
  const div = document.createElement('div'); div.id=qid; div.className='exam-q';
  const pre = opts && opts.prefill && opts.prefill.q ? opts.prefill.q : '';
  div.innerHTML = `
    <label>Question:<input class="exam-q-text" style="width:100%;margin-top:6px" value="${escapeHtml(pre)}"></label>
    <label style="margin-top:6px">Choice A<input class="exam-choice" data-index="0" style="width:100%;margin-top:6px"></label>
    <label style="margin-top:6px">Choice B<input class="exam-choice" data-index="1" style="width:100%;margin-top:6px"></label>
    <label style="margin-top:6px">Choice C<input class="exam-choice" data-index="2" style="width:100%;margin-top:6px"></label>
    <label style="margin-top:6px">Choice D<input class="exam-choice" data-index="3" style="width:100%;margin-top:6px"></label>
    <label style="margin-top:6px">Correct answer
      <select class="exam-correct">
        <option value="0">A</option><option value="1">B</option><option value="2">C</option><option value="3">D</option>
      </select>
    </label>
    <div style="margin-top:6px"><button class="btn small remove-q">Remove question</button></div>
  `;
  builder.appendChild(div);
  div.querySelector('.remove-q').addEventListener('click', ()=>div.remove());
}
function saveExamFromBuilder(){
  const title = document.getElementById('examTitle').value.trim() || ('Exam ' + new Date().toLocaleString());
  const durationMin = parseInt(document.getElementById('examDuration').value,10) || 30;
  const builder = document.getElementById('examBuilder'); const qDivs = Array.from(builder.querySelectorAll('.exam-q'));
  if (!qDivs.length) return alert('Add questions');
  const questions = qDivs.map(div=>{ const q=div.querySelector('.exam-q-text').value.trim(); const choices=Array.from(div.querySelectorAll('.exam-choice')).map(i=>i.value.trim()||'—'); const aIndex=parseInt(div.querySelector('.exam-correct').value,10); return { q, choices, aIndex }; });
  const exam = { id: uid('exam'), title, durationMin, questions };
  STATE.exams = STATE.exams || []; STATE.exams.push(exam); save(); document.getElementById('examTitle').value=''; document.getElementById('examDuration').value='30'; builder.innerHTML=''; renderExamsList(); alert('Exam saved.');
}
function renderExamsList(){
  const area = document.getElementById('examsListArea'); if (!area) return; area.innerHTML='';
  const arr = STATE.exams || []; if (!arr.length){ area.innerHTML='<div class="muted">No exams yet.</div>'; return; }
  arr.forEach(ex=>{ const div=document.createElement('div'); div.className='card'; div.style.marginBottom='8px'; div.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center"><div><strong>${escapeHtml(ex.title)}</strong><div class="muted">${ex.questions.length} questions • ${ex.durationMin} min</div></div><div><button class="btn" data-run="${ex.id}">Run</button> <button class="btn" data-export="${ex.id}">Export</button> <button class="btn" data-del="${ex.id}">Remove</button></div></div>`; div.querySelector('[data-run]').addEventListener('click', ()=>startExam(ex.id)); div.querySelector('[data-export]').addEventListener('click', ()=>exportExamJSON(ex.id)); div.querySelector('[data-del]').addEventListener('click', ()=>{ if(confirm('Delete exam?')){ STATE.exams=STATE.exams.filter(e=>e.id!==ex.id); save(); renderExamsList();}}); area.appendChild(div); });
}
function exportExamsJSON(){ const arr = STATE.exams || []; const blob = new Blob([JSON.stringify(arr,null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`exams_${new Date().toISOString().slice(0,10)}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),2000); }
function exportExamJSON(id){ const ex = (STATE.exams||[]).find(e=>e.id===id); if(!ex) return; const blob = new Blob([JSON.stringify(ex,null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`${ex.title.replace(/\s+/g,'_')}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),2000); }

/* Exam runner */
function startExam(examId){
  const ex = (STATE.exams||[]).find(e=>e.id===examId); if(!ex) return alert('Missing');
  EXAM_SESSION = { exam:ex, i:0, correct:0, remainingSec: ex.durationMin*60, selected:{}, timerHandle:null };
  const modal = document.getElementById('examRunnerModal'); modal.classList.remove('hidden'); modal.setAttribute('aria-hidden','false');
  renderExamQuestion();
  EXAM_SESSION.timerHandle = setInterval(()=>{ EXAM_SESSION.remainingSec--; updateExamTimer(); if (EXAM_SESSION.remainingSec<=0) finishExam(); }, 1000);
}
function closeExamRunner(){ const modal=document.getElementById('examRunnerModal'); modal.classList.add('hidden'); modal.setAttribute('aria-hidden','true'); if(EXAM_SESSION && EXAM_SESSION.timerHandle) clearInterval(EXAM_SESSION.timerHandle); EXAM_SESSION=null; }
function updateExamTimer(){ const area=document.getElementById('examRunnerArea'); if(!area||!EXAM_SESSION) return; const minutes=Math.floor(EXAM_SESSION.remainingSec/60); const secs=EXAM_SESSION.remainingSec%60; const timer=area.querySelector('.exam-timer'); if(timer) timer.textContent=`Time left: ${minutes}:${String(secs).padStart(2,'0')}`; }
function renderExamQuestion(){ const area=document.getElementById('examRunnerArea'); area.innerHTML=''; if(!EXAM_SESSION) return; const ex=EXAM_SESSION.exam; if(EXAM_SESSION.i>=ex.questions.length) return finishExam(); const q=ex.questions[EXAM_SESSION.i]; const wrapper=document.createElement('div'); wrapper.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center"><div><strong>${escapeHtml(ex.title)}</strong></div><div class="exam-timer muted">Time left</div></div><div class="exam-q" style="margin-top:12px"><div><strong>Q${EXAM_SESSION.i+1}.</strong> ${escapeHtml(q.q)}</div></div>`; const opts=document.createElement('div'); opts.style.marginTop='8px'; q.choices.forEach((c,idx)=>{ const b=document.createElement('button'); b.className='btn'; b.style.display='block'; b.style.width='100%'; b.style.marginBottom='6px'; b.textContent=c; b.addEventListener('click', ()=>{ EXAM_SESSION.selected[EXAM_SESSION.i]=idx; if(idx===q.aIndex) EXAM_SESSION.correct++; EXAM_SESSION.i++; renderExamQuestion(); }); opts.appendChild(b); }); wrapper.appendChild(opts); wrapper.innerHTML += `<div style="margin-top:8px"><button class="btn" id="quitExamBtn">Quit</button></div>`; area.appendChild(wrapper); document.getElementById('quitExamBtn').addEventListener('click', ()=>{ if(confirm('Quit exam?')) finishExam(); }); updateExamTimer(); }
function finishExam(){ if(!EXAM_SESSION) return; if(EXAM_SESSION.timerHandle) clearInterval(EXAM_SESSION.timerHandle); const ex=EXAM_SESSION.exam; const score=Math.round((EXAM_SESSION.correct/ex.questions.length)*100); const studentName = STATE.profile?.name || 'Anonymous'; STATE.attempts = STATE.attempts || []; STATE.attempts.unshift({ type:'exam', examId:ex.id, examTitle:ex.title, score, when:new Date().toISOString(), studentName }); save(); const area=document.getElementById('examRunnerArea'); area.innerHTML=`<div class="card"><div style="font-weight:800">Your score: ${score}%</div><div class="muted">Correct: ${EXAM_SESSION.correct} / ${ex.questions.length}</div><div style="margin-top:8px"><button class="btn" id="closeResultBtn">Close</button><button class="btn" id="exportResultBtn">Export result CSV</button></div></div>`; document.getElementById('closeResultBtn').addEventListener('click', ()=>closeExamRunner()); document.getElementById('exportResultBtn').addEventListener('click', ()=>{ const csv = exm.exportAttemptCSV(STATE.attempts[0]); const blob=new Blob([csv],{type:'text/csv'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`${ex.title.replace(/\s+/g,'_')}_result.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),2000); }); EXAM_SESSION=null; }

/* ---------- Analytics ---------- */
function renderAnalytics(){ const area=document.getElementById('analyticsArea'); if(!area) return; area.innerHTML=''; const examAgg = an.aggregateExamAverages(STATE.attempts||[]); const examDiv=document.createElement('div'); examDiv.className='analytics-card'; examDiv.innerHTML='<h3>Exams (local)</h3>'; if(!examAgg.length) examDiv.innerHTML+='<div class="muted">No exam attempts yet.</div>'; else { examAgg.forEach(d=> examDiv.innerHTML+=`<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px"><div><strong>${escapeHtml(d.title)}</strong></div><div class="muted">${d.avg}% avg</div></div>`); } area.appendChild(examDiv); const fcStats = an.flashcardStats(STATE.flashcards||[]); const fcDiv=document.createElement('div'); fcDiv.className='analytics-card'; fcDiv.style.marginTop='12px'; fcDiv.innerHTML=`<h3>Flashcards</h3><div class="muted">Total: ${fcStats.total} • Due: ${fcStats.due}</div>`; area.appendChild(fcDiv); }

/* ---------- Manage & media (IDB) ---------- */
async function migrateTeacherMediaIfNeeded(){
  if(!STATE.teacherTopics || !STATE.teacherTopics.length) return;
  let migrated=false;
  for(const t of STATE.teacherTopics){
    if(t.media && t.media.data && !t.media.mediaKey){
      try{ const blob=dataURLtoBlob(t.media.data); const key=await idb.putMedia({ blob, type: t.media.type||blob.type||'audio/webm', name: t.media.name||'media' }); t.media={ mediaKey:key, type:t.media.type||'audio', name:t.media.name||'media' }; migrated=true; } catch(e){ console.warn('migration fail', e); }
    }
  }
  if(migrated) save();
}
function dataURLtoBlob(dataurl){
  const arr=dataurl.split(','); const mime=arr[0].match(/:(.*?);/)[1]; const bstr=atob(arr[1]); let n=bstr.length; const u8=new Uint8Array(n); while(n--) u8[n]=bstr.charCodeAt(n); return new Blob([u8],{type:mime});
}
function renderManage(){ const container=document.getElementById('teacherTopicsListContainer'); container.innerHTML=''; const header=document.createElement('div'); header.className='card'; header.innerHTML='<h3>Teacher-created topics</h3>'; container.appendChild(header); if(!(STATE.teacherTopics||[]).length){ const empty=document.createElement('div'); empty.className='card muted'; empty.innerHTML='<div class="muted">No custom topics yet.</div>'; container.appendChild(empty); return; } STATE.teacherTopics.forEach((t, idx)=>{ const card=document.createElement('div'); card.className='card'; card.style.padding='10px'; card.style.marginBottom='8px'; const title=escapeHtml(t.title||'Untitled'); const subject=escapeHtml(t.subject||'—'); card.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center"><div><strong>${title}</strong><div class="muted">${subject}</div></div><div><button class="btn play-btn" data-idx="${idx}">Play</button> <button class="btn" data-add="${idx}">Add to content</button> <button class="btn" data-del="${idx}">Remove</button></div></div><div style="margin-top:8px" id="mediaArea_${idx}"></div>`; card.querySelector('[data-add]').addEventListener('click', ()=> addTopicToContent(idx)); card.querySelector('[data-del]').addEventListener('click', ()=> removeTeacherTopicWithMedia(idx)); card.querySelector('.play-btn').addEventListener('click', async (ev)=>{ ev.preventDefault(); await showTopicMediaPreview(idx); }); container.appendChild(card); }); populateSubjectSelects(); }
async function showTopicMediaPreview(idx){ const t=STATE.teacherTopics[idx]; if(!t) return; const area=document.getElementById('mediaArea_'+idx); area.innerHTML='Loading media...'; if(t.media && t.media.mediaKey){ const rec=await idb.getMedia(t.media.mediaKey); if(!rec){ area.innerHTML='<div class="muted">Media not found.</div>'; return;} const url=URL.createObjectURL(rec.blob); if(rec.type && rec.type.startsWith('video')) area.innerHTML=`<video controls style="max-width:100%" src="${url}"></video><div class="muted">${escapeHtml(rec.name)}</div>`; else area.innerHTML=`<audio controls src="${url}"></audio><div class="muted">${escapeHtml(rec.name)}</div>`; } else area.innerHTML='<div class="muted">No media attached.</div>'; }
async function removeTeacherTopicWithMedia(idx){ const t=STATE.teacherTopics[idx]; if(!t) return; if(!confirm('Remove this topic?')) return; if(t.media && t.media.mediaKey){ if(confirm('Delete the stored media blob too?')){ try{ await idb.deleteMedia(t.media.mediaKey); }catch(e){console.warn(e);} } } STATE.teacherTopics.splice(idx,1); save(); renderManage(); }
function addTopicToContent(idx){ const t=STATE.teacherTopics[idx]; if(!t) return; const subj = SAMPLE_CONTENT.find(s=>s.id===t.subject); const topic = { id:t.id, title:t.title, lesson:t.lesson||'', media:t.media }; if(!subj) SAMPLE_CONTENT.push({ id:t.subject, title:t.subject, desc:'Imported', topics:[topic] }); else subj.topics.push(topic); save(); renderSubjects(); alert('Added to content'); }

/* ---------- Media recorder with subject selector ---------- */
function openMediaRecorder(){ document.getElementById('mediaRecorderModal').classList.remove('hidden'); document.getElementById('mediaRecorderModal').setAttribute('aria-hidden','false'); document.getElementById('recPreviewArea').innerHTML=''; document.getElementById('recStatus').textContent='Idle'; document.getElementById('recTitle').value=''; document.getElementById('startRec').disabled=false; document.getElementById('stopRec').disabled=true; document.getElementById('saveRecBtn').disabled=true; document.getElementById('discardRecBtn').disabled=true; lastRecordedBlob=null; lastRecordedType=null; populateSubjectSelects(); }
function closeMediaRecorder(){ if(mediaRecorder && mediaRecorder.state==='recording') mediaRecorder.stop(); if(mediaStream) mediaStream.getTracks().forEach(t=>t.stop()); document.getElementById('mediaRecorderModal').classList.add('hidden'); document.getElementById('mediaRecorderModal').setAttribute('aria-hidden','true'); }
async function startRecording(){ const type=document.getElementById('recType').value||'audio'; document.getElementById('recStatus').textContent='Requesting media...'; try{ const constraints = type==='video' ? { audio:true, video:{ width:{ideal:640}, height:{ideal:360}}} : { audio:true }; mediaStream = await navigator.mediaDevices.getUserMedia(constraints); mediaChunks=[]; mediaRecorder = new MediaRecorder(mediaStream); mediaRecorder.ondataavailable = (e)=>{ if(e.data && e.data.size) mediaChunks.push(e.data); }; mediaRecorder.onstop = ()=>{ lastRecordedBlob = new Blob(mediaChunks, { type: mediaChunks[0]?.type || (type==='video'?'video/webm':'audio/webm') }); lastRecordedType = type; showRecordingPreview(lastRecordedBlob, type); document.getElementById('recStatus').textContent='Recording stopped'; document.getElementById('saveRecBtn').disabled=false; document.getElementById('discardRecBtn').disabled=false; }; mediaRecorder.start(); document.getElementById('recStatus').textContent='Recording...'; document.getElementById('startRec').disabled=true; document.getElementById('stopRec').disabled=false; }catch(e){ alert('Could not access devices: '+e.message); document.getElementById('recStatus').textContent='Error'; } }
function stopRecording(){ if(mediaRecorder && mediaRecorder.state==='recording') mediaRecorder.stop(); setTimeout(()=>{ if(mediaStream) mediaStream.getTracks().forEach(t=>t.stop()); mediaStream=null; }, 400); }
function showRecordingPreview(blob,type){ const area=document.getElementById('recPreviewArea'); area.innerHTML=''; if(!blob){ area.innerHTML='<div class="muted">No recording</div>'; return; } const url=URL.createObjectURL(blob); if(type==='video') area.innerHTML=`<video controls style="max-width:100%" src="${url}"></video><div class="muted">Preview</div>`; else area.innerHTML=`<audio controls src="${url}"></audio><div class="muted">Preview</div>`; }
async function saveRecordingAsTopic(){ if(!lastRecordedBlob) return alert('No recording'); const title=document.getElementById('recTitle').value.trim()||('Recording '+new Date().toLocaleString()); const subject=document.getElementById('recSubject').value||SAMPLE_CONTENT[0].id; try{ const key=await idb.putMedia({ blob:lastRecordedBlob, name:title, type:lastRecordedBlob.type }); STATE.teacherTopics = STATE.teacherTopics||[]; STATE.teacherTopics.push({ id:'t_'+Date.now(), subject, title, lesson:`<p>Recorded ${lastRecordedType}</p>`, media:{ mediaKey:key, type:lastRecordedType, name:title }, created:new Date().toISOString() }); save(); renderManage(); lastRecordedBlob=null; lastRecordedType=null; closeMediaRecorder(); alert('Recording saved.'); }catch(e){ console.error(e); alert('Save failed: '+e.message); } }
function discardRecording(){ lastRecordedBlob=null; lastRecordedType=null; document.getElementById('recPreviewArea').innerHTML=''; document.getElementById('saveRecBtn').disabled=true; document.getElementById('discardRecBtn').disabled=true; document.getElementById('recStatus').textContent='Discarded'; }

/* ---------- Subject package export/import (tar) ---------- */
async function exportSubjectPackage(subjectId){
  const subj = SAMPLE_CONTENT.find(s=>s.id===subjectId); if(!subj) return alert('Not found');
  const files=[]; const manifest={ media:{} }; const mediaKeys=new Set();
  subj.topics.forEach(t=>{ if(t.media && t.media.mediaKey) mediaKeys.add(t.media.mediaKey); });
  (STATE.teacherTopics||[]).forEach(tt=>{ if(tt.subject===subjectId && tt.media && tt.media.mediaKey) mediaKeys.add(tt.media.mediaKey); });
  for(const mk of mediaKeys){ try{ const rec = await idb.getMedia(mk); if(!rec) continue; const name=`media/${mk}_${rec.name}`; manifest.media[mk]=name; const ab=await rec.blob.arrayBuffer(); files.push({ name, data:new Uint8Array(ab) }); }catch(e){ console.warn(e); } }
  const subjCopy = JSON.parse(JSON.stringify(subj)); subjCopy.topics.forEach(t=>{ if(t.media && t.media.mediaKey && manifest.media[t.media.mediaKey]) t.media.exportPath = manifest.media[t.media.mediaKey]; });
  const teacherPack = (STATE.teacherTopics||[]).filter(tt=>tt.subject===subjectId).map(tt=>{ const copy=JSON.parse(JSON.stringify(tt)); if(copy.media && copy.media.mediaKey && manifest.media[copy.media.mediaKey]) copy.media.exportPath = manifest.media[copy.media.mediaKey]; return copy; });
  const pkg = { subject:subjCopy, teacherTopics:teacherPack, created:new Date().toISOString() };
  files.push({ name:'subject.json', data:new TextEncoder().encode(JSON.stringify(pkg,null,2)) });
  files.push({ name:'manifest.json', data:new TextEncoder().encode(JSON.stringify(manifest,null,2)) });
  const tar = packer.packFilesToTar(files);
  const url = URL.createObjectURL(tar); const a=document.createElement('a'); a.href=url; a.download=`${subjectId}_package_${new Date().toISOString().slice(0,10)}.tar`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),3000);
}
async function handleImportPackageFile(file){
  if(!file) return;
  const name=(file.name||'').toLowerCase();
  if(name.endsWith('.json')){ const text=await file.text(); try{ const pkg=JSON.parse(text); if(pkg.subject){ // simple import of JSON with embedded base64 omitted for brevity
      alert('JSON import: if this package includes base64 media, they will be migrated. Implementation supports .tar for full import.'); } }catch(e){ alert('Invalid JSON'); } return; }
  if(name.endsWith('.tar')){ const files = await packer.parseTar(file); const map={}; files.forEach(f=> map[f.name]=f.data); if(!map['subject.json']) return alert('Invalid package'); const pkg = JSON.parse(new TextDecoder().decode(map['subject.json'])); const manifest = map['manifest.json'] ? JSON.parse(new TextDecoder().decode(map['manifest.json'])) : { media:{} }; const mediaMap={}; for(const old in manifest.media){ const filename = manifest.media[old]; const data = map[filename]; if(!data) continue; const blob = new Blob([data]); const newKey = await idb.putMedia({ blob, name: filename.split('/').pop(), type: blob.type }); mediaMap[old]=newKey; } const subj = pkg.subject; const newId = subj.id || ('import_'+Date.now()); subj.topics.forEach(t=>{ const newTopic = { id:'import_'+Date.now()+'_'+Math.floor(Math.random()*1000), title:t.title, lesson:t.lesson || '' }; if(t.media && t.media.mediaKey && mediaMap[t.media.mediaKey]) newTopic.media = { mediaKey: mediaMap[t.media.mediaKey], type:t.media.type, name:t.media.name }; const existing=SAMPLE_CONTENT.find(s=>s.id===newId); if(!existing) SAMPLE_CONTENT.push({ id:newId, title:subj.title||newId, desc:subj.desc||'', topics:[newTopic] }); else existing.topics.push(newTopic); }); (pkg.teacherTopics||[]).forEach(tt=>{ const copy=tt; if(copy.media && copy.media.mediaKey && mediaMap[copy.media.mediaKey]) copy.media.mediaKey = mediaMap[copy.media.mediaKey]; STATE.teacherTopics = STATE.teacherTopics || []; STATE.teacherTopics.push(copy); }); save(); renderSubjects(); renderManage(); alert('Imported package'); return; }
  alert('Unsupported package type');
}

/* ---------- Utility helpers ---------- */
function uid(prefix='id'){ return prefix+'_'+Date.now()+'_'+Math.floor(Math.random()*1000); }
function escapeHtml(s){ return ui.escapeHtml(s); }

/* ---------- Data export/import ---------- */
function exportAllData(){ const data=JSON.stringify(STATE,null,2); const blob=new Blob([data],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`bluebird_data_${new Date().toISOString().slice(0,10)}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),2000); }
function handleImportFile(ev){ const f=ev.target.files && ev.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=async ()=>{ try{ const parsed=JSON.parse(r.result); if(!confirm('Import will overwrite local data. Proceed?')) { ev.target.value=''; return; } STATE = Object.assign({}, DEFAULT_STATE, parsed); await migrateTeacherMediaIfNeeded(); save(); alert('Imported.'); }catch(e){ alert('Invalid file.'); } ev.target.value=''; }; r.readAsText(f); }
function clearAllData(){ if(!confirm('Clear all local Bluebird data?')) return; localStorage.removeItem('bluebirdlearn_state_v1'); STATE = Object.assign({}, DEFAULT_STATE); save(); alert('Cleared'); }

/* ---------- Dashboard render ---------- */
function renderProfileSummary(){ const wrap=document.getElementById('profileSummary'); wrap.innerHTML=''; const avatar=document.createElement('img'); avatar.className='avatar'; avatar.src=STATE.profile?.avatar || 'logo.svg'; avatar.alt='Avatar'; const meta=document.createElement('div'); meta.innerHTML=`<div style="font-weight:800">${escapeHtml(STATE.profile?.name||'Guest')}</div><div class="muted">${escapeHtml(STATE.profile?.role||'Learner')} ${STATE.profile?.class?('• '+STATE.profile.class):''}</div>`; wrap.appendChild(avatar); wrap.appendChild(meta); }
function renderDashboard(){ const el=document.getElementById('dashboardContent'); el.innerHTML=''; const name=STATE.profile?.name||'Guest'; const cls=STATE.profile?.class||'—'; const div=document.createElement('div'); div.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center"><div><strong>${escapeHtml(name)}</strong><div class="muted">Class: ${escapeHtml(cls)}</div></div><div class="muted">Topics available: ${SAMPLE_CONTENT.reduce((a,s)=>a+s.topics.length,0)}</div></div>`; el.appendChild(div); }

/* ---------- Init and start ---------- */
(async function(){ try{ await migrateTeacherMediaIfNeeded(); }catch(e){console.warn(e);} init(); })();