/**
 * Curated skill groups for onboarding's "I don't have an occupation yet"
 * branch (skill-discovery.tsx).
 *
 * IMPORTANT, learned the hard way: these must be `cross-sector` (or
 * `sector-specific`/`occupation-specific`) skills, NOT `transversal` ones.
 * ESCO's `occupation_skill_relations` table — which previewOccupationsForSkills
 * in queries.ts reads to build the "based on what you picked" panel — has ZERO
 * rows for transversal skills (verified directly: 0/112 sampled relation-skills
 * were transversal). ESCO documents transversal skills as relevant to all
 * occupations generically, so it doesn't enumerate per-occupation relations for
 * them at all. A first version of this file used transversal skills and every
 * discovery selection silently produced empty occupation suggestions.
 *
 * So each entry here was picked by cross-referencing two things: an ILIKE
 * search over `cross-sector` skills for everyday, non-jargony phrasing, and a
 * live count against `occupation_skill_relations` to confirm it actually
 * connects to real occupations (counts noted in the source search, all > 0).
 * ESCO has no "life category" taxonomy of its own — the category buckets
 * below are a hand-sort for a person without work history to recognise
 * themselves in, not an ESCO grouping.
 *
 * The huge ESCO language-skill set (~370 transversal entries: "Arabic",
 * "interact verbally in X", "understand spoken X"…) is surfaced separately,
 * via search, in skill-discovery.tsx — it's still valuable for a user's saved
 * skill profile even though (being transversal) it won't feed this preview.
 */

export type DiscoveryCategoryKey =
  | "people"
  | "organizing"
  | "thinking"
  | "digital"
  | "handsOn"
  | "personal"
  | "caring";

const ESCO = "http://data.europa.eu/esco/skill/";

export const DISCOVERY_CATEGORIES: {
  key: DiscoveryCategoryKey;
  skillUris: string[];
}[] = [
  {
    key: "people",
    skillUris: [
      `${ESCO}a17286c5-238d-4f0b-bc24-29e9121345de`, // listen actively
      `${ESCO}a5b0cd5c-e13a-4ab3-8d93-4d242adcfb01`, // teamwork principles
      `${ESCO}28d715e3-3e5b-4fb6-8dd2-4be4919c8587`, // handle customer complaints
      `${ESCO}26a6e6d2-1c9a-4d7e-8c04-5ba16d1f53da`, // greet guests
      `${ESCO}486df8bc-3498-43ad-83b6-dc8a4a3b16c6`, // provide support to social services users
      `${ESCO}477173ca-5fc2-406b-9122-95d92811f284`, // communicate with stakeholders
    ],
  },
  {
    key: "organizing",
    skillUris: [
      `${ESCO}933e7ccf-5d56-46ba-aca4-857f826a6b3a`, // administer appointments
      `${ESCO}5d2e82cc-5943-4218-a459-a1956fad2b63`, // manage warehouse inventory
      `${ESCO}35718973-913e-447b-a968-83e66e6c8872`, // keep inventory of goods in production
      `${ESCO}2a778aeb-f246-4f03-9a96-c60183001037`, // schedule production
      `${ESCO}08fd2839-670c-4f16-8024-97437f2035ab`, // plan marketing strategy
    ],
  },
  {
    key: "thinking",
    skillUris: [
      `${ESCO}334e3e49-fb02-4051-809a-f06adfdc1c40`, // troubleshoot
      `${ESCO}14832d87-2f2f-4895-b290-e4760ebae42a`, // solve technical problems
      `${ESCO}7a8fb784-67fa-41e9-a75c-6b491d91f800`, // develop strategy to solve problems
      `${ESCO}91be6910-bd67-4e1f-95b0-32513b399b24`, // communicate problems to senior colleagues
      `${ESCO}d63f49de-cb72-4ce3-9553-a374a4f32f52`, // analyse data about clients
    ],
  },
  {
    key: "digital",
    skillUris: [
      `${ESCO}21d2f96d-35f7-4e3f-9745-c533d2dd6e97`, // computer programming
      `${ESCO}1973c966-f236-40c9-b2d4-5d71a89019be`, // use spreadsheets software
      `${ESCO}81633a44-f1db-4a01-a940-804c6905e330`, // use word processing software
      `${ESCO}ddc3119d-1d6e-4324-9125-a3380d299ac5`, // computer technology
      `${ESCO}260ddfe0-637b-4ce8-8007-9601645e2dc8`, // type texts from audio sources
    ],
  },
  {
    key: "handsOn",
    skillUris: [
      `${ESCO}5033c2fb-ec55-4b8e-b0a4-9379593f1e1c`, // maintain equipment
      `${ESCO}ab2bb44a-3956-4028-8715-8b70b1960b99`, // lift heavy weights
      `${ESCO}4f1b6304-f54a-42f0-9604-5427a28d240f`, // perform cleaning duties
      `${ESCO}6561c8e7-3851-4878-bcf4-d2ffd63d835e`, // use repair manuals
      `${ESCO}3dc6fd8e-6ff7-432e-a262-04d487858efb`, // assemble hardware components
      `${ESCO}a2cd3b30-2d6c-473e-a5d4-4e7cb576babe`, // clean building floors
    ],
  },
  {
    key: "personal",
    skillUris: [
      `${ESCO}91abe492-18be-4cce-93c7-0dca07072363`, // meet deadlines
      `${ESCO}25e16679-a7d0-464d-916c-63210001bbab`, // act reliably
      `${ESCO}5592ab32-4e7a-4cda-8e64-ca36d5de8a10`, // adapt to changing situations
      `${ESCO}ebfe7b18-1fad-463f-9509-8ef1a5736045`, // perform services in a flexible manner
      `${ESCO}6dc2dfac-3e21-44dd-a71c-9a1c8fe2514c`, // make independent operating decisions
      `${ESCO}22c2af9e-ba0d-4cee-abb6-b6dbef006cd5`, // motivate employees
    ],
  },
  {
    key: "caring",
    skillUris: [
      `${ESCO}75dfe1ee-5935-42ce-b820-697f827825c3`, // maintain customer service
      `${ESCO}a65fb963-6faf-47b2-a3d9-c4e5e4d833c5`, // support children's wellbeing
      `${ESCO}3ff9d956-3e26-40d1-ae0e-f5f247943042`, // monitor children's physical development
      `${ESCO}6b58a6d2-89cf-4ab5-bb62-eb29ae968934`, // implement care programmes for children
      `${ESCO}beb952e4-8a9c-47af-8a60-c6eb5c5f25bc`, // attend to children's basic physical needs
      `${ESCO}94b01483-f13d-48ba-b8a9-ef8f18fcb2dc`, // play with children
      `${ESCO}108112e0-a3df-43bf-91ec-d9614ca4224c`, // provide psychological support to patients
    ],
  },
];
