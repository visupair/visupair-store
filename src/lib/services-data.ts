// Services data - CMS-ready structure for Sanity CMS integration
// Each service category contains multiple pricing plans

export interface ServicePlan {
    _key: string; // Unique key for CMS lists
    name: 'Basic' | 'Standard' | 'Premium';
    price: number;
    description: string;
    features: string[];
    highlight?: boolean;
    ctaLabel?: string; // CMS allows custom button text
}

export interface ServiceCategory {
    id: string;
    title: string;
    subtitle: string;
    plans: ServicePlan[];
}

export const servicesData: ServiceCategory[] = [
    {
        id: 'logo-design',
        title: 'Logo Design',
        subtitle: 'Crafting the face of your brand with precision and creativity.',
        plans: [
            {
                _key: 'logo-basic',
                name: 'Basic',
                price: 350,
                description: 'Essential branding for startups and side projects.',
                ctaLabel: 'Start Basic',
                features: [
                    '1 logo concept',
                    '2 revision rounds',
                    'Primary logo version',
                    'Color and black/white versions',
                    'Exported files (PNG, SVG, PDF)',
                    'Ready for web and social use'
                ]
            },
            {
                _key: 'logo-standard',
                name: 'Standard',
                price: 700,
                description: 'Perfect for growing businesses needing a professional look.',
                highlight: true,
                ctaLabel: 'Get Standard',
                features: [
                    '2 logo concepts',
                    '4 revision rounds',
                    'Primary and secondary logo versions',
                    'Icon / symbol version',
                    'Typography recommendations',
                    'Basic logo usage guidelines'
                ]
            },
            {
                _key: 'logo-premium',
                name: 'Premium',
                price: 1200,
                description: 'Comprehensive identity system for established brands.',
                ctaLabel: 'Go Premium',
                features: [
                    '3 logo concepts',
                    'Unlimited revisions within scope',
                    'Full logo system (primary, secondary, icon)',
                    'Custom symbol or mark',
                    'Detailed logo usage guidelines',
                    'Complete brand-ready export package'
                ]
            }
        ]
    },
    {
        id: 'web-design',
        title: 'Web Design',
        subtitle: 'Digital experiences that convert and engage.',
        plans: [
            {
                _key: 'web-basic',
                name: 'Basic',
                price: 900,
                description: 'A clean, high-converting landing page.',
                ctaLabel: 'Start Basic',
                features: [
                    '1-page website design',
                    'Desktop layout',
                    'UI design in Figma',
                    'Basic UX structure',
                    '2 revision rounds'
                ]
            },
            {
                _key: 'web-standard',
                name: 'Standard',
                price: 1600,
                description: 'Multi-page site for businesses expanding their reach.',
                highlight: true,
                ctaLabel: 'Get Standard',
                features: [
                    'Up to 5 pages',
                    'Responsive design (desktop and mobile)',
                    'Improved UX flow',
                    'UI components and sections',
                    '4 revision rounds'
                ]
            },
            {
                _key: 'web-premium',
                name: 'Premium',
                price: 2800,
                description: 'Complex, scalable design systems for large platforms.',
                ctaLabel: 'Go Premium',
                features: [
                    'Up to 10 pages',
                    'Advanced UX and layout system',
                    'Design system (colors, typography, components)',
                    'Micro-interaction concepts',
                    'Developer-ready Figma file',
                    'Unlimited revisions within scope'
                ]
            }
        ]
    },
    {
        id: 'brand-identity',
        title: 'Brand Identity',
        subtitle: 'A complete visual language for your business.',
        plans: [
            {
                _key: 'brand-basic',
                name: 'Basic',
                price: 1200,
                description: 'Foundational elements to get you started.',
                ctaLabel: 'Start Basic',
                features: [
                    'Logo design (Basic level)',
                    'Color palette',
                    'Typography system',
                    'Basic brand mood and direction',
                    'Mini brand guide (PDF)'
                ]
            },
            {
                _key: 'brand-standard',
                name: 'Standard',
                price: 2400,
                description: 'Extensive visual toolkit for marketing and social.',
                highlight: true,
                ctaLabel: 'Get Standard',
                features: [
                    'Logo design (Standard level)',
                    'Brand visual system',
                    'Iconography direction',
                    'Social media visuals',
                    'Extended brand guidelines'
                ]
            },
            {
                _key: 'brand-premium',
                name: 'Premium',
                price: 4200,
                description: 'The ultimate brand package for market leaders.',
                ctaLabel: 'Go Premium',
                features: [
                    'Logo design (Premium level)',
                    'Complete brand identity system',
                    'Marketing and presentation visuals',
                    'Website visual direction',
                    'Comprehensive brand book (PDF)',
                    'Focus on long-term brand scalability'
                ]
            }
        ]
    }
];
