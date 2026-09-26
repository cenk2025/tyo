import type { LangTask, LangfitDraft, Level, RegulatedKey } from "./types";
import { emptyLevels } from "./types";

/**
 * Two ready-made example ads so the demo tells its story without a model call.
 * Their task rows are hand-written examples (origin "example") and still arrive
 * unvalidated: the employer has to review each one, exactly as with AI output.
 * The home-care rows deliberately include one requirement with no job-based
 * reason, so the warning path is visible too.
 */

type L = "fi" | "en";
type Bi = { fi: string; en: string };

interface SampleRow {
  description: Bi;
  language: LangTask["language"];
  levels: Partial<Record<keyof LangTask["levels"], Level>>;
  requiredBy: LangTask["requiredBy"];
  rationaleType: LangTask["rationaleType"];
  rationale: Bi;
  englishSufficient?: boolean;
}

interface Sample {
  key: string;
  title: Bi;
  ad: Bi;
  regulated: RegulatedKey | null;
  rows: SampleRow[];
}

const SAMPLES: Sample[] = [
  {
    key: "warehouse",
    title: { fi: "Varastotyöntekijä, Vantaa", en: "Warehouse worker, Vantaa" },
    ad: {
      fi: "Etsimme varastotyöntekijää Vantaan logistiikkakeskukseemme. Tehtäviin kuuluu tuotteiden keräily ja pakkaus käsipäätteellä, trukilla ajo, vastaanottotarkastukset ja poikkeamien kirjaaminen järjestelmään, päivittäisiin turvallisuusinfoihin osallistuminen sekä yhteydenpito kuljetusliikkeiden kuljettajiin. Tiimimme on monikielinen. Vaadimme sujuvaa suomen kielen taitoa ja trukkikorttia.",
      en: "We are looking for a warehouse worker for our logistics centre in Vantaa. The job includes picking and packing with a handheld terminal, driving a forklift, goods-in inspections and logging deviations in the system, attending daily safety briefings, and keeping in touch with haulage drivers. Our team is multilingual. We require fluent Finnish and a forklift licence.",
    },
    regulated: null,
    rows: [
      {
        description: { fi: "Keräily ja pakkaus käsipäätteellä", en: "Picking and packing with a handheld terminal" },
        language: "fi",
        levels: { reading: "A2" },
        requiredBy: "m6",
        rationaleType: "none",
        rationale: { fi: "", en: "" },
        englishSufficient: true,
      },
      {
        description: { fi: "Työturvallisuusohjeiden, kylttien ja varoitusten ymmärtäminen", en: "Understanding safety instructions, signs and warnings" },
        language: "fi",
        levels: { listening: "A2", reading: "A2" },
        requiredBy: "day1",
        rationaleType: "legislation",
        rationale: {
          fi: "Työturvallisuuslaki velvoittaa perehdyttämään niin, että työntekijä ymmärtää ohjeet. Varastoalueen kyltit ja varoitukset ovat suomeksi.",
          en: "The Occupational Safety and Health Act requires induction the worker can understand. Signs and warnings in the warehouse are in Finnish.",
        },
      },
      {
        description: { fi: "Päivittäiset turvallisuusinfot", en: "Daily safety briefings" },
        language: "fi",
        levels: { listening: "B1", speaking: "A2" },
        requiredBy: "m6",
        rationaleType: "legislation",
        rationale: {
          fi: "Infot pidetään suomeksi koko vuorolle. Ensimmäiset kuusi kuukautta työpari tiivistää infon englanniksi.",
          en: "Briefings are held in Finnish for the whole shift. For the first six months a buddy summarises them in English.",
        },
      },
      {
        description: { fi: "Poikkeamien kirjaaminen järjestelmään", en: "Logging deviations in the system" },
        language: "fi",
        levels: { reading: "B1", writing: "A2" },
        requiredBy: "m12",
        rationaleType: "customer_work",
        rationale: {
          fi: "Asiakkaan reklamaatiokäsittely lukee poikkeamaraportit suomeksi.",
          en: "The customer's claims team reads the deviation reports in Finnish.",
        },
      },
      {
        description: { fi: "Yhteydenpito kuljetusliikkeiden kuljettajiin", en: "Keeping in touch with haulage drivers" },
        language: "fi",
        levels: { listening: "B1", speaking: "B1" },
        requiredBy: "m12",
        rationaleType: "customer_work",
        rationale: {
          fi: "Kuljettajat ovat pääosin suomenkielisiä ja aikatauluista sovitaan puhelimessa.",
          en: "Drivers are mostly Finnish-speaking and schedules are agreed by phone.",
        },
      },
      {
        description: { fi: "Tiimin sisäinen viestintä", en: "Communication within the team" },
        language: "en",
        levels: { listening: "B1", speaking: "B1" },
        requiredBy: "day1",
        rationaleType: "none",
        rationale: { fi: "", en: "" },
      },
    ],
  },
  {
    key: "homecare",
    title: { fi: "Lähihoitaja kotihoitoon", en: "Practical nurse, home care" },
    ad: {
      fi: "Haemme lähihoitajaa kotihoidon tiimiimme. Työ sisältää asiakkaiden kotikäynnit ja arjen tukemisen, lääkehoidon toteuttamisen, hoitokirjausten tekemisen potilastietojärjestelmään, yhteydenpidon omaisiin ja lääkäriin sekä osallistumisen tiimipalavereihin. Edellytämme erinomaista suomen kielen taitoa.",
      en: "We are hiring a practical nurse for our home-care team. The job covers home visits and everyday support for clients, administering medication, writing care records in the patient information system, keeping in touch with relatives and the doctor, and taking part in team meetings. We require excellent Finnish.",
    },
    regulated: "health_professional",
    rows: [
      {
        description: { fi: "Kotikäynnit ja asiakkaan arjen tukeminen", en: "Home visits and supporting the client's daily life" },
        language: "fi",
        levels: { listening: "B1", speaking: "B1" },
        requiredBy: "day1",
        rationaleType: "customer_work",
        rationale: {
          fi: "Iäkkäät asiakkaat puhuvat pääosin vain suomea, ja käynneillä ollaan yksin asiakkaan kanssa.",
          en: "Elderly clients mostly speak only Finnish, and visits are made alone.",
        },
      },
      {
        description: { fi: "Lääkehoidon toteuttaminen ja lääkelistojen lukeminen", en: "Administering medication and reading medication lists" },
        language: "fi",
        levels: { reading: "B2", listening: "B1" },
        requiredBy: "day1",
        rationaleType: "patient_safety",
        rationale: {
          fi: "Lääkelistan tai annosohjeen väärinymmärrys on suora potilasturvallisuusriski.",
          en: "Misreading a medication list or dosage instruction is a direct patient-safety risk.",
        },
      },
      {
        description: { fi: "Hoitokirjaukset potilastietojärjestelmään", en: "Care records in the patient information system" },
        language: "fi",
        levels: { writing: "B1", reading: "B1" },
        requiredBy: "m6",
        rationaleType: "patient_safety",
        rationale: {
          fi: "Kirjaukset turvaavat hoidon jatkuvuuden. Alussa työpari tarkistaa kirjaukset.",
          en: "Records keep care continuous. At first a colleague reviews them.",
        },
      },
      {
        description: { fi: "Puhelut omaisille ja lääkärille", en: "Phone calls to relatives and the doctor" },
        language: "fi",
        levels: { listening: "B2", speaking: "B2" },
        requiredBy: "m12",
        rationaleType: "patient_safety",
        rationale: {
          fi: "Muutokset asiakkaan voinnissa raportoidaan lääkärille puhelimessa ilman tukea.",
          en: "Changes in a client's condition are reported to the doctor by phone without support.",
        },
      },
      {
        description: { fi: "Tiimipalaverit", en: "Team meetings" },
        language: "fi",
        levels: { listening: "C1", speaking: "C1" },
        requiredBy: "day1",
        rationaleType: "none",
        rationale: { fi: "", en: "" },
      },
    ],
  },
];

export const SAMPLE_KEYS = SAMPLES.map((s) => s.key);

export function sampleDraft(key: string, locale: L): LangfitDraft | null {
  const s = SAMPLES.find((x) => x.key === key);
  if (!s) return null;
  return {
    title: s.title[locale],
    adText: s.ad[locale],
    regulated: s.regulated,
    tasks: s.rows.map((r, i) => ({
      id: `${s.key}-${i}`,
      description: r.description[locale],
      language: r.language,
      levels: { ...emptyLevels(), ...r.levels },
      requiredBy: r.requiredBy,
      rationaleType: r.rationaleType,
      rationale: r.rationale[locale],
      englishSufficient: r.englishSufficient ?? false,
      origin: "example",
      validated: false,
      locked: false,
    })),
  };
}
