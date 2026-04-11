// This file simulates data that would eventually come from Sanity CMS
// Structure is CMS-ready for easy migration

export interface Category {
    id: string;
    title: string;
    children?: Category[];
}

export interface StoreSection {
    id: string;
    title: string;
    categories: Category[];
}

export interface Product {
    id: string;
    name: string;
    price: number;
    pricePLN?: number;
    currency?: 'EUR' | 'PLN'; // Legacy field - will be auto-detected based on user location
    description: string;
    image?: string;
    mainImage?: any; // Sanity Image Object for optimization
    slug?: string; // Added for Sanity compatibility
    categoryPath: string[];

    // Optional fields for Sanity CMS integration
    productType?: 'physical' | 'digital'; // Product type for payment/shipping logic
    images?: string[]; // Gallery images (URLs)
    gallery?: any[]; // Sanity Image Objects (Raw)
    inStock?: boolean;
    stock?: number;
    sizes?: string[]; // For fashion items

    details?: Record<string, string>; // Specifications (material, dimensions, format, etc.)

    shipping?: {
        weight?: number;
        length?: number;
        width?: number;
        height?: number;
    };

    // Stripe Payment Integration
    stripePriceId?: string; // Stripe Price ID (e.g. price_1OqXXXXXXXXXXXXX)


    // Digital Twin (Reciprocal Reference)
    twinProduct?: {
        slug: string;
        name: string;
        productType: 'physical' | 'digital';
        image?: string;
    };
    showDigitalTwinLink?: boolean;
    clo3dEmbedUrl?: string;
}

export type CoursePricingType = 'paid' | 'free' | 'donation' | 'payAtDoor';

export interface Course {
    _id?: string;
    name: string;
    slug?: string;
    pricingType?: CoursePricingType;
    price: number;
    pricePLN?: number;
    stripePriceId?: string;
    donationPresets?: number[];
    description: string;
    mainImage?: string;
    /** When the course begins (ISO datetime from Sanity). Optional for on-demand / TBA. */
    startsAt?: string;
    registrationOpen?: boolean;

    // Course-specific fields
    instructor?: {
        name: string;
        title: string;
        avatar?: string;
    };
    details?: {
        duration?: string;
        level?: string;
        software?: string;
    };
    curriculum?: {
        week: string;
        title: string;
    }[];

    // Legacy fields (for backward compatibility during migration)
    id?: string;
    image?: string;
    images?: string[];
    categoryPath?: string[];
    inStock?: boolean;
}

export interface PortfolioCategory {
    title: string;
    slug: string;
    description?: string;
}

export interface PortfolioItem {
    id?: string; // Legacy
    name: string; // Replaces title
    slug: string; // Replaces id
    title?: string; // Legacy support
    description: string; // Sanity Text (was Block Content)
    mainImage?: any; // Sanity Image Object (was string URL)
    image?: string; // Legacy support
    category: string; // Category Title
    categorySlug?: string;
    categoryPath?: string[]; // Legacy

    // Portfolio-specific fields
    images?: string[]; // Gallery images (Legacy)
    gallery?: any[]; // Sanity Image Objects (was string URLs)
    tools?: { value: string }[] | string[]; // Support both object array (Sanity) and string array (Legacy)
    year?: string | number;
    featured?: boolean;
    isFeatured?: boolean;
    details?: Record<string, string>; // Additional info
    youtubeUrl?: string; // Legacy: single video
    /** Multiple videos; optional `title` is used for the iframe accessible name. */
    youtubeVideos?: Array<{ url: string; title?: string }>;
    /** Sanity document updated time (ISO); used for portfolio ordering ties / “recently added”. */
    _updatedAt?: string;
}

// Garments store section (URL segment remains fashion-design)
const fashionCategories: Category[] = [
    {
        id: 'fashion-physical',
        title: 'Physical Products',
        children: [
            { id: 'fashion-physical-garments', title: 'Garments' },
            { id: 'fashion-physical-accessories', title: 'Accessories' }
        ]
    },
    {
        id: 'fashion-digital',
        title: 'Digital Products',
        children: [
            { id: 'fashion-digital-garments', title: 'Garments' },
            { id: 'fashion-digital-accessories', title: 'Accessories' }
        ]
    }
];

// 3D Models Structure
const modelsCategories: Category[] = [
    { id: '3d-hard-surface', title: 'Hard Surface Models' },
    { id: '3d-organic', title: 'Organic Models' }
];

// Artworks Structure
const artCategories: Category[] = [
    { id: 'art-oil', title: 'Oil Paintings' },
    { id: 'art-watercolors', title: 'Watercolors' },
    { id: 'art-drawings', title: 'Drawings' }
];

export const storeSections: Record<string, StoreSection> = {
    'fashion-design': { id: 'fashion-design', title: 'Garments', categories: fashionCategories },
    '3d-models': { id: '3d-models', title: '3D Models', categories: modelsCategories },
    'artworks': { id: 'artworks', title: 'Artworks', categories: artCategories }
};

// Mock Products - Structure supports Sanity GROQ queries later
export const mockProducts: Product[] = [
    // Fashion Physical
    { id: 'p1', name: 'Oversized Hoodie', price: 150, description: 'Heavyweight cotton hoodie with embroidered logo.', categoryPath: ['fashion-design', 'fashion-physical', 'fashion-physical-garments'] },
    { id: 'p2', name: 'Leather Tech Belt', price: 85, description: 'Utility belt with magnetic buckle.', categoryPath: ['fashion-design', 'fashion-physical', 'fashion-physical-accessories'] },

    // Fashion Digital
    { id: 'p3', name: 'Digital Cloak Pattern', price: 25, description: 'CLO3D compatible pattern file.', categoryPath: ['fashion-design', 'fashion-digital', 'fashion-digital-garments'] },

    // 3D Models
    { id: 'p4', name: 'Sci-Fi Crate', price: 15, description: 'Game-ready hard surface asset.', categoryPath: ['3d-models', '3d-hard-surface'] },
    { id: 'p5', name: 'Alien Creature Bust', price: 45, description: 'High-poly ZBrush sculpt.', categoryPath: ['3d-models', '3d-organic'] },

    // Artworks
    { id: 'p6', name: 'Sunset over Dystopia', price: 400, description: 'Oil on canvas, 24x36.', categoryPath: ['artworks', 'art-oil'] },
    { id: 'p7', name: 'Charcoal Study #4', price: 120, description: 'Original charcoal drawing on textured paper.', categoryPath: ['artworks', 'art-drawings'] },
    { id: 'p8', name: 'Neon Rain', price: 250, description: 'Watercolor styling of a cyberpunk city.', categoryPath: ['artworks', 'art-watercolors'] },
];

// Portfolio Sections - REMOVED (Migrated to Sanity)
// export const portfolioSection = ...
// export const mockPortfolioItems = ...


// Courses
export const mockCourses: Course[] = [
    {
        id: '3d-modeling-masterclass',
        name: '3D Modeling Masterclass',
        price: 199,
        description: 'Comprehensive guide to hard-surface modeling in Blender and Maya. Suitable for beginners to intermediate.',
        categoryPath: ['courses'],
        details: {
            duration: '12 Weeks',
            level: 'Intermediate',
            software: 'Blender 4.0'
        },
        instructor: {
            name: 'Alex V.',
            title: 'Senior 3D Artist @ Visupair'
        },
        curriculum: [
            { week: 'Week 01', title: 'Introduction & Fundamentals' },
            { week: 'Week 02', title: 'Advanced Techniques & Tools' },
            { week: 'Week 03', title: 'Final Project & Peer Review' },
            { week: 'Bonus', title: 'Career Guidance & Portfolio' }
        ]
    },
    {
        id: 'organic-sculpting-zbrush',
        name: 'Organic Sculpting in ZBrush',
        price: 149,
        description: 'Learn anatomy and creature design from industry professionals. Master the digital clay.',
        categoryPath: ['courses'],
        details: {
            duration: '8 Weeks',
            level: 'Advanced',
            software: 'ZBrush 2024'
        },
        instructor: {
            name: 'Jordan M.',
            title: 'Character Sculpt Specialist'
        },
        curriculum: [
            { week: 'Week 01', title: 'Anatomy Fundamentals' },
            { week: 'Week 02', title: 'Creature Design Techniques' },
            { week: 'Week 03', title: 'Final Sculpture & Refinement' },
            { week: 'Bonus', title: 'Portfolio Building' }
        ]
    },
    {
        id: 'jewelry-design-3d-printing',
        name: 'Jewelry Design for 3D Printing',
        price: 250,
        description: 'Create intricate jewelry pieces ready for casting. Focus on precision and manufacturability.',
        categoryPath: ['courses'],
        details: {
            duration: '10 Weeks',
            level: 'Beginner',
            software: 'Rhino Gold'
        },
        instructor: {
            name: 'Sam L.',
            title: 'Jewelry Design Director'
        },
        curriculum: [
            { week: 'Week 01', title: 'Jewelry Basics & Design Principles' },
            { week: 'Week 02', title: '3D Software Mastery' },
            { week: 'Week 03', title: 'Print-Ready Optimization' },
            { week: 'Bonus', title: 'Casting & Material Selection' }
        ]
    },
    {
        id: 'oil-painting-essentials',
        name: 'Oil Painting Essentials',
        price: 120,
        description: 'Master color theory, mixing, and brushwork. A calming journey into traditional media.',
        categoryPath: ['courses'],
        details: {
            duration: '6 Weeks',
            level: 'Beginner'
        },
        instructor: {
            name: 'Elena P.',
            title: 'Fine Art Instructor'
        },
        curriculum: [
            { week: 'Week 01', title: 'Color Theory & Mixing' },
            { week: 'Week 02', title: 'Brushwork & Techniques' },
            { week: 'Week 03', title: 'Composition & Practice' },
            { week: 'Bonus', title: 'Gallery & Selling Your Art' }
        ]
    }
];
