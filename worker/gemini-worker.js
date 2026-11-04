const MODEL = "gemini-3.6-flash";
const MAX_TEXT_LENGTH = 60000;
function corsHeaders(origin, allowedOrigin) {
 const allowed = allowedOrigin === "*" ? "*" : (origin === allowedOrigin ? origin : "null");
 return {"Access-Control-Allow-Origin":allowed,"Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type","Vary":"Origin"};
}
export default {
 async fetch(request, env) {
  const origin=request.headers.get("Origin")||"",cors=corsHeaders(origin,env.ALLOWED_ORIGIN||"");
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  const url=new URL(request.url);
  if(url.pathname!=="/analyze"||request.method!=="POST")return Response.json({error:"Niet gevonden."},{status:404,headers:cors});
  if(!env.GEMINI_API_KEY)return Response.json({error:"De Gemini API-sleutel is nog niet ingesteld."},{status:503,headers:cors});
  if(!env.ALLOWED_ORIGIN||origin!==env.ALLOWED_ORIGIN)return Response.json({error:"Deze app is niet toegestaan."},{status:403,headers:cors});
  try {
   const body=await request.json(),text=String(body.text||"").trim();
   if(text.length<80)return Response.json({error:"Te weinig vacaturetekst."},{status:400,headers:cors});
   if(text.length>MAX_TEXT_LENGTH)return Response.json({error:"De tekst is te lang."},{status:413,headers:cors});
   const prompt=`Analyseer de onderstaande vacaturetekst in het Nederlands. Vul alleen informatie in die expliciet of duidelijk uit de tekst blijkt. Verzin nooit gegevens. Gebruik lege strings als iets ontbreekt. Maak een korte, feitelijke samenvatting en vat werkzaamheden, gevraagd profiel en aanbod afzonderlijk samen. Geef uitsluitend JSON terug met de velden title, company, location, hours, salaryMin, salaryMax, summary, tasks, requirements, offer.\n\nVACATURETEKST:\n${text}`;
   const response=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+MODEL+":generateContent?key="+encodeURIComponent(env.GEMINI_API_KEY),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:"application/json",responseSchema:{type:"OBJECT",properties:{title:{type:"STRING"},company:{type:"STRING"},location:{type:"STRING"},hours:{type:"STRING"},salaryMin:{type:"STRING"},salaryMax:{type:"STRING"},summary:{type:"STRING"},tasks:{type:"STRING"},requirements:{type:"STRING"},offer:{type:"STRING"}},required:["title","company","location","hours","salaryMin","salaryMax","summary","tasks","requirements","offer"]}}})});
   const data=await response.json();
   if(!response.ok)return Response.json({error:data.error?.message||"Gemini kon de tekst niet analyseren."},{status:502,headers:cors});
   const output=data.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("")||"";
   let result;try{result=JSON.parse(output)}catch{return Response.json({error:"Gemini gaf geen geldige analyse terug."},{status:502,headers:cors});}
   return Response.json(result,{headers:{...cors,"Cache-Control":"no-store"}});
  }catch(error){return Response.json({error:"De AI-aanvraag is mislukt."},{status:500,headers:cors});}
 }
};