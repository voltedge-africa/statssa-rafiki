/**
 * Public vocabulary aids for the query normalizer (`AgentService.normalizeQuestion`).
 *
 * This is a SEEDED FIRST DRAFT, not an exhaustive lookup: anchors and examples, not a whitelist.
 * The normalizer is an LLM, so it generalises beyond these entries — the list mainly teaches it the
 * corpus's own vocabulary and resolves local/informal terms. Extend it whenever a real question is
 * mishandled, then restart.
 *
 * Nothing here is privileged: it is public Stats SA terminology and the public shape of the
 * knowledge base (the study's sections and its published fact tables). The normalizer is given no
 * tools and no rows — only this metadata and the user's question.
 */

/** The topics the GHS 2025 knowledge base covers, and the fact tables available in SQL. */
export const KNOWLEDGE_COVERAGE = [
  "The knowledge base is Statistics South Africa's General Household Survey (GHS) 2025 (release P0318): its statistical release, presentation and media release.",
  "It reports at national, provincial and urban/rural level on:",
  "- household composition and living arrangements (single-person, couple and parent/child households; children living with mothers only, fathers only, both parents or neither parent)",
  "- population and the number of households per province",
  "- education (school attendance, highest level of education, early childhood development)",
  "- health and social development (medical aid, chronic illness, disability, social grants)",
  "- water (main source of drinking water, access to improved water)",
  "- sanitation (toilet types, improved sanitation)",
  "- energy (electricity for lighting, cooking and heating; other energy sources)",
  "- refuse removal",
  "- internet access (mobile, fixed, at work or school, any kind)",
  "- transport (mode of travel to school or work)",
  "- agriculture (household food production, livestock)",
  "- household assets (refrigerator, television, stove, computer, working vehicle, etc.)",
  "- food security (hunger, food access)",
  "- survey methodology (sample, response rates)",
  "Published fact tables queryable by SQL (the fact store):",
  "- internet_access_by_province: type_of_internet_access, wc, ec, nc, fs, kzn, nw, gp, mp, lp, rsa",
  "- household_assets: asset, rural, urban, metro, south_africa",
  "- response_rates_by_province: province_metro, response_rate",
  "- higher_education_population_group: population_group, y2002, y2025",
  "OUT OF SCOPE: general knowledge, current affairs, politics, sport, other countries, other Stats SA releases (Census, CPI, GDP, Labour Force Survey, etc.), forecasts, opinions and predictions.",
].join("\n");

/** Informal / local terms mapped to the vocabulary the knowledge base uses. */
export const QUERY_GLOSSARY = [
  "- single mother / single parent / lone parent -> children living with mothers only; household composition",
  "- household / home / house / family -> household",
  "- shack / informal dwelling / informal settlement -> dwelling type; housing",
  "- toilet / toilets / loo -> sanitation; toilet facilities",
  "- tap water / running water / clean water -> main source of drinking water; improved water",
  "- electricity / power / lights / candles -> energy; electricity for lighting, cooking or heating",
  "- wifi / internet / data / online / connected -> internet access",
  "- rubbish / trash / garbage / bin collection -> refuse removal",
  "- matric / grade 12 -> highest level of education; school attendance",
  "- kids in school / schooling -> education; school attendance",
  "- grant / social grant / pension / child grant / SASSA -> social grants; social development",
  "- job / jobs / work / unemployed / jobless -> employment; labour",
  "- pay / salary / wages / income / money earned -> income",
  "- fridge / refrigerator -> household assets (refrigerator)",
  "- tv / television -> household assets (television)",
  "- cellphone / phone / smartphone / cell -> household assets; communication",
  "- car / vehicle / bakkie -> household assets (working vehicle); transport",
  "- hungry / no food / food access -> food security; hunger",
  "- farm / farming / livestock / cattle / crops -> agriculture; household food production",
  "- provinces: WC=Western Cape, EC=Eastern Cape, NC=Northern Cape, FS=Free State, KZN=KwaZulu-Natal, NW=North West, GP=Gauteng, MP=Mpumalanga, LP=Limpopo, RSA=South Africa",
  "- 'how many' / 'what percentage' / 'what proportion' -> keep the user's own metric; never swap a count for a percentage or vice versa",
].join("\n");
