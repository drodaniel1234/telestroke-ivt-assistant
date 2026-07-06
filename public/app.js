const NOTES = {
  note1: {
    label: "Note 1 · Complete",
    text: `ED Telestroke Consult Note

Chief Complaint: Right-sided weakness and slurred speech, onset 90 minutes ago.

HPI: 68-year-old male, last known well at 07:15, found by wife with right facial droop, right arm drift, and dysarthria at 07:30. EMS activated stroke alert, arrived ED 08:20. No seizure activity witnessed. No head trauma.

PMH: Hypertension, hyperlipidemia, type 2 diabetes. No prior stroke or TIA. No history of atrial fibrillation. No known bleeding disorder. No malignancy.

Medications: Lisinopril 10mg daily, atorvastatin 40mg daily, metformin 500mg BID. No anticoagulants or antiplatelets.

Surgical history: Cholecystectomy 2015. No neurosurgery, no recent surgery of any kind in the last 3 months.

Social history: Non-smoker. Denies alcohol/drug use.

Exam: NIHSS 9. BP 168/94, HR 82, glucose 134. Facial droop, right arm drift 3/5, mild dysarthria, no neglect.

Labs: INR 1.0, aPTT 28s, platelets 245,000. Glucose 134.

Imaging: Non-contrast head CT at 08:35: no acute hemorrhage, no early ischemic changes, no extensive hypodensity. CTA pending.

Assessment: Acute ischemic stroke, right MCA territory suspected, within 4.5 hour window from last known well (73 minutes elapsed at time of imaging).`
  },
  note2: {
    label: "Note 2 · Ambiguous AC",
    text: `ED Telestroke Consult Note

Chief Complaint: Left-sided weakness, found down by neighbor.

HPI: 76-year-old female, found on kitchen floor by neighbor at 14:00, unclear how long she had been down. Neighbor reports she seemed "normal" when she saw her yesterday evening around 19:00. Patient is confused, unable to give reliable history. EMS transport time 20 minutes, arrived ED 14:35.

PMH: Per old chart review - history of atrial fibrillation (diagnosed ~2021), hypertension, chronic kidney disease stage 3. Prior TIA in 2019, no residual deficit documented at that time.

Medications: Chart lists "apixaban" on the active medication list from a visit 8 months ago, but current adherence unknown - patient lives alone, no current medication list from pharmacy available, family not yet reached. Patient unable to confirm last dose taken.

Surgical history: None documented in available records.

Exam: NIHSS 14. BP 178/100, HR 96 irregularly irregular, glucose 110. Left facial droop, left hemiplegia, left neglect, dysarthria.

Labs: INR pending (sent, not yet resulted). Platelets 210,000. Renal panel pending.

Imaging: Non-contrast head CT at 14:50: no acute hemorrhage. Subtle loss of gray-white differentiation in right MCA territory, not extensive. CTA pending.

Assessment: Acute ischemic stroke, right MCA territory suspected. Time of onset unknown but last known well was approximately 19:00 the prior evening (~19 hours 35 minutes prior to current time) - outside the standard 4.5 hour IVT window based on last known well, though wake-up/unwitnessed-onset protocol with advanced imaging may apply. Anticoagulation status uncertain pending labs and medication reconciliation.`
  },
  note3: {
    label: "Note 3 · Missing LKW",
    text: `ED Telestroke Consult Note

Chief Complaint: Word-finding difficulty and right arm weakness, reported by bystander.

HPI: 54-year-old male, brought in by ambulance after a passerby noticed him having difficulty speaking near a bus stop. Patient has no ID, unable to provide history due to expressive aphasia. No witnesses to onset available. EMS report notes "unknown time last seen normal." Arrival to ED 11:10.

PMH: Unknown - no prior records found in system under any identifying information provided. Patient unable to communicate history due to aphasia.

Medications: Unknown. No pill bottles or medication list found on patient.

Surgical history: Unknown.

Allergies: Unknown.

Exam: NIHSS 11. BP 152/88, HR 78, glucose 98. Expressive aphasia, right arm drift 4/5, mild right facial droop.

Labs: Sent on arrival, INR and platelet count pending at time of this note.

Imaging: Non-contrast head CT at 11:20: no acute hemorrhage, no extensive hypodensity. CTA pending.

Assessment: Acute ischemic stroke suspected, left hemisphere. Time of onset/last known well cannot be established - patient found down with unknown down-time, no witnesses located, no collateral history available at this time. Social work and police assistance requested to attempt identification and locate any available history.`
  },
  note4: {
    label: "Note 4 · Contraindication",
    text: `ED Telestroke Consult Note

Chief Complaint: Left arm weakness and confusion, onset 45 minutes prior to arrival per spouse.

HPI: 71-year-old male, witnessed onset of left arm weakness and confusion by spouse at 09:00, EMS called immediately, arrived ED 09:40. Spouse reports patient underwent a craniotomy for a subdural hematoma evacuation 9 days ago at an outside hospital, with planned neurosurgery follow-up later this week.

PMH: Hypertension, prior subdural hematoma status post craniotomy (9 days ago, as above). No history of atrial fibrillation. No known malignancy.

Medications: Amlodipine 5mg daily. No anticoagulants.

Surgical history: Craniotomy for subdural hematoma evacuation, 9 days prior to this presentation (outside hospital records being obtained).

Exam: NIHSS 7. BP 160/92, HR 88, glucose 122. Left arm drift 3/5, mild confusion, no facial droop, no aphasia.

Labs: INR 1.1, aPTT 26s, platelets 260,000.

Imaging: Non-contrast head CT at 09:50: postsurgical changes from prior craniotomy, small residual extra-axial collection, no new acute hemorrhage. No extensive hypodensity. CTA pending.

Assessment: Acute ischemic stroke suspected, right hemisphere, within 4.5 hour window from witnessed onset. However, patient underwent neurosurgery (craniotomy) 9 days ago, which falls within the 14-day neurosurgery exclusion window for IV thrombolytic therapy.`
  }
};

let SCHEMA = { inclusion: [], absolute: [], relative: [] };
let currentNote = "note1";
let results = {}; // id -> {value, evidence, notes}
let status = "idle"; // idle | loading | done | error
let errorMessage = "";

function allCriteria(){
  return [...SCHEMA.inclusion, ...SCHEMA.absolute, ...SCHEMA.relative];
}

async function loadCriteria(){
  const resp = await fetch("/api/criteria");
  const data = await resp.json();
  SCHEMA = {
    inclusion: data.inclusion_criteria.map(c=>({id:c.id, label:c.label, notes:c.notes||null})),
    absolute: data.absolute_contraindications.map(c=>({id:c.id, label:c.label, notes:c.notes||null})),
    relative: data.relative_contraindications.map(c=>({id:c.id, label:c.label, notes:c.notes||null}))
  };
}

function renderButtons(){
  const wrap = document.getElementById("noteButtons");
  wrap.innerHTML = "";
  Object.keys(NOTES).forEach(key=>{
    const b = document.createElement("button");
    b.className = "note-btn" + (key===currentNote ? " active" : "");
    b.textContent = NOTES[key].label;
    b.onclick = ()=>{ currentNote = key; results = {}; status="idle"; renderAll(); };
    wrap.appendChild(b);
  });
  const run = document.createElement("button");
  run.className = "run-btn";
  run.id = "runBtn";
  run.textContent = status==="loading" ? "Extracting..." : "Run Extraction";
  run.disabled = status==="loading";
  run.onclick = runExtraction;
  wrap.appendChild(run);
}

function renderNote(){
  document.getElementById("noteBody").textContent = NOTES[currentNote].text;
}

function badgeInfo(criterionType, value){
  if(!value) return {cls:"pending", text:"pending"};
  if(value==="unknown") return {cls:"unknown", text:"unknown"};
  if(criterionType==="inclusion"){
    return value==="yes" ? {cls:"yes", text:"met"} : {cls:"contra-yes", text:"not met"};
  } else {
    // absolute / relative contraindications: yes = bad
    return value==="yes" ? {cls:"contra-yes", text:"present"} : {cls:"no", text:"absent"};
  }
}

function renderChecklist(){
  const body = document.getElementById("checklistBody");
  body.innerHTML = "";
  const sections = [
    {key:"inclusion", title:"Inclusion Criteria"},
    {key:"absolute", title:"Absolute Contraindications"},
    {key:"relative", title:"Relative Contraindications"}
  ];
  sections.forEach(sec=>{
    const h = document.createElement("div");
    h.className = "cat-head";
    h.textContent = sec.title;
    body.appendChild(h);
    SCHEMA[sec.key].forEach(item=>{
      const r = results[item.id];
      const info = badgeInfo(sec.key, r ? r.value : null);
      const row = document.createElement("div");
      row.className = "row";
      row.onclick = ()=>{
        row.classList.toggle("expanded");
        highlightEvidence(r ? r.location : null);
      };
      row.innerHTML = `
        <span class="badge ${info.cls}">${info.text}</span>
        <div class="row-main">
          <div class="row-label">${item.label}</div>
          ${r && r.reasoning ? `<div class="row-evidence">${r.reasoning}</div>` : ""}
          ${item.notes ? `<div class="row-notes">${item.notes}</div>` : ""}
        </div>
      `;
      body.appendChild(row);
    });
  });
}

function highlightEvidence(location){
  const noteBody = document.getElementById("noteBody");
  const rawText = NOTES[currentNote].text;
  noteBody.innerHTML = "";
  const valid = location
    && Number.isInteger(location.start) && Number.isInteger(location.end)
    && location.start >= 0 && location.end > location.start && location.end <= rawText.length;
  const snippet = valid ? rawText.slice(location.start, location.end) : "";
  if(!valid || !snippet.trim()){ noteBody.textContent = rawText; return; }
  const before = rawText.slice(0, location.start);
  const after = rawText.slice(location.end);
  noteBody.appendChild(document.createTextNode(before));
  const markEl = document.createElement("mark");
  markEl.textContent = snippet;
  noteBody.appendChild(markEl);
  noteBody.appendChild(document.createTextNode(after));
  markEl.scrollIntoView({block:"center", behavior:"smooth"});
}

function computeEligibility(){
  const inclusionFail = SCHEMA.inclusion.filter(c => results[c.id] && results[c.id].value === "no");
  const inclusionUnknown = SCHEMA.inclusion.filter(c => !results[c.id] || results[c.id].value === "unknown");
  const absoluteHit = SCHEMA.absolute.filter(c => results[c.id] && results[c.id].value === "yes");
  const absoluteUnknown = SCHEMA.absolute.filter(c => !results[c.id] || results[c.id].value === "unknown");
  const relativeHit = SCHEMA.relative.filter(c => results[c.id] && results[c.id].value === "yes");
  const relativeUnknown = SCHEMA.relative.filter(c => !results[c.id] || results[c.id].value === "unknown");

  if(inclusionFail.length){
    return {cls:"not-eligible", text:"Does NOT meet inclusion criteria for IVT: " + inclusionFail.map(c=>c.label).join(", ")};
  }
  if(absoluteHit.length){
    return {cls:"not-eligible", text:"NOT eligible — absolute contraindication present: " + absoluteHit.map(c=>c.label).join(", ")};
  }
  if(inclusionUnknown.length || absoluteUnknown.length){
    const unresolved = [...inclusionUnknown, ...absoluteUnknown].map(c=>c.label).join(", ");
    return {cls:"needs-review", text:"Cannot determine — clarify " + unresolved + " before proceeding."};
  }
  if(relativeHit.length || relativeUnknown.length){
    const flagged = [...relativeHit, ...relativeUnknown].map(c=>c.label).join(", ");
    return {cls:"needs-review", text:"Inclusion met, no absolute contraindications — relative factor(s) need clinical judgment: " + flagged};
  }
  return {cls:"eligible", text:"Meets inclusion criteria — no absolute or relative contraindications identified."};
}

function renderBanner(){
  const el = document.getElementById("resultBanner");
  if(status==="idle"){
    el.className = "result-banner idle";
    el.textContent = "Select a note and run extraction to see the eligibility read-out.";
    return;
  }
  if(status==="loading"){
    el.className = "result-banner idle";
    el.textContent = "Reading note and extracting criteria...";
    return;
  }
  if(status==="error"){
    el.className = "result-banner not-eligible";
    el.textContent = "Extraction failed: " + (errorMessage || "see console, or retry.");
    return;
  }
  const r = computeEligibility();
  el.className = "result-banner " + r.cls;
  el.textContent = r.text;
}

function renderAll(){
  renderButtons();
  renderNote();
  renderChecklist();
  renderBanner();
}

async function runExtraction(){
  status = "loading";
  errorMessage = "";
  renderAll();

  try{
    const resp = await fetch("/api/extract", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ noteText: NOTES[currentNote].text })
    });
    const data = await resp.json();
    if(!resp.ok){
      throw new Error(data.error || "Request failed");
    }
    results = {};
    (data.results || []).forEach(item=>{
      results[item.id] = {value:item.v, reasoning:item.reasoning || null, location:item.location || null};
    });
    status = "done";
  }catch(err){
    console.error("Extraction error:", err);
    errorMessage = err.message || String(err);
    status = "error";
  }
  renderAll();
}

(async function init(){
  await loadCriteria();
  renderAll();
})();
