// Test contacts for the Contacts page and the "Contact birthdays" calendar, shared by
// seed.mjs (full reset) and seed-contacts.mjs (contacts only). Birthdays are dated around
// "now" so some always fall in the shown weeks. All names, numbers and addresses are made up.

const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
const md = (d) => `${pad(d.getMonth() + 1)}${pad(d.getDate())}`

const card = (lines, version = '3.0') =>
  ['BEGIN:VCARD', `VERSION:${version}`, 'PRODID:-//DaisyCal seed//EN', ...lines.filter(Boolean), 'END:VCARD', ''].join(
    '\r\n',
  )

/**
 * `at(days)` is the local date `days` after the start of the current week (as in seed.mjs).
 * Returns `{ uid, vcf }` for every contact.
 */
export function buildContacts(at) {
  const bday = (days, year) => {
    const d = at(days)
    return `BDAY:${ymd(new Date(year, d.getMonth(), d.getDate()))}`
  }
  const list = [
    // With a year: shown with the age.
    {
      uid: 'contact-ana',
      lines: [
        'UID:contact-ana',
        'FN:Ana Petrović',
        'N:Petrović;Ana;;;',
        'ORG:Studio Lumen',
        'TITLE:Product designer',
        'item1.EMAIL;type=INTERNET;type=pref:ana.petrovic@example.com',
        'item1.X-ABLabel:_$!<Other>!$_',
        'EMAIL;type=INTERNET;type=WORK:ana@lumen.example.com',
        'TEL;type=CELL;type=VOICE;type=pref:+387 61 214 330',
        'ADR;type=HOME:;;Ferhadija 12;Sarajevo;;71000;Bosnia and Herzegovina',
        'URL:https://lumen.example.com',
        bday(2, 1990),
        'CATEGORIES:Friends,Work',
        'NOTE:Met at the design meetup in 2023.\\nPrefers tea over coffee.',
      ],
    },
    // Apple Contacts without a year.
    {
      uid: 'contact-marko',
      lines: [
        'UID:contact-marko',
        'FN:Marko Jovanović',
        'N:Jovanović;Marko;;;',
        'NICKNAME:Mare',
        'TEL;type=CELL;type=VOICE:+381 64 118 2290',
        'EMAIL;type=INTERNET;type=HOME:marko.j@example.com',
        `BDAY;X-APPLE-OMIT-YEAR=1604:1604-${md(at(4)).slice(0, 2)}-${md(at(4)).slice(2)}`,
        'CATEGORIES:Football,Friends',
      ],
    },
    // vCard 4 style without a year, next week.
    {
      uid: 'contact-lena',
      version: '4.0',
      lines: [
        'UID:contact-lena',
        'FN:Lena Kovač',
        'N:Kovač;Lena;;;',
        'TEL;TYPE=cell:+385 91 552 7781',
        'EMAIL;TYPE=home:lena.kovac@example.com',
        'ADR;TYPE=home:;;Ilica 45;Zagreb;;10000;Croatia',
        `BDAY:--${md(at(9))}`,
        'CATEGORIES:Family',
      ],
    },
    // No birthday: not in the calendar.
    {
      uid: 'contact-nobday',
      lines: ['UID:contact-nobday', 'FN:Ivo Ivić', 'N:Ivić;Ivo;;;', 'TEL;type=CELL:+387 61 000 000'],
    },
    {
      uid: 'contact-amra',
      lines: [
        'UID:contact-amra',
        'FN:Amra Hadžić',
        'N:Hadžić;Amra;;;',
        'ORG:Vertex IT',
        'TITLE:Engineering manager',
        'EMAIL;type=INTERNET;type=WORK:amra.hadzic@vertex.example.com',
        'TEL;type=WORK;type=VOICE:+387 33 715 400',
        'TEL;type=CELL;type=VOICE:+387 62 903 118',
        'ADR;type=WORK:;;Zmaja od Bosne 7;Sarajevo;;71000;Bosnia and Herzegovina',
        bday(17, 1986),
        'CATEGORIES:Work',
      ],
    },
    {
      uid: 'contact-dzenan',
      lines: [
        'UID:contact-dzenan',
        'FN:Dženan Mehmedović',
        'N:Mehmedović;Dženan;;;',
        'TEL;type=CELL;type=VOICE:+387 61 778 041',
        'EMAIL;type=INTERNET;type=HOME:dzenan.m@example.com',
        'CATEGORIES:Football',
        'NOTE:Goalkeeper, Thursday 5-a-side.',
      ],
    },
    {
      uid: 'contact-mama',
      lines: [
        'UID:contact-mama',
        'FN:Mama',
        'N:;Mama;;;',
        'TEL;type=CELL;type=VOICE;type=pref:+387 65 120 440',
        'TEL;type=HOME;type=VOICE:+387 51 228 910',
        'ADR;type=HOME:;;Kralja Petra I 21;Banja Luka;;78000;Bosnia and Herzegovina',
        bday(-3, 1964),
        'CATEGORIES:Family',
      ],
    },
    {
      uid: 'contact-stefan',
      lines: [
        'UID:contact-stefan',
        'FN:Stefan Nikolić',
        'N:Nikolić;Stefan;;;',
        'ORG:Nikolić & Partneri',
        'TITLE:Attorney',
        'EMAIL;type=INTERNET;type=WORK:s.nikolic@np.example.com',
        'TEL;type=WORK;type=VOICE:+381 11 334 0921',
        'ADR;type=WORK:;;Knez Mihailova 30;Beograd;;11000;Serbia',
        'URL:np.example.com',
      ],
    },
    {
      uid: 'contact-mirela',
      lines: [
        'UID:contact-mirela',
        'FN:Dr. Mirela Šarić',
        'N:Šarić;Mirela;;Dr.;',
        'ORG:Dom zdravlja Centar',
        'TITLE:Family doctor',
        'TEL;type=WORK;type=VOICE:+387 33 292 600',
        'NOTE:Appointments by phone, mornings only.',
      ],
    },
    // A business: no person's name, shown by the organization.
    {
      uid: 'contact-servis',
      lines: [
        'UID:contact-servis',
        'FN:Auto servis Brzi',
        'N:;;;;',
        'ORG:Auto servis Brzi',
        'TEL;type=WORK;type=VOICE:+387 33 640 640',
        'ADR;type=WORK:;;Bulevar Meše Selimovića 85;Sarajevo;;71000;Bosnia and Herzegovina',
        'URL:https://brzi.example.com',
        'CATEGORIES:Services',
      ],
    },
    {
      uid: 'contact-jelena',
      lines: [
        'UID:contact-jelena',
        'FN:Jelena Babić',
        'N:Babić;Jelena;;;',
        'EMAIL;type=INTERNET;type=HOME:jelena.babic@example.com',
        'TEL;type=CELL;type=VOICE:+387 66 401 223',
        bday(23, 1995),
        'CATEGORIES:Friends',
      ],
    },
    {
      uid: 'contact-tarik',
      lines: [
        'UID:contact-tarik',
        'FN:Tarik Begić',
        'N:Begić;Tarik;;;',
        'ORG:Vertex IT',
        'TITLE:Backend developer',
        'EMAIL;type=INTERNET;type=WORK:tarik.begic@vertex.example.com',
        'TEL;type=CELL;type=VOICE:+387 61 330 902',
        'CATEGORIES:Work,Football',
      ],
    },
    {
      uid: 'contact-nina',
      lines: [
        'UID:contact-nina',
        'FN:Nina Radić',
        'N:Radić;Nina;;;',
        'EMAIL;type=INTERNET;type=HOME:nina.radic@example.com',
        'ADR;type=HOME:;;Trg slobode 4;Novi Sad;;21000;Serbia',
        bday(40, 1992),
      ],
    },
    {
      uid: 'contact-emir',
      lines: [
        'UID:contact-emir',
        'FN:Emir Kurtović',
        'N:Kurtović;Emir;;;',
        'TEL;type=CELL;type=VOICE:+387 62 515 600',
        'CATEGORIES:Family',
        'NOTE:Cousin. Has the spare key for the apartment.',
      ],
    },
    {
      uid: 'contact-olivera',
      lines: [
        'UID:contact-olivera',
        'FN:Olivera Stanković',
        'N:Stanković;Olivera;;;',
        'ORG:Kafana Kod Olje',
        'TITLE:Owner',
        'TEL;type=WORK;type=VOICE:+381 21 445 120',
        'EMAIL;type=INTERNET;type=WORK:info@olja.example.com',
        'CATEGORIES:Services',
      ],
    },
    {
      uid: 'contact-luka',
      lines: [
        'UID:contact-luka',
        'FN:Luka Perić',
        'N:Perić;Luka;;;',
        'TEL;type=CELL;type=VOICE:+385 98 220 1450',
        'EMAIL;type=INTERNET;type=HOME:luka.peric@example.com',
        bday(1, 1999),
        'CATEGORIES:Friends',
      ],
    },
  ]
  return list.map(({ uid, lines, version }) => ({ uid, vcf: card(lines, version) }))
}
