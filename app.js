const STATUSES=["Vacature gevonden","Gesolliciteerd","Afgewezen","Uitgenodigd op gesprek","Eerste gesprek","Vervolggesprek","Aanbod ontvangen","Zelf teruggetrokken"];
const DOC_TYPES=["CV","Motivatiebrief","Certificaat","Diploma","Referentie","Overig"];
const DB_NAME="sollicitatie-app", DB_VERSION=3;
let db, vacancies=[], documents=[], contacts=[], reminders=[], inboxItems=[], editingId=null, processingInboxId=null;
const $=id=>document.getElementById(id);
const uid=()=>crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random();
function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,DB_VERSION);req.onupgradeneeded=()=>{const d=req.result;if(!d.objectStoreNames.contains("vacancies"))d.createObjectStore("vacancies",{keyPath:"id"});if(!d.objectStoreNames.contains("documents"))d.createObjectStore("documents",{keyPath:"id"});if(!d.objectStoreNames.contains("settings"))d.createObjectStore("settings",{keyPath:"id"});if(!d.objectStoreNames.contains("contacts"))d.createObjectStore("contacts",{keyPath:"id"});if(!d.objectStoreNames.contains("reminders"))d.createObjectStore("reminders",{keyPath:"id"});if(!d.objectStoreNames.contains("inbox"))d.createObjectStore("inbox",{keyPath:"id"});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function store(name,mode="readonly"){return db.transaction(name,mode).objectStore(name)}
function all(name){return new Promise((res,rej)=>{const r=store(name).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function put(name,value){return new Promise((res,rej)=>{const r=store(name,"readwrite").put(value);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function remove(name,id){return new Promise((res,rej)=>{const r=store(name,"readwrite").delete(id);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function fillSelect(id,items,first){$(id).innerHTML=(first?`<option value="">${first}</option>`:"")+items.map(x=>`<option>${escapeHTML(x)}</option>`).join("")}
function escapeHTML(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function dateToday(){return new Date().toISOString().slice(0,10)}
function showPage(id){document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id===id));document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("selected",b.dataset.page===id));}
function salaryLabel(v){const min=v.salaryMin||v.salary||"",max=v.salaryMax||"";if(min&&max)return `${escapeHTML(min)} – ${escapeHTML(max)}`;return escapeHTML(min||max)}
function vacancyCard(v){return `<article class="vacancy-card"><h3>${escapeHTML(v.title)}</h3><div class="vacancy-meta">${escapeHTML(v.company)}${v.location?" · "+escapeHTML(v.location):""}${v.hours?" · "+escapeHTML(v.hours)+" uur":""}${salaryLabel(v)?" · "+salaryLabel(v):""}</div><span class="status-pill">${escapeHTML(v.status)}</span>${v.notes?`<p class="muted">${escapeHTML(v.notes)}</p>`:""}<div class="card-actions"><button data-edit="${v.id}">Bewerken</button><button class="danger" data-delete="${v.id}">Verwijderen</button></div></article>`}
function render(){const query=($("vacancySearch").value||"").toLowerCase(),filter=$("statusFilter").value;const filtered=vacancies.filter(v=>(!filter||v.status===filter)&&(`${v.title} ${v.company}`.toLowerCase().includes(query)));$("vacancyList").innerHTML=filtered.length?filtered.sort((a,b)=>(b.foundDate||"").localeCompare(a.foundDate||"")).map(vacancyCard).join(""):"Geen vacatures gevonden.";const recent=[...vacancies].sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||"")).slice(0,3);$("recentVacancies").className=recent.length?"vacancy-list":"vacancy-list empty-state";$("recentVacancies").innerHTML=recent.length?recent.map(vacancyCard).join(""):"Je hebt nog geen vacatures toegevoegd."; $("statTotal").textContent=vacancies.length;$("statApplied").textContent=vacancies.filter(v=>v.status==="Gesolliciteerd").length;$("statInterviews").textContent=vacancies.filter(v=>["Uitgenodigd op gesprek","Eerste gesprek","Vervolggesprek"].includes(v.status)).length;$("statOffers").textContent=vacancies.filter(v=>v.status==="Aanbod ontvangen").length;renderDocs();renderContacts();renderReminders();}
function renderDocs(){$("documentList").className=documents.length?"document-list":"document-list empty-state";$("documentList").innerHTML=documents.length?documents.map(d=>{const linked=(d.vacancyIds||[]).map(id=>vacancies.find(v=>v.id===id)).filter(Boolean);return `<article class="document-card"><div><h3>${escapeHTML(d.name)}</h3><span class="status-pill">${escapeHTML(d.type)}</span><p class="muted">${escapeHTML(d.note||"Geen notitie")} · ${new Date(d.addedAt).toLocaleDateString("nl-NL")}${linked.length?" · "+linked.map(v=>escapeHTML(v.company)).join(", "):""}</p></div><div class="card-actions"><button data-open-doc="${d.id}">Open</button><button class="danger" data-delete-doc="${d.id}">Verwijder</button></div></article>`}).join(""):"Nog geen documenten toegevoegd.";}
let pendingVacancyText="";
function updateJobUrlLink(url){const a=$("jobUrlOpen");if(!a)return;try{const parsed=new URL(String(url||"").trim());a.href=parsed.href;a.hidden=!/^https?:$/.test(parsed.protocol)}catch{a.hidden=true}}
function openVacancy(v=null){
 if(!v){$("addMethodDialog").showModal();return;}
 editingId=v.id||null;$("vacancyForm").reset();
 $("jobTitle").value=v.title||"";$("company").value=v.company||"";$("location").value=v.location||"";$("hours").value=v.hours||"";
 $("salaryMin").value=v.salaryMin||v.salary||"";$("salaryMax").value=v.salaryMax||"";$("foundDate").value=v.foundDate||dateToday();
 $("jobUrl").value=v.url||"";updateJobUrlLink(v.url);$("jobStatus").value=v.status||STATUSES[0];$("jobNotes").value=v.notes||"";
 pendingVacancyText="";$("fullVacancyTextInput").value=v.fullText||"";$("vacancyDialog").showModal();
}
function labelledValue(text,labels){
 const re=new RegExp("^\\s*(?:[-•*]\\s*)?("+labels+")\\s*[:：-]\\s*(.+?)\\s*$","i");
 for(const line of text.split("\n")){const m=line.match(re);if(m)return m[2].trim();}
 return "";
}
function parseVacancyText(text){
 const clean=String(text||"").replaceAll("\r","").replace(/[\u00a0\t]+/g," ").trim();
 const lines=clean.split("\n").map(x=>x.replace(/^\s*[•*–-]\s*/,"").trim()).filter(Boolean);
 const get=labels=>labelledValue(clean,labels);
 const firstMatch=(re,source=clean)=>source.match(re);
 const urlMatch=firstMatch(/https?:\/\/[^\s<>"']+/i);
 const url=urlMatch?urlMatch[0].replace(/[),.;!?]+$/,""):"";
 let title=get("functie(?:titel)?|job title|vacature(?:titel)?");
 if(!title){
  const candidate=lines.slice(0,12).find(line=>line.length>5&&line.length<100&&line.split(/\s+/).length>=2&&!/^(hoofdkantoor|fulltime|parttime|ref(?:no|erentie)?\b|vacature delen|solliciteren|over ons|wie zoeken we|wat krijg je)/i.test(line)&&!/^\d+\s*(uur|dagen)/i.test(line));
  if(candidate)title=candidate.replace(/^#\s*/,"").replace(/\s+[-|]\s+.*$/,"").trim();
 }
 let company=get("bedrijf|organisatie|werkgever|company");
 if(!company&&/werkenbijkwantum\.nl|kwantum/i.test(clean))company="Kwantum";
 let location=get("locatie|standplaats|plaats|location");
 if(!location){
  const m=clean.match(/(?:hoofdkantoor|standplaats|locatie)[ \t]+([A-ZÀ-Ý][\p{L}'-]+(?:[ \t]+[A-ZÀ-Ý][\p{L}'-]+){0,2})/iu)
  if(m)location=m[1];
  else if(lines.length&&/^[A-ZÀ-Ý][\p{L}'-]+(?:,\s*[A-ZÀ-Ý][\p{L}'-]+)?$/u.test(lines[0])&&lines[0].length<45)location=lines[0];
 }
 const hoursRaw=get("uren(?: per week)?|arbeidsduur|aantal uren|hours");
 let hours="";
 const hr=hoursRaw.match(/(\d{1,2})\s*(?:tot|-|–)\s*(\d{1,2})/i);
 const hm=clean.match(/\b(\d{1,2})\s*(?:tot|-|–)\s*(\d{1,2})\s*uur(?:\s+per\s+week)?\b|\b(\d{1,2})\s*uur\s*(?:per\s+week)?\b/i);
 if(hr)hours=hr[1]+"–"+hr[2];else if(hm)hours=hm[1]&&hm[2]?hm[1]+"–"+hm[2]:hm[3]||hm[1]||"";
 if(!hours&&/fulltime/i.test(clean))hours="Fulltime";
 if(!hours&&/parttime/i.test(clean))hours="Parttime";
 let salaryMin="",salaryMax="";
 const salaryLine=clean.split("\n").find(line=>/salaris|beloning|verdien|maandsalaris|jaarsalaris/i.test(line))||"";
 const salaryScope=salaryLine||get("salaris|salarisindicatie|bruto salaris|salary|beloning");
 const salaryNums=[...salaryScope.matchAll(/(?:€\s*)?(\d{1,3}(?:\.\d{3})+|\d{4,5})(?:,\d{2})?/g)].map(m=>m[1].startsWith("€")?m[1]:m[1]).filter(v=>Number(v.replace(/\./g,""))>=1000);
 if(salaryNums.length){salaryMin="€ "+salaryNums[0];if(salaryNums.length>1)salaryMax="€ "+salaryNums[1];}
 const ref=clean.match(/(?:ref(?:erentie)?\s*(?:no|nr|nummer)?\s*[:#]?\s*)([A-Z0-9-]+)/i);
 return {title,company,location,hours,salaryMin,salaryMax,url,fullText:text,reference:ref?.[1]||""};
}
function startPasteImport(){$("addMethodDialog").close();$("pasteVacancyText").value="";$("pasteParseMessage").textContent="";$("pasteVacancyDialog").showModal();}
async function init(){db=await openDB();vacancies=await all("vacancies");documents=await all("documents");contacts=await all("contacts");reminders=await all("reminders");inboxItems=await all("inbox");fillSelect("jobStatus",STATUSES);fillSelect("statusFilter",STATUSES,"Alle statussen");fillSelect("documentType",DOC_TYPES);const settings=await all("settings");if(settings[0])applySettings(settings[0]);render();installExtraUI();render();if("serviceWorker"in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});}


function sourceFromUrl(url){try{return new URL(url).hostname.replace(/^www\./,"")}catch{return ""}}
function renderInbox(){
 const el=$("inboxList"),count=$("inboxCount");if(!el)return;
 const sorted=[...inboxItems].sort((a,b)=>(b.receivedAt||"").localeCompare(a.receivedAt||""));
 if(count)count.textContent=String(sorted.length);
 el.className=sorted.length?"vacancy-list":"empty-state";
 el.innerHTML=sorted.length?sorted.map(item=>'<article class="vacancy-card"><h3>'+escapeHTML(item.title||"Gedeelde vacature")+'</h3><p class="vacancy-meta">'+escapeHTML(item.source||sourceFromUrl(item.url)||"Gedeelde link")+(item.url?" · Link ontvangen":"")+'</p>'+(item.url?'<a class="inbox-original-link" href="'+escapeHTML(item.url)+'" target="_blank" rel="noopener">Open oorspronkelijke vacature ↗</a>':"")+(item.text?'<p class="muted">Tekst ontvangen</p>':"")+((item.files||[]).length?'<p class="muted">'+item.files.length+' bestand(en) ontvangen</p>':"")+'<p class="muted">'+new Date(item.receivedAt||Date.now()).toLocaleString("nl-NL")+'</p><div class="card-actions"><button class="primary-button compact" data-process-inbox="'+item.id+'">Vacature aanvullen</button><button class="danger" data-delete-inbox="'+item.id+'">Verwijderen</button></div></article>').join(""):"Je gedeelde links en bestanden verschijnen hier automatisch.";
}
async function receiveSharedItem(data){
 const url=(data.url||"").trim(),title=(data.title||"").trim(),text=String(data.text||"").trim();
 const files=(data.files||[]).filter(f=>f&&f.size).map(f=>({name:f.name||"gedeeld-bestand",type:f.type||"application/octet-stream",blob:f}));
 const key=url.toLowerCase().replace(/\/$/,"");
 const existing=key&&inboxItems.find(x=>(x.url||"").toLowerCase().replace(/\/$/,"")===key);
 const item=existing||{id:uid(),receivedAt:new Date().toISOString()};
 item.title=title||item.title||"";item.url=url||item.url||"";item.text=[item.text,text].filter(Boolean).join("\n\n");item.source=sourceFromUrl(item.url);item.files=[...(item.files||[]),...files];item.updatedAt=new Date().toISOString();
 await put("inbox",item);inboxItems=await all("inbox");renderInbox();showPage("inbox");
}
async function processInboxItem(id){
 const item=inboxItems.find(x=>x.id===id);if(!item)return;
 processingInboxId=id;inboxSupplementText=item.text||"";
 $("inboxImportMessage").textContent="";
 $("inboxImportTitle").textContent=item.title||"Gedeelde vacature";
 const link=$("inboxOriginalLink");
 if(item.url){link.href=item.url;link.hidden=false;}else{link.removeAttribute("href");link.hidden=true;}
 $("inboxImportDialog").showModal();
}
async function extractInboxAttachments(){
 const item=inboxItems.find(x=>x.id===processingInboxId);if(!item||!item.files?.length)return "";
 const files=item.files.map(f=>new File([f.blob],f.name,{type:f.type}));
 return await importMultipleFiles(files,$("fileImportMessage"));
}
function applyInboxSource(){
 const item=inboxItems.find(x=>x.id===processingInboxId);if(!item)return;
 if(item.url){$("jobUrl").value=item.url;updateJobUrlLink(item.url)}
 if(item.title&&!$("jobTitle").value)$("jobTitle").value=item.title;
 if(!$("company").value&&item.url&&sourceFromUrl(item.url).includes("werkenbijkwantum"))$("company").value="Kwantum";
}


function renderContacts(){const el=$("contactList");if(!el)return;el.className=contacts.length?"vacancy-list":"vacancy-list empty-state";el.innerHTML=contacts.length?contacts.map(c=>{const v=vacancies.find(x=>x.id===c.vacancyId);return `<article class="vacancy-card"><h3>${escapeHTML(c.name)}</h3><p class="vacancy-meta">${escapeHTML(c.company||"")}${c.role?" · "+escapeHTML(c.role):""}${v?" · "+escapeHTML(v.title):""}</p><p class="muted">${escapeHTML(c.email||"")}${c.phone?" · "+escapeHTML(c.phone):""}</p><div class="card-actions"><button data-edit-contact="${c.id}">Bewerken</button><button class="danger" data-delete-contact="${c.id}">Verwijderen</button></div></article>`}).join(""):"Nog geen contacten toegevoegd.";}
function renderReminders(){const el=$("reminderList");if(!el)return;const sorted=[...reminders].sort((a,b)=>a.date.localeCompare(b.date));el.className=sorted.length?"vacancy-list":"vacancy-list empty-state";el.innerHTML=sorted.length?sorted.map(r=>{const v=vacancies.find(x=>x.id===r.vacancyId);return `<article class="vacancy-card"><h3>${escapeHTML(r.title)}</h3><p class="vacancy-meta">${new Date(r.date+"T12:00:00").toLocaleDateString("nl-NL")}${r.time?" · "+escapeHTML(r.time):""}${v?" · "+escapeHTML(v.company+" – "+v.title):""}</p><p class="muted">${escapeHTML(r.note||"")}</p><div class="card-actions"><button class="danger" data-delete-reminder="${r.id}">Verwijderen</button></div></article>`}).join(""):"Nog geen herinneringen gepland.";}
function installExtraUIOriginal(){const nav=document.querySelector(".bottom-nav");if(nav&&!$("extraNav")){nav.insertAdjacentHTML("beforeend",'<button id="extraNav" class="nav-item" data-page="contacts"><span>♙</span>Contacten</button><button class="nav-item" data-page="reminders"><span>◷</span>Herinneringen</button>');}
const main=document.querySelector("main");if(main&&!$("contacts"))main.insertAdjacentHTML("beforeend",'<section id="contacts" class="page"><div class="section-heading"><div><p class="eyebrow">NETWERK</p><h2>Contacten</h2></div></div><form id="contactForm" class="panel"><h3>Contact toevoegen / bewerken</h3><input id="contactId" type="hidden"><label>Naam<input id="contactName" class="field" required></label><label>Bedrijf<input id="contactCompany" class="field"></label><label>Koppel aan vacature<select id="contactVacancy" class="field"></select></label><label>Functie / rol<input id="contactRole" class="field"></label><label>E-mailadres<input id="contactEmail" class="field" type="email"></label><label>Telefoon<input id="contactPhone" class="field" type="tel"></label><label>Notities<textarea id="contactNotes" class="field" rows="2"></textarea></label><button class="primary-button" type="submit">Contact opslaan</button></form><div id="contactList"></div></section><section id="reminders" class="page"><div class="section-heading"><div><p class="eyebrow">OPVOLGEN</p><h2>Herinneringen</h2></div></div><form id="reminderForm" class="panel"><h3>Nieuwe herinnering</h3><label>Onderwerp<input id="reminderTitle" class="field" required placeholder="Bijv. Nabellen na gesprek"></label><div class="two-col"><label>Datum<input id="reminderDate" class="field" type="date" required></label><label>Tijd<input id="reminderTime" class="field" type="time"></label></div><label>Koppel aan vacature<select id="reminderVacancy" class="field"></select></label><label>Notitie<input id="reminderNote" class="field"></label><button class="primary-button" type="submit">Herinnering opslaan</button></form><div id="reminderList"></div><p class="small-note">Dit zijn in-app herinneringen; er worden nog geen pushmeldingen verstuurd.</p></section>');
const df=$("documentForm");if(df&&!$("documentVacancy")){const l=document.createElement("label");l.innerHTML='Koppel aan vacature (optioneel)<select id="documentVacancy" class="field" multiple size="3"></select>';df.insertBefore(l,df.querySelector("button"));}
refreshRelations();
$("contactForm")?.addEventListener("submit",async e=>{e.preventDefault();const id=$("contactId").value||uid();await put("contacts",{id,name:$("contactName").value.trim(),company:$("contactCompany").value.trim(),vacancyId:$("contactVacancy").value,role:$("contactRole").value.trim(),email:$("contactEmail").value.trim(),phone:$("contactPhone").value.trim(),notes:$("contactNotes").value.trim()});contacts=await all("contacts");e.target.reset();renderContacts()});
$("reminderForm")?.addEventListener("submit",async e=>{e.preventDefault();await put("reminders",{id:uid(),title:$("reminderTitle").value.trim(),date:$("reminderDate").value,time:$("reminderTime").value,vacancyId:$("reminderVacancy").value,note:$("reminderNote").value.trim()});reminders=await all("reminders");e.target.reset();renderReminders()});}
function refreshRelations(){const opts='<option value="">Geen koppeling</option>'+vacancies.map(v=>'<option value="'+escapeHTML(v.id)+'">'+escapeHTML(v.company+' – '+v.title)+'</option>').join("");if($("documentVacancy"))$("documentVacancy").innerHTML=vacancies.map(v=>'<option value="'+escapeHTML(v.id)+'">'+escapeHTML(v.company+' – '+v.title)+'</option>').join("");if($("reminderVacancy"))$("reminderVacancy").innerHTML=opts;if($("contactVacancy"))$("contactVacancy").innerHTML=opts;}

function applySettings(s){document.body.classList.remove("theme-pastel","theme-beach","theme-colorful","theme-dark");if(s.theme&&s.theme!=="lavender")document.body.classList.add("theme-"+s.theme);if(s.dark)document.body.classList.add("theme-dark");if(s.accent)document.documentElement.style.setProperty("--accent",s.accent);$("colorTheme").value=s.theme||"lavender";$("accentColor").value=s.accent||"#7765a8";}
document.addEventListener("click",async e=>{const page=e.target.closest("[data-page]");if(page)showPage(page.dataset.page);const process=e.target.closest("[data-process-inbox]");if(process){await processInboxItem(process.dataset.processInbox);return;}const removeInbox=e.target.closest("[data-delete-inbox]");if(removeInbox){await remove("inbox",removeInbox.dataset.deleteInbox);inboxItems=await all("inbox");renderInbox();return;}const ec=e.target.closest("[data-edit-contact]");if(ec){const c=contacts.find(x=>x.id===ec.dataset.editContact);if(c){$("contactId").value=c.id;for(const k of ["name","company","role","email","phone","notes"])$("contact"+k[0].toUpperCase()+k.slice(1)).value=c[k]||"";$("contactVacancy").value=c.vacancyId||"";}}const dc=e.target.closest("[data-delete-contact]");if(dc&&confirm("Contact verwijderen?")){await remove("contacts",dc.dataset.deleteContact);contacts=await all("contacts");renderContacts()}const dr=e.target.closest("[data-delete-reminder]");if(dr){await remove("reminders",dr.dataset.deleteReminder);reminders=await all("reminders");renderReminders()}if(e.target.closest('[data-action="new-vacancy"]'))openVacancy();const edit=e.target.closest("[data-edit]");if(edit){const v=vacancies.find(x=>x.id===edit.dataset.edit);if(v)openVacancy(v)}const del=e.target.closest("[data-delete]");if(del&&confirm("Deze vacature verwijderen? Gekoppelde documenten blijven bewaard; de koppeling met deze vacature wordt verwijderd.")){const id=del.dataset.delete;await remove("vacancies",id);for(const d of documents){if((d.vacancyIds||[]).includes(id)){d.vacancyIds=d.vacancyIds.filter(x=>x!==id);await put("documents",d)}}for(const c of contacts){if(c.vacancyId===id){c.vacancyId="";await put("contacts",c)}}for(const r of reminders){if(r.vacancyId===id){r.vacancyId="";await put("reminders",r)}}vacancies=await all("vacancies");documents=await all("documents");contacts=await all("contacts");reminders=await all("reminders");if(activeVacancyId===id){activeVacancyId=null;showPage("vacancies")}refreshRelations();render()}const op=e.target.closest("[data-open-doc]");if(op){const d=documents.find(x=>x.id===op.dataset.openDoc);if(d){const url=URL.createObjectURL(d.blob);const a=document.createElement("a");a.href=url;a.download=d.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}}const dd=e.target.closest("[data-delete-doc]");if(dd&&confirm("Dit document verwijderen?")){await remove("documents",dd.dataset.deleteDoc);documents=await all("documents");renderDocs()}});
$("vacancyForm").addEventListener("submit",async e=>{e.preventDefault();const old=vacancies.find(v=>v.id===editingId);const v={id:editingId||uid(),fullText:$("fullVacancyTextInput").value||"",title:$("jobTitle").value.trim(),company:$("company").value.trim(),location:$("location").value.trim(),hours:$("hours").value,salaryMin:$("salaryMin").value.trim(),salaryMax:$("salaryMax").value.trim(),foundDate:$("foundDate").value,url:$("jobUrl").value.trim(),status:$("jobStatus").value,notes:$("jobNotes").value.trim(),createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};if(!old){const norm=s=>String(s||"").trim().toLowerCase().replace(/\s+/g," ");const duplicate=vacancies.find(x=>(v.url&&x.url&&norm(v.url)===norm(x.url))||(v.title&&v.company&&norm(v.title)===norm(x.title)&&norm(v.company)===norm(x.company)));if(duplicate&&confirm("Deze vacature lijkt al in je overzicht te staan ("+duplicate.title+" – "+duplicate.company+"). Wil je de bestaande vacature openen in plaats van een dubbele toe te voegen?")){$("vacancyDialog").close();openVacancyDetail(duplicate.id);return;}}v.statusHistory=Array.isArray(old?.statusHistory)?[...old.statusHistory]:[{status:old?.status||v.status,date:old?.foundDate||v.foundDate||dateToday(),note:""}];if(old&&old.status!==v.status)v.statusHistory.push({status:v.status,date:dateToday(),note:""});await put("vacancies",v);if(processingInboxId){await remove("inbox",processingInboxId);processingInboxId=null;inboxItems=await all("inbox");}pendingVacancyText="";vacancies=await all("vacancies");refreshRelations();$("vacancyDialog").close();render()});
$("closeDialog").onclick=$("cancelDialog").onclick=()=>{$("vacancyDialog").close();pendingVacancyText="";processingInboxId=null};
$("chooseManualVacancy").addEventListener("click",()=>{$("addMethodDialog").close();editingId=null;pendingVacancyText="";$("vacancyForm").reset();$("fullVacancyTextInput").value="";$("foundDate").value=dateToday();$("jobStatus").value=STATUSES[0];$("vacancyDialog").showModal()});
$("choosePasteVacancy").addEventListener("click",startPasteImport);
$("chooseLinkVacancy")?.addEventListener("click",()=>{$("addMethodDialog").close();$("vacancyUrlInput").value="";$("linkImportMessage").textContent="";$("linkVacancyDialog").showModal()});
["cancelLinkVacancy","cancelLinkVacancyBottom"].forEach(id=>$(id)?.addEventListener("click",()=>$("linkVacancyDialog").close()));
async function fetchVacancyFromUrl(raw){
 const parsed=new URL(raw);if(!["http:","https:"].includes(parsed.protocol))throw new Error("Gebruik een geldige http- of https-link.");
 const response=await fetch(parsed.href,{method:"GET",credentials:"omit"});
 if(!response.ok)throw new Error("De website gaf een foutmelding (HTTP "+response.status+").");
 const type=response.headers.get("content-type")||"";if(!type.includes("text/html")&&!type.includes("text/plain"))throw new Error("Deze link verwijst niet naar een uitleesbare webpagina.");
 const source=await response.text(),doc=new DOMParser().parseFromString(source,"text/html");
 doc.querySelectorAll("script,style,noscript,svg,nav,footer,header,form,iframe").forEach(n=>n.remove());
 const pageTitle=doc.querySelector('meta[property="og:title"]')?.content||doc.querySelector("h1")?.textContent||doc.title||"";
 const description=doc.querySelector('meta[property="og:description"]')?.content||doc.querySelector('meta[name="description"]')?.content||"";
 const body=(doc.querySelector("main")||doc.querySelector("article")||doc.body)?.innerText||"";
 const text=[pageTitle,description,body].filter(Boolean).join("\n\n").replace(/\n{3,}/g,"\n\n");
 if(text.trim().length<80)throw new Error("De pagina bevat te weinig leesbare vacaturetekst.");
 return {text,url:parsed.href};
}
$("fetchLinkVacancy")?.addEventListener("click",async()=>{
 const raw=$("vacancyUrlInput").value.trim();if(!raw){$("linkImportMessage").textContent="Vul eerst een vacaturelink in.";return;}
 const button=$("fetchLinkVacancy");button.disabled=true;button.textContent="Pagina ophalen…";$("linkImportMessage").textContent="";
 try{const result=await fetchVacancyFromUrl(raw);$("linkVacancyDialog").close();openVacancyFromText(result.text);$("jobUrl").value=result.url; if(!$("company").value){const host=new URL(result.url).hostname.replace(/^www\./,"").split(".")[0];if(host==="werkenbijkwantum")$("company").value="Kwantum";}}
 catch(err){$("linkImportMessage").textContent=err.message.includes("Failed to fetch")||err instanceof TypeError?"Deze website blokkeert automatisch uitlezen vanuit de app (CORS). Plak de vacaturetekst of upload de PDF; de link kun je daarna ook bewaren.":err.message}
 finally{button.disabled=false;button.textContent="Vacature ophalen";}
});

$("cancelPasteVacancy").addEventListener("click",()=> $("pasteVacancyDialog").close());
$("cancelPasteVacancyBottom").addEventListener("click",()=> $("pasteVacancyDialog").close());
function openVacancyFromText(text){
 const p=parseVacancyText(text),inboxItem=inboxItems.find(x=>x.id===processingInboxId);editingId=null;pendingVacancyText=p.fullText;$("vacancyForm").reset();
 $("jobTitle").value=p.title;$("company").value=p.company;$("location").value=p.location;$("hours").value=p.hours;
 $("salaryMin").value=p.salaryMin;$("salaryMax").value=p.salaryMax;$("foundDate").value=dateToday();$("jobUrl").value=p.url||inboxItem?.url||"";updateJobUrlLink($("jobUrl").value);
 $("jobStatus").value=STATUSES[0];$("jobNotes").value="";$("fullVacancyTextInput").value=p.fullText;applyInboxSource();updateJobUrlLink($("jobUrl").value);$("vacancyDialog").showModal();
}
function loadBrowserLibrary(src,globalName){
 if(window[globalName])return Promise.resolve(window[globalName]);
 return new Promise((resolve,reject)=>{const script=document.createElement("script");script.src=src;script.onload=()=>window[globalName]?resolve(window[globalName]):reject(new Error("Bibliotheek kon niet worden geladen."));script.onerror=()=>reject(new Error("Geen verbinding om de bestandslezer te laden."));document.head.appendChild(script)});
}
function pdfItemsToText(items){const lines=[];let lastY=null,current="";for(const item of items){const value=(item.str||"").trim();if(!value)continue;const y=Array.isArray(item.transform)?item.transform[5]:null;if(lastY!==null&&y!==null&&Math.abs(y-lastY)>2){if(current.trim())lines.push(current.trim());current="";}current+=(current?" ":"")+value;if(y!==null)lastY=y;}if(current.trim())lines.push(current.trim());return lines.join("\n").trim();}
async function extractVacancyFile(file){
 const ext=file.name.split(".").pop().toLowerCase();
 if(ext==="txt")return await file.text();
 if(ext==="pdf"){
  const pdfjs=await loadBrowserLibrary("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js","pdfjsLib");
  pdfjs.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise,parts=[];
  let needsOcr=false;
  for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){const page=await pdf.getPage(pageNo),content=await page.getTextContent(),pageText=pdfItemsToText(content.items);parts.push(pageText);if(!pageText)needsOcr=true}
  if(!needsOcr)return parts.join("\n\n").trim();
  const tesseract=await loadBrowserLibrary("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js","Tesseract");
  for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){if(parts[pageNo-1])continue;const page=await pdf.getPage(pageNo),viewport=page.getViewport({scale:1.5}),canvas=document.createElement("canvas");canvas.width=viewport.width;canvas.height=viewport.height;const context=canvas.getContext("2d");if(!context)throw new Error("Deze browser kan de PDF-pagina niet verwerken.");await page.render({canvasContext:context,viewport}).promise;const result=await tesseract.recognize(canvas,"nld+eng",{logger:m=>{if(m.status==="recognizing text")$("fileImportMessage").textContent="Gescande PDF uitlezen… pagina "+pageNo+"/"+pdf.numPages+" ("+Math.round((m.progress||0)*100)+"%)"}});parts[pageNo-1]=result.data.text||""}
  return parts.join("\n\n").trim();
 }
 if(ext==="docx"){
  const mammoth=await loadBrowserLibrary("https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js","mammoth");
  const result=await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});return result.value||"";
 }
 if(["jpg","jpeg","png","webp"].includes(ext)){
  const tesseract=await loadBrowserLibrary("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js","Tesseract");
  const result=await tesseract.recognize(file,"nld+eng",{logger:m=>{if(m.status==="recognizing text")$("fileImportMessage").textContent="Foto uitlezen… "+Math.round((m.progress||0)*100)+"%"}});
  return result.data.text||"";
 }
 throw new Error("Dit bestandstype wordt nog niet ondersteund. Gebruik PDF, DOCX, TXT of een JPG-, PNG- of WEBP-afbeelding.");
}
$("parsePasteVacancy").addEventListener("click",async()=>{const attachmentText=await extractInboxAttachments();const text=[$("pasteVacancyText").value,inboxSupplementText,attachmentText].filter(Boolean).join("\n\n");if(!text.trim()){$("pasteParseMessage").textContent="Plak eerst de vacaturetekst.";return;}$("pasteVacancyDialog").close();openVacancyFromText(text)});
$("chooseFileVacancy")?.addEventListener("click",()=>{$("addMethodDialog").close();$("vacancyImportFile").value="";$("fileImportMessage").textContent="";$("fileVacancyDialog").showModal()});
$("cancelFileVacancy")?.addEventListener("click",()=> $("fileVacancyDialog").close());
$("cancelFileVacancyBottom")?.addEventListener("click",()=> $("fileVacancyDialog").close());
$("importFileVacancy")?.addEventListener("click",async()=>{const files=Array.from($("vacancyImportFile").files||[]);if(!files.length){$("fileImportMessage").textContent="Kies eerst een of meer bestanden.";return;}const button=$("importFileVacancy");button.disabled=true;button.textContent="Bestanden uitlezen…";try{const text=[await extractInboxAttachments(),inboxSupplementText,await importMultipleFiles(files,$("fileImportMessage"))].filter(Boolean).join("\n\n");$("fileVacancyDialog").close();openVacancyFromText(text)}catch(err){$("fileImportMessage").textContent=err.message}finally{button.disabled=false;button.textContent="Gegevens herkennen"}});

function normalizeOverlapLine(line){return String(line||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim()}
function overlapCount(left,right){
 const a=left.split("\n").map(normalizeOverlapLine).filter(x=>x.length>=18),b=right.split("\n").map(normalizeOverlapLine).filter(x=>x.length>=18);
 let best=0;for(let n=1;n<=Math.min(a.length,b.length);n++){let ok=true;for(let j=0;j<n;j++)if(a[a.length-n+j]!==b[j]){ok=false;break;}if(ok)best=n;}return best;
}
function mergeImportedTexts(items){
 const usable=items.map(x=>({name:x.name,text:String(x.text||"").replace(/\r/g,"").trim(),isImage:x.isImage})).filter(x=>x.text);
 if(!usable.length)return "";
 const photos=usable.filter(x=>x.isImage),others=usable.filter(x=>!x.isImage);
 let orderedPhotos=photos;
 if(photos.length>1){
  const scores=photos.map((p,i)=>photos.map((q,j)=>i===j?0:overlapCount(p.text,q.text)));
  const incoming=scores.map((row,j)=>scores.reduce((sum,col)=>sum+col[j],0));
  const outgoing=scores.map(row=>row.reduce((sum,v)=>sum+v,0));
  let current=outgoing.map((v,i)=>({i,score:v-incoming[i]})).sort((a,b)=>b.score-a.score)[0].i;
  const sequence=[current],remaining=new Set(photos.map((_,i)=>i));remaining.delete(current);
  while(remaining.size){let best=-1,bestScore=0;for(const j of remaining){const score=scores[current][j];if(score>bestScore){best=j;bestScore=score;}}
   if(best<0||bestScore===0)break;sequence.push(best);remaining.delete(best);current=best;
  }
  // Only reorder when every selected image is connected by a meaningful text overlap.
  if(remaining.size===0&&sequence.length===photos.length)orderedPhotos=sequence.map(i=>photos[i]);
 }
 const sequence=[...others,...orderedPhotos];
 let result="";
 for(const item of sequence){
  const next=item.text.split("\n"),existing=result.split("\n");
  let overlap=0;
  for(let n=1;n<=Math.min(existing.length,next.length);n++){
   const tail=existing.slice(-n).map(normalizeOverlapLine),head=next.slice(0,n).map(normalizeOverlapLine);
   if(tail.every((v,i)=>v&&v===head[i]))overlap=n;
  }
  result+=(result?"\n\n":"")+next.slice(overlap).join("\n").trim();
 }
 return result.trim();
}
async function importMultipleFiles(files,progressTarget){
 const results=[];
 for(let index=0;index<files.length;index++){
  const file=files[index];
  if(file.size>25*1024*1024)throw new Error(file.name+" is groter dan 25 MB.");
  if(progressTarget)progressTarget.textContent="Bestand "+(index+1)+" van "+files.length+" uitlezen: "+file.name;
  const text=await extractVacancyFile(file);
  results.push({name:file.name,text,isImage:/\.(jpe?g|png|webp)$/i.test(file.name)});
 }
 const merged=mergeImportedTexts(results);
 if(!merged)throw new Error("Er is geen leesbare tekst gevonden. Probeer scherpere foto's of een tekst-PDF.");
 return merged;
}


$("documentForm").addEventListener("submit",async e=>{e.preventDefault();const f=$("documentFile").files[0];if(!f)return;await put("documents",{id:uid(),name:f.name,type:$("documentType").value,note:$("documentNote").value.trim(),vacancyIds:Array.from($("documentVacancy")?.selectedOptions||[]).map(o=>o.value),addedAt:new Date().toISOString(),blob:f});documents=await all("documents");e.target.reset();renderDocs()});
$("vacancySearch").addEventListener("input",render);$("statusFilter").addEventListener("change",render);
$("settingsShortcut").onclick=()=>showPage("settings")
$("exportData").onclick=async()=>{const docs=await Promise.all(documents.map(async d=>({id:d.id,name:d.name,type:d.type,note:d.note,vacancyIds:d.vacancyIds||[],addedAt:d.addedAt,mime:d.blob.type,data:await blobToBase64(d.blob)})));const inbox=await Promise.all(inboxItems.map(async item=>({...item,files:await Promise.all((item.files||[]).map(async f=>({name:f.name,type:f.type,data:await blobToBase64(f.blob)})))})));const payload={format:"sollicitatie-app-backup",version:3,exportedAt:new Date().toISOString(),vacancies,documents:docs,contacts,reminders,inbox,settings:await all("settings")};download(new Blob([JSON.stringify(payload)],{type:"application/json"}),"sollicitaties-backup.json");$("backupMessage").textContent="Back-up aangemaakt."};
function blobToBase64(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(",")[1]);r.onerror=reject;r.readAsDataURL(blob)})}
function download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
$("importData").onchange=async e=>{
 const f=e.target.files[0];if(!f)return;
 try{
  const data=JSON.parse(await f.text());
  if(data.format!=="sollicitatie-app-backup"||!Array.isArray(data.vacancies)||!Array.isArray(data.documents)||!Array.isArray(data.contacts||[])||!Array.isArray(data.reminders||[])||!Array.isArray(data.settings||[]))throw Error("Ongeldig back-upbestand");
  if(data.vacancies.some(v=>!v||typeof v!=="object"||!v.id)||data.documents.some(d=>!d||typeof d!=="object"||!d.id||typeof d.data!=="string"))throw Error("De back-up bevat onvolledige gegevens.");
  const restoredDocs=data.documents.map(d=>{const raw=atob(d.data),arr=Uint8Array.from(raw,c=>c.charCodeAt(0));return {...d,blob:new Blob([arr],{type:d.mime||"application/octet-stream"})}});const restoredInbox=(data.inbox||[]).map(item=>({...item,files:(item.files||[]).map(f=>{const raw=atob(f.data),arr=Uint8Array.from(raw,c=>c.charCodeAt(0));return {name:f.name,type:f.type,blob:new Blob([arr],{type:f.type||"application/octet-stream"})}})}));
  if(!confirm("Back-up terugzetten? Bestaande gegevens met dezelfde ID worden bijgewerkt. Andere bestaande gegevens blijven behouden."))return;
  for(const v of data.vacancies)await put("vacancies",v);
  for(const d of restoredDocs)await put("documents",d);
  for(const c of data.contacts||[])await put("contacts",c);
  for(const r of data.reminders||[])await put("reminders",r);for(const item of restoredInbox)await put("inbox",item);
  for(const item of data.settings||[])await put("settings",item);
  vacancies=await all("vacancies");documents=await all("documents");contacts=await all("contacts");reminders=await all("reminders");inboxItems=await all("inbox");
  const settings=(await all("settings"))[0];if(settings)applySettings(settings);refreshRelations();render();$("backupMessage").textContent="Back-up teruggezet.";
 }catch(err){$("backupMessage").textContent="Importeren mislukt: "+err.message}
 e.target.value="";
};

/* v3 interface, board, detail history and full theme system */
let currentView="list", activeVacancyId=null, detailTab="overview";
const THEME_PALETTES={
 lavender:{accent:"#60748b",soft:"#e8edf2",bg:"#f5f7f9",surface:"#ffffff",text:"#26313c",muted:"#6d7884",line:"#e2e7ec",column:"#edf1f5"},
 forest:{accent:"#47745c",soft:"#e7efe9",bg:"#f4f7f4",surface:"#ffffff",text:"#29372f",muted:"#718076",line:"#e1e9e2",column:"#eaf1eb",colors:["#dce9dd","#e9e4d3","#dce8e9","#f0e3d9"]},
 ocean:{accent:"#347b9a",soft:"#e5f0f5",bg:"#f3f7fa",surface:"#ffffff",text:"#263743",muted:"#6c7c87",line:"#dfe8ed",column:"#e8f1f5",colors:["#d9eaf2","#e0e9f1","#dceeea","#f1e7d9"]},
 sand:{accent:"#9b7955",soft:"#f1eade",bg:"#faf7f1",surface:"#ffffff",text:"#3b342b",muted:"#82786b",line:"#eee7dc",column:"#f4eee4",colors:["#eee2d0","#e5e9df","#e8e2d9","#eee7d9"]},
 terracotta:{accent:"#b45f48",soft:"#f6e9e4",bg:"#fbf6f3",surface:"#ffffff",text:"#3d302c",muted:"#83736e",line:"#eee2dc",column:"#f6ebe6",colors:["#f0d8ce","#e6e6d4","#e2e9e8","#f2e3c8"]},
 pastel:{accent:"#a65d91",soft:"#f5e8f0",bg:"#fbf5f8",surface:"#ffffff",text:"#392e38",muted:"#817580",line:"#eee2e9",column:"#f7eaf1",colors:["#e9c8df","#cce9df","#f7e7b9","#d8d0f2"]},
 beach:{accent:"#278c91",soft:"#e0f2ef",bg:"#f1f8f7",surface:"#ffffff",text:"#243638",muted:"#687c7c",line:"#dcebe8",column:"#e3f3ef",colors:["#bfe6df","#f5dfb5","#c9e0f4","#f2cfd0"]},
 colorful:{accent:"#7450bd",soft:"#eee7fa",bg:"#f8f5fc",surface:"#ffffff",text:"#30283d",muted:"#786f83",line:"#e9e1f2",column:"#f0eafb",colors:["#e9d5ff","#c9f0df","#ffe7ae","#ffd4df"]},
 monochrome:{accent:"#60748b",soft:"#e8edf2",bg:"#f5f7f9",surface:"#ffffff",text:"#26313c",muted:"#6d7884",line:"#e2e7ec",column:"#edf1f5"},
 dark:{accent:"#91a9bd",soft:"#35414b",bg:"#20252b",surface:"#2a3038",text:"#eef1f4",muted:"#aab2bc",line:"#414a55",column:"#303943"}
};
function hexMix(hex,amount){const n=parseInt(hex.slice(1),16),r=Math.round(((n>>16)&255)*(1-amount)+255*amount),g=Math.round(((n>>8)&255)*(1-amount)+255*amount),b=Math.round((n&255)*(1-amount)+255*amount);return "#"+[r,g,b].map(x=>x.toString(16).padStart(2,"0")).join("")}
function applySettings(s={}){const theme=s.theme||"lavender",base=THEME_PALETTES[theme]||THEME_PALETTES.lavender,p={...base};if(theme==="monochrome"&&s.accent){p.accent=s.accent;p.soft=hexMix(s.accent,.9);p.column=hexMix(s.accent,.95);p.bg=hexMix(s.accent,.975);p.line=hexMix(s.accent,.82)}const root=document.documentElement;Object.entries({"--accent":p.accent,"--accent-soft":p.soft,"--bg":p.bg,"--surface":p.surface,"--text":p.text,"--muted":p.muted,"--line":p.line,"--column":p.column,"--palette-1":p.colors?.[0]||p.soft,"--palette-2":p.colors?.[1]||p.soft,"--palette-3":p.colors?.[2]||p.soft,"--palette-4":p.colors?.[3]||p.soft}).forEach(([k,v])=>root.style.setProperty(k,v));document.body.classList.toggle("theme-dark",!!s.dark||theme==="dark");if(s.dark||theme==="dark"){root.style.setProperty("--bg","#20252b");root.style.setProperty("--surface","#2a3038");root.style.setProperty("--text","#eef1f4");root.style.setProperty("--muted","#aab2bc");root.style.setProperty("--line","#414a55")}const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=(s.dark||theme==="dark")?"#20252b":p.bg;document.body.style.backgroundColor=(s.dark||theme==="dark")?"#20252b":p.bg;if($("colorTheme"))$("colorTheme").value=theme;if($("accentColor"))$("accentColor").value=s.accent||p.accent;if($("accentPickerLabel"))$("accentPickerLabel").hidden=theme!=="monochrome";updateThemePreview()}
function updateThemePreview(){const p=THEME_PALETTES[$("colorTheme")?.value||"lavender"];const c=$("colorTheme")?.value==="monochrome"?$("accentColor")?.value:p.accent;const box=$("themePreview");if(box){box.style.setProperty("--preview-accent",c);box.style.setProperty("--preview-soft",hexMix(c,.86));box.style.setProperty("--preview-bg",hexMix(c,.96))}}
function showPage(id){document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id===id));document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("selected",b.dataset.page===id));window.scrollTo({top:0,behavior:"smooth"});if(id==="statistics")renderStatistics()}
function historyFor(v){if(!Array.isArray(v.statusHistory)||!v.statusHistory.length)v.statusHistory=[{status:v.status,date:v.appliedDate||v.foundDate||v.createdAt?.slice(0,10)||dateToday(),note:""}];return v.statusHistory}
function vacancyCard(v){return `<article class="vacancy-card clickable-card"><button class="card-open" data-open-vacancy="${v.id}" aria-label="Open vacature"><h3>${escapeHTML(v.title)}</h3><div class="vacancy-meta">${escapeHTML(v.company)}${v.location?" · "+escapeHTML(v.location):""}${v.hours?" · "+escapeHTML(v.hours)+" uur":""}${salaryLabel(v)?" · "+salaryLabel(v):""}</div><span class="status-pill">${escapeHTML(v.status)}</span></button><div class="card-actions"><button data-edit="${v.id}">Bewerken</button><button class="danger" data-delete="${v.id}">Verwijderen</button></div></article>`}
function render(){const query=($("vacancySearch")?.value||"").toLowerCase(),filter=$("statusFilter")?.value||"",filtered=vacancies.filter(v=>(!filter||v.status===filter)&&(`${v.title} ${v.company}`.toLowerCase().includes(query)));const sorted=[...filtered].sort((a,b)=>(b.foundDate||"").localeCompare(a.foundDate||""));$("vacancyList").innerHTML=sorted.length?sorted.map(vacancyCard).join(""):"Geen vacatures gevonden.";const board=$("vacancyBoard");if(board){board.hidden=currentView!=="board";$("vacancyList").hidden=currentView==="board";board.innerHTML=currentView==="board"?STATUSES.map(s=>{const items=sorted.filter(v=>v.status===s);return `<section class="kanban-column"><header><strong>${escapeHTML(s)}</strong><span>${items.length}</span></header><div class="kanban-cards">${items.map(v=>`<article class="kanban-card"><button data-open-vacancy="${v.id}"><strong>${escapeHTML(v.title)}</strong><span>${escapeHTML(v.company)}</span><small>${v.foundDate?new Date(v.foundDate+"T12:00:00").toLocaleDateString("nl-NL"):""}</small></button><select class="kanban-status" data-change-status="${v.id}" aria-label="Status wijzigen">${STATUSES.map(x=>`<option ${x===v.status?"selected":""}>${escapeHTML(x)}</option>`).join("")}</select></article>`).join("")||'<p class="muted">Geen vacatures</p>'}</div></section>`}).join(""):""};const recent=[...vacancies].sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||"")).slice(0,3);$("recentVacancies").className=recent.length?"vacancy-list":"vacancy-list empty-state";$("recentVacancies").innerHTML=recent.length?recent.map(vacancyCard).join(""):"Je hebt nog geen vacatures toegevoegd.";const count=(...ss)=>vacancies.filter(v=>ss.includes(v.status)).length;$("statTotal").textContent=vacancies.length;$("statApplied").textContent=count("Gesolliciteerd","Uitgenodigd op gesprek","Eerste gesprek","Vervolggesprek");$("statInterviews").textContent=count("Uitgenodigd op gesprek","Eerste gesprek","Vervolggesprek");$("statOffers").textContent=count("Aanbod ontvangen");$("dashboardStats").innerHTML=statsSummary("month");renderDocs();renderContacts();renderReminders();renderInbox();if(activeVacancyId&&$("vacancyDetail").classList.contains("active"))renderVacancyDetail()}
function statsSummary(period){const cutoff=periodStart(period),recent=vacancies.filter(v=>(v.foundDate||v.createdAt?.slice(0,10)||"")>=cutoff);const responses=recent.filter(v=>!["Vacature gevonden"].includes(v.status));const pct=recent.length?Math.round(responses.length/recent.length*100):0;return `<div class="stats-inline"><div><strong>${pct}%</strong><span>Reactiepercentage</span></div><div><strong>${responses.length}</strong><span>Reacties</span></div><div><strong>${recent.length}</strong><span>Sollicitaties</span></div></div>`}
function periodStart(p){const d=new Date();if(p==="month")d.setDate(1);else if(p==="quarter")d.setMonth(d.getMonth()-3);else if(p==="year")d.setMonth(0,1);else return "0000-00-00";return d.toISOString().slice(0,10)}
function renderStatistics(){const p=$("statsPeriod")?.value||"month",cut=periodStart(p),items=vacancies.filter(v=>(v.foundDate||v.createdAt?.slice(0,10)||"")>=cut),responses=items.filter(v=>v.status!=="Vacature gevonden"),rate=items.length?Math.round(responses.length/items.length*100):0;$("statisticsContent").innerHTML=`<div class="stats-inline"><div><strong>${items.length}</strong><span>Sollicitaties</span></div><div><strong>${responses.length}</strong><span>Reacties</span></div><div><strong>${rate}%</strong><span>Reactiepercentage</span></div></div><p class="muted">Periode: ${p==="month"?"deze maand":p==="quarter"?"afgelopen 3 maanden":p==="year"?"dit jaar":"alle gegevens"}</p>`;$("statusBreakdown").innerHTML="<h3>Verdeling per status</h3>"+STATUSES.map(s=>{const n=items.filter(v=>v.status===s).length;return `<div class="bar-row"><span>${escapeHTML(s)}</span><div><i style="width:${items.length?n/items.length*100:0}%"></i></div><b>${n}</b></div>`}).join("")}
function openVacancyDetail(id){activeVacancyId=id;detailTab="overview";renderVacancyDetail();showPage("vacancyDetail")}
const VACANCY_SECTION_RULES=[
 {label:"Werkzaamheden",pattern:/^(?:wat ga je doen\??|dit ga je doen|werkzaamheden|jouw werkzaamheden|functieomschrijving|jouw rol|de functie|over de functie)$/i},
 {label:"Wie zoeken ze?",pattern:/^(?:wie ben jij\??|jouw profiel|wie zoeken wij\??|wat breng je mee\??|wat verwachten we van jou|functie-eisen|eisen|jij hebt)$/i},
 {label:"Wat bieden ze?",pattern:/^(?:wat bieden wij\??|wat bieden we\??|ons aanbod|arbeidsvoorwaarden|dit krijg je|wij bieden)$/i}
];
function extractVacancySections(text){
 const lines=String(text||"").replace(/\r/g,"").split("\n"),found=[];
 let current=null;
 for(const raw of lines){
  const line=raw.trim().replace(/^#{1,4}\s*/,"").replace(/\s*[:：]$/,"").trim();
  const rule=VACANCY_SECTION_RULES.find(x=>x.pattern.test(line));
  if(rule){if(current&&current.lines.length)found.push(current);current={label:rule.label,lines:[]};continue;}
  if(current)current.lines.push(raw);
 }
 if(current&&current.lines.length)found.push(current);
 return found.map(x=>({label:x.label,text:x.lines.join("\n").trim()})).filter(x=>x.text).slice(0,3);
}
function vacancySummaryMarkup(v){
 if(!v.fullText)return "";
 const sections=extractVacancySections(v.fullText);
 return '<section class="vacancy-summary"><h3>Inhoud uit de vacaturetekst</h3>'+
 (sections.length?sections.map(x=>'<div class="summary-section"><h4>'+escapeHTML(x.label)+'</h4><p>'+escapeHTML(x.text.length>900?x.text.slice(0,900).trimEnd()+"…":x.text)+'</p></div>').join(""):'<p class="muted">Geen herkenbare onderdelen gevonden. De volledige tekst is wel bewaard.</p>')+
 '</section>';
}
function renderVacancyDetail(){const v=vacancies.find(x=>x.id===activeVacancyId);if(!v)return;const hist=historyFor(v);const linked=documents.filter(d=>(d.vacancyIds||[]).includes(v.id));$("vacancyDetailContent").innerHTML=`<div class="detail-head"><div><p class="eyebrow">${escapeHTML(v.company)} · ${escapeHTML(v.location||"")}</p><h2>${escapeHTML(v.title)}</h2><span class="status-pill">${escapeHTML(v.status)}</span></div><div class="card-actions"><button data-edit="${v.id}">✎ Bewerken</button><button data-delete="${v.id}" class="danger">Verwijderen</button></div></div><div class="detail-tabs"><button data-detail-tab="overview" class="${detailTab==="overview"?"active":""}">Overzicht</button><button data-detail-tab="steps" class="${detailTab==="steps"?"active":""}">Stappen</button><button data-detail-tab="notes" class="${detailTab==="notes"?"active":""}">Notities</button><button data-detail-tab="files" class="${detailTab==="files"?"active":""}">Bestanden</button></div><div class="panel detail-panel">${detailTab==="overview"?`<h3>Vacaturegegevens</h3><dl class="detail-grid"><dt>Bedrijf</dt><dd>${escapeHTML(v.company)}</dd><dt>Locatie</dt><dd>${escapeHTML(v.location||"—")}</dd><dt>Uren</dt><dd>${escapeHTML(v.hours||"—")}</dd><dt>Salaris</dt><dd>${salaryLabel(v)||"—"}</dd><dt>Gevonden</dt><dd>${escapeHTML(v.foundDate||"—")}</dd><dt>Vacaturelink</dt><dd>${v.url?`<a href="${escapeHTML(v.url)}" target="_blank" rel="noopener">Vacature bekijken ↗</a>`:"—"}</dd></dl><label>Status wijzigen<select class="field" data-change-status="${v.id}">${STATUSES.map(s=>`<option ${s===v.status?"selected":""}>${escapeHTML(s)}</option>`).join("")}</select></label>${vacancySummaryMarkup(v)}${v.fullText?`<div class="full-text-action"><p class="muted">De oorspronkelijke vacaturetekst is apart bewaard.</p><button type="button" class="secondary-button" data-show-full-text="${v.id}">Volledige vacaturetekst bekijken</button></div>`:""}`:detailTab==="steps"?`<h3>Sollicitatiestappen</h3><ol class="timeline">${hist.map((h,index)=>`<li><div class="timeline-entry"><div><strong>${escapeHTML(h.status)}</strong><small>${escapeHTML(h.date||"Datum onbekend")}</small>${h.note?`<p>${escapeHTML(h.note)}</p>`:""}</div><button type="button" class="step-delete" data-delete-step="${index}" aria-label="Stap verwijderen">Verwijderen</button></div></li>`).join("")}</ol><form id="stepForm" class="inline-form"><label>Nieuwe stap<select id="stepStatus" class="field">${STATUSES.map(s=>`<option>${escapeHTML(s)}</option>`).join("")}</select></label><label>Datum<input id="stepDate" type="date" class="field" value="${dateToday()}"></label><label>Toelichting<input id="stepNote" class="field" placeholder="Bijv. telefonisch contact"></label><button class="primary-button">Stap toevoegen</button></form>`:detailTab==="notes"?`<h3>Notities</h3><textarea id="detailNotes" class="field" rows="8">${escapeHTML(v.notes||"")}</textarea><button class="primary-button" data-save-notes="${v.id}">Notities opslaan</button>`: `<h3>Bestanden</h3><p class="muted">Documenten die aan deze vacature gekoppeld zijn.</p>${linked.map(d=>`<div class="file-row"><span>${escapeHTML(d.name)} · ${escapeHTML(d.type)}</span><div><button data-open-doc="${d.id}">Open</button><button class="danger" data-unlink-doc="${d.id}">Loskoppelen</button></div></div>`).join("")||"<p class='muted'>Nog geen gekoppelde bestanden.</p>"}<form id="vacancyFileForm" class="inline-form"><h4>Bestand toevoegen</h4><label>Type<select id="vacancyFileType" class="field">${DOC_TYPES.map(t=>`<option>${escapeHTML(t)}</option>`).join("")}</select></label><label>Bestand<input id="vacancyFile" class="field" type="file" required accept=".pdf,.doc,.docx,.odt,.rtf,.txt,.png,.jpg,.jpeg"></label><label>Notitie (optioneel)<input id="vacancyFileNote" class="field" placeholder="Bijv. aangepaste versie"></label><button class="primary-button">Bestand toevoegen</button></form>`}</div>`}


function installExtraUI(){installExtraUIOriginal();$("extraNav")?.remove();document.querySelectorAll('.bottom-nav [data-page="reminders"],.bottom-nav [data-page="documents"],.bottom-nav [data-page="settings"]').forEach(x=>x.remove());const settings=$("settings");if(settings){const links=settings.querySelector(".settings-links");if(links){links.innerHTML='<button data-page="documents">▧ Documenten beheren</button><button data-page="reminders">◷ Herinneringen beheren</button>';}}}
document.addEventListener("click",async e=>{
 const view=e.target.closest("[data-view]");if(view){currentView=view.dataset.view;document.querySelectorAll("[data-view]").forEach(b=>b.classList.toggle("active",b===view));render();return}
 const open=e.target.closest("[data-open-vacancy]");if(open){openVacancyDetail(open.dataset.openVacancy);return}
 const tab=e.target.closest("[data-detail-tab]");if(tab){detailTab=tab.dataset.detailTab;renderVacancyDetail();return}
 const save=e.target.closest("[data-save-notes]");if(save){const v=vacancies.find(x=>x.id===save.dataset.saveNotes);if(v){v.notes=$("detailNotes").value;v.updatedAt=new Date().toISOString();await put("vacancies",v);vacancies=await all("vacancies");renderVacancyDetail();}}
});
document.addEventListener("change",async e=>{const status=e.target.closest("[data-change-status]");if(status){const v=vacancies.find(x=>x.id===status.dataset.changeStatus);if(v&&v.status!==status.value){historyFor(v).push({status:status.value,date:dateToday(),note:""});v.status=status.value;await put("vacancies",v);vacancies=await all("vacancies");render();if($("vacancyDetail").classList.contains("active"))renderVacancyDetail();}}});
document.addEventListener("submit",async e=>{if(e.target.id==="stepForm"){e.preventDefault();const v=vacancies.find(x=>x.id===activeVacancyId);if(!v)return;const status=$("stepStatus").value;historyFor(v).push({status,date:$("stepDate").value||dateToday(),note:$("stepNote").value.trim()});v.status=status;v.updatedAt=new Date().toISOString();await put("vacancies",v);vacancies=await all("vacancies");render();detailTab="steps";renderVacancyDetail();}});
$("statsPeriod")?.addEventListener("change",renderStatistics);
$("colorTheme")?.addEventListener("change",()=>{$("accentPickerLabel").hidden=$("colorTheme").value!=="monochrome";updateThemePreview()});
$("accentColor")?.addEventListener("input",updateThemePreview);
$("saveAppearance")?.addEventListener("click",async()=>{const s={id:"appearance",theme:$("colorTheme").value,accent:$("accentColor").value};await put("settings",s);applySettings(s)});
$("themeButton")?.remove();
init().then(async()=>{const q=new URLSearchParams(location.search);if(q.get("shared")==="1"){const fileIds=(q.get("sharedFiles")||"").split(",").filter(Boolean),files=[];if(fileIds.length){try{const cache=await caches.open("vacature-share-inbox-v1");for(const id of fileIds){const key=new Request(new URL("./__shared_files/"+encodeURIComponent(id),location.href).toString()),response=await cache.match(key);if(response){const blob=await response.blob();files.push(new File([blob],response.headers.get("x-file-name")||"gedeeld-bestand",{type:blob.type}));await cache.delete(key);}}}catch(error){console.warn("Gedeelde bestanden konden niet worden opgehaald:",error);}}await receiveSharedItem({title:q.get("title")||"",text:q.get("text")||"",url:q.get("url")||"",files});history.replaceState({},"",location.pathname);}}).catch(err=>{document.body.innerHTML="<main><h1>App kon niet starten</h1><p>"+escapeHTML(err.message)+"</p></main>"});

document.addEventListener("click",async e=>{const step=e.target.closest("[data-delete-step]");if(step){const v=vacancies.find(x=>x.id===activeVacancyId);if(!v)return;const ix=Number(step.dataset.deleteStep);const h=historyFor(v);if(ix<0||ix>=h.length)return;if(!confirm("Deze sollicitatiestap verwijderen?"))return;h.splice(ix,1);if(h.length)v.status=h[h.length-1].status;else{v.status="Vacature gevonden";h.push({status:v.status,date:v.foundDate||dateToday(),note:""})}await put("vacancies",v);vacancies=await all("vacancies");render();detailTab="steps";renderVacancyDetail();return}const unlink=e.target.closest("[data-unlink-doc]");if(unlink){const d=documents.find(x=>x.id===unlink.dataset.unlinkDoc);if(d){d.vacancyIds=(d.vacancyIds||[]).filter(id=>id!==activeVacancyId);await put("documents",d);documents=await all("documents");renderVacancyDetail()}}});
document.addEventListener("submit",async e=>{if(e.target.id==="vacancyFileForm"){e.preventDefault();const v=vacancies.find(x=>x.id===activeVacancyId),f=$("vacancyFile").files[0];if(!v||!f)return;await put("documents",{id:uid(),name:f.name,type:$("vacancyFileType").value,note:$("vacancyFileNote").value.trim(),vacancyIds:[v.id],addedAt:new Date().toISOString(),blob:f});documents=await all("documents");renderDocs();renderVacancyDetail()}});

document.addEventListener("click",e=>{const b=e.target.closest("[data-show-full-text]");if(!b)return;const v=vacancies.find(x=>x.id===b.dataset.showFullText);if(!v)return;$("fullVacancyTextContent").textContent=v.fullText||"";$("fullVacancyTextDialog").showModal()});
["closeFullVacancyText","closeFullVacancyTextBottom"].forEach(id=>$(id)?.addEventListener("click",()=>$("fullVacancyTextDialog").close()));

let inboxSupplementText="";
$("inboxTryUrl")?.addEventListener("click",async()=>{const item=inboxItems.find(x=>x.id===processingInboxId);if(!item?.url){$("inboxImportMessage").textContent="Er is geen oorspronkelijke link bij deze inzending.";return;}const button=$("inboxTryUrl");button.disabled=true;button.textContent="Vacature ophalen…";try{const result=await fetchVacancyFromUrl(item.url);const attachmentText=await extractInboxAttachments();$("inboxImportDialog").close();openVacancyFromText([result.text,inboxSupplementText,attachmentText].filter(Boolean).join("\n\n"));}catch(err){$("inboxImportMessage").innerHTML='Automatisch uitlezen is niet gelukt. <a class="inbox-original-link" href="'+escapeHTML(item.url)+'" target="_blank" rel="noopener">Open oorspronkelijke vacature ↗</a>';}finally{button.disabled=false;button.textContent="Automatisch uitlezen";}});
$("inboxManualEntry")?.addEventListener("click",()=>{const item=inboxItems.find(x=>x.id===processingInboxId);if(!item)return;$("inboxImportDialog").close();editingId=null;pendingVacancyText="";$("vacancyForm").reset();$("jobTitle").value=item.title||"";$("jobUrl").value=item.url||"";updateJobUrlLink(item.url||"");$("fullVacancyTextInput").value=inboxSupplementText||"";$("foundDate").value=dateToday();$("jobStatus").value=STATUSES[0];if(item.url&&sourceFromUrl(item.url).includes("werkenbijkwantum"))$("company").value="Kwantum";$("vacancyDialog").showModal();});
$("inboxPasteText")?.addEventListener("click",()=>{$("inboxImportDialog").close();$("pasteVacancyText").value=inboxSupplementText||"";$("pasteParseMessage").textContent="";$("pasteVacancyDialog").showModal();});
$("inboxUploadFile")?.addEventListener("click",()=>{$("inboxImportDialog").close();$("vacancyImportFile").value="";$("fileImportMessage").textContent="";$("fileVacancyDialog").showModal();});
$("inboxCancelImport")?.addEventListener("click",()=>{$("inboxImportDialog").close();processingInboxId=null;inboxSupplementText="";});

$("jobUrl")?.addEventListener("input",()=>updateJobUrlLink($("jobUrl").value));
