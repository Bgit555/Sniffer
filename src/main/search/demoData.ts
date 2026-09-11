import type { NormalizedCompany, NormalizedPerson } from '@shared/types'

/**
 * Built-in demo dataset so the MVP search works end-to-end without an external
 * provider account. All entries are fictional placeholders for development.
 */
export interface DemoCompany extends NormalizedCompany {
  tags: string[]
}

const demo: DemoCompany[] = [
  {
    provider: 'demo',
    name: 'Signalfire Analytics',
    domain: 'signalfireanalytics.com',
    website: 'https://signalfireanalytics.com',
    description:
      'Usage analytics and customer-intelligence platform for B2B SaaS teams.',
    industry: 'SaaS',
    tags: ['saas', 'software', 'analytics', 'b2b'],
    employeeCount: 84,
    country: 'US',
    city: 'Austin, TX',
    dataConfidence: 0.9,
    signals: [
      { type: 'funding', title: 'Raised $18M Series B', source: 'demo', publishedAt: daysAgo(40), confidence: 0.9 },
      { type: 'hiring', title: 'Hiring VP Marketing & sales reps', source: 'demo', publishedAt: daysAgo(12), confidence: 0.8 }
    ]
  },
  {
    provider: 'demo',
    name: 'Ledgerlynx',
    domain: 'ledgerlynx.io',
    website: 'https://ledgerlynx.io',
    description: 'Accounting automation and close-management for mid-market finance teams.',
    industry: 'Fintech',
    tags: ['fintech', 'accounting', 'saas', 'finance'],
    employeeCount: 132,
    country: 'US',
    city: 'San Francisco, CA',
    dataConfidence: 0.88,
    signals: [
      { type: 'funding', title: 'Closed $32M Series B led by growth fund', source: 'demo', publishedAt: daysAgo(95), confidence: 0.9 },
      { type: 'leadership', title: 'Hired new CRO', source: 'demo', publishedAt: daysAgo(22), confidence: 0.7 }
    ]
  },
  {
    provider: 'demo',
    name: 'Trueskope Security',
    domain: 'trueskope.com',
    website: 'https://trueskope.com',
    description: 'Cloud-native identity and access posture management (ITDR).',
    industry: 'Cybersecurity',
    tags: ['security', 'cybersecurity', 'software', 'b2b'],
    employeeCount: 57,
    country: 'US',
    city: 'Seattle, WA',
    dataConfidence: 0.85,
    signals: [
      { type: 'hiring', title: 'Scaling go-to-market; hiring account executives', source: 'demo', publishedAt: daysAgo(6), confidence: 0.85 }
    ]
  },
  {
    provider: 'demo',
    name: 'Dataloft Cloud',
    domain: 'dataloft.dev',
    website: 'https://dataloft.dev',
    description: 'Developer platform for streaming data pipelines and realtime ML features.',
    industry: 'Developer Tools',
    tags: ['devtools', 'infrastructure', 'software', 'ai'],
    employeeCount: 210,
    country: 'CA',
    city: 'Toronto, ON',
    dataConfidence: 0.9,
    signals: [
      { type: 'funding', title: 'Series C extension of $45M', source: 'demo', publishedAt: daysAgo(60), confidence: 0.88 },
      { type: 'expansion', title: 'Opened London office', source: 'demo', publishedAt: daysAgo(30), confidence: 0.75 }
    ]
  },
  {
    provider: 'demo',
    name: 'Medilattice',
    domain: 'medilattice.com',
    website: 'https://medilattice.com',
    description: 'Clinical-trial recruitment and site-operations software.',
    industry: 'Healthtech',
    tags: ['healthcare', 'healthtech', 'clinical', 'saas'],
    employeeCount: 148,
    country: 'US',
    city: 'Boston, MA',
    dataConfidence: 0.83,
    signals: [
      { type: 'expansion', title: 'Expanding into EU clinical sites', source: 'demo', publishedAt: daysAgo(18), confidence: 0.7 },
      { type: 'hiring', title: 'Hiring customer success leads', source: 'demo', publishedAt: daysAgo(9), confidence: 0.7 }
    ]
  },
  {
    provider: 'demo',
    name: 'Paylinecraft',
    domain: 'paylinecraft.co.uk',
    website: 'https://paylinecraft.co.uk',
    description: 'Embedded payments and checkout orchestration for UK merchants.',
    industry: 'Fintech',
    tags: ['fintech', 'payments', 'saas', 'ecommerce'],
    employeeCount: 96,
    country: 'GB',
    city: 'London, UK',
    dataConfidence: 0.8,
    signals: [
      { type: 'product', title: 'Launched checkout orchestration API', source: 'demo', publishedAt: daysAgo(25), confidence: 0.78 }
    ]
  },
  {
    provider: 'demo',
    name: 'Klaris HR',
    domain: 'klaris-hr.com',
    website: 'https://klaris-hr.com',
    description: 'People analytics and workforce planning for mid-size companies.',
    industry: 'HR Tech',
    tags: ['hrtech', 'hr', 'people', 'analytics', 'saas'],
    employeeCount: 44,
    country: 'US',
    city: 'Denver, CO',
    dataConfidence: 0.8,
    signals: [
      { type: 'hiring', title: 'Growing product org; hiring PMs', source: 'demo', publishedAt: daysAgo(35), confidence: 0.6 }
    ]
  },
  {
    provider: 'demo',
    name: 'Stackloom',
    domain: 'stackloom.io',
    website: 'https://stackloom.io',
    description: 'Design systems platform for product and engineering teams.',
    industry: 'Developer Tools',
    tags: ['devtools', 'design', 'software'],
    employeeCount: 28,
    country: 'US',
    city: 'Portland, OR',
    dataConfidence: 0.76,
    signals: []
  },
  {
    provider: 'demo',
    name: 'Cortexclear BI',
    domain: 'cortexclear.com',
    website: 'https://cortexclear.com',
    description: 'Self-serve BI and data governance for regulated industries.',
    industry: 'Data & Analytics',
    tags: ['data', 'analytics', 'bi', 'governance', 'software'],
    employeeCount: 122,
    country: 'US',
    city: 'Chicago, IL',
    dataConfidence: 0.84,
    signals: [
      { type: 'leadership', title: 'Appointed new VP of Data Science', source: 'demo', publishedAt: daysAgo(14), confidence: 0.65 }
    ]
  },
  {
    provider: 'demo',
    name: 'Brightmatrix AI',
    domain: 'brightmatrix.ai',
    website: 'https://brightmatrix.ai',
    description: 'LLM evaluation and observability for enterprise AI teams.',
    industry: 'AI',
    tags: ['ai', 'mlops', 'software', 'developer'],
    employeeCount: 61,
    country: 'US',
    city: 'New York, NY',
    dataConfidence: 0.86,
    signals: [
      { type: 'funding', title: 'Seed + $7M bridge', source: 'demo', publishedAt: daysAgo(50), confidence: 0.8 },
      { type: 'product', title: 'Launched eval studio', source: 'demo', publishedAt: daysAgo(10), confidence: 0.7 }
    ]
  },
  {
    provider: 'demo',
    name: 'Fieldfox Robotics',
    domain: 'fieldfox.co',
    website: 'https://fieldfox.co',
    description: 'Autonomous inspection robots for agriculture and logistics yards.',
    industry: 'Robotics',
    tags: ['robotics', 'hardware', 'industrial', 'ai'],
    employeeCount: 178,
    country: 'US',
    city: 'Raleigh, NC',
    dataConfidence: 0.82,
    signals: [
      { type: 'funding', title: 'Raised $60M Series C', source: 'demo', publishedAt: daysAgo(120), confidence: 0.9 },
      { type: 'expansion', title: 'New manufacturing facility in Mexico', source: 'demo', publishedAt: daysAgo(45), confidence: 0.7 }
    ]
  },
  {
    provider: 'demo',
    name: 'Nimbusware CRM',
    domain: 'nimbusware.com',
    website: 'https://nimbusware.com',
    description: 'Lightweight CRM for professional services firms.',
    industry: 'SaaS',
    tags: ['crm', 'saas', 'software', 'b2b'],
    employeeCount: 18,
    country: 'DE',
    city: 'Berlin, Germany',
    dataConfidence: 0.74,
    signals: []
  },
  {
    provider: 'demo',
    name: 'Vaultrail Compliance',
    domain: 'vaultrail.com',
    website: 'https://vaultrail.com',
    description: 'Regulatory reporting and compliance workflow automation.',
    industry: 'RegTech',
    tags: ['regtech', 'compliance', 'fintech', 'saas'],
    employeeCount: 240,
    country: 'US',
    city: 'Jersey City, NJ',
    dataConfidence: 0.85,
    signals: [
      { type: 'hiring', title: 'Hiring compliance analysts and sales', source: 'demo', publishedAt: daysAgo(8), confidence: 0.8 },
      { type: 'funding', title: 'Growth round of $28M', source: 'demo', publishedAt: daysAgo(70), confidence: 0.85 }
    ]
  },
  {
    provider: 'demo',
    name: 'Orchardshop',
    domain: 'orchardshop.app',
    website: 'https://orchardshop.app',
    description: 'Headless commerce and subscriptions for D2C food brands.',
    industry: 'E-commerce',
    tags: ['ecommerce', 'retail', 'saas', 'headless'],
    employeeCount: 74,
    country: 'CA',
    city: 'Vancouver, BC',
    dataConfidence: 0.78,
    signals: [
      { type: 'hiring', title: 'Expanding marketing team', source: 'demo', publishedAt: daysAgo(5), confidence: 0.6 }
    ]
  },
  {
    provider: 'demo',
    name: 'Securavi',
    domain: 'securavi.com',
    website: 'https://securavi.com',
    description: 'Third-party vendor risk management for financial services.',
    industry: 'Cybersecurity',
    tags: ['security', 'risk', 'fintech', 'software', 'b2b'],
    employeeCount: 108,
    country: 'US',
    city: 'Tampa, FL',
    dataConfidence: 0.81,
    signals: [
      { type: 'leadership', title: 'New CISO hired', source: 'demo', publishedAt: daysAgo(28), confidence: 0.6 }
    ]
  },
  {
    provider: 'demo',
    name: 'Greenmeter Energy',
    domain: 'greenmeter.energy',
    website: 'https://greenmeter.energy',
    description: 'Software for solar installers to design, permit and monitor projects.',
    industry: 'Climate Tech',
    tags: ['climate', 'energy', 'cleantech', 'saas'],
    employeeCount: 35,
    country: 'US',
    city: 'Boulder, CO',
    dataConfidence: 0.72,
    signals: [
      { type: 'funding', title: 'Raised $9M Series A', source: 'demo', publishedAt: daysAgo(200), confidence: 0.8 }
    ]
  }
]

export function daysAgo(n: number): number {
  return Date.now() - n * 24 * 60 * 60 * 1000
}

export function demoCompanies(): DemoCompany[] {
  return demo
}

/** Deterministic demo people generator (decision-maker archetypes). */
export function demoPeopleFor(
  company: Pick<DemoCompany, 'name' | 'domain'>,
  titleHints: string[]
): NormalizedPerson[] {
  const roleTitles = titleHints.length > 0 ? titleHints : ['VP Marketing', 'Head of Growth', 'VP Sales', 'Founder & CEO']
  return roleTitles.slice(0, 4).map((title, i) => {
    const first = ['Alex', 'Jordan', 'Sam', 'Taylor', 'Casey', 'Morgan'][i % 6]
    const last = ['Reed', 'Nguyen', 'Okafor', 'Silva', 'Kowalski', 'Hart'][i % 6]
    const domain = company.domain ?? ''
    const slug = `${first.toLowerCase()}.${last.toLowerCase()}`
    return {
      provider: 'demo',
      firstName: first,
      lastName: last,
      title,
      companyName: company.name,
      email: domain ? `${slug}@${domain}` : null,
      emailStatus: domain ? 'verified' : null,
      location: null,
      linkedinUrl: `https://linkedin.com/in/${slug}-${(company.name.toLowerCase().replace(/[^a-z]/g, '')).slice(0, 12)}`
    }
  })
}

export function signalTitleFor(type: string): string {
  const map: Record<string, string> = {
    funding: 'Recent funding round',
    hiring: 'Active hiring',
    expansion: 'Expansion',
    leadership: 'Leadership change',
    product: 'Product launch'
  }
  return map[type] ?? type
}
