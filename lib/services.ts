export const SERVICE_SLUGS = [
  "languages",
  "school-support",
  "special-needs",
  "shadow-teacher",
  "test-prep",
  "online-home-tutoring",
] as const;

export type ServiceSlug = (typeof SERVICE_SLUGS)[number];

export const CREDENTIAL_VERIFIED_SLUGS: ServiceSlug[] = [
  "special-needs",
  "shadow-teacher",
];

export const FORM_SERVICE_BY_SLUG: Record<ServiceSlug, string> = {
  languages: "languages",
  "school-support": "school-support",
  "special-needs": "special-needs",
  "shadow-teacher": "shadow-teacher",
  "test-prep": "test-prep",
  "online-home-tutoring": "online-tutoring",
};

export const OFFER_CARDS: {
  slug: ServiceSlug;
  titleKey: string;
  bodyKey: string;
}[] = [
  { slug: "languages", titleKey: "languages", bodyKey: "languagesBody" },
  { slug: "school-support", titleKey: "school", bodyKey: "schoolBody" },
  { slug: "special-needs", titleKey: "special", bodyKey: "specialBody" },
  { slug: "shadow-teacher", titleKey: "shadow", bodyKey: "shadowBody" },
  { slug: "test-prep", titleKey: "testPrep", bodyKey: "testPrepBody" },
  { slug: "online-home-tutoring", titleKey: "onlineHome", bodyKey: "onlineHomeBody" },
];
