import { createHash } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ownerEmail = (process.env.OWNER_EMAIL ?? "").trim().toLowerCase();
const parsedUrl = new URL(supabaseUrl);
if (!["127.0.0.1", "localhost"].includes(parsedUrl.hostname)) {
  throw new Error("Owner theme previews are restricted to local Supabase");
}
if (!serviceRoleKey || !ownerEmail.endsWith("@gmail.com")) {
  throw new Error("Local service role and Gmail owner email are required");
}

const [ownerLocal, ownerDomain] = ownerEmail.split("@");
const recipient = `${ownerLocal}+bulletin-theme-preview@${ownerDomain}`;
const database = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const subscriberId = "a9100000-0000-4000-8000-000000000001";
const articleIds = [1, 2, 3, 4].map((value) => `a9200000-0000-4000-8000-00000000000${value}`);
const clusterIds = [1, 2, 3, 4].map((value) => `a9300000-0000-4000-8000-00000000000${value}`);
const clusterReferences = [1, 2, 3, 4].map((value) => `a9310000-0000-4000-8000-00000000000${value}`);
const deliveryIds = [1, 2, 3, 4].map((value) => `a9500000-0000-4000-8000-00000000000${value}`);
const previewVersion = "phase9-owner-preview-2026-07-19-v1";
const languageSlot = { en: 1, ml: 2, hi: 3 };
const summaryId = (story, language) => `a9400000-0000-4000-800${languageSlot[language]}-00000000000${story}`;
const bytea = (value) => `\\x${createHash("sha256").update(value).digest("hex")}`;

const stories = [
  {
    category: "politics",
    publishedAt: "2026-07-19T08:36:00.000Z",
    url: "https://newsonair.gov.in/government-to-convene-all-party-meeting-on-july-19-ahead-of-monsoon-session-2/",
    source: "akashvani",
    centralTopic: "parliament monsoon session",
    en: {
      headline: "All-party meeting sets the stage for Parliament’s Monsoon Session",
      summary: "The Union government convened an all-party meeting on 19 July before Parliament’s Monsoon Session begins on 20 July. Defence Minister Rajnath Singh chaired the meeting, with parliamentary-affairs ministers and party leaders attending. Several opposition parties briefly staged a symbolic walkout over the invitation extended to the NCPI, then returned after registering their protest. The session is scheduled to continue through 13 August, with significant legislation expected for discussion and passage.",
      why: "The meeting frames the political cooperation and disputes likely to shape the coming parliamentary session.",
    },
    ml: {
      headline: "പാർലമെന്റിന്റെ വർഷകാല സമ്മേളനത്തിന് മുന്നോടിയായി സർവകക്ഷി യോഗം",
      summary: "ജൂലൈ 20ന് ആരംഭിക്കുന്ന പാർലമെന്റിന്റെ വർഷകാല സമ്മേളനത്തിന് മുന്നോടിയായി കേന്ദ്ര സർക്കാർ ജൂലൈ 19ന് സർവകക്ഷി യോഗം ചേർന്നു. പ്രതിരോധ മന്ത്രി രാജ്നാഥ് സിങ് യോഗത്തിന് അധ്യക്ഷത വഹിച്ചു; പാർലമെന്ററി കാര്യ മന്ത്രിമാരും വിവിധ കക്ഷി നേതാക്കളും പങ്കെടുത്തു. എൻസിപിഐയെ ക്ഷണിച്ചതിൽ പ്രതിഷേധിച്ച് ചില പ്രതിപക്ഷ കക്ഷികൾ പ്രതീകാത്മകമായി ഇറങ്ങിപ്പോയെങ്കിലും പ്രതിഷേധം രേഖപ്പെടുത്തിയ ശേഷം യോഗത്തിൽ തിരിച്ചെത്തി. സമ്മേളനം ഓഗസ്റ്റ് 13 വരെ നീളും; പ്രധാന നിയമനിർമാണങ്ങൾ ചർച്ചയ്ക്കും പാസാക്കലിനുമായി പരിഗണിക്കപ്പെടും.",
      why: "വരാനിരിക്കുന്ന പാർലമെന്റ് സമ്മേളനത്തെ സ്വാധീനിക്കാവുന്ന സഹകരണത്തിന്റെയും രാഷ്ട്രീയ ഭിന്നതകളുടെയും പശ്ചാത്തലം ഈ യോഗം വ്യക്തമാക്കുന്നു.",
    },
    hi: {
      headline: "संसद के मानसून सत्र से पहले सर्वदलीय बैठक",
      summary: "20 जुलाई से शुरू होने वाले संसद के मानसून सत्र से पहले केंद्र सरकार ने 19 जुलाई को सर्वदलीय बैठक बुलाई। रक्षा मंत्री राजनाथ सिंह ने बैठक की अध्यक्षता की और संसदीय कार्य मंत्रियों के साथ विभिन्न दलों के नेता इसमें शामिल हुए। एनसीपीआई को आमंत्रित किए जाने के विरोध में कुछ विपक्षी दलों ने प्रतीकात्मक वॉकआउट किया, लेकिन विरोध दर्ज कराने के बाद वे बैठक में लौट आए। सत्र 13 अगस्त तक चलेगा और इसमें कई महत्वपूर्ण विधेयकों पर चर्चा तथा पारित किए जाने की संभावना है।",
      why: "यह बैठक आगामी संसदीय सत्र में सहयोग और राजनीतिक मतभेदों की संभावित दिशा स्पष्ट करती है।",
    },
  },
  {
    category: "education-careers",
    publishedAt: "2026-07-19T02:01:00.000Z",
    url: "https://newsonair.gov.in/cbse-declares-results-of-class-10-second-board-examination-2026/",
    source: "akashvani",
    centralTopic: "cbse class ten results",
    en: {
      headline: "CBSE declares Class 10 second-board-examination results",
      summary: "CBSE has declared the results of the 2026 Class 10 Second Board Examination. Students can retrieve results and digital academic documents through the DigiLocker Results Portal. The second examination followed the main February–March examination and was conducted from 15 to 21 May under the new two-examination model. CBSE reported a combined overall pass percentage of 96.78% across the main and second examinations.",
      why: "The result is the first major outcome of CBSE’s new policy allowing two Class 10 board examinations in one year.",
    },
    ml: {
      headline: "സിബിഎസ്ഇ പത്താം ക്ലാസ് രണ്ടാം ബോർഡ് പരീക്ഷാഫലം പ്രഖ്യാപിച്ചു",
      summary: "2026ലെ പത്താം ക്ലാസ് രണ്ടാം ബോർഡ് പരീക്ഷാഫലം സിബിഎസ്ഇ പ്രഖ്യാപിച്ചു. വിദ്യാർഥികൾക്ക് ഡിജിലോക്കർ റിസൾട്ട്സ് പോർട്ടലിലൂടെ ഫലവും ഡിജിറ്റൽ അക്കാദമിക് രേഖകളും ലഭിക്കും. ഫെബ്രുവരി–മാർച്ച് മാസങ്ങളിലെ പ്രധാന പരീക്ഷയ്ക്ക് പിന്നാലെ പുതിയ രണ്ട് പരീക്ഷാ മാതൃകയുടെ ഭാഗമായി മേയ് 15 മുതൽ 21 വരെയാണ് രണ്ടാം പരീക്ഷ നടന്നത്. പ്രധാന പരീക്ഷയും രണ്ടാം പരീക്ഷയും ചേർത്തുള്ള മൊത്തം വിജയശതമാനം 96.78 ആണെന്ന് സിബിഎസ്ഇ അറിയിച്ചു.",
      why: "ഒരു വർഷത്തിൽ രണ്ട് പത്താം ക്ലാസ് ബോർഡ് പരീക്ഷകൾ അനുവദിക്കുന്ന സിബിഎസ്ഇയുടെ പുതിയ നയത്തിന്റെ ആദ്യ പ്രധാന ഫലമാണിത്.",
    },
    hi: {
      headline: "सीबीएसई ने कक्षा 10 की दूसरी बोर्ड परीक्षा के नतीजे घोषित किए",
      summary: "सीबीएसई ने 2026 की कक्षा 10 दूसरी बोर्ड परीक्षा के परिणाम घोषित कर दिए हैं। विद्यार्थी डिजिलॉकर रिजल्ट्स पोर्टल से परिणाम और डिजिटल शैक्षणिक दस्तावेज प्राप्त कर सकते हैं। नई दो-परीक्षा व्यवस्था के तहत मुख्य परीक्षा फरवरी–मार्च में हुई थी और दूसरी परीक्षा 15 से 21 मई तक आयोजित की गई। सीबीएसई के अनुसार दोनों परीक्षाओं को मिलाकर कुल उत्तीर्ण प्रतिशत 96.78 रहा।",
      why: "यह एक वर्ष में कक्षा 10 की दो बोर्ड परीक्षाओं की अनुमति देने वाली सीबीएसई की नई नीति का पहला बड़ा परिणाम है।",
    },
  },
  {
    category: "sports",
    publishedAt: "2026-07-19T08:22:00.000Z",
    url: "https://newsonair.gov.in/fifa-world-cup-2026-england-beat-france-6-4-in-thrilling-third-place-match-to-secure-bronze-medal-argentina-to-take-on-spain-in-final-tonight/",
    source: "akashvani",
    centralTopic: "fifa world cup final",
    en: {
      headline: "Argentina and Spain prepare for the 2026 World Cup final",
      summary: "Defending champions Argentina and Spain are set to meet in the FIFA World Cup final at the New York–New Jersey Stadium. Kick-off is scheduled for 12:30 AM Indian Standard Time. England secured third place by defeating France 6–4 in the bronze-medal match in Miami. France’s Kylian Mbappé finished the tournament with 10 goals and moved beyond Lionel Messi’s career World Cup scoring record, according to the report.",
      why: "The final decides football’s biggest international title after a tournament that has also reshaped prominent scoring records.",
    },
    ml: {
      headline: "2026 ലോകകപ്പ് ഫൈനലിന് അർജന്റീനയും സ്പെയിനും തയ്യാറെടുക്കുന്നു",
      summary: "നിലവിലെ ചാമ്പ്യന്മാരായ അർജന്റീനയും സ്പെയിനും ന്യൂയോർക്ക്–ന്യൂജേഴ്സി സ്റ്റേഡിയത്തിൽ നടക്കുന്ന ഫിഫ ലോകകപ്പ് ഫൈനലിൽ ഏറ്റുമുട്ടും. ഇന്ത്യൻ സമയം പുലർച്ചെ 12:30നാണ് മത്സരം ആരംഭിക്കുക. മയാമിയിൽ നടന്ന വെങ്കല മെഡൽ മത്സരത്തിൽ ഫ്രാൻസിനെ 6–4ന് തോൽപ്പിച്ച് ഇംഗ്ലണ്ട് മൂന്നാം സ്ഥാനം നേടി. റിപ്പോർട്ട് പ്രകാരം ഫ്രാൻസിന്റെ കിലിയൻ എംബാപ്പെ 10 ഗോളുകളോടെ ടൂർണമെന്റ് പൂർത്തിയാക്കി ലയണൽ മെസ്സിയുടെ കരിയർ ലോകകപ്പ് ഗോൾ റെക്കോർഡ് മറികടന്നു.",
      why: "പ്രമുഖ ഗോൾ റെക്കോർഡുകൾ പുതുക്കപ്പെട്ട ഒരു ടൂർണമെന്റിന് ശേഷം ഫുട്ബോളിലെ ഏറ്റവും വലിയ അന്താരാഷ്ട്ര കിരീടം ആരുടേതെന്ന് ഫൈനൽ തീരുമാനിക്കും.",
    },
    hi: {
      headline: "2026 विश्व कप फाइनल के लिए अर्जेंटीना और स्पेन तैयार",
      summary: "मौजूदा चैंपियन अर्जेंटीना और स्पेन न्यूयॉर्क–न्यू जर्सी स्टेडियम में फीफा विश्व कप फाइनल खेलेंगे। मुकाबला भारतीय समयानुसार रात 12:30 बजे शुरू होना है। मियामी में कांस्य पदक के मुकाबले में इंग्लैंड ने फ्रांस को 6–4 से हराकर तीसरा स्थान हासिल किया। रिपोर्ट के अनुसार फ्रांस के किलियन एम्बाप्पे ने टूर्नामेंट में 10 गोल किए और लियोनेल मेसी के करियर विश्व कप गोल रिकॉर्ड को पीछे छोड़ दिया।",
      why: "रिकॉर्ड बदलने वाले इस टूर्नामेंट के बाद फाइनल फुटबॉल के सबसे बड़े अंतरराष्ट्रीय खिताब का फैसला करेगा।",
    },
  },
  {
    category: "health",
    publishedAt: "2026-07-15T10:00:00.000Z",
    url: "https://www.who.int/news/item/15-07-2026-new-who-guidelines--up-to-45--of-dementia-risk-could-be-prevented-or-delayed",
    source: "who",
    centralTopic: "dementia risk guidelines",
    en: {
      headline: "WHO updates guidance on reducing dementia risk",
      summary: "The World Health Organization has published updated evidence-based guidance for preventing or delaying cognitive decline and dementia. WHO says up to 45% of dementia risk is linked to modifiable factors including tobacco and alcohol use, social isolation, physical inactivity, air pollution, hypertension and diabetes. The guidance recommends physical activity, stopping tobacco use, reducing alcohol, healthy diets, social and cognitive engagement, and management of cardiometabolic conditions. It does not recommend vitamin or omega-3 supplementation without a diagnosed deficiency because evidence of benefit is insufficient.",
      why: "The guidance gives health systems and individuals concrete prevention measures for a condition affecting more than 57 million people worldwide.",
    },
    ml: {
      headline: "ഡിമെൻഷ്യ സാധ്യത കുറയ്ക്കാനുള്ള മാർഗനിർദേശങ്ങൾ ലോകാരോഗ്യ സംഘടന പുതുക്കി",
      summary: "ബൗദ്ധിക ക്ഷയവും ഡിമെൻഷ്യയും തടയാനോ വൈകിക്കാനോ സഹായിക്കുന്ന തെളിവാധിഷ്ഠിത മാർഗനിർദേശങ്ങൾ ലോകാരോഗ്യ സംഘടന പുതുക്കി പ്രസിദ്ധീകരിച്ചു. പുകയിലയും മദ്യവും, സാമൂഹിക ഒറ്റപ്പെടൽ, ശാരീരിക നിഷ്ക്രിയത്വം, വായുമലിനീകരണം, ഉയർന്ന രക്തസമ്മർദം, പ്രമേഹം തുടങ്ങിയ മാറ്റാനാകുന്ന ഘടകങ്ങളുമായി ഡിമെൻഷ്യ സാധ്യതയുടെ 45% വരെ ബന്ധപ്പെട്ടിരിക്കാമെന്ന് സംഘടന പറയുന്നു. വ്യായാമം, പുകയില ഉപേക്ഷിക്കൽ, മദ്യപാനം കുറയ്ക്കൽ, ആരോഗ്യകരമായ ഭക്ഷണം, സാമൂഹികവും ബൗദ്ധികവുമായ ഇടപെടൽ, ഹൃദയ–ഉപാപചയ രോഗങ്ങളുടെ നിയന്ത്രണം എന്നിവ മാർഗനിർദേശങ്ങൾ ശുപാർശ ചെയ്യുന്നു. സ്ഥിരീകരിച്ച കുറവ് ഇല്ലാത്തപ്പോൾ വിറ്റാമിനുകളോ ഒമേഗ-3 സപ്ലിമെന്റുകളോ ഉപയോഗിക്കാൻ മതിയായ ഗുണഫല തെളിവില്ലാത്തതിനാൽ ശുപാർശ ചെയ്യുന്നില്ല.",
      why: "ലോകത്ത് 5.7 കോടിയിലധികം ആളുകളെ ബാധിക്കുന്ന അവസ്ഥയ്ക്കെതിരെ ആരോഗ്യ സംവിധാനങ്ങൾക്കും വ്യക്തികൾക്കും സ്വീകരിക്കാവുന്ന വ്യക്തമായ പ്രതിരോധ നടപടികളാണ് ഈ മാർഗനിർദേശം നൽകുന്നത്.",
    },
    hi: {
      headline: "डब्ल्यूएचओ ने डिमेंशिया जोखिम घटाने के दिशानिर्देश अपडेट किए",
      summary: "विश्व स्वास्थ्य संगठन ने संज्ञानात्मक गिरावट और डिमेंशिया को रोकने या देर से शुरू होने में मदद करने वाले साक्ष्य-आधारित दिशानिर्देश जारी किए हैं। डब्ल्यूएचओ के अनुसार डिमेंशिया के 45% तक जोखिम का संबंध तंबाकू और शराब, सामाजिक अलगाव, शारीरिक निष्क्रियता, वायु प्रदूषण, उच्च रक्तचाप और मधुमेह जैसे बदले जा सकने वाले कारकों से है। दिशानिर्देश व्यायाम, तंबाकू छोड़ने, शराब कम करने, स्वस्थ आहार, सामाजिक और मानसिक सक्रियता तथा हृदय और चयापचय संबंधी स्थितियों के प्रबंधन की सलाह देते हैं। किसी प्रमाणित कमी के बिना विटामिन या ओमेगा-3 सप्लीमेंट लेने की सलाह नहीं दी गई है क्योंकि लाभ के पर्याप्त प्रमाण नहीं हैं।",
      why: "ये दिशानिर्देश दुनिया भर में 5.7 करोड़ से अधिक लोगों को प्रभावित करने वाली स्थिति के लिए स्वास्थ्य प्रणालियों और व्यक्तियों को ठोस रोकथाम उपाय देते हैं।",
    },
  },
];

async function rows(table, values) {
  const { error } = await database.from(table).insert(values);
  if (error) throw new Error(`${table}:${error.code}:${error.message}`);
}

async function ensureSource(input) {
  const existing = await database.from("sources").select("id").eq("feed_url", input.feed_url).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data.id;
  const created = await database.from("sources").insert(input).select("id").single();
  if (created.error || !created.data) throw created.error ?? new Error("source-not-created");
  return created.data.id;
}

const existingPreview = await database.from("deliveries")
  .select("id", { count: "exact", head: true })
  .eq("personalization_version", previewVersion);
if (existingPreview.error) throw existingPreview.error;
if ((existingPreview.count ?? 0) > 0) throw new Error("Owner theme previews already exist; refusing duplicate sends");

const existingSubscriber = await database.from("subscribers").select("id").eq("email", recipient).maybeSingle();
if (existingSubscriber.error) throw existingSubscriber.error;
if (existingSubscriber.data) throw new Error("Preview recipient already exists without preview deliveries; inspect before retrying");

const akashvaniSourceId = await ensureSource({
  id: "a9110000-0000-4000-8000-000000000001",
  publisher_name: "Akashvani News",
  publisher_icon_url: "https://newsonair.gov.in/wp-content/uploads/2024/01/cropped-logo-180x180.png",
  feed_name: "Manual owner preview source",
  feed_url: "https://newsonair.gov.in/",
  publisher_domain: "newsonair.gov.in",
  category_scope: ["politics", "education-careers", "sports"],
  language: "en",
  country_code: "IN",
  reliability: "tier-1",
  role: "primary",
  is_aggregator: false,
  is_institutional: true,
  terms_status: "approved",
  terms_notes: "Owner-authorized manual preview source; inactive for automated ingestion.",
  is_active: false,
  publisher_family_key: "akashvani-news",
  publisher_family_metadata: { version: "phase9-owner-preview", basis: "publisher-identity" },
});
const whoSourceId = await ensureSource({
  id: "a9110000-0000-4000-8000-000000000002",
  publisher_name: "World Health Organization",
  feed_name: "WHO News Releases",
  feed_url: "https://www.who.int/rss-feeds/news-english.xml",
  publisher_domain: "who.int",
  category_scope: ["health", "science"],
  language: "en",
  reliability: "tier-1",
  role: "primary",
  is_aggregator: false,
  is_institutional: true,
  terms_status: "approved",
  terms_notes: "Official public-health news release feed.",
  is_active: false,
  publisher_family_key: "who",
  publisher_family_metadata: { version: "phase9-owner-preview", basis: "publisher-identity" },
});

try {
  await rows("subscribers", [{
    id: subscriberId,
    email: recipient,
    name: "Sougandh Manoj",
    status: "active",
    verified_at: new Date().toISOString(),
    consent_at: new Date().toISOString(),
    consent_version: "owner-authorized-theme-preview-2026-07-19",
    unverified_expires_at: "2026-07-20T00:00:00.000Z",
  }]);
  await rows("subscriber_preferences", [{
    subscriber_id: subscriberId,
    country_code: "IN",
    state_region: "Kerala",
    language: "en",
    categories: ["politics", "education-careers", "sports", "health"],
    story_count: 4,
    theme: "light-editorial",
  }]);
  await rows("subscriber_schedules", [{
    subscriber_id: subscriberId,
    frequency: "daily",
    local_delivery_time: "08:00:00",
    timezone: "Asia/Kolkata",
    next_delivery_at: "2026-07-20T02:30:00.000Z",
  }]);

  await rows("articles", stories.map((story, index) => ({
    id: articleIds[index],
    source_id: story.source === "who" ? whoSourceId : akashvaniSourceId,
    original_title: story.en.headline,
    normalized_title: story.en.headline.toLowerCase(),
    description: story.en.summary,
    canonical_url: story.url,
    canonical_url_hash: bytea(story.url),
    normalized_title_hash: bytea(story.en.headline.toLowerCase()),
    published_at: story.publishedAt,
    declared_language: "en",
    country_code: story.source === "who" ? null : "IN",
    processing_status: "processed",
    processed_at: new Date().toISOString(),
    next_processing_at: new Date().toISOString(),
    classification_version: previewVersion,
    factual_depth: 3,
    intelligence_metadata: { ownerPreview: true, manuallySourceReviewed: true },
  })));

  await rows("story_clusters", stories.map((story, index) => ({
    id: clusterIds[index],
    public_reference: clusterReferences[index],
    status: "verified",
    category: story.category,
    country_code: story.source === "who" ? null : "IN",
    central_topics: [story.centralTopic],
    entities: {},
    evidence_strength: "sufficient",
    current_version: 1,
    latest_event_at: story.publishedAt,
    verified_at: new Date().toISOString(),
    evidence_independence_count: 1,
    evidence_result: { ownerPreview: true, sourceCount: 1, manuallySourceReviewed: true },
    conflict_details: [],
    verification_version: previewVersion,
  })));
  await rows("story_cluster_articles", stories.map((_, index) => ({
    cluster_id: clusterIds[index],
    article_id: articleIds[index],
    decision: "accepted",
    decision_method: "owner-preview-source-review",
    decision_metadata: { exactOriginalUrl: true },
    added_in_version: 1,
  })));

  const summaries = stories.flatMap((story, index) => ["en", "ml", "hi"].map((language) => ({
    id: summaryId(index + 1, language),
    cluster_id: clusterIds[index],
    cluster_version: 1,
    language,
    status: "verified",
    headline: story[language].headline,
    summary: story[language].summary,
    why_it_matters: story[language].why,
    verification_result: { passed: true, method: "owner-authorized-manual-source-review" },
    prompt_version: previewVersion,
    schema_version: "phase7-summary-v1",
    provider: "manual-source-review",
    model: "codex-owner-preview",
    verified_at: new Date().toISOString(),
    source_references: [{ articleId: articleIds[index], url: story.url }],
    verification_version: previewVersion,
  })));
  await rows("cluster_summaries", summaries);
  await rows("cluster_summary_articles", stories.flatMap((_, index) => ["en", "ml", "hi"].map((language) => ({
    summary_id: summaryId(index + 1, language),
    article_id: articleIds[index],
    citation_order: 1,
  }))));

  const now = new Date();
  const variants = [
    { language: "en", theme: "light-editorial" },
    { language: "ml", theme: "dark-intelligence" },
    { language: "hi", theme: "midnight-brief" },
    { language: "en", theme: "amber-brief" },
  ];
  await rows("deliveries", variants.map((variant, index) => {
    const scheduled = new Date(now.getTime() - (4 - index) * 60_000);
    return {
      id: deliveryIds[index],
      subscriber_id: subscriberId,
      scheduled_for: scheduled.toISOString(),
      preference_version: 1,
      language: variant.language,
      theme: variant.theme,
      next_attempt_at: new Date(now.getTime() - (4 - index) * 30_000).toISOString(),
      news_window_started_at: new Date(scheduled.getTime() - 86_400_000).toISOString(),
      news_window_ended_at: scheduled.toISOString(),
      personalization_status: "ready",
      personalized_at: now.toISOString(),
      personalization_version: previewVersion,
      personalization_metadata: { ownerPreview: true, variant: index + 1 },
      actual_story_count: 4,
    };
  }));
  await rows("delivery_stories", variants.flatMap((variant, deliveryIndex) => stories.map((story, storyIndex) => ({
    delivery_id: deliveryIds[deliveryIndex],
    position: storyIndex + 1,
    cluster_id: clusterIds[storyIndex],
    cluster_public_reference: clusterReferences[storyIndex],
    cluster_version: 1,
    summary_id: summaryId(storyIndex + 1, variant.language),
    summary_language: variant.language,
    is_update: false,
    selection_score: 100 - storyIndex,
    selection_reasons: { ownerPreview: true, exactStoredSummary: true },
    subject_key: story.centralTopic,
  }))));
  process.stdout.write(JSON.stringify({ ok: true, deliveries: 4, storiesPerDelivery: 4, recipientAlias: true }) + "\n");
} catch (error) {
  await database.from("subscribers").delete().eq("id", subscriberId);
  await database.from("story_clusters").delete().in("id", clusterIds);
  await database.from("articles").delete().in("id", articleIds);
  throw error;
}
